import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { clearTimeout, setTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';

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
  claimedReceipt: null,
});

const present = (
  vendorOrderId: string,
  committedAt = '2026-10-13T00:00:00.000Z',
): ReadObservation => {
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
      committedAt,
      storeId: 'fixture-store',
    },
    httpStatus: 200,
    nextAttemptAt: null,
  };
};

const processHarness = fileURLToPath(
  new URL('./helpers/state-process-harness.mjs', import.meta.url),
);

type HarnessMessage = {
  type: 'ready' | 'result' | 'barrier' | 'error';
  operation?: string;
  result?: unknown;
  message?: string;
};

type OwnedChild = {
  child: ChildProcess;
  diagnostics: () => string;
};

const isHarnessMessage = (value: unknown): value is HarnessMessage => {
  if (typeof value !== 'object' || value === null) return false;
  const type = (value as Record<string, unknown>).type;
  return type === 'ready' || type === 'result' || type === 'barrier' || type === 'error';
};

const asObject = (value: unknown): Record<string, unknown> => {
  assert.ok(
    typeof value === 'object' && value !== null,
    `expected a process result object, got ${String(value)}`,
  );
  return value as Record<string, unknown>;
};

const startHarness = (
  action: 'abort-approval' | 'worker',
  path: string,
  jobId: string,
): OwnedChild => {
  const child = spawn(
    process.execPath,
    [processHarness, action, path, jobId, JSON.stringify(order)],
    {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      windowsHide: true,
    },
  );
  let diagnostics = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk) => {
    diagnostics += String(chunk);
  });
  return { child, diagnostics: () => diagnostics };
};

const waitForHarness = (
  owned: OwnedChild,
  type: HarnessMessage['type'],
  operation?: string,
): Promise<HarnessMessage> =>
  new Promise((resolve, reject) => {
    const { child } = owned;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const expected = operation ? `${type}/${operation}` : type;
    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
    };
    const fail = (message: string) => {
      cleanup();
      reject(
        Error(`${message}${owned.diagnostics() ? `\nchild stderr: ${owned.diagnostics()}` : ''}`),
      );
    };
    const onMessage = (message: unknown) => {
      if (!isHarnessMessage(message)) return;
      if (message.type === 'error') {
        fail(`child process reported ${message.message ?? 'an unknown error'}`);
        return;
      }
      if (message.type === type && (operation === undefined || message.operation === operation)) {
        cleanup();
        resolve(message);
      }
    };
    const onExit = (code: number | null, signal: string | null) => {
      fail(
        `child process exited before ${expected} (code ${String(code)}, signal ${String(signal)})`,
      );
    };
    if (child.exitCode !== null || child.signalCode !== null) {
      fail(`child process had already exited before ${expected}`);
      return;
    }
    child.on('message', onMessage);
    child.once('exit', onExit);
    timeout = setTimeout(() => fail(`timed out waiting for child process ${expected}`), 5_000);
  });

const waitForExit = (
  owned: OwnedChild,
  label: string,
): Promise<{ code: number | null; signal: string | null }> =>
  new Promise((resolve, reject) => {
    const { child } = owned;
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      reject(
        Error(
          `timed out waiting for owned child process ${label} to exit${owned.diagnostics() ? `\nchild stderr: ${owned.diagnostics()}` : ''}`,
        ),
      );
    }, 5_000);
    const onExit = (code: number | null, signal: string | null) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    };
    child.once('exit', onExit);
  });

const sendHarnessCommand = (owned: OwnedChild, operation: string, now?: number) => {
  assert.ok(owned.child.connected, `owned child process is disconnected before ${operation}`);
  owned.child.send({ operation, ...(now === undefined ? {} : { now }) });
};

const closeWorker = async (owned: OwnedChild, label: string) => {
  if (owned.child.exitCode === null && owned.child.signalCode === null) {
    sendHarnessCommand(owned, 'close');
  }
  await waitForExit(owned, label);
};

const terminateOwnedChild = async (owned: OwnedChild, label: string) => {
  if (owned.child.exitCode === null && owned.child.signalCode === null) {
    owned.child.kill('SIGKILL');
  }
  await waitForExit(owned, label);
};

