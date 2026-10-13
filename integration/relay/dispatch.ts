import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { parseReceipt } from './contract.ts';
import { isRetryableStatus, retryDecision } from './retry.ts';
import type { JobSnapshot, ReadObservation, RelayStore } from './state-types.ts';
import { exchange, type HttpResult, type VendorConnection } from './transport.ts';

type ReadStep =
  | {
      kind: 'present' | 'absent' | 'scheduled' | 'not_due' | 'deferred' | 'integrity';
      snapshot: JobSnapshot;
    }
  | { kind: 'blocked'; snapshot: JobSnapshot };

const currentTime = () => Date.now();

const requiresReconciliation = (snapshot: JobSnapshot) =>
  snapshot.postReservations > 0 &&
  snapshot.observed !== 'present' &&
  (snapshot.outcome === 'retryable' ||
    snapshot.outcome === 'unknown' ||
    snapshot.holdReason === 'recovery_readback_required');

const persistAutomaticBlock = (
  store: RelayStore,
  jobId: string,
  reason: 'post_budget_exhausted' | 'read_budget_exhausted' | 'deadline_expired',
  now: number,
) => store.hold(jobId, reason, now);

const waitForDue = async (store: RelayStore, jobId: string) => {
  const beforeWait = store.snapshot(jobId);
  const dueAt = beforeWait.nextAttemptAt;
  if (dueAt !== null) {
    const remaining = dueAt - currentTime();
    if (remaining > 0) await sleep(remaining);
  }
  return store.snapshot(jobId);
};

const unknownObservation = (
  reason: Extract<ReadObservation, { kind: 'unknown' }>['reason'],
  httpStatus: number | null,
  nextAttemptAt: number | null,
  deferred: boolean,
): ReadObservation => ({
  kind: 'unknown',
  reason,
  httpStatus,
  nextAttemptAt,
  ...(deferred ? { holdReason: 'deferred_outside_deadline' as const } : {}),
});

const retryRead = (
  store: RelayStore,
  jobId: string,
  reservation: Extract<ReturnType<RelayStore['reserveRead']>, { kind: 'read_reserved' }>,
  snapshot: JobSnapshot,
  reason: Extract<ReadObservation, { kind: 'unknown' }>['reason'],
  httpStatus: number | null,
  retryAfter: string | null,
  now: number,
): ReadStep => {
  const decision = retryDecision({
    attempt: reservation.attempt,
    now,
    deadlineAt: snapshot.deadlineAt ?? now,
    retryAfter,
    random: Math.random(),
  });
  const settled = store.settleRead(
    reservation,
    unknownObservation(
      reason,
      httpStatus,
      decision.nextAttemptAt,
      decision.kind === 'deferred_outside_deadline',
    ),
    now,
  );
  return {
    kind: decision.kind === 'deferred_outside_deadline' ? 'deferred' : 'scheduled',
    snapshot: settled,
  };
};

const readVendor = async (
  store: RelayStore,
  jobId: string,
  connection: VendorConnection,
  requireVerifiedReceipt: boolean,
): Promise<ReadStep> => {
  const reservation = store.reserveRead(jobId, currentTime());
  if (reservation.kind === 'blocked') {
    if (reservation.reason === 'not_due')
      return { kind: 'not_due', snapshot: store.snapshot(jobId) };
    if (
      reservation.reason === 'read_budget_exhausted' ||
      reservation.reason === 'deadline_expired'
    ) {
      return {
        kind: 'blocked',
        snapshot: persistAutomaticBlock(store, jobId, reservation.reason, currentTime()),
      };
    }
    return { kind: 'blocked', snapshot: store.snapshot(jobId) };
  }
  const snapshot = store.snapshot(jobId);
  const result = await exchange(connection, {
    method: 'GET',
    path: '/v1/orders/' + snapshot.identity.idempotencyKey,
    requestId: reservation.requestId,
    key: snapshot.identity.idempotencyKey,
  });
  const now = currentTime();
  if (result.kind === 'response' && result.status === 200) {
    try {
      const receipt = parseReceipt(result.body, snapshot.order, snapshot.vendorStoreId);
      return {
        kind: 'present',
        snapshot: store.settleRead(
          reservation,
          { kind: 'present', receipt, httpStatus: result.status, nextAttemptAt: null },
          now,
        ),
      };
    } catch {
      const settled = store.settleRead(
        reservation,
        unknownObservation('readback_mismatch', result.status, null, false),
        now,
      );
      return {
        kind: 'integrity',
        snapshot: store.hold(jobId, 'integrity_failure', now) ?? settled,
      };
    }
  }
  if (result.kind === 'response' && result.status === 404) {
    const settled = store.settleRead(
      reservation,
      { kind: 'absent', httpStatus: result.status, nextAttemptAt: null },
      now,
    );
    return {
      kind: requireVerifiedReceipt ? 'integrity' : 'absent',
      snapshot: requireVerifiedReceipt ? store.hold(jobId, 'integrity_failure', now) : settled,
    };
  }
  const retryable = result.kind !== 'response' || isRetryableStatus(result.status);
  if (retryable) {
    const reason =
      result.kind === 'response'
        ? 'vendor_unavailable'
        : result.kind === 'protocol_error'
          ? 'protocol_failure'
          : 'network_failure';
    return retryRead(
      store,
      jobId,
      reservation,
      snapshot,
      reason,
      result.kind === 'response' ? result.status : null,
      result.kind === 'response' ? result.retryAfter : null,
      now,
    );
  }
  const settled = store.settleRead(
    reservation,
    unknownObservation('protocol_failure', result.status, null, false),
    now,
  );
  return { kind: 'integrity', snapshot: store.hold(jobId, 'integrity_failure', now) ?? settled };
};

