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

type ResponseMetadata = { status: number | null; retryAfter: string | null };

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

const metadataFor = (result: HttpResult): ResponseMetadata => {
  if (result.kind === 'response') {
    return { status: result.status, retryAfter: result.retryAfter };
  }
  return { status: result.httpStatus, retryAfter: result.retryAfter };
};

const isAmbiguousSuccess = (status: number | null) =>
  status !== null && status >= 200 && status < 300;

const isVerifiedAbsence = (result: HttpResult, expectedRequestId: string) => {
  if (result.kind !== 'response' || result.status !== 404) return false;
  const body = result.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const value = body as Record<string, unknown>;
  return (
    Object.keys(value).length === 4 &&
    value.schemaVersion === 1 &&
    value.code === 'not_found' &&
    value.message === 'Synthetic vendor request rejected.' &&
    value.requestId === expectedRequestId
  );
};

const isRetryableResult = (result: HttpResult, status: number | null) =>
  status !== null
    ? isRetryableStatus(status)
    : result.kind === 'timeout' || result.kind === 'network_error';

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

const readbackIntegrity = (
  store: RelayStore,
  jobId: string,
  reservation: Extract<ReturnType<RelayStore['reserveRead']>, { kind: 'read_reserved' }>,
  status: number | null,
  now: number,
) => {
  const settled = store.settleRead(
    reservation,
    unknownObservation('readback_mismatch', status, null, false),
    now,
  );
  return store.hold(jobId, 'integrity_failure', now) ?? settled;
};

const readVendor = async (
  store: RelayStore,
  jobId: string,
  connection: VendorConnection,
  requireVerifiedReceipt: boolean,
): Promise<ReadStep> => {
  const reservation = store.reserveRead(jobId, currentTime());
  if (reservation.kind === 'blocked') {
    if (reservation.reason === 'not_due') {
      return { kind: 'not_due', snapshot: store.snapshot(jobId) };
    }
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
  const metadata = metadataFor(result);
  if (metadata.status === 200) {
    if (result.kind === 'response') {
      try {
        const receipt = parseReceipt(result.body, snapshot.order, snapshot.vendorStoreId);
        return {
          kind: 'present',
          snapshot: store.settleRead(
            reservation,
            { kind: 'present', receipt, httpStatus: metadata.status, nextAttemptAt: null },
            now,
          ),
        };
      } catch {
        return {
          kind: 'integrity',
          snapshot: readbackIntegrity(store, jobId, reservation, metadata.status, now),
        };
      }
    }
    return {
      kind: 'integrity',
      snapshot: readbackIntegrity(store, jobId, reservation, metadata.status, now),
    };
  }
  if (isVerifiedAbsence(result, reservation.requestId)) {
    const settled = store.settleRead(
      reservation,
      { kind: 'absent', httpStatus: metadata.status, nextAttemptAt: null },
      now,
    );
    return {
      kind: requireVerifiedReceipt
        ? 'integrity'
        : settled.postReservations !== reservation.generation || settled.observed !== 'absent'
          ? 'scheduled'
          : 'absent',
      snapshot: requireVerifiedReceipt ? store.hold(jobId, 'integrity_failure', now) : settled,
    };
  }
  if (isRetryableResult(result, metadata.status)) {
    return retryRead(
      store,
      jobId,
      reservation,
      snapshot,
      metadata.status === null ? 'network_failure' : 'vendor_unavailable',
      metadata.status,
      metadata.retryAfter,
      now,
    );
  }
  const settled = store.settleRead(
    reservation,
    unknownObservation('protocol_failure', metadata.status, null, false),
    now,
  );
  return { kind: 'integrity', snapshot: store.hold(jobId, 'integrity_failure', now) ?? settled };
};

const settlePostRetry = (
  store: RelayStore,
  admission: Extract<ReturnType<RelayStore['reservePost']>, { kind: 'admitted' }>,
  metadata: ResponseMetadata,
  now: number,
) => {
  const decision = retryDecision({
    attempt: admission.attempt,
    now,
    deadlineAt: admission.deadlineAt,
    retryAfter: metadata.retryAfter,
    random: Math.random(),
  });
  return {
    decision,
    snapshot: store.settle(
      admission,
      {
        classification: 'retryable',
        httpStatus: metadata.status,
        nextAttemptAt: decision.nextAttemptAt,
        claimedReceipt: null,
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
      requestId: admission.requestId,
      order: admission.order,
      key: admission.identity.idempotencyKey,
    });
    const now = currentTime();
    const metadata = metadataFor(result);
    if (isAmbiguousSuccess(metadata.status)) {
      let claimedReceipt = null;
      if (result.kind === 'response') {
        try {
          claimedReceipt = parseReceipt(result.body, admission.order, connection.storeId);
        } catch {
          // A 2xx without a valid receipt remains ambiguous and must be read back.
        }
      }
      store.settle(
        admission,
        {
          classification: 'unknown',
          httpStatus: metadata.status,
          nextAttemptAt: null,
          claimedReceipt,
        },
        now,
      );
      reconcile = true;
      continue;
    }
    if (isRetryableResult(result, metadata.status)) {
      const settled = settlePostRetry(store, admission, metadata, now);
      if (settled.decision.kind === 'deferred_outside_deadline') return settled.snapshot;
      reconcile = true;
      continue;
    }
    return store.settle(
      admission,
      {
        classification: 'permanent_failure',
        httpStatus: metadata.status,
        nextAttemptAt: null,
        claimedReceipt: null,
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
  const requestId = randomUUID();
  const result = await exchange(connection, {
    method: 'GET',
    path: '/v1/orders/' + snapshot.identity.idempotencyKey,
    requestId,
    key: snapshot.identity.idempotencyKey,
  });
  const observedAt = currentTime();
  const metadata = metadataFor(result);
  if (metadata.status === 200) {
    if (result.kind === 'response') {
      try {
        const receipt = parseReceipt(result.body, snapshot.order, snapshot.vendorStoreId);
        return store.recordInspection(
          jobId,
          { kind: 'present', receipt, httpStatus: metadata.status, nextAttemptAt: null },
          observedAt,
          requestId,
        );
      } catch {
        store.recordInspection(
          jobId,
          unknownObservation('readback_mismatch', metadata.status, null, false),
          observedAt,
          requestId,
        );
        return store.hold(jobId, 'integrity_failure', observedAt);
      }
    }
    store.recordInspection(
      jobId,
      unknownObservation('readback_mismatch', metadata.status, null, false),
      observedAt,
      requestId,
    );
    return store.hold(jobId, 'integrity_failure', observedAt);
  }
  if (isVerifiedAbsence(result, requestId)) {
    return store.recordInspection(
      jobId,
      { kind: 'absent', httpStatus: metadata.status, nextAttemptAt: null },
      observedAt,
      requestId,
    );
  }
  const reason =
    metadata.status === null && (result.kind === 'timeout' || result.kind === 'network_error')
      ? 'network_failure'
      : 'protocol_failure';
  return store.recordInspection(
    jobId,
    unknownObservation(reason, metadata.status, null, false),
    observedAt,
    requestId,
  );
};
