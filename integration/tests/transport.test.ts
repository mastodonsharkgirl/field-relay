import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

import { identify, type Order } from '../relay/contract.ts';
import { dispatch, inspectOrder } from '../relay/dispatch.ts';
import { openRelayStore } from '../relay/state.ts';
import { exchange } from '../relay/transport.ts';
import { withVendor, type VendorProcess } from './helpers/vendor-process.ts';

const schedulerToleranceMs = 150;

for (const fault of ['malformed_404', 'slow_404', 'invalid_404', 'mismatched_404']) {
  test('invalid absence evidence cannot authorize a second POST: ' + fault, async () => {
    await withVendor(async (vendor) => {
      const order = orderFor('INVALID-ABSENCE-' + fault);
      const key = identify(order).idempotencyKey;
      await vendor.configure(key, ['503_once', fault]);
      await withApprovedJob(vendor, order, async (store, jobId) => {
        const result = await dispatch(store, jobId, vendor.connection, 'absence-worker');
        assert.equal(result.postReservations, 1);
        assert.equal(result.holdReason, 'integrity_failure');
        assert.equal(result.observed, 'unknown');
        assert.equal(
          store.events(jobId).findLast((event) => event.kind === 'read_settled')?.httpStatus,
          404,
        );
        await vendor.configure(key, [fault]);
        const inspected = await inspectOrder(store, jobId, vendor.connection);
        assert.equal(inspected.observed, 'unknown');
        assert.equal(
          store.events(jobId).findLast((event) => event.kind === 'operator_inspection')?.observed,
          'unknown',
        );
      });
    });
  });
}

const orderFor = (orderId: string): Order => ({
  schemaVersion: 1,
  partner: 'northstar',
  orderId,
  region: 'North',
  quantity: 3,
  amountMinor: 4_250,
});

/* eslint-disable no-unused-vars -- Callable test helper parameter names document its contract. */
const withApprovedJob = async <T>(
  vendor: VendorProcess,
  order: Order,
  runWithJob: (store: ReturnType<typeof openRelayStore>, jobId: string) => Promise<T>,
) => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-transport-'));
  const path = join(directory, 'relay.sqlite');
  const store = openRelayStore(path, 'new');
  try {
    const pending = store.enqueue(order, vendor.connection.storeId, Date.now());
    const approved = store.approve(pending.jobId, pending.approvalRevision, Date.now());
    return await runWithJob(store, approved.jobId);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
};
/* eslint-enable no-unused-vars */

const waitFor = async (condition: () => boolean, timeoutMs: number) => {
  const endsAt = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= endsAt) throw Error('timed out waiting for relay state');
    await delay(10);
  }
};

const assertScenarioCounts = async (
  vendor: VendorProcess,
  key: string,
  post: number,
  get: number,
) => {
  const observed = await vendor.observe(key);
  assert.deepEqual(observed.requestCount, { post, get });
};

test('healthy dispatch persists exact HTTP readback before delivery and operator inspection never posts', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-HEALTHY');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['healthy']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const delivered = await dispatch(store, jobId, vendor.connection, 'worker-healthy');
      assert.equal(delivered.outcome, 'delivered');
      assert.equal(delivered.observed, 'present');
      assert.deepEqual(delivered.receipt?.order, order);
      assert.equal(delivered.receipt?.idempotencyKey, identity.idempotencyKey);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);

      const events = store.events(jobId);
      const postReserved = events.find((event) => event.kind === 'post_reserved');
      const postSettled = events.find((event) => event.kind === 'post_settled');
      const readReserved = events.find((event) => event.kind === 'read_reserved');
      const readSettled = events.find((event) => event.kind === 'read_settled');
      assert.ok(postReserved?.requestId);
      assert.equal(postSettled?.requestId, postReserved?.requestId);
      assert.ok(readReserved?.requestId);
      assert.equal(readSettled?.requestId, readReserved?.requestId);
      const wireEvidence = await vendor.observe(identity.idempotencyKey);
      assert.deepEqual(wireEvidence.requestIds, {
        post: [postReserved?.requestId],
        get: [readReserved?.requestId],
      });

      const inspected = await inspectOrder(store, jobId, vendor.connection);
      assert.equal(inspected.outcome, 'delivered');
      assert.equal(store.events(jobId).at(-1)?.kind, 'operator_inspection');
      const inspectedRequests = await vendor.observe(identity.idempotencyKey);
      assert.equal(store.events(jobId).at(-1)?.requestId, inspectedRequests.requestIds.get.at(-1));
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 2);
    });
  });
});