const settlePostRetry = (
  store: RelayStore,
  admission: Extract<ReturnType<RelayStore['reservePost']>, { kind: 'admitted' }>,
  result: HttpResult,
  now: number,
) => {
  const decision = retryDecision({
    attempt: admission.attempt,
    now,
    deadlineAt: admission.deadlineAt,
    retryAfter: result.kind === 'response' ? result.retryAfter : null,
    random: Math.random(),
  });
  return {
    decision,
    snapshot: store.settle(
      admission,
      {
        classification: 'retryable',
        httpStatus: result.kind === 'response' ? result.status : null,
        nextAttemptAt: decision.nextAttemptAt,
        receipt: null,
        ...(decision.kind === 'deferred_outside_deadline'
          ? { holdReason: 'deferred_outside_deadline' as const }
          : {}),
      },
      now,
    ),
  };
};

export const dispatch = async (
  store: RelayStore,
  jobId: string,
  connection: VendorConnection,
  workerId: string,
): Promise<JobSnapshot> => {
  let reconcile = requiresReconciliation(store.snapshot(jobId));
  while (true) {
    const snapshot = store.snapshot(jobId);
    if (snapshot.vendorStoreId !== connection.storeId) {
      return store.hold(jobId, 'store_mismatch', currentTime());
    }
    if (
      snapshot.holdReason === 'deferred_outside_deadline' ||
      snapshot.outcome === 'delivered' ||
      snapshot.observed === 'present'
    ) {
      return snapshot;
    }
    if (reconcile) {
      const read = await readVendor(store, jobId, connection, snapshot.outcome === 'unknown');
      if (read.kind === 'present' || read.kind === 'integrity' || read.kind === 'deferred') {
        return read.snapshot;
      }
      if (read.kind === 'scheduled' || read.kind === 'not_due') {
        await waitForDue(store, jobId);
        reconcile = true;
        continue;
      }
      if (read.kind === 'blocked') return read.snapshot;
      reconcile = false;
      continue;
    }

    const admission = store.reservePost(jobId, workerId, currentTime());
    if (admission.kind === 'blocked') {
      if (admission.reason === 'recovery_readback_required') {
        reconcile = true;
        continue;
      }
      if (admission.reason === 'not_due') {
        await waitForDue(store, jobId);
        reconcile = requiresReconciliation(store.snapshot(jobId));
        continue;
      }
      if (admission.reason === 'post_budget_exhausted' || admission.reason === 'deadline_expired') {
        return persistAutomaticBlock(store, jobId, admission.reason, currentTime());
      }
      return store.snapshot(jobId);
    }

    const result = await exchange(connection, {
      method: 'POST',
      path: '/v1/orders',
      requestId: randomUUID(),
      order: admission.order,
      key: admission.identity.idempotencyKey,
    });
    const now = currentTime();
    if (result.kind === 'response' && result.status >= 200 && result.status < 300) {
      try {
        parseReceipt(result.body, admission.order, connection.storeId);
      } catch {
        // A malformed 2xx still needs actual vendor readback before any outcome is trusted.
      }
      store.settle(
        admission,
        {
          classification: 'unknown',
          httpStatus: result.status,
          nextAttemptAt: null,
          receipt: null,
        },
        now,
      );
      reconcile = true;
      continue;
    }
    if (result.kind !== 'response' || isRetryableStatus(result.status)) {
      const settled = settlePostRetry(store, admission, result, now);
      if (settled.decision.kind === 'deferred_outside_deadline') return settled.snapshot;
      reconcile = true;
      continue;
    }
    return store.settle(
      admission,
      {
        classification: 'permanent_failure',
        httpStatus: result.status,
        nextAttemptAt: null,
        receipt: null,
      },
      now,
    );
  }
};

export const inspectOrder = async (
  store: RelayStore,
  jobId: string,
  connection: VendorConnection,
): Promise<JobSnapshot> => {
  const snapshot = store.snapshot(jobId);
  const now = currentTime();
  if (snapshot.vendorStoreId !== connection.storeId) {
    store.recordInspection(jobId, unknownObservation('protocol_failure', null, null, false), now);
    return store.hold(jobId, 'store_mismatch', now);
  }
  const result = await exchange(connection, {
    method: 'GET',
    path: '/v1/orders/' + snapshot.identity.idempotencyKey,
    requestId: randomUUID(),
    key: snapshot.identity.idempotencyKey,
  });
  const observedAt = currentTime();
  if (result.kind === 'response' && result.status === 200) {
    try {
      const receipt = parseReceipt(result.body, snapshot.order, snapshot.vendorStoreId);
      return store.recordInspection(
        jobId,
        { kind: 'present', receipt, httpStatus: result.status, nextAttemptAt: null },
        observedAt,
      );
    } catch {
      store.recordInspection(
        jobId,
        unknownObservation('readback_mismatch', result.status, null, false),
        observedAt,
      );
      return store.hold(jobId, 'integrity_failure', observedAt);
    }
  }
  if (result.kind === 'response' && result.status === 404) {
    return store.recordInspection(
      jobId,
      { kind: 'absent', httpStatus: result.status, nextAttemptAt: null },
      observedAt,
    );
  }
  const reason =
    result.kind === 'response'
      ? 'protocol_failure'
      : result.kind === 'protocol_error'
        ? 'protocol_failure'
        : 'network_failure';
  return store.recordInspection(
    jobId,
    unknownObservation(reason, result.kind === 'response' ? result.status : null, null, false),
    observedAt,
  );
};