const createApprovedJob = (path: string, now: number) => {
  const store = openRelayStore(path, 'new');
  try {
    const pending = store.enqueue(order, 'fixture-store', now);
    return store.approve(pending.jobId, pending.approvalRevision, now);
  } finally {
    store.close();
  }
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
    assert.throws(
      () => store.revoke(approved.jobId, pending.approvalRevision, 'operator hold', 1_003),
      /revision/i,
    );
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
      const read = store.reserveRead(job.jobId, 2_200 + attempt);
      assert.equal(read.kind, 'read_reserved', JSON.stringify(read));
      if (read.kind !== 'read_reserved') throw Error('expected read reservation');
      job = store.settleRead(read, unknown(), 2_200 + attempt);
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
    assert.equal(
      store.events(approved.jobId).find((event) => event.kind === 'post_settled')?.approvalRevision,
      admission.approvalRevision,
    );
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

test('a direct late worker settlement expires its lease and commits a readback hold', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
    const claim = store.reservePost(approved.jobId, 'worker', 1_001);
    if (claim.kind !== 'admitted') throw Error('expected admission');
    assert.throws(() => store.settle(claim, retry(7_000), 6_001), /lease expired/i);
    assert.equal(store.snapshot(claim.jobId).holdReason, 'recovery_readback_required');
    assert.equal(store.events(claim.jobId).at(-1)?.kind, 'lease_expired');
    store.close();
  });
});

test('automatic reads respect due time, deadline, and clock regression before spending a slot', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
    const claim = store.reservePost(approved.jobId, 'worker', 1_001);
    if (claim.kind !== 'admitted') throw Error('expected admission');
    store.settle(claim, retry(2_000), 1_002);
    assert.equal(store.reserveRead(approved.jobId, 1_003).kind, 'blocked');
    assert.equal(store.snapshot(approved.jobId).getReservations, 0);
    assert.equal(store.reserveRead(approved.jobId, 900).kind, 'blocked');
    assert.equal(store.snapshot(approved.jobId).holdReason, 'clock_regression');
    assert.equal(store.recordInspection(approved.jobId, unknown(), 901).observed, 'unknown');
    store.close();
  });
});

test('operator inspection cannot clear a scheduled retry or enable a verified job to post', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
    const claim = store.reservePost(approved.jobId, 'worker', 1_001);
    if (claim.kind !== 'admitted') throw Error('expected admission');
    store.settle(claim, retry(5_000), 1_002);
    assert.equal(store.recordInspection(approved.jobId, unknown(null), 1_003).nextAttemptAt, 5_000);
    store.recordInspection(approved.jobId, present('vendor-1'), 1_004);
    assert.equal(store.reservePost(approved.jobId, 'worker', 5_000).kind, 'blocked');
    store.close();
  });
});

test('a same-ID receipt with a changed immutable timestamp is held and the first receipt remains', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const job = store.enqueue(order, 'fixture-store', 1_000);
    store.recordInspection(job.jobId, present('vendor-1'), 1_001);
    const snapshot = store.recordInspection(
      job.jobId,
      present('vendor-1', '2026-10-13T00:00:01.000Z'),
      1_002,
    );
    assert.equal(snapshot.receipt?.committedAt, '2026-10-13T00:00:00.000Z');
    assert.equal(snapshot.holdReason, 'integrity_failure');
    store.close();
  });
});

test('an admitted worker claim cannot replace an operator-verified receipt', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const claim = store.reservePost(approved.jobId, 'worker', 1_001);
      if (claim.kind !== 'admitted') throw Error('expected admission');
      store.recordInspection(claim.jobId, present('operator-receipt'), 1_002);
      const conflicting = present('worker-receipt');
      if (conflicting.kind !== 'present') throw Error('expected present observation');
      const snapshot = store.settle(
        claim,
        {
          classification: 'unknown',
          httpStatus: 201,
          nextAttemptAt: null,
          claimedReceipt: conflicting.receipt,
        },
        1_003,
      );
      assert.equal(snapshot.receipt?.vendorOrderId, 'operator-receipt');
      assert.equal(snapshot.holdReason, 'integrity_failure');
      const postSettled = store.events(claim.jobId).at(-1);
      assert.equal(postSettled?.kind, 'post_settled');
      assert.equal(postSettled?.vendorOrderId, null);
    } finally {
      store.close();
    }
  });
});

test('automatic read at the recovery deadline does not consume a GET slot', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
    const claim = store.reservePost(approved.jobId, 'worker', 1_001);
    if (claim.kind !== 'admitted') throw Error('expected admission');
    store.settle(claim, retry(null), 1_002);
    assert.equal(store.reserveRead(approved.jobId, 31_001).kind, 'blocked');
    assert.equal(store.snapshot(approved.jobId).getReservations, 0);
    store.close();
  });
});

