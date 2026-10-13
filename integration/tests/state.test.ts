import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openRelayStore } from '../relay/state.ts';
import { identify } from '../relay/contract.ts';
import type { AttemptResult, ReadObservation } from '../relay/state-types.ts';

const order = {
  schemaVersion: 1 as const,
  partner: 'northstar' as const,
  orderId: '0007',
  region: 'North' as const,
  quantity: 3,
  amountMinor: 4250,
};

// eslint-disable-next-line no-unused-vars -- callable test helper shape
const withStore = (run: (path: string) => void) => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  try {
    run(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const unknown = (nextAttemptAt: number | null = null): ReadObservation => ({
  kind: 'unknown',
  reason: 'network_failure',
  httpStatus: null,
  nextAttemptAt,
});

const retry = (nextAttemptAt: number | null): AttemptResult => ({
  classification: 'retryable',
  httpStatus: 503,
  nextAttemptAt,
  receipt: null,
});

const present = (vendorOrderId: string): ReadObservation => {
  const identity = identify(order);
  return {
  kind: 'present',
  receipt: {
    schemaVersion: 1,
    vendorOrderId,
    idempotencyKey: identity.idempotencyKey,
    businessKey: identity.businessKey,
    payloadDigest: identity.payloadDigest,
    order,
    committedAt: '2026-10-13T00:00:00.000Z',
    storeId: 'fixture-store',
  },
  httpStatus: 200,
  nextAttemptAt: null,
  };
};

test('new jobs require explicit approval bound to the immutable canonical order for ten minutes', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    assert.equal(pending.approvalState, 'pending');
    assert.equal(pending.approvalExpiresAt, null);
    assert.equal(store.reservePost(pending.jobId, 'worker', 1_000).kind, 'blocked');

    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
    assert.equal(approved.approvalState, 'approved');
    assert.equal(approved.approvalExpiresAt, 601_000);
    assert.equal(approved.identity.canonical, '[1,"northstar","0007","North",3,4250]');
    assert.equal(store.reservePost(approved.jobId, 'worker', 601_001).kind, 'blocked');
    store.close();
  });
});

test('revocation blocks a reservation without erasing its approval history', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1000);
    assert.equal(store.reservePost(pending.jobId, 'worker', 1000).kind, 'blocked');
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1000);
    store.revoke(approved.jobId, approved.approvalRevision, 'operator hold', 1001);
    assert.equal(store.reservePost(approved.jobId, 'worker', 1002).kind, 'blocked');
    assert.equal(store.snapshot(approved.jobId).postReservations, 0);
    assert.equal(store.snapshot(approved.jobId).approvalState, 'revoked');
    assert.deepEqual(
      store.events(approved.jobId).map((event) => event.kind),
      ['enqueued', 'approved', 'revoked'],
    );
    store.close();
  });
});

test('stale approval and revocation revisions fail without mutating the durable job', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    assert.throws(() => store.approve(pending.jobId, 99, 1_001), /revision/i);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_002);
    assert.throws(() => store.revoke(approved.jobId, pending.approvalRevision, 'operator hold', 1_003), /revision/i);
    assert.equal(store.snapshot(pending.jobId).approvalState, 'approved');
    store.close();
  });
});

test('identical enqueue preserves approval and counters while a changed payload holds the original body', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_001);
    const claim = store.reservePost(approved.jobId, 'worker-a', 1_002);
    assert.equal(claim.kind, 'admitted');
    if (claim.kind !== 'admitted') throw Error('expected admission');
    store.settle(claim, retry(1_500), 1_003);
    const same = store.enqueue(order, 'fixture-store', 1_004);
    assert.equal(same.jobId, approved.jobId);
    assert.equal(same.approvalState, 'approved');
    assert.equal(same.postReservations, 1);

    const changed = store.enqueue({ ...order, quantity: 4 }, 'fixture-store', 1_005);
    assert.equal(changed.jobId, approved.jobId);
    assert.equal(changed.order.quantity, 3);
    assert.equal(changed.holdReason, 'content_conflict');
    assert.equal(store.reservePost(changed.jobId, 'worker-b', 1_500).kind, 'blocked');
    store.close();
  });
});

