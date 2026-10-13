import type { Order, OrderIdentity, VendorReceipt } from './contract.ts';

export type ApprovalState = 'pending' | 'approved' | 'revoked';
export type ObservedState = 'unknown' | 'absent' | 'present';
export type HoldReason =
  | 'content_conflict'
  | 'integrity_failure'
  | 'store_mismatch'
  | 'post_budget_exhausted'
  | 'read_budget_exhausted'
  | 'deadline_expired'
  | 'authorization_required'
  | 'authorization_expired'
  | 'authorization_revoked'
  | 'recovery_readback_required'
  | 'clock_regression';
export type BlockReason = HoldReason | 'leased' | 'not_due' | 'outcome_finalized' | 'unknown_job';
export type Outcome = 'pending' | 'retryable' | 'permanent_failure' | 'delivered' | 'unknown';

export type JobSnapshot = {
  jobId: string;
  order: Order;
  identity: OrderIdentity;
  vendorStoreId: string;
  approvalRevision: number;
  approvalState: ApprovalState;
  approvalExpiresAt: number | null;
  holdReason: HoldReason | null;
  postReservations: number;
  getReservations: number;
  firstAdmissionAt: number | null;
  deadlineAt: number | null;
  nextAttemptAt: number | null;
  leaseId: string | null;
  leaseExpiresAt: number | null;
  observed: ObservedState;
  outcome: Outcome;
  receipt: VendorReceipt | null;
};

export type Admission = {
  kind: 'admitted';
  jobId: string;
  leaseId: string;
  order: Order;
  identity: OrderIdentity;
  attempt: number;
  approvalRevision: number;
  admittedAt: number;
  deadlineAt: number;
};

export type Blocked = { kind: 'blocked'; reason: BlockReason; nextAttemptAt?: number };

export type ReadReservation = {
  kind: 'read_reserved';
  jobId: string;
  requestId: string;
  attempt: number;
  reservedAt: number;
};

export type ReadObservation =
  | { kind: 'present'; receipt: VendorReceipt; httpStatus: number | null; nextAttemptAt: number | null }
  | { kind: 'absent'; httpStatus: number | null; nextAttemptAt: number | null }
  | {
      kind: 'unknown';
      reason: 'network_failure' | 'protocol_failure' | 'vendor_unavailable' | 'readback_mismatch';
      httpStatus: number | null;
      nextAttemptAt: number | null;
    };

export type AttemptResult = {
  classification: 'retryable' | 'permanent_failure' | 'delivered' | 'unknown';
  httpStatus: number | null;
  nextAttemptAt: number | null;
  receipt: VendorReceipt | null;
};

export type AuditEvent = {
  sequence: number;
  jobId: string;
  kind:
    | 'enqueued'
    | 'approved'
    | 'revoked'
    | 'post_reserved'
    | 'post_settled'
    | 'read_reserved'
    | 'read_settled'
    | 'operator_inspection'
    | 'held'
    | 'clock_hold'
    | 'lease_expired';
  at: number;
  approvalRevision: number;
  attempt: number | null;
  outcome: Outcome | null;
  httpStatus: number | null;
  nextAttemptAt: number | null;
  reason: string | null;
  observed: ObservedState | null;
  vendorOrderId: string | null;
};

/* eslint-disable no-unused-vars -- Interface names are API documentation. */
export interface RelayStore {
  enqueue(order: Order, vendorStoreId: string, now: number): JobSnapshot;
  approve(jobId: string, expectedRevision: number, now: number): JobSnapshot;
  revoke(jobId: string, expectedRevision: number, reason: string, now: number): JobSnapshot;
  snapshot(jobId: string): JobSnapshot;
  events(jobId: string): AuditEvent[];
  reservePost(jobId: string, workerId: string, now: number): Admission | Blocked;
  reserveRead(jobId: string, now: number): ReadReservation | Blocked;
  settleRead(reservation: ReadReservation, result: ReadObservation, now: number): JobSnapshot;
  settle(admission: Admission, result: AttemptResult, now: number): JobSnapshot;
  hold(jobId: string, reason: HoldReason, now: number): JobSnapshot;
  recordInspection(jobId: string, observation: ReadObservation, now: number): JobSnapshot;
  close(): void;
}
/* eslint-enable no-unused-vars */