test('changed vendor store ID holds the immutable original body', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const job = store.enqueue(order, 'fixture-store', 1_000);
    const held = store.enqueue(order, 'replacement-store', 1_001);
    assert.equal(held.jobId, job.jobId);
    assert.equal(held.vendorStoreId, 'fixture-store');
    assert.deepEqual(held.order, order);
    assert.equal(held.holdReason, 'store_mismatch');
    store.close();
  });
});

test('a deferred Retry-After holds every automatic request even with no representable due timestamp', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const admission = store.reservePost(approved.jobId, 'worker', 1_001);
      if (admission.kind !== 'admitted') throw Error('expected admission');
      const deferred = store.settle(
        admission,
        {
          classification: 'retryable',
          httpStatus: 429,
          nextAttemptAt: null,
          claimedReceipt: null,
          holdReason: 'deferred_outside_deadline',
        },
        1_002,
      );
      assert.equal(deferred.holdReason, 'deferred_outside_deadline');
      assert.equal(deferred.nextAttemptAt, null);
      assert.deepEqual(store.reservePost(approved.jobId, 'worker', 1_003), {
        kind: 'blocked',
        reason: 'deferred_outside_deadline',
      });
      assert.deepEqual(store.reserveRead(approved.jobId, 1_003), {
        kind: 'blocked',
        reason: 'deferred_outside_deadline',
      });
      assert.equal(store.events(approved.jobId).at(-1)?.reason, 'deferred_outside_deadline');
    } finally {
      store.close();
    }
  });
});

test('an automatic exact readback, rather than a POST response, promotes delivery', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const admission = store.reservePost(approved.jobId, 'worker', 1_001);
      if (admission.kind !== 'admitted') throw Error('expected admission');
      store.settle(
        admission,
        { classification: 'unknown', httpStatus: 201, nextAttemptAt: null, claimedReceipt: null },
        1_002,
      );
      const read = store.reserveRead(approved.jobId, 1_003);
      if (read.kind !== 'read_reserved') throw Error('expected automatic read');
      const verified = store.settleRead(read, present('vendor-automatic'), 1_004);
      assert.equal(verified.observed, 'present');
      assert.equal(verified.outcome, 'delivered');
    } finally {
      store.close();
    }
  });
});

test('an automatic absent readback clears only an expired-lease recovery hold before a same-key retry', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const first = store.reservePost(approved.jobId, 'worker-a', 1_001);
      if (first.kind !== 'admitted') throw Error('expected initial admission');
      assert.deepEqual(store.reservePost(approved.jobId, 'worker-b', 6_002), {
        kind: 'blocked',
        reason: 'recovery_readback_required',
      });
      const read = store.reserveRead(approved.jobId, 6_003);
      if (read.kind !== 'read_reserved') throw Error('expected recovery read');
      const absent = store.settleRead(
        read,
        { kind: 'absent', httpStatus: 404, nextAttemptAt: null },
        6_004,
      );
      assert.equal(absent.holdReason, null);
      assert.equal(store.reservePost(approved.jobId, 'worker-c', 6_005).kind, 'admitted');
    } finally {
      store.close();
    }
  });
});

test('stale automatic reads cannot erase a later POST retry schedule or admit an early write', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const first = store.reservePost(approved.jobId, 'worker-a', 1_001);
      if (first.kind !== 'admitted') throw Error('expected initial admission');
      store.settle(first, retry(null), 1_002);

      const firstRead = store.reserveRead(approved.jobId, 1_003);
      const staleRead = store.reserveRead(approved.jobId, 1_004);
      if (firstRead.kind !== 'read_reserved' || staleRead.kind !== 'read_reserved') {
        throw Error('expected overlapping automatic reads');
      }
      store.settleRead(firstRead, { kind: 'absent', httpStatus: 404, nextAttemptAt: null }, 1_005);

      const second = store.reservePost(approved.jobId, 'worker-b', 1_006);
      if (second.kind !== 'admitted')
        throw Error('expected second admission after verified absence');
      store.settle(second, retry(5_000), 1_007);

      const afterStaleRead = store.settleRead(
        staleRead,
        { kind: 'absent', httpStatus: 404, nextAttemptAt: null },
        1_008,
      );
      assert.equal(afterStaleRead.nextAttemptAt, 5_000);
      assert.deepEqual(store.reservePost(approved.jobId, 'worker-c', 1_009), {
        kind: 'blocked',
        reason: 'not_due',
        nextAttemptAt: 5_000,
      });
    } finally {
      store.close();
    }
  });
});