test('post and read budgets persist through restart, reapproval, and identical enqueue', () => {
  withStore((path) => {
    let store = openRelayStore(path, 'new');
    let job = store.enqueue(order, 'fixture-store', 1_000);
    job = store.approve(job.jobId, job.approvalRevision, 1_000);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const claim = store.reservePost(job.jobId, 'worker', 1_100 + attempt * 100);
      assert.equal(claim.kind, 'admitted');
      if (claim.kind !== 'admitted') throw Error('expected admission');
      job = store.settle(claim, retry(1_101 + attempt * 100), 1_100 + attempt * 100);
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const read = store.reserveRead(job.jobId, 2_000 + attempt);
      assert.equal(read.kind, 'read_reserved');
      if (read.kind !== 'read_reserved') throw Error('expected read reservation');
      job = store.settleRead(read, unknown(2_100 + attempt), 2_000 + attempt);
    }
    store.close();
    store = openRelayStore(path, 'resume');
    job = store.enqueue(order, 'fixture-store', 3_000);
    job = store.approve(job.jobId, job.approvalRevision, 3_000);
    assert.equal(job.postReservations, 3);
    assert.equal(job.getReservations, 6);
    assert.equal(store.reservePost(job.jobId, 'worker', 3_001).kind, 'blocked');
    assert.equal(store.reserveRead(job.jobId, 3_001).kind, 'blocked');
    store.close();
  });
});

test('one live lease wins, an expired lease becomes readback-only, and a stale worker cannot settle it', () => {
  withStore((path) => {
    const first = openRelayStore(path, 'new');
    const pending = first.enqueue(order, 'fixture-store', 1_000);
    first.approve(pending.jobId, pending.approvalRevision, 1_000);
    const second = openRelayStore(path, 'resume');
    const admission = first.reservePost(pending.jobId, 'worker-a', 1_001);
    assert.equal(admission.kind, 'admitted');
    assert.equal(second.reservePost(pending.jobId, 'worker-b', 1_002).kind, 'blocked');
    assert.equal(second.reservePost(pending.jobId, 'worker-b', 6_002).kind, 'blocked');
    assert.equal(second.reserveRead(pending.jobId, 6_003).kind, 'read_reserved');
    if (admission.kind !== 'admitted') throw Error('expected admission');
    assert.throws(() => first.settle(admission, retry(7_000), 6_004), /stale/i);
    assert.equal(first.snapshot(pending.jobId).postReservations, 1);
    first.close();
    second.close();
  });
});

test('revocation after admission preserves the admission outcome without restoring authorization', () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  const store = openRelayStore(path, 'new');
  try {
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
    const admission = store.reservePost(approved.jobId, 'worker', 1_001);
    assert.equal(admission.kind, 'admitted');
    if (admission.kind !== 'admitted') throw Error('expected admission');
    store.revoke(approved.jobId, approved.approvalRevision, 'operator hold', 1_002);
    const settled = store.settle(admission, retry(2_000), 1_003);
    assert.equal(settled.approvalState, 'revoked');
    assert.equal(settled.outcome, 'retryable');
    assert.equal(store.reservePost(approved.jobId, 'worker', 2_000).kind, 'blocked');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('clock rollback holds automated writes while operator inspection remains available and prior time stays intact', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 10_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 10_000);
    const claim = store.reservePost(approved.jobId, 'worker', 10_001);
    assert.equal(claim.kind, 'admitted');
    if (claim.kind !== 'admitted') throw Error('expected admission');
    store.settle(claim, retry(11_000), 10_002);
    store.reservePost(approved.jobId, 'worker', 9_999);
    const snapshot = store.snapshot(approved.jobId);
    assert.equal(snapshot.holdReason, 'clock_regression');
    assert.equal(snapshot.nextAttemptAt, 11_000);
    assert.equal(store.recordInspection(approved.jobId, unknown(), 9_998).observed, 'unknown');
    assert.equal(store.events(approved.jobId).at(-1)?.kind, 'operator_inspection');
    store.close();
  });
});

test('a later readback cannot replace a verified immutable receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  const store = openRelayStore(path, 'new');
  try {
    const job = store.enqueue(order, 'fixture-store', 1_000);
    store.recordInspection(job.jobId, present('vendor-1'), 1_001);
    const afterConflict = store.recordInspection(job.jobId, present('vendor-2'), 1_002);
    assert.equal(afterConflict.receipt?.vendorOrderId, 'vendor-1');
    assert.equal(afterConflict.holdReason, 'integrity_failure');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
