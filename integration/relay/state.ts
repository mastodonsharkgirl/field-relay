import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import {
  identify,
  parseReceipt,
  validateOrder,
  type Order,
  type OrderIdentity,
  type VendorReceipt,
} from './contract.ts';
import type {
  Admission,
  ApprovalState,
  AttemptResult,
  AuditEvent,
  Blocked,
  HoldReason,
  JobSnapshot,
  Outcome,
  ReadObservation,
  ReadReservation,
  RelayStore,
} from './state-types.ts';

const SCHEMA_VERSION = '3';
const APPROVAL_MS = 600_000;
const LEASE_MS = 5_000;
const RECOVERY_MS = 30_000;
const MAX_POSTS = 3;
const MAX_READS = 6;

type Row = Record<string, unknown>;
const asNumber = (value: unknown) => Number(value);
const nullableNumber = (value: unknown) => (value === null ? null : Number(value));
const nullableString = (value: unknown) => (value === null ? null : String(value));

class SqliteRelayStore implements RelayStore {
  readonly #db: DatabaseSync;

  constructor(path: string, mode: 'new' | 'resume') {
    if (mode === 'new' && existsSync(path))
      throw Error('relay state already exists; use a new path');
    if (mode === 'resume' && !existsSync(path))
      throw Error('relay state does not exist; resume is refused');
    this.#db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
    try {
      this.#db.exec('PRAGMA busy_timeout = 250; PRAGMA foreign_keys = ON;');
      if (mode === 'new') {
        this.#db.exec('PRAGMA journal_mode = WAL;');
        this.#create();
      } else {
        // WAL persists on disk; concurrent resumes must not renegotiate its mode.
        this.#verify();
      }
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }

  #create() {
    this.#db.exec(`
      CREATE TABLE metadata (name TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE jobs (
        job_id TEXT PRIMARY KEY, business_key TEXT NOT NULL UNIQUE, canonical TEXT NOT NULL,
        payload_digest TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, order_json TEXT NOT NULL,
        vendor_store_id TEXT NOT NULL, approval_revision INTEGER NOT NULL, approval_state TEXT NOT NULL,
        approval_expires_at INTEGER, hold_reason TEXT, post_reservations INTEGER NOT NULL,
        get_reservations INTEGER NOT NULL, first_admission_at INTEGER, deadline_at INTEGER,
        next_attempt_at INTEGER, lease_id TEXT, lease_request_id TEXT, lease_expires_at INTEGER,
        operation_generation INTEGER NOT NULL, last_read_attempt INTEGER NOT NULL,
        observed TEXT NOT NULL, outcome TEXT NOT NULL, claimed_receipt_json TEXT, receipt_json TEXT,
        last_observed_at INTEGER NOT NULL
      );
      CREATE TABLE reads (
        request_id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(job_id), attempt INTEGER NOT NULL,
        generation INTEGER NOT NULL, reserved_at INTEGER NOT NULL, settled_at INTEGER
      );
      CREATE TABLE audit_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL REFERENCES jobs(job_id),
        kind TEXT NOT NULL, at INTEGER NOT NULL, approval_revision INTEGER NOT NULL, attempt INTEGER,
        outcome TEXT, http_status INTEGER, next_attempt_at INTEGER, reason TEXT, observed TEXT,
        vendor_order_id TEXT, request_id TEXT
      );
      INSERT INTO metadata(name, value) VALUES ('schemaVersion', '${SCHEMA_VERSION}');
    `);
  }

  #verify() {
    const version = this.#db
      .prepare("SELECT value FROM metadata WHERE name = 'schemaVersion'")
      .get() as Row | undefined;
    if (!version || version.value !== SCHEMA_VERSION) {
      throw Error('relay database has an unknown schema version');
    }
    const journal = this.#db.prepare('PRAGMA journal_mode').get() as Row | undefined;
    if (journal?.journal_mode !== 'wal') throw Error('relay database must retain WAL mode');
  }

  #transaction<T>(work: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const value = work();
      this.#db.exec('COMMIT');
      return value;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  #row(jobId: string): Row {
    const row = this.#db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId) as
      Row | undefined;
    if (!row) throw Error('unknown relay job');
    return row;
  }

  #immutableReceipt(receipt: VendorReceipt) {
    return {
      schemaVersion: receipt.schemaVersion,
      vendorOrderId: receipt.vendorOrderId,
      idempotencyKey: receipt.idempotencyKey,
      businessKey: receipt.businessKey,
      order: [
        receipt.order.schemaVersion,
        receipt.order.partner,
        receipt.order.orderId,
        receipt.order.region,
        receipt.order.quantity,
        receipt.order.amountMinor,
      ],
      committedAt: receipt.committedAt,
      storeId: receipt.storeId,
    };
  }

  #sameReceipt(first: VendorReceipt, second: VendorReceipt) {
    return (
      JSON.stringify(this.#immutableReceipt(first)) ===
      JSON.stringify(this.#immutableReceipt(second))
    );
  }

  #parseStoredReceipt(value: unknown, order: Order, vendorStoreId: string) {
    return parseReceipt(JSON.parse(String(value)), order, vendorStoreId);
  }

  #snapshot(row: Row): JobSnapshot {
    const order = validateOrder(JSON.parse(String(row.order_json)));
    const vendorStoreId = String(row.vendor_store_id);
    const identity: OrderIdentity = {
      businessKey: String(row.business_key),
      canonical: String(row.canonical),
      payloadDigest: String(row.payload_digest),
      idempotencyKey: String(row.idempotency_key),
    };
    return {
      jobId: String(row.job_id),
      order,
      identity,
      vendorStoreId,
      approvalRevision: asNumber(row.approval_revision),
      approvalState: String(row.approval_state) as ApprovalState,
      approvalExpiresAt: nullableNumber(row.approval_expires_at),
      holdReason: nullableString(row.hold_reason) as HoldReason | null,
      postReservations: asNumber(row.post_reservations),
      getReservations: asNumber(row.get_reservations),
      firstAdmissionAt: nullableNumber(row.first_admission_at),
      deadlineAt: nullableNumber(row.deadline_at),
      nextAttemptAt: nullableNumber(row.next_attempt_at),
      leaseId: nullableString(row.lease_id),
      leaseExpiresAt: nullableNumber(row.lease_expires_at),
      observed: String(row.observed) as JobSnapshot['observed'],
      outcome: String(row.outcome) as Outcome,
      claimedReceipt:
        row.claimed_receipt_json === null
          ? null
          : this.#parseStoredReceipt(row.claimed_receipt_json, order, vendorStoreId),
      receipt:
        row.receipt_json === null
          ? null
          : this.#parseStoredReceipt(row.receipt_json, order, vendorStoreId),
    };
  }

  #event(
    jobId: string,
    kind: AuditEvent['kind'],
    at: number,
    fields: Partial<Omit<AuditEvent, 'sequence' | 'jobId' | 'kind' | 'at'>> = {},
  ) {
    const row = this.#row(jobId);
    this.#db
      .prepare(
        `INSERT INTO audit_events(
        job_id, kind, at, approval_revision, attempt, outcome, http_status, next_attempt_at,
        reason, observed, vendor_order_id, request_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        jobId,
        kind,
        at,
        fields.approvalRevision ?? asNumber(row.approval_revision),
        fields.attempt ?? null,
        fields.outcome ?? null,
        fields.httpStatus ?? null,
        fields.nextAttemptAt ?? null,
        fields.reason ?? null,
        fields.observed ?? null,
        fields.vendorOrderId ?? null,
        fields.requestId ?? null,
      );
  }