test('an earlier overlapping read in one generation cannot shorten a newer read retry wait', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const admission = store.reservePost(approved.jobId, 'worker-a', 1_001);
      if (admission.kind !== 'admitted') throw Error('expected admission');
      store.settle(admission, retry(null), 1_002);

      const earlier = store.reserveRead(approved.jobId, 1_003);
      const later = store.reserveRead(approved.jobId, 1_004);
      if (earlier.kind !== 'read_reserved' || later.kind !== 'read_reserved') {
        throw Error('expected overlapping automatic reads');
      }
      store.settleRead(later, unknown(5_000), 1_005);
      const afterEarlier = store.settleRead(
        earlier,
        { kind: 'absent', httpStatus: 404, nextAttemptAt: null },
        1_006,
      );
      assert.equal(afterEarlier.nextAttemptAt, 5_000);
      assert.deepEqual(store.reservePost(approved.jobId, 'worker-b', 1_007), {
        kind: 'blocked',
        reason: 'not_due',
        nextAttemptAt: 5_000,
      });
    } finally {
      store.close();
    }
  });
});

test('an earlier overlapping read still extends a wait without replacing newer absence', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const admission = store.reservePost(approved.jobId, 'worker-a', 1_001);
      if (admission.kind !== 'admitted') throw Error('expected admission');
      store.settle(admission, retry(null), 1_002);
      const earlier = store.reserveRead(approved.jobId, 1_003);
      const later = store.reserveRead(approved.jobId, 1_004);
      if (earlier.kind !== 'read_reserved' || later.kind !== 'read_reserved')
        throw Error('expected reads');
      store.settleRead(later, { kind: 'absent', httpStatus: 404, nextAttemptAt: null }, 1_005);
      const result = store.settleRead(earlier, { ...unknown(5_000), httpStatus: 429 }, 1_006);
      assert.equal(result.observed, 'absent');
      assert.equal(result.nextAttemptAt, 5_000);
      assert.deepEqual(store.reservePost(approved.jobId, 'worker-b', 1_007), {
        kind: 'blocked',
        reason: 'not_due',
        nextAttemptAt: 5_000,
      });
    } finally {
      store.close();
    }
  });
});

test('a POST receipt is a durable claim until an exact automatic read verifies it', () => {
  withStore((path) => {
    let store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const admission = store.reservePost(approved.jobId, 'worker', 1_001);
      if (admission.kind !== 'admitted') throw Error('expected admission');
      const claim = present('claimed-vendor-order');
      if (claim.kind !== 'present') throw Error('expected a receipt claim');
      const claimed = store.settle(
        admission,
        {
          classification: 'unknown',
          httpStatus: 201,
          nextAttemptAt: null,
          claimedReceipt: claim.receipt,
        },
        1_002,
      );
      assert.equal(claimed.claimedReceipt?.vendorOrderId, 'claimed-vendor-order');
      assert.equal(claimed.receipt, null);
      assert.equal(claimed.observed, 'unknown');
      assert.equal(claimed.outcome, 'unknown');
      const postSettled = store.events(approved.jobId).at(-1);
      assert.equal(postSettled?.kind, 'post_settled');
      assert.equal(postSettled?.vendorOrderId, null);
      store.close();

      store = openRelayStore(path, 'resume');
      assert.equal(
        store.snapshot(approved.jobId).claimedReceipt?.vendorOrderId,
        'claimed-vendor-order',
      );
      const read = store.reserveRead(approved.jobId, 1_003);
      if (read.kind !== 'read_reserved') throw Error('expected automatic read');
      const mismatch = store.settleRead(read, present('different-vendor-order'), 1_004);
      assert.equal(mismatch.holdReason, 'integrity_failure');
      assert.equal(mismatch.receipt, null);
      assert.equal(mismatch.observed, 'unknown');
      assert.equal(mismatch.outcome, 'unknown');
      assert.equal(store.reservePost(approved.jobId, 'worker', 1_005).kind, 'blocked');
      assert.equal(store.events(approved.jobId).at(-1)?.vendorOrderId, null);
    } finally {
      store.close();
    }
  });
});

