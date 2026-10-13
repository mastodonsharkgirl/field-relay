# Task 3 report: durable relay approval, admission and audit

## Delivered

Implemented the relay-owned, file-backed SQLite state store in `integration/relay/state.ts`, with exported durable-state contracts in `integration/relay/state-types.ts`.

- New jobs start pending. Explicit approval increments a revision and records a ten-minute expiry.
- Identical enqueue keeps immutable content, approval and lifetime counters. A content or vendor-store mismatch holds the original job and never replaces its body.
- POST reservations use random lease IDs, consume one of three lifetime slots before I/O, start the persisted 30-second recovery deadline on the first admission, and reject concurrent/due/expired/held claims.
- Expired in-flight leases become readback-only; an old lease token cannot settle a later state. A revocation after the committed admission retains the admitted result while still preventing another POST.
- Automatic GET reservations use independent random request IDs and six lifetime slots. Settlements and explicit operator inspections validate receipts, preserve authorization and budgets, preserve an existing verified receipt, and hold an incompatible later receipt as an integrity failure.
- All state transitions and allowlisted audit records use `BEGIN IMMEDIATE` transactions with WAL, foreign keys and a 250 ms busy timeout. Audit events contain only structured fields; there are no headers, credentials or raw transport payloads.
- A persisted wall-clock regression holds automated writes without overwriting prior time; operator inspection remains available.

The relay database is deliberately separate from the Python vendor database and uses its own schema version. `new` refuses an existing database and `resume` refuses a missing or unknown-version database, preserving state files fail-closed.

## TDD evidence

### RED

1. `node --test integration/tests/state.test.ts` before implementation failed with `ERR_MODULE_NOT_FOUND` for `integration/relay/state.ts`. This recorded the greenfield missing module only; it was not treated as behavioral regression proof.
2. After the initial store existed, the added regression `revocation after admission preserves the admission outcome without restoring authorization` failed with `Error: stale admission cannot settle`. The existing revision check incorrectly rejected a legitimately admitted lease after a subsequent revocation.
3. The added regression `a later readback cannot replace a verified immutable receipt` failed with `actual 'vendor-2', expected 'vendor-1'`. This proved a later observation could replace a verified receipt.

### GREEN

`node --test integration/tests/contract.test.ts integration/tests/state.test.ts` passed: **14/14 tests**. This covers approval/revocation revisions, immutable enqueue conflict handling, restart-persistent POST/GET budgets, racing connections and lease expiry, stale settlement, readback-only recovery, clock regression, explicit inspection, and immutable verified readback.

## Final verification

- `npx tsc -p integration/tsconfig.json` — passed.
- `npm run lint` — passed with no lint output.
- `git diff --check` — passed.

Node 24.11.0 emits `ExperimentalWarning: SQLite is an experimental feature and might change at any time` when the state tests load `node:sqlite`. This is expected for the approved lab runtime and remains a runtime limitation to record, not suppress.

## Files changed

- `integration/relay/state.ts`
- `integration/relay/state-types.ts`
- `integration/tests/state.test.ts`
- `.superpowers/sdd/2026-10-13-mock-http-integration/task-3-report.md`

## Self-review

Reviewed durable transition paths for stale lease fencing, revocation sequencing, budget non-reset, receipt validation, and audit field allowlisting. No unrelated product/UI files were changed. Broad `npm run qa` is intentionally left to Task 6 as assigned.