  #clockHold(row: Row, now: number): boolean {
    if (now >= asNumber(row.last_observed_at)) return false;
    this.#db
      .prepare('UPDATE jobs SET hold_reason = ? WHERE job_id = ?')
      .run('clock_regression', String(row.job_id));
    this.#event(String(row.job_id), 'clock_hold', asNumber(row.last_observed_at), {
      reason: 'clock_regression',
    });
    return true;
  }

  #preserveScheduledDue(currentDue: number | null, candidateDue: number | null, now: number) {
    if (currentDue !== null && currentDue > now) {
      return candidateDue === null ? currentDue : Math.max(currentDue, candidateDue);
    }
    return candidateDue;
  }

  enqueue(input: Order, vendorStoreId: string, now: number): JobSnapshot {
    const order = validateOrder(input);
    if (!vendorStoreId) throw Error('vendor store ID is required');
    const identity = identify(order);
    return this.#transaction(() => {
      const existing = this.#db
        .prepare('SELECT * FROM jobs WHERE business_key = ?')
        .get(identity.businessKey) as Row | undefined;
      if (existing) {
        if (
          String(existing.canonical) !== identity.canonical ||
          String(existing.vendor_store_id) !== vendorStoreId
        ) {
          const reason =
            String(existing.vendor_store_id) !== vendorStoreId
              ? 'store_mismatch'
              : 'content_conflict';
          this.#db
            .prepare('UPDATE jobs SET hold_reason = ? WHERE job_id = ?')
            .run(reason, String(existing.job_id));
          this.#event(String(existing.job_id), 'held', now, { reason });
        }
        return this.#snapshot(this.#row(String(existing.job_id)));
      }
      const jobId = randomUUID();
      this.#db
        .prepare(
          `INSERT INTO jobs VALUES (
          ?, ?, ?, ?, ?, ?, ?, 0, 'pending', NULL, NULL, 0, 0, NULL, NULL, NULL,
          NULL, NULL, NULL, 0, 0, 'unknown', 'pending', NULL, NULL, ?
        )`,
        )
        .run(
          jobId,
          identity.businessKey,
          identity.canonical,
          identity.payloadDigest,
          identity.idempotencyKey,
          JSON.stringify(order),
          vendorStoreId,
          now,
        );
      this.#event(jobId, 'enqueued', now);
      return this.#snapshot(this.#row(jobId));
    });
  }

  approve(
    jobId: string,
    expectedRevision: number,
    now: number,
    source: 'operator' | 'harness' = 'operator',
  ): JobSnapshot {
    if (source !== 'operator' && source !== 'harness') throw Error('Invalid approval source.');
    return this.#transaction(() => {
      const row = this.#row(jobId);
      if (asNumber(row.approval_revision) !== expectedRevision)
        throw Error('approval revision is stale');
      if (this.#clockHold(row, now)) return this.#snapshot(this.#row(jobId));
      this.#db
        .prepare(
          `UPDATE jobs SET approval_revision = approval_revision + 1, approval_state = 'approved', approval_expires_at = ?, last_observed_at = ? WHERE job_id = ?`,
        )
        .run(now + APPROVAL_MS, now, jobId);
      this.#event(jobId, 'approved', now, { reason: source });
      return this.#snapshot(this.#row(jobId));
    });
  }

  revoke(jobId: string, expectedRevision: number, reason: string, now: number): JobSnapshot {
    return this.#transaction(() => {
      const row = this.#row(jobId);
      if (asNumber(row.approval_revision) !== expectedRevision)
        throw Error('approval revision is stale');
      this.#db
        .prepare(
          `UPDATE jobs SET approval_revision = approval_revision + 1, approval_state = 'revoked', approval_expires_at = NULL, last_observed_at = CASE WHEN last_observed_at > ? THEN last_observed_at ELSE ? END WHERE job_id = ?`,
        )
        .run(now, now, jobId);
      this.#event(jobId, 'revoked', now, { reason: 'authorization_revoked' });
      return this.#snapshot(this.#row(jobId));
    });
  }

  snapshot(jobId: string) {
    return this.#snapshot(this.#row(jobId));
  }

  list(): JobSnapshot[] {
    return (this.#db.prepare('SELECT job_id FROM jobs ORDER BY rowid').all() as Row[]).map((row) =>
      this.snapshot(String(row.job_id)),
    );
  }

  events(jobId: string): AuditEvent[] {
    this.#row(jobId);
    return (
      this.#db
        .prepare('SELECT * FROM audit_events WHERE job_id = ? ORDER BY sequence')
        .all(jobId) as Row[]
    ).map((row) => ({
      sequence: asNumber(row.sequence),
      jobId: String(row.job_id),
      kind: String(row.kind) as AuditEvent['kind'],
      at: asNumber(row.at),
      approvalRevision: asNumber(row.approval_revision),
      attempt: nullableNumber(row.attempt),
      outcome: nullableString(row.outcome) as Outcome | null,
      httpStatus: nullableNumber(row.http_status),
      nextAttemptAt: nullableNumber(row.next_attempt_at),
      reason: nullableString(row.reason),
      scheduledDelayMs:
        ['retry_scheduled', 'retry_schedule_ignored'].includes(String(row.kind)) &&
        row.next_attempt_at !== null
          ? asNumber(row.next_attempt_at) - asNumber(row.at)
          : null,
      observed: nullableString(row.observed) as AuditEvent['observed'],
      vendorOrderId: nullableString(row.vendor_order_id),
      requestId: nullableString(row.request_id),
    }));
  }

  reservePost(jobId: string, workerId: string, now: number): Admission | Blocked {
    if (!workerId) throw Error('worker ID is required');
    return this.#transaction(() => {
      let row = this.#row(jobId);
      if (this.#clockHold(row, now)) return { kind: 'blocked', reason: 'clock_regression' };
      if (row.lease_id !== null && asNumber(row.lease_expires_at) <= now) {
        const expiredRequestId = nullableString(row.lease_request_id);
        this.#db
          .prepare(
            `UPDATE jobs SET lease_id = NULL, lease_request_id = NULL, lease_expires_at = NULL, hold_reason = 'recovery_readback_required', last_observed_at = ? WHERE job_id = ?`,
          )
          .run(now, jobId);
        this.#event(jobId, 'lease_expired', now, {
          reason: 'recovery_readback_required',
          requestId: expiredRequestId,
        });
        return { kind: 'blocked', reason: 'recovery_readback_required' };
      }
      if (row.lease_id !== null) return { kind: 'blocked', reason: 'leased' };
      if (
        String(row.observed) === 'present' ||
        String(row.outcome) === 'delivered' ||
        String(row.outcome) === 'permanent_failure'
      ) {
        return { kind: 'blocked', reason: 'outcome_finalized' };
      }
      const hold = nullableString(row.hold_reason) as HoldReason | null;
      if (hold) return { kind: 'blocked', reason: hold };
      if (String(row.approval_state) !== 'approved') {
        return {
          kind: 'blocked',
          reason:
            String(row.approval_state) === 'revoked'
              ? 'authorization_revoked'
              : 'authorization_required',
        };
      }
      if (asNumber(row.approval_expires_at) <= now) {
        return { kind: 'blocked', reason: 'authorization_expired' };
      }
      if (asNumber(row.post_reservations) >= MAX_POSTS) {
        return { kind: 'blocked', reason: 'post_budget_exhausted' };
      }
      if (row.deadline_at !== null && asNumber(row.deadline_at) <= now) {
        return { kind: 'blocked', reason: 'deadline_expired' };
      }
      if (row.next_attempt_at !== null && asNumber(row.next_attempt_at) > now) {
        return { kind: 'blocked', reason: 'not_due', nextAttemptAt: asNumber(row.next_attempt_at) };
      }
      const attempt = asNumber(row.post_reservations) + 1;
      const leaseId = randomUUID();
      const requestId = randomUUID();
      const generation = asNumber(row.operation_generation) + 1;
      const deadlineAt = row.deadline_at === null ? now + RECOVERY_MS : asNumber(row.deadline_at);
      this.#db
        .prepare(
          `UPDATE jobs SET post_reservations = ?, lease_id = ?, lease_request_id = ?, lease_expires_at = ?, first_admission_at = COALESCE(first_admission_at, ?), deadline_at = ?, next_attempt_at = NULL, operation_generation = ?, last_observed_at = ? WHERE job_id = ?`,
        )
        .run(attempt, leaseId, requestId, now + LEASE_MS, now, deadlineAt, generation, now, jobId);
      this.#event(jobId, 'post_reserved', now, { attempt, requestId });
      row = this.#row(jobId);
      const order = validateOrder(JSON.parse(String(row.order_json)));
      return {
        kind: 'admitted',
        jobId,
        leaseId,
        requestId,
        generation,
        order,
        identity: identify(order),
        attempt,
        approvalRevision: asNumber(row.approval_revision),
        admittedAt: now,
        deadlineAt,
      };
    });
  }

  reserveRead(jobId: string, now: number): ReadReservation | Blocked {
    return this.#transaction(() => {
      const row = this.#row(jobId);
      if (nullableString(row.hold_reason) === 'deferred_outside_deadline') {
        return { kind: 'blocked', reason: 'deferred_outside_deadline' };
      }
      if (this.#clockHold(row, now)) return { kind: 'blocked', reason: 'clock_regression' };
      if (row.deadline_at !== null && asNumber(row.deadline_at) <= now) {
        return { kind: 'blocked', reason: 'deadline_expired' };
      }
      if (row.next_attempt_at !== null && asNumber(row.next_attempt_at) > now) {
        return { kind: 'blocked', reason: 'not_due', nextAttemptAt: asNumber(row.next_attempt_at) };
      }
      if (asNumber(row.get_reservations) >= MAX_READS) {
        return { kind: 'blocked', reason: 'read_budget_exhausted' };
      }
      const attempt = asNumber(row.get_reservations) + 1;
      const generation = asNumber(row.operation_generation);
      const requestId = randomUUID();
      this.#db
        .prepare(
          'UPDATE jobs SET get_reservations = ?, last_observed_at = CASE WHEN last_observed_at > ? THEN last_observed_at ELSE ? END WHERE job_id = ?',
        )
        .run(attempt, now, now, jobId);
      this.#db
        .prepare(
          'INSERT INTO reads(request_id, job_id, attempt, generation, reserved_at, settled_at) VALUES (?, ?, ?, ?, ?, NULL)',
        )
        .run(requestId, jobId, attempt, generation, now);
      this.#event(jobId, 'read_reserved', now, { attempt, requestId });
      return { kind: 'read_reserved', jobId, requestId, attempt, generation, reservedAt: now };
    });
  }

  #applyObservation(
    jobId: string,
    observation: ReadObservation,
    now: number,
    kind: 'read_settled' | 'operator_inspection',
    reservation?: ReadReservation,
    inspectionRequestId: string | null = null,
  ) {
    const row = this.#row(jobId);
    const order = validateOrder(JSON.parse(String(row.order_json)));
    const vendorStoreId = String(row.vendor_store_id);
    const existingObserved = String(row.observed) as JobSnapshot['observed'];
    const existingOutcome = String(row.outcome) as Outcome;
    const existingHold = nullableString(row.hold_reason) as HoldReason | null;
    const currentDue = nullableNumber(row.next_attempt_at);
    const staleAutomaticRead =
      kind === 'read_settled' &&
      reservation !== undefined &&
      (reservation.generation !== asNumber(row.operation_generation) ||
        reservation.attempt < asNumber(row.last_read_attempt));
    const canApplyState = !staleAutomaticRead || observation.kind === 'present';

    let receipt: VendorReceipt | null = null;
    let receiptJson: string | null = null;
    let receiptConflict = false;
    if (observation.kind === 'present') {
      receipt = parseReceipt(observation.receipt, order, vendorStoreId);
      for (const persisted of [row.receipt_json, row.claimed_receipt_json]) {
        if (persisted === null) continue;
        const existing = this.#parseStoredReceipt(persisted, order, vendorStoreId);
        if (!this.#sameReceipt(existing, receipt)) receiptConflict = true;
      }
      if (!receiptConflict) receiptJson = JSON.stringify(receipt);
    }

    let observed = existingObserved;
    let outcome = existingOutcome;
    let holdReason = existingHold;
    let nextAttemptAt = currentDue;
    if (receiptConflict) {
      holdReason = 'integrity_failure';
    } else if (!canApplyState) {
      // A delayed absence or transient read is evidence only of its old reservation.
      // It cannot downgrade verified state or overwrite a newer durable wait.
      nextAttemptAt = this.#preserveScheduledDue(currentDue, observation.nextAttemptAt, now);
      if (observation.holdReason !== undefined) holdReason = observation.holdReason;
    } else {
      if (observation.kind === 'present') {
        observed = 'present';
        outcome = 'delivered';
        nextAttemptAt = null;
      } else {
        observed = existingObserved === 'present' ? 'present' : observation.kind;
        outcome = existingOutcome === 'delivered' ? 'delivered' : existingOutcome;
        nextAttemptAt =
          kind === 'operator_inspection' && currentDue !== null
            ? Math.max(currentDue, observation.nextAttemptAt ?? currentDue)
            : this.#preserveScheduledDue(currentDue, observation.nextAttemptAt, now);
      }
      if (observation.holdReason !== undefined) holdReason = observation.holdReason;
      const clearsRecoveryHold =
        kind === 'read_settled' &&
        observation.kind === 'absent' &&
        existingHold === 'recovery_readback_required';
      if (clearsRecoveryHold) holdReason = null;
    }
    if (outcome === 'delivered') nextAttemptAt = null;
    const lastReadAttempt =
      reservation === undefined
        ? asNumber(row.last_read_attempt)
        : Math.max(asNumber(row.last_read_attempt), reservation.attempt);
    this.#db
      .prepare(
        `UPDATE jobs SET observed = ?, receipt_json = COALESCE(?, receipt_json), hold_reason = ?, outcome = ?, next_attempt_at = ?, last_read_attempt = ?, last_observed_at = CASE WHEN last_observed_at > ? THEN last_observed_at ELSE ? END WHERE job_id = ?`,
      )
      .run(
        observed,
        receiptJson,
        holdReason,
        outcome,
        nextAttemptAt,
        lastReadAttempt,
        now,
        now,
        jobId,
      );
    this.#event(jobId, kind, now, {
      attempt: reservation?.attempt ?? null,
      outcome,
      observed,
      httpStatus: observation.httpStatus,
      nextAttemptAt,
      reason: receiptConflict
        ? 'integrity_failure'
        : staleAutomaticRead && observation.kind !== 'present'
          ? 'stale_read_ignored'
          : (observation.holdReason ??
            (observation.kind === 'unknown' ? observation.reason : null)),
      vendorOrderId:
        receipt !== null && !receiptConflict && canApplyState ? receipt.vendorOrderId : null,
      requestId: reservation?.requestId ?? inspectionRequestId,
    });
    if (observation.retryReason)
      this.#event(
        jobId,
        !receiptConflict && outcome !== 'delivered' && nextAttemptAt === observation.nextAttemptAt
          ? 'retry_scheduled'
          : 'retry_schedule_ignored',
        now,
        {
          attempt: reservation?.attempt ?? null,
          outcome,
          observed,
          httpStatus: observation.httpStatus,
          nextAttemptAt: observation.nextAttemptAt,
          reason: observation.retryReason,
          requestId: reservation?.requestId ?? inspectionRequestId,
        },
      );
    return this.#snapshot(this.#row(jobId));
  }

  settleRead(reservation: ReadReservation, result: ReadObservation, now: number): JobSnapshot {
    return this.#transaction(() => {
      const read = this.#db
        .prepare('SELECT * FROM reads WHERE request_id = ? AND job_id = ?')
        .get(reservation.requestId, reservation.jobId) as Row | undefined;
      if (
        !read ||
        asNumber(read.attempt) !== reservation.attempt ||
        asNumber(read.generation) !== reservation.generation ||
        asNumber(read.reserved_at) !== reservation.reservedAt ||
        read.settled_at !== null
      ) {
        throw Error('read reservation is stale');
      }
      this.#db
        .prepare('UPDATE reads SET settled_at = ? WHERE request_id = ?')
        .run(now, reservation.requestId);
      return this.#applyObservation(reservation.jobId, result, now, 'read_settled', reservation);
    });
  }

  settle(admission: Admission, result: AttemptResult, now: number): JobSnapshot {
    let expired = false;
    const snapshot = this.#transaction(() => {
      const row = this.#row(admission.jobId);
      // The lease token, request ID, and generation fence workers. A later revocation
      // can change approval, but cannot rewrite an already admitted operation.
      if (
        row.lease_id !== admission.leaseId ||
        row.lease_request_id !== admission.requestId ||
        asNumber(row.operation_generation) !== admission.generation ||
        asNumber(row.post_reservations) !== admission.attempt
      ) {
        throw Error('stale admission cannot settle');
      }
      if (asNumber(row.lease_expires_at) <= now) {
        this.#db
          .prepare(
            `UPDATE jobs SET lease_id = NULL, lease_request_id = NULL, lease_expires_at = NULL, hold_reason = 'recovery_readback_required', last_observed_at = ? WHERE job_id = ?`,
          )
          .run(now, admission.jobId);
        this.#event(admission.jobId, 'lease_expired', now, {
          attempt: admission.attempt,
          reason: 'recovery_readback_required',
          requestId: admission.requestId,
        });
        expired = true;
        return this.#snapshot(this.#row(admission.jobId));
      }

      const order = validateOrder(JSON.parse(String(row.order_json)));
      const vendorStoreId = String(row.vendor_store_id);
      let claimedReceiptJson: string | null = null;
      let receiptConflict = false;
      if (result.claimedReceipt !== null) {
        const claim = parseReceipt(result.claimedReceipt, order, vendorStoreId);
        for (const persisted of [row.claimed_receipt_json, row.receipt_json]) {
          if (persisted === null) continue;
          const existing = this.#parseStoredReceipt(persisted, order, vendorStoreId);
          if (!this.#sameReceipt(existing, claim)) receiptConflict = true;
        }
        if (!receiptConflict) claimedReceiptJson = JSON.stringify(claim);
      }
      const existingOutcome = String(row.outcome) as Outcome;
      const outcome: Outcome =
        existingOutcome === 'delivered' ? 'delivered' : result.classification;
      const observed = String(row.observed) as JobSnapshot['observed'];
      const currentDue = nullableNumber(row.next_attempt_at);
      const nextAttemptAt =
        outcome === 'delivered'
          ? null
          : this.#preserveScheduledDue(currentDue, result.nextAttemptAt, now);
      const holdReason = receiptConflict
        ? 'integrity_failure'
        : (result.holdReason ?? (nullableString(row.hold_reason) as HoldReason | null));
      this.#db
        .prepare(
          `UPDATE jobs SET lease_id = NULL, lease_request_id = NULL, lease_expires_at = NULL, outcome = ?, observed = ?, claimed_receipt_json = COALESCE(?, claimed_receipt_json), hold_reason = ?, next_attempt_at = ?, last_observed_at = CASE WHEN last_observed_at > ? THEN last_observed_at ELSE ? END WHERE job_id = ?`,
        )
        .run(
          outcome,
          observed,
          claimedReceiptJson,
          holdReason,
          nextAttemptAt,
          now,
          now,
          admission.jobId,
        );
      const persisted = this.#snapshot(this.#row(admission.jobId));
      this.#event(admission.jobId, 'post_settled', now, {
        attempt: admission.attempt,
        approvalRevision: admission.approvalRevision,
        outcome,
        httpStatus: result.httpStatus,
        nextAttemptAt,
        reason: receiptConflict ? 'integrity_failure' : (result.holdReason ?? null),
        observed,
        // A POST confirmation is only a claim. The verified vendor ID is recorded by a GET.
        vendorOrderId: null,
        requestId: admission.requestId,
      });
      if (result.retryReason)
        this.#event(
          admission.jobId,
          !receiptConflict && outcome !== 'delivered' && nextAttemptAt === result.nextAttemptAt
            ? 'retry_scheduled'
            : 'retry_schedule_ignored',
          now,
          {
            attempt: admission.attempt,
            approvalRevision: admission.approvalRevision,
            outcome,
            observed,
            httpStatus: result.httpStatus,
            nextAttemptAt: result.nextAttemptAt,
            reason: result.retryReason,
            requestId: admission.requestId,
          },
        );
      return persisted;
    });
    if (expired) throw Error('admission lease expired; readback is required');
    return snapshot;
  }

  hold(jobId: string, reason: HoldReason, now: number): JobSnapshot {
    return this.#transaction(() => {
      this.#row(jobId);
      this.#db
        .prepare(
          'UPDATE jobs SET hold_reason = ?, last_observed_at = CASE WHEN last_observed_at > ? THEN last_observed_at ELSE ? END WHERE job_id = ?',
        )
        .run(reason, now, now, jobId);
      this.#event(jobId, 'held', now, { reason });
      return this.#snapshot(this.#row(jobId));
    });
  }

  recordInspection(
    jobId: string,
    observation: ReadObservation,
    now: number,
    requestId: string | null = null,
  ): JobSnapshot {
    if (requestId !== null && !/^[A-Za-z0-9_-]{1,64}$/.test(requestId))
      throw Error('invalid inspection request ID');
    return this.#transaction(() =>
      this.#applyObservation(jobId, observation, now, 'operator_inspection', undefined, requestId),
    );
  }

  close() {
    this.#db.close();
  }
}

export const openRelayStore = (path: string, mode: 'new' | 'resume'): RelayStore =>
  new SqliteRelayStore(path, mode);