test('POST and automatic GET request IDs are durably bound to their reservation and settlement audit events', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      const approved = store.approve(pending.jobId, pending.approvalRevision, 1_000);
      const admission = store.reservePost(approved.jobId, 'worker', 1_001);
      if (admission.kind !== 'admitted') throw Error('expected admission');
      assert.match(admission.requestId, /^[A-Za-z0-9_-]{1,64}$/);
      store.settle(admission, retry(null), 1_002);
      const read = store.reserveRead(approved.jobId, 1_003);
      if (read.kind !== 'read_reserved') throw Error('expected automatic read');
      store.settleRead(read, unknown(), 1_004);
      const events = store.events(approved.jobId);
      assert.equal(
        events.find((event) => event.kind === 'post_reserved')?.requestId,
        admission.requestId,
      );
      assert.equal(
        events.find((event) => event.kind === 'post_settled')?.requestId,
        admission.requestId,
      );
      assert.equal(
        events.find((event) => event.kind === 'read_reserved')?.requestId,
        read.requestId,
      );
      assert.equal(
        events.find((event) => event.kind === 'read_settled')?.requestId,
        read.requestId,
      );
    } finally {
      store.close();
    }
  });
});

test('audit insertion failure rolls back the enclosing state mutation', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const db = new DatabaseSync(path);
    db.exec(`CREATE TRIGGER fail_approval_audit BEFORE INSERT ON audit_events
      WHEN NEW.kind = 'approved' BEGIN SELECT RAISE(ABORT, 'audit failure'); END;`);
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const before = store.events(pending.jobId).length;
    assert.throws(
      () => store.approve(pending.jobId, pending.approvalRevision, 1_001),
      /audit failure/,
    );
    assert.equal(store.snapshot(pending.jobId).approvalState, 'pending');
    assert.equal(store.events(pending.jobId).length, before);
    db.close();
    store.close();
  });
});

test('retry schedule audit and POST settlement roll back together and survive reopen', () => {
  withStore((path) => {
    let store = openRelayStore(path, 'new');
    const db = new DatabaseSync(path);
    try {
      const pending = store.enqueue(order, 'fixture-store', 1_000);
      store.approve(pending.jobId, 0, 1_001);
      const admission = store.reservePost(pending.jobId, 'worker', 1_002);
      assert.equal(admission.kind, 'admitted');
      if (admission.kind !== 'admitted') throw Error('admission missing');
      const before = store.snapshot(pending.jobId);
      const eventsBefore = store.events(pending.jobId);
      const result = {
        classification: 'retryable' as const,
        httpStatus: 429,
        nextAttemptAt: 1_200,
        claimedReceipt: null,
        retryReason: 'malformed_retry_after_fallback' as const,
      };
      db.exec(
        "CREATE TRIGGER fail_retry_audit BEFORE INSERT ON audit_events WHEN NEW.kind = 'retry_scheduled' BEGIN SELECT RAISE(ABORT, 'retry audit failure'); END;",
      );
      assert.throws(() => store.settle(admission, result, 1_100), /retry audit failure/);
      assert.deepEqual(store.snapshot(pending.jobId), before);
      assert.deepEqual(store.events(pending.jobId), eventsBefore);
      db.exec('DROP TRIGGER fail_retry_audit');
      store.settle(admission, result, 1_100);
      store.close();
      store = openRelayStore(path, 'resume');
      const schedule = store
        .events(pending.jobId)
        .find((event) => event.kind === 'retry_scheduled');
      assert.equal(schedule?.reason, 'malformed_retry_after_fallback');
      assert.equal(schedule?.scheduledDelayMs, 100);
      assert.equal(schedule?.requestId, admission.requestId);
    } finally {
      db.close();
      store.close();
    }
  });
});