test('a real 429 waits for Retry-After before reconciliation and then sends the same immutable order', async (t) => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-429');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['429_once']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-429');
      assert.equal(result.outcome, 'delivered');
      assert.deepEqual(result.receipt?.order, order);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 2, 2);

      const events = store.events(jobId);
      const schedule = events.find((event) => event.kind === 'retry_scheduled');
      assert.equal(schedule?.reason, 'retry_after');
      assert.equal(schedule?.scheduledDelayMs, 1_000);
      const limited = events.find(
        (event) => event.kind === 'post_settled' && event.httpStatus === 429,
      );
      const reconciliation = events.find(
        (event) => event.kind === 'read_reserved' && limited !== undefined && event.at > limited.at,
      );
      assert.ok(limited?.nextAttemptAt !== null && limited?.nextAttemptAt !== undefined);
      assert.ok(reconciliation);
      if (!limited || !reconciliation || limited.nextAttemptAt === null) {
        throw Error('expected a scheduled 429 reconciliation');
      }
      const requested = limited.nextAttemptAt - limited.at;
      const actual = reconciliation.at - limited.at;
      assert.ok(
        Math.abs(actual - requested) <= schedulerToleranceMs,
        'expected ' + String(requested) + 'ms delay, saw ' + String(actual) + 'ms',
      );
      t.diagnostic(
        '429 requested ' +
          String(requested) +
          'ms; first reconciliation observed after ' +
          String(actual) +
          'ms.',
      );
    });
  });
});

test('a malformed Retry-After header records its fallback through real HTTP', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-BAD-RETRY-HEADER');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['429_invalid_retry_after']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-bad-retry-header');
      assert.equal(result.outcome, 'delivered');
      const schedule = store.events(jobId).find((event) => event.kind === 'retry_scheduled');
      assert.equal(schedule?.reason, 'malformed_retry_after_fallback');
      assert.ok(
        schedule &&
          schedule.scheduledDelayMs !== null &&
          schedule.scheduledDelayMs >= 0 &&
          schedule.scheduledDelayMs <= 250,
      );
      await assertScenarioCounts(vendor, identity.idempotencyKey, 2, 2);
    });
  });
});

test('a huge real Retry-After persists a null-due deferral and blocks later automatic requests', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-HUGE-RETRY-AFTER');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['429_huge_retry_after']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const deferred = await dispatch(store, jobId, vendor.connection, 'worker-huge-retry-after');
      assert.equal(deferred.outcome, 'retryable');
      assert.equal(deferred.holdReason, 'deferred_outside_deadline');
      assert.equal(deferred.nextAttemptAt, null);
      const schedule = store.events(jobId).find((event) => event.kind === 'retry_scheduled');
      assert.equal(schedule?.reason, 'retry_after_unrepresentable');
      assert.equal(schedule?.nextAttemptAt, null);
      assert.equal(schedule?.scheduledDelayMs, null);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);

      const repeated = await dispatch(store, jobId, vendor.connection, 'worker-huge-retry-after');
      assert.equal(repeated.holdReason, 'deferred_outside_deadline');
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
    });
  });
});

test('dispatch rechecks durable approval after a Retry-After wait before admitting another POST', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-REVOKED-WAIT');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['429_once']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const pending = dispatch(store, jobId, vendor.connection, 'worker-revoked');
      await waitFor(
        () =>
          store
            .events(jobId)
            .some((event) => event.kind === 'post_settled' && event.httpStatus === 429),
        2_000,
      );
      const snapshot = store.snapshot(jobId);
      store.revoke(jobId, snapshot.approvalRevision, 'test revocation during backoff', Date.now());
      const result = await pending;
      assert.equal(result.approvalState, 'revoked');
      assert.equal(result.postReservations, 1);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);
    });
  });
});

test('three transient reservations remain bounded after readbacks prove the vendor is absent', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-THREE-TRANSIENTS');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['429_repeat']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-transient');
      assert.equal(result.holdReason, 'post_budget_exhausted');
      assert.equal(result.postReservations, 3);
      assert.equal(result.getReservations, 3);
      assert.equal(result.observed, 'absent');
      await assertScenarioCounts(vendor, identity.idempotencyKey, 3, 3);
    });
  });
});

test('a permanent vendor failure settles without an automatic retry', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-PERMANENT');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['422']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-permanent');
      const repeated = await dispatch(store, jobId, vendor.connection, 'worker-permanent-repeat');
      assert.equal(repeated.postReservations, 1);
      assert.equal(result.outcome, 'permanent_failure');
      assert.equal(result.postReservations, 1);
      assert.equal(result.getReservations, 0);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
    });
  });
});