test('automatic read schedule audit and settlement roll back together', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const db = new DatabaseSync(path);
    try {
      const job = store.enqueue(order, 'fixture-store', 1_000);
      store.approve(job.jobId, 0, 1_001);
      const post = store.reservePost(job.jobId, 'worker', 1_002);
      if (post.kind !== 'admitted') throw Error('admission missing');
      store.settle(
        post,
        {
          classification: 'retryable',
          httpStatus: 503,
          nextAttemptAt: 1_100,
          claimedReceipt: null,
          retryReason: 'full_jitter',
        },
        1_003,
      );
      const read = store.reserveRead(job.jobId, 1_100);
      if (read.kind !== 'read_reserved') throw Error('read missing');
      const before = store.snapshot(job.jobId);
      const eventsBefore = store.events(job.jobId);
      const result = {
        kind: 'unknown' as const,
        reason: 'vendor_unavailable' as const,
        httpStatus: 503,
        nextAttemptAt: 1_300,
        retryReason: 'full_jitter' as const,
      };
      db.exec(
        "CREATE TRIGGER fail_retry_audit BEFORE INSERT ON audit_events WHEN NEW.kind = 'retry_scheduled' BEGIN SELECT RAISE(ABORT, 'retry audit failure'); END;",
      );
      assert.throws(() => store.settleRead(read, result, 1_101), /retry audit failure/);
      assert.deepEqual(store.snapshot(job.jobId), before);
      assert.deepEqual(store.events(job.jobId), eventsBefore);
      db.exec('DROP TRIGGER fail_retry_audit');
      store.settleRead(read, result, 1_101);
      const schedule = store
        .events(job.jobId)
        .findLast((event) => event.kind === 'retry_scheduled');
      assert.equal(schedule?.scheduledDelayMs, 199);
      assert.equal(schedule?.requestId, read.requestId);
    } finally {
      db.close();
      store.close();
    }
  });
});

test('actual corrupt database bytes and unknown schema fail closed without overwriting relay state', () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const corrupt = join(directory, 'corrupt.sqlite');
  const unknown = join(directory, 'unknown.sqlite');
  const legacy = join(directory, 'legacy.sqlite');
  try {
    const corruptBytes = Buffer.from([
      0x46, 0x69, 0x65, 0x6c, 0x64, 0x20, 0x52, 0x65, 0x6c, 0x61, 0x79, 0x00, 0xff,
    ]);
    writeFileSync(corrupt, corruptBytes);
    assert.throws(() => openRelayStore(corrupt, 'resume'), /database|malformed/i);
    assert.deepEqual(readFileSync(corrupt), corruptBytes);
    const unknownDb = new DatabaseSync(unknown);
    unknownDb.exec(
      "CREATE TABLE metadata(name TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO metadata VALUES ('schemaVersion', '99');",
    );
    unknownDb.close();
    assert.throws(() => openRelayStore(unknown, 'resume'), /unknown schema/i);
    const verify = new DatabaseSync(unknown);
    assert.equal(
      verify.prepare("SELECT value FROM metadata WHERE name='schemaVersion'").get()?.value,
      '99',
    );
    verify.close();

    const current = openRelayStore(legacy, 'new');
    current.close();
    const legacyVersion = new DatabaseSync(legacy);
    legacyVersion.prepare("UPDATE metadata SET value = '2' WHERE name = 'schemaVersion'").run();
    legacyVersion.close();
    assert.throws(() => openRelayStore(legacy, 'resume'), /unknown schema/i);
    const verifyLegacy = new DatabaseSync(legacy);
    assert.equal(
      verifyLegacy.prepare("SELECT value FROM metadata WHERE name='schemaVersion'").get()?.value,
      '2',
    );
    verifyLegacy.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('transaction lock fails within the configured busy bound without partial mutation', () => {
  withStore((path) => {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    const lock = new DatabaseSync(path);
    lock.exec('BEGIN EXCLUSIVE');
    const started = Date.now();
    assert.throws(() => store.approve(pending.jobId, pending.approvalRevision, 1_001));
    assert.ok(Date.now() - started < 1_000);
    lock.exec('ROLLBACK');
    lock.close();
    assert.equal(store.snapshot(pending.jobId).approvalState, 'pending');
    store.close();
  });
});

test('separate connections preserve admission ordering and monotonic attempts/audit across resume', () => {
  withStore((path) => {
    let first = openRelayStore(path, 'new');
    const pending = first.enqueue(order, 'fixture-store', 1_000);
    const approved = first.approve(pending.jobId, pending.approvalRevision, 1_000);
    const second = openRelayStore(path, 'resume');
    second.enqueue({ ...order, quantity: 4 }, 'fixture-store', 1_001);
    assert.equal(first.reservePost(approved.jobId, 'first', 1_002).kind, 'blocked');
    first.close();
    second.close();
    first = openRelayStore(path, 'resume');
    const clean = first.enqueue({ ...order, orderId: '0008' }, 'fixture-store', 2_000);
    first.approve(clean.jobId, clean.approvalRevision, 2_000);
    const admission = first.reservePost(clean.jobId, 'first', 2_001);
    if (admission.kind !== 'admitted') throw Error('expected admission');
    const competitor = openRelayStore(path, 'resume');
    competitor.enqueue({ ...order, orderId: '0008', quantity: 4 }, 'fixture-store', 2_002);
    assert.equal(first.snapshot(clean.jobId).order.quantity, 3);
    assert.equal(first.reservePost(clean.jobId, 'second', 2_003).kind, 'blocked');
    const events = first.events(clean.jobId);
    assert.deepEqual(
      events.map((event) => event.sequence),
      [...events.map((event) => event.sequence)].sort((a, b) => a - b),
    );
    assert.equal(admission.attempt, 1);
    competitor.close();
    first.close();
  });
});

test('process termination between RelayStore state and audit writes leaves both unchanged', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  let child: OwnedChild | undefined;
  try {
    const store = openRelayStore(path, 'new');
    const pending = store.enqueue(order, 'fixture-store', 1_000);
    store.close();

    child = startHarness('abort-approval', path, pending.jobId);
    const barrier = await waitForHarness(child, 'barrier', 'before-audit-insert');
    assert.equal(barrier.operation, 'before-audit-insert');
    assert.equal(child.child.kill('SIGKILL'), true);
    const exited = await waitForExit(child, 'approval transaction barrier');
    assert.equal(exited.signal, 'SIGKILL');

    const recovered = openRelayStore(path, 'resume');
    try {
      const snapshot = recovered.snapshot(pending.jobId);
      assert.equal(snapshot.approvalState, 'pending');
      assert.equal(snapshot.approvalRevision, pending.approvalRevision);
      assert.deepEqual(
        recovered.events(pending.jobId).map((event) => event.kind),
        ['enqueued'],
      );
    } finally {
      recovered.close();
    }
  } finally {
    if (child) await terminateOwnedChild(child, 'approval transaction cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('two real worker processes commit a conflict before admission and block the reservation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  let reserver: OwnedChild | undefined;
  let conflicter: OwnedChild | undefined;
  try {
    const approved = createApprovedJob(path, 1_000);
    reserver = startHarness('worker', path, approved.jobId);
    conflicter = startHarness('worker', path, approved.jobId);
    await Promise.all([
      waitForHarness(reserver, 'ready', 'worker'),
      waitForHarness(conflicter, 'ready', 'worker'),
    ]);

    sendHarnessCommand(conflicter, 'conflict', 1_001);
    const conflict = asObject((await waitForHarness(conflicter, 'result', 'conflict')).result);
    assert.equal(conflict.holdReason, 'content_conflict');
    assert.deepEqual(conflict.order, order);

    sendHarnessCommand(reserver, 'reserve', 1_002);
    assert.deepEqual((await waitForHarness(reserver, 'result', 'reserve')).result, {
      kind: 'blocked',
      reason: 'content_conflict',
    });

    const recovered = openRelayStore(path, 'resume');
    try {
      const snapshot = recovered.snapshot(approved.jobId);
      assert.equal(snapshot.postReservations, 0);
      assert.equal(snapshot.holdReason, 'content_conflict');
      assert.deepEqual(snapshot.order, order);
    } finally {
      recovered.close();
    }
    await closeWorker(reserver, 'pre-admission reserver');
    await closeWorker(conflicter, 'pre-admission conflicter');
  } finally {
    if (reserver) await terminateOwnedChild(reserver, 'pre-admission reserver cleanup');
    if (conflicter) await terminateOwnedChild(conflicter, 'pre-admission conflicter cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('two real worker processes preserve the admitted body after conflict and block future writes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  let reserver: OwnedChild | undefined;
  let conflicter: OwnedChild | undefined;
  try {
    const approved = createApprovedJob(path, 1_000);
    reserver = startHarness('worker', path, approved.jobId);
    conflicter = startHarness('worker', path, approved.jobId);
    await Promise.all([
      waitForHarness(reserver, 'ready', 'worker'),
      waitForHarness(conflicter, 'ready', 'worker'),
    ]);

    sendHarnessCommand(reserver, 'reserve', 1_001);
    const admission = asObject((await waitForHarness(reserver, 'result', 'reserve')).result);
    assert.equal(admission.kind, 'admitted');
    assert.equal(admission.attempt, 1);
    assert.deepEqual(admission.order, order);

    sendHarnessCommand(conflicter, 'conflict', 1_002);
    const conflict = asObject((await waitForHarness(conflicter, 'result', 'conflict')).result);
    assert.equal(conflict.holdReason, 'content_conflict');
    assert.deepEqual(conflict.order, order);

    sendHarnessCommand(reserver, 'settle', 1_003);
    assert.equal(
      asObject((await waitForHarness(reserver, 'result', 'settle')).result).holdReason,
      'content_conflict',
    );
    sendHarnessCommand(conflicter, 'reserve', 1_004);
    assert.deepEqual((await waitForHarness(conflicter, 'result', 'reserve')).result, {
      kind: 'blocked',
      reason: 'content_conflict',
    });

    const recovered = openRelayStore(path, 'resume');
    try {
      const snapshot = recovered.snapshot(approved.jobId);
      assert.equal(snapshot.postReservations, 1);
      assert.equal(snapshot.holdReason, 'content_conflict');
      assert.deepEqual(snapshot.order, order);
    } finally {
      recovered.close();
    }
    await closeWorker(reserver, 'post-admission reserver');
    await closeWorker(conflicter, 'post-admission conflicter');
  } finally {
    if (reserver) await terminateOwnedChild(reserver, 'post-admission reserver cleanup');
    if (conflicter) await terminateOwnedChild(conflicter, 'post-admission conflicter cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('competing resumed workers keep multiple reservation and audit IDs strictly monotonic', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-state-'));
  const path = join(directory, 'relay.sqlite');
  let first: OwnedChild | undefined;
  let second: OwnedChild | undefined;
  try {
    const approved = createApprovedJob(path, 1_000);
    first = startHarness('worker', path, approved.jobId);
    second = startHarness('worker', path, approved.jobId);
    await Promise.all([
      waitForHarness(first, 'ready', 'worker'),
      waitForHarness(second, 'ready', 'worker'),
    ]);

    sendHarnessCommand(first, 'reserve', 1_001);
    const firstAdmission = asObject((await waitForHarness(first, 'result', 'reserve')).result);
    assert.equal(firstAdmission.kind, 'admitted');
    assert.equal(firstAdmission.attempt, 1);

    sendHarnessCommand(second, 'reserve', 1_002);
    assert.deepEqual((await waitForHarness(second, 'result', 'reserve')).result, {
      kind: 'blocked',
      reason: 'leased',
    });

    sendHarnessCommand(first, 'settle', 1_003);
    await waitForHarness(first, 'result', 'settle');
    sendHarnessCommand(second, 'reserve', 1_004);
    const secondAdmission = asObject((await waitForHarness(second, 'result', 'reserve')).result);
    assert.equal(secondAdmission.kind, 'admitted');
    assert.equal(secondAdmission.attempt, 2);
    sendHarnessCommand(second, 'settle', 1_005);
    await waitForHarness(second, 'result', 'settle');

    await closeWorker(first, 'first monotonic worker');
    await closeWorker(second, 'second monotonic worker');
    const recovered = openRelayStore(path, 'resume');
    try {
      const events = recovered.events(approved.jobId);
      const attempts = events
        .filter((event) => event.kind === 'post_reserved')
        .map((event) => event.attempt);
      assert.deepEqual(attempts, [1, 2]);
      assert.ok(events.length > 1);
      for (let index = 1; index < events.length; index += 1) {
        assert.ok(events[index]!.sequence > events[index - 1]!.sequence);
      }
      assert.equal(recovered.snapshot(approved.jobId).postReservations, 2);
    } finally {
      recovered.close();
    }
  } finally {
    if (first) await terminateOwnedChild(first, 'first monotonic worker cleanup');
    if (second) await terminateOwnedChild(second, 'second monotonic worker cleanup');
    rmSync(directory, { recursive: true, force: true });
  }
});

test('resume refuses changed journal mode without rewriting it', () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-journal-'));
  const path = join(directory, 'relay.sqlite');
  try {
    openRelayStore(path, 'new').close();
    const changed = new DatabaseSync(path);
    changed.exec('PRAGMA journal_mode = DELETE;');
    changed.close();
    assert.throws(() => openRelayStore(path, 'resume').close(), /WAL/);
    const inspected = new DatabaseSync(path);
    try {
      assert.equal(inspected.prepare('PRAGMA journal_mode').get()?.journal_mode, 'delete');
    } finally {
      inspected.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