test('a committed response loss reaches delivery through exact readback without a duplicate POST', async (t) => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-LOSS');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['timeout_after_commit']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const startedAt = Date.now();
      const result = await dispatch(store, jobId, vendor.connection, 'worker-loss');
      const elapsed = Date.now() - startedAt;
      assert.equal(result.outcome, 'delivered');
      assert.deepEqual(result.receipt?.order, order);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);
      assert.ok(
        elapsed >= 700,
        'response-loss recovery should include the bounded response deadline',
      );
      t.diagnostic('response-loss recovery completed in ' + String(elapsed) + 'ms.');
    });
  });
});

test('a malformed success only becomes delivered after a valid readback', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-MALFORMED');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['malformed_success']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-malformed');
      assert.equal(result.outcome, 'delivered');
      assert.deepEqual(result.receipt?.order, order);
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);
    });
  });
});

test('an uncommitted malformed 2xx is read back once and held instead of being blindly resent', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-MALFORMED-ABSENT');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['malformed_success_absent']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-malformed-absent');
      assert.equal(result.outcome, 'unknown');
      assert.equal(result.holdReason, 'integrity_failure');
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);
    });
  });
});

test('malformed terminal status responses settle permanently without automatic retry', async () => {
  await withVendor(async (vendor) => {
    for (const [scenario, status] of [
      ['malformed_401', 401],
      ['malformed_403', 403],
      ['malformed_422', 422],
      ['malformed_500', 500],
    ] as const) {
      const order = orderFor('HTTP-' + scenario.toUpperCase());
      const identity = identify(order);
      await vendor.configure(identity.idempotencyKey, [scenario]);
      await withApprovedJob(vendor, order, async (store, jobId) => {
        const result = await dispatch(store, jobId, vendor.connection, 'worker-' + scenario);
        assert.equal(result.outcome, 'permanent_failure');
        assert.equal(result.postReservations, 1);
        assert.equal(result.getReservations, 0);
        assert.equal(
          store.events(jobId).find((event) => event.kind === 'post_settled')?.httpStatus,
          status,
        );
        await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
      });
    }
  });
});

test('a malformed 429 preserves Retry-After through the next reconciliation request', async (t) => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-MALFORMED-429');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['malformed_429']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-malformed-429');
      assert.equal(result.outcome, 'delivered');
      await assertScenarioCounts(vendor, identity.idempotencyKey, 2, 2);
      const events = store.events(jobId);
      const limited = events.find(
        (event) => event.kind === 'post_settled' && event.httpStatus === 429,
      );
      const reconciliation = events.find(
        (event) => event.kind === 'read_reserved' && limited !== undefined && event.at > limited.at,
      );
      assert.ok(limited?.nextAttemptAt !== null && limited?.nextAttemptAt !== undefined);
      assert.ok(reconciliation);
      if (!limited || !reconciliation || limited.nextAttemptAt === null) {
        throw Error('expected a scheduled malformed-429 reconciliation');
      }
      const requested = limited.nextAttemptAt - limited.at;
      const actual = reconciliation.at - limited.at;
      assert.ok(
        Math.abs(actual - requested) <= schedulerToleranceMs,
        'expected ' + String(requested) + 'ms delay, saw ' + String(actual) + 'ms',
      );
      t.diagnostic(
        'malformed 429 requested ' +
          String(requested) +
          'ms; readback began after ' +
          String(actual) +
          'ms.',
      );
    });
  });
});

test('a claimed POST receipt that disagrees with a valid readback is held without a second POST', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-CLAIMED-RECEIPT-MISMATCH');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['claimed_receipt_mismatch']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-claimed-mismatch');
      assert.equal(result.outcome, 'unknown');
      assert.equal(result.holdReason, 'integrity_failure');
      assert.equal(result.receipt, null);
      assert.ok(result.claimedReceipt);
      assert.equal(
        store.events(jobId).find((event) => event.kind === 'post_settled')?.vendorOrderId,
        null,
      );
      assert.equal(
        store.events(jobId).find((event) => event.kind === 'read_settled')?.vendorOrderId,
        null,
      );
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);
    });
  });
});

test('a readback outage consumes a bounded GET and retries only the read', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-READ-OUTAGE');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['readback_unavailable']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-read-outage');
      assert.equal(result.outcome, 'delivered');
      assert.equal(result.postReservations, 1);
      assert.equal(result.getReservations, 2);
      const schedule = store.events(jobId).find((event) => event.kind === 'retry_scheduled');
      assert.equal(schedule?.reason, 'full_jitter');
      assert.ok(
        schedule &&
          schedule.scheduledDelayMs !== null &&
          schedule.scheduledDelayMs >= 0 &&
          schedule.scheduledDelayMs <= 250,
      );
      assert.equal(
        schedule?.requestId,
        store.events(jobId).find((event) => event.kind === 'read_reserved')?.requestId,
      );
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 2);
    });
  });
});

test('a mismatched vendor readback holds writes without a second POST', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-FALSE-READBACK');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['mismatched_readback']);
    await withApprovedJob(vendor, order, async (store, jobId) => {
      const result = await dispatch(store, jobId, vendor.connection, 'worker-mismatch');
      assert.equal(result.outcome, 'unknown');
      assert.equal(result.holdReason, 'integrity_failure');
      await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 1);
    });
  });
});

test('transport refuses redirects, hostile paths, and invalid ports before credentials can reach another request', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-TRANSPORT-GUARDS');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['redirect']);
    const redirected = await exchange(vendor.connection, {
      method: 'POST',
      path: '/v1/orders',
      requestId: 'redirect-post',
      order,
      key: identity.idempotencyKey,
    });
    assert.equal(redirected.kind, 'protocol_error');
    if (redirected.kind !== 'protocol_error') throw Error('expected a redirect protocol error');
    assert.equal(redirected.reason, 'redirect_refused');
    await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);

    const hostile = await exchange(vendor.connection, {
      method: 'GET',
      path: '/v1/orders/' + identity.idempotencyKey + '?forward=elsewhere',
      requestId: 'hostile-read',
      key: identity.idempotencyKey,
    });
    const invalidPort = await exchange(
      { ...vendor.connection, port: 0 },
      {
        method: 'GET',
        path: '/v1/orders/' + identity.idempotencyKey,
        requestId: 'invalid-port-read',
        key: identity.idempotencyKey,
      },
    );
    assert.equal(hostile.kind, 'protocol_error');
    assert.equal(invalidPort.kind, 'protocol_error');
    await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
  });
});

test('the total transport deadline includes a slowly streamed response body', async (t) => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-SLOW-BODY');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['slow_body']);
    const startedAt = Date.now();
    const result = await exchange(vendor.connection, {
      method: 'POST',
      path: '/v1/orders',
      requestId: 'slow-body-post',
      order,
      key: identity.idempotencyKey,
    });
    const elapsed = Date.now() - startedAt;
    assert.equal(result.kind, 'timeout');
    if (result.kind !== 'timeout') throw Error('expected complete-body timeout');
    assert.equal(result.httpStatus, 201);
    assert.equal(result.retryAfter, null);
    assert.ok(elapsed >= 650 && elapsed <= 1_100, 'expected a bounded whole-body timeout');
    await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
    t.diagnostic('slow-body timeout observed after ' + String(elapsed) + 'ms.');
  });
});

test('the response byte cap rejects an oversized body after response headers', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-OVERSIZED-BODY');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['oversized_response']);
    const result = await exchange(vendor.connection, {
      method: 'POST',
      path: '/v1/orders',
      requestId: 'oversized-body-post',
      order,
      key: identity.idempotencyKey,
    });
    assert.equal(result.kind, 'protocol_error');
    if (result.kind !== 'protocol_error') throw Error('expected an oversized protocol error');
    assert.equal(result.reason, 'response_too_large');
    assert.equal(result.httpStatus, 201);
    assert.equal(result.retryAfter, null);
    await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
  });
});

test('a content-type failure preserves only the bounded status metadata from a real response', async () => {
  await withVendor(async (vendor) => {
    const order = orderFor('HTTP-WRONG-CONTENT-TYPE');
    const identity = identify(order);
    await vendor.configure(identity.idempotencyKey, ['wrong_content_type_success']);
    const result = await exchange(vendor.connection, {
      method: 'POST',
      path: '/v1/orders',
      requestId: 'wrong-content-type-post',
      order,
      key: identity.idempotencyKey,
    });
    assert.equal(result.kind, 'protocol_error');
    if (result.kind !== 'protocol_error') throw Error('expected a content-type protocol error');
    assert.equal(result.reason, 'invalid_content_type');
    assert.equal(result.httpStatus, 201);
    assert.equal(result.retryAfter, null);
    await assertScenarioCounts(vendor, identity.idempotencyKey, 1, 0);
  });
});
