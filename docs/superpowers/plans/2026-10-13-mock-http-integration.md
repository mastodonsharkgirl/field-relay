# Field Relay Mock HTTP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible synthetic local integration exercise that proves its outcome by authenticated readback of a durable mock vendor, including failures, retries, conflicts and approval revocation.

**Architecture:** Keep the existing Astro reconciliation desk and browser delivery simulator unchanged. A TypeScript CLI reuses intake rules and owns `relay.sqlite`; a separate Python HTTP process owns `vendor.sqlite`. Only the HTTP read API establishes the vendor outcome.

**Tech Stack:** Node 24.11.0, native TypeScript stripping, experimental `node:sqlite`, Python 3.14 standard library, SQLite, Node test runner, Python unittest, existing npm/Astro QA.

**Spec:** [Approved integration design](../specs/2026-10-13-mock-http-integration-design.md). Owner approved the written spec with “go ahead, use @Superpowers” and subsequently explicitly approved the Field Relay plan. Execution began with sequential subagents and scoped reviews, then continued inline after an unavailable implementer, preserving the review gates.

**Final local disposition, 15 October 2026:** Tasks 1–6 are implemented, verified and reviewed, with source-specific evidence and known limits in the [release record](../../integration/RELEASE.md). Full aggregate/application gates passed at `478a207`; subsequent bounded changes have focused verification, clean walkthrough/resume evidence and final independent review through `10733d1`. One unexplained failed demo remains preserved beside the successful repeat. The original task checklist below is retained as the original acceptance contract; it is not retroactively marked as a perfect test-first execution history. The execution ledger and review record describe deviations and evidence accurately. No push or deployment was performed.

## Global Constraints

- “Only Field Relay may be edited.” No shared registry, host, portfolio or career-evidence edits.
- “No browser CSV, reconciliation finding, review pack, or browser approval enters the HTTP exercise.”
- “No runtime exercise code is bundled into Astro.” No new UI or animation.
- “Bind to literal `127.0.0.1` on an OS-assigned free port, supplied to the relay through the launcher.” No arbitrary vendor URL and no followed redirects.
- “At most three reserved POST attempts in the job's lifetime.”
- “At most six automatic per-order verification GET attempts.”
- “Each HTTP exchange has a 750 ms total client deadline, including response body consumption.”
- “A 30-second recovery deadline begins on the first admission.”
- Approval is exact-payload/revision-bound and expires after ten minutes. Reapproval never resets budgets.
- Request body limit 16 KiB; response body limit 64 KiB; at most 100 vendor orders per state directory.
- Backoff: random delay between zero and `min(2000, 250 * 2^(attempt-1))` milliseconds; never shorten valid Retry-After.
- “Each approval, revocation, attempt reservation, retry schedule, conflict, order commit and outcome transition commits together with its audit event in the same database transaction.”
- Credential values never enter arguments, files, fixtures, logs, reports or Git. Independently filtered child environments keep the admin credential out of the relay.
- Use one writer in this repository at a time. Follow the repository model-routing table; never use Ultra. No live vendor, paid call, publication or application action.
- Source baseline `a55564c`; approved design package `2c4e67c`. Prior 15-unit/20-browser results are baseline evidence, not evidence for this new subsystem.

## Review Focus

1. Leading-zero IDs and cross-language JSON number/string handling must preserve the same canonical identity. Task 1 pins this with shared vectors and boolean/float rejection.
2. A restarted or delayed worker must not overwrite a newer approval, release another worker's lease, or record phantom success. Tasks 3 and 5 test stale lease tokens and atomic audit rollback.
3. Wall-clock rollback must not extend approval or the recovery window. Task 3 detects persisted time regression, holds writes and permits operator readback.
4. A slowly streamed success response must respect the total timeout and size bound; a 100-order listing must fit the bounded API. Tasks 2 and 4 test complete-body limits and compact receipt lists.
5. Stopping or resuming the launcher from a path containing spaces must preserve existing state, clean up only owned children and avoid leaking credentials. Task 5 uses process-level lifecycle tests.

## File map and execution order

| Task                       | Owned files and responsibilities                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 — Contract and intake    | `integration/relay/contract.ts`, `integration/relay/intake.ts`, `integration/vendor/contract.py`, `integration/fixtures/{northstar.csv,orbit.csv,contract-vectors.json}`, contract tests; scoped TypeScript/lint configuration |
| 2 — Mock vendor            | `integration/vendor/{__init__.py,store.py,server.py}`, Python vendor tests; authenticated HTTP, transactions and bounded fault controls                                                                                        |
| 3 — Relay state            | `integration/relay/{state.ts,state-types.ts}`, state tests; approvals, admission, leases, retries and atomic audit                                                                                                             |
| 4 — Delivery               | `integration/relay/{transport.ts,retry.ts,dispatch.ts}`, policy and HTTP tests; actual requests, bounded recovery and readback validation                                                                                      |
| 5 — Reproducible exercise  | `integration/launch.ts`, `integration/relay/{cli.ts,evidence.ts}`, `integration/tests/{harness.ts,run-all.ts,lifecycle.test.ts,adversarial.test.ts}`, `scripts/start-integration-lab.ps1`; process orchestration and evidence  |
| 6 — Acceptance and handoff | Existing README/architecture/brief/case-study documentation, `docs/integration/{CONTRACT.md,WALKTHROUGH.md,EXECUTIVE_BRIEF.md,RELEASE.md}`, local portfolio handoff and sanitized measured evidence                            |

Tasks run in order. Setup, tests and configuration are included with the behavior they support. Before execution, use `superpowers:using-git-worktrees` to select an isolated Field Relay worktree from the approved plan commit, then follow the chosen execution skill's task ledger. Do not create a worktree for either portfolio. Use original checkout paths only for read-only reference after switching execution to that worktree.

## Task 1: Canonical contract and reuse of existing intake

**Files:** Create the Task 1 files above, `integration/tests/contract.test.ts`, `integration/tests/test_contract.py`, and `integration/tsconfig.json`. Modify `package.json`, `package-lock.json`, `eslint.config.js`, `tsconfig.json`, `.gitignore` only for scoped integration tooling. Leave `src/lib/core.ts` unchanged.

**Interfaces:**

- Export TypeScript `Order = { schemaVersion: 1; partner: 'northstar' | 'orbit'; orderId: string; region: 'North' | 'South' | 'East' | 'West' | 'Central'; quantity: number; amountMinor: number }` and `OrderIdentity = { businessKey: string; canonical: string; payloadDigest: string; idempotencyKey: string }`.
- Export `validateOrder(value: unknown): Order`, `identify(order: Order): OrderIdentity`, and `parseReceipt(value: unknown, expected: Order, storeId: string): VendorReceipt`. `VendorReceipt` includes the spec fields, with optional POST-only `replayed`; exact order and identity comparisons are mandatory.
- Python exposes `validate_order(value: object) -> dict`, `identify(order: dict) -> dict`, and `decode_order(body: bytes) -> dict`; the last rejects duplicate JSON keys.
- `loadFixture(name: 'northstar' | 'orbit'): { orders: Order[]; quarantineCount: number; suppressedCount: number }` calls existing `ingest` and converts only accepted records. Reject empty/header-only fixtures and unknown fixture names. Every resulting integration job still needs separate approval.

- [ ] **Write failing cross-language contract tests.** Assert canonical `[1,"northstar","0007","North",3,4250]`, distinct identities for `0007` and `7`, unchanged key but changed digest when quantity changes, and identical Python/TypeScript vector output. Test every schema field/type, unknown fields, missing values, integer boundaries 1/10,000 and 1/99,999,999,999, booleans, nonintegers, nonfinite values, duplicate JSON keys and unsafe receipt substitutions. Pin order ID syntax to `[A-Za-z0-9][A-Za-z0-9._-]{0,63}` within the spec's ASCII subset. Assert that input maps, quarantines and duplicate suppression come from existing intake behavior.

  Representative assertion, using Node's `test` and `assert/strict`:

  ```ts
  test('identity preserves a leading-zero ID and binds changed content', () => {
    const order = validateOrder({
      schemaVersion: 1,
      partner: 'northstar',
      orderId: '0007',
      region: 'North',
      quantity: 3,
      amountMinor: 4250,
    });
    const first = identify(order);
    const changed = identify({ ...order, quantity: 4 });
    assert.equal(first.canonical, '[1,"northstar","0007","North",3,4250]');
    assert.equal(changed.idempotencyKey, first.idempotencyKey);
    assert.notEqual(changed.payloadDigest, first.payloadDigest);
    assert.notEqual(identify({ ...order, orderId: '7' }).idempotencyKey, first.idempotencyKey);
  });
  ```

- [ ] **Run the failing tests.** `node --test integration/tests/contract.test.ts` and `py -3.14 -m unittest integration.tests.test_contract -v` must fail because the new modules/behavior are absent; record the failure rather than reporting a tool/import accident as full behavioral coverage.
- [ ] **Implement the interfaces and fixtures.** Use compact JSON arrays and SHA-256; store independently computed expected strings/digests in the shared vectors. Keep fixtures fictional. Receipt parsing validates all fields and identifiers before use. No simulated network success may satisfy it.
- [ ] **Add scoped tool support.** Install only development types using `npm install --save-dev --save-exact @types/node@24`; retain the resolved version in the lockfile. Integration TypeScript uses `strict`, `noEmit`, `NodeNext`, `allowImportingTsExtensions`, `erasableSyntaxOnly` and `types: ["node"]`. Exclude `integration` from Astro's root include and include it in the separate config, including the imported existing core file. Extend ESLint only for integration TypeScript globals and include `integration/**/*.ts` in lint. Ignore `.local/integration/` and integration Python caches. No runtime dependency is added.
- [ ] **Verify and commit.** Run both contract commands, `npx tsc -p integration/tsconfig.json`, `npm run lint` and the existing `npm test`; require exit 0 with explicit test counts. Commit only the listed task files with `feat: define synthetic integration contracts and intake`.

## Task 2: Authenticated durable mock vendor

**Files:** Task 2 files above plus `integration/tests/test_vendor.py`.

**Interfaces:**

- Python `VendorStore(path: Path, mode: Literal['new', 'resume'])`, `.create_or_replay(order: dict, key: str, request_id: str) -> tuple[int, dict]`, `.get_order(key: str) -> dict | None`, `.list_orders() -> dict`, `.close() -> None`.
- `create_server(store_path: Path, mode: str, token: str, admin_token: str) -> ThreadingHTTPServer` binds `('127.0.0.1', 0)`; token values are passed in memory only.
- `py -3.14 -m integration.vendor.server --state-dir <owned-path> --mode new|resume` takes credentials solely from filtered environment variables. Startup emits one bounded JSON readiness line `{ port, instanceId, storeId }`, with no credentials. Runtime version and errors are fixed safe fields.
- Implement exactly the spec routes. Admin `POST /__lab/scenarios` accepts a bounded object with `action: 'configure' | 'observe' | 'release'`, one idempotency key and an allowlisted scenario. Observe returns sanitized phase/sequence/request counts; release unblocks a named test barrier. Ordinary credentials cannot call this route.

- [ ] **Write failing vendor tests.** Real HTTP requests against a spawned Python process must prove missing/wrong bearer denial, admin separation, strict Host/Origin handling, JSON framing/duplicate headers/body limits, create/replay/conflict, independent key recomputation, unique business-key enforcement and the 100-order cap. Require a 101st distinct order to receive terminal 422 without changing stored count. Assert compact list output remains within 64 KiB at the maximum count.
- [ ] **Add failure/concurrency assertions.** Submit same/different bodies concurrently, restart the vendor and read the same receipt, hold the response after commit while a simultaneous GET observes the saved row, and crash during a state/audit transaction. Assert exact committed payload, one unique order and no phantom audit. Reject new-mode reuse of an existing directory and resume of a missing/corrupt/unknown-version database without overwriting files.

  Name the store regression `test_changed_payload_preserves_original_receipt`; its assertion body uses a new per-test `VendorStore`, with `order` loaded from a valid shared vector:

  ```python
  key = identify(order)["idempotencyKey"]
  status, receipt = store.create_or_replay(order, key, "first")
  replay_status, replay = store.create_or_replay(order, key, "repeat")
  conflict_status, _ = store.create_or_replay({**order, "quantity": order["quantity"] + 1}, key, "changed")
  self.assertEqual((status, replay_status, conflict_status), (201, 200, 409))
  self.assertEqual(receipt["vendorOrderId"], replay["vendorOrderId"])
  self.assertEqual(store.get_order(key)["order"], order)
  self.assertEqual(store.list_orders()["count"], 1)
  ```

- [ ] **Run red.** `py -3.14 -m unittest integration.tests.test_vendor -v`; retain actual failing assertions before implementation.
- [ ] **Implement the store and server.** Use one connection per thread, parameterized SQL, WAL, foreign keys, a 250 ms busy timeout and explicit transactions. Limit header/body reading to 750 ms, reject transfer-encoding and duplicate content-length/auth/key/request-ID headers, verify exact Host with allocated port, reject any Origin, and set `Cache-Control: no-store`. Reserve sanitized fault sequence numbers atomically; delays and barrier waits occur outside SQLite transactions and expire within five seconds.
- [ ] **Implement the fixed faults.** Allow healthy, one/two/repeated 429, 503, permanent 401/403/422, timeout before commit, timeout after commit, malformed success, mismatched readback and blocked/unavailable readback. Store per-key progression durably; cap scenario length and delays. Fault controls can select only synthetic cases, never paths, code or URLs. Health returns a persisted store ID; readback returns committed data only. Both valid/invalid key requests are independently validated before any order mutation.
- [ ] **Verify and commit.** Both Python suites pass; inspect HTTP readback and request counts, not handler-return values alone. Run `py -3.14 -m compileall -q integration/vendor`. Commit `feat: add authenticated durable Python mock vendor`.

## Task 3: Durable approval, admission and audit

**Files:** Task 3 files above plus `integration/tests/state.test.ts`.

**Interfaces:**

- `openRelayStore(path: string, mode: 'new' | 'resume'): RelayStore`; all store methods are synchronous, transactional and use epoch milliseconds.
- `JobSnapshot` carries `jobId`, immutable `order`, `identity`, `vendorStoreId`, `approvalRevision`, `approvalState: 'pending' | 'approved' | 'revoked'`, `approvalExpiresAt`, `holdReason`, `postReservations`, `getReservations`, `firstAdmissionAt`, `deadlineAt`, `nextAttemptAt`, `leaseId`, `leaseExpiresAt`, `observed: 'unknown' | 'absent' | 'present'`, `outcome` and optional verified `receipt`. Nullable fields are explicitly `null` until known.
- `RelayStore.enqueue(order: Order, vendorStoreId: string, now: number): JobSnapshot`, `.approve(jobId: string, expectedRevision: number, now: number): JobSnapshot`, `.revoke(jobId: string, expectedRevision: number, reason: string, now: number): JobSnapshot`, `.snapshot(jobId: string): JobSnapshot`, `.events(jobId: string): AuditEvent[]`, `.close(): void`.
- `.reservePost(jobId: string, workerId: string, now: number): Admission | Blocked`; `Admission` contains `kind: 'admitted'`, `jobId`, `leaseId`, `order`, `identity`, `attempt`, `approvalRevision`, `admittedAt` and `deadlineAt`. `Blocked` contains `kind: 'blocked'`, a fixed reason and optional next due time. Lease duration is 5,000 ms; claim tokens are random and checked on updates.
- `.reserveRead(jobId: string, now: number): ReadReservation | Blocked` consumes a lifetime GET slot. `ReadReservation` has `kind: 'read_reserved'`, `jobId`, unique `requestId`, `attempt` and `reservedAt`. `.settleRead(reservation: ReadReservation, result: ReadObservation, now: number): JobSnapshot` validates reservation ownership, schema/identity and never changes approval or replenishes budgets. Read observations are `present` with a validated receipt, `absent`, or `unknown` with a fixed reason; every variant also carries `httpStatus: number | null` and `nextAttemptAt: number | null` so read failures can persist their schedule. Stale results cannot downgrade a previously verified immutable receipt.
- `.settle(admission: Admission, result: AttemptResult, now: number): JobSnapshot` atomically records fixed result fields and a persisted retry schedule; stale lease tokens cannot release a new lease or overwrite outcome/approval. `AttemptResult` carries classification, HTTP status or null, next due time or null, and validated evidence if any. `.hold(jobId: string, reason: HoldReason, now: number): JobSnapshot` creates an auditable hold without granting authorization. `HoldReason` covers the spec's conflict, integrity, store, budget, deadline, authorization and clock conditions as fixed codes, not free-form exception text.
- `.recordInspection(jobId: string, observation: ReadObservation, now: number): JobSnapshot` records explicit operator GET evidence separately from automatic reservations, validates the same identity, preserves approval and budgets, and cannot enable a write. `AuditEvent` contains the spec's allowed structured fields with a monotonic sequence ID; all secret/raw transport fields are excluded from its type.

- [ ] **Write failing state tests.** All new jobs, even routine North-region fixtures, start pending. Approval binds the current canonical content, store ID and revision for 600,000 ms. Stale approval/revocation revisions fail without mutation. Identical enqueue preserves counters and approval; changed enqueue holds the original and preserves its body. Use test times to prove three POST/six GET caps and no budget reset on restart, reapproval or identical enqueue.
- [ ] **Test admission races and persistence.** Separate connections/processes compete for one job; assert one live claim, monotonic attempt IDs and atomic events. Test conflict/revocation before and after reservation, expired lease recovery, stale worker completion, crash rollback, busy/corrupt/unknown-version store, changed vendor store ID and backward wall clock. Persist `lastObservedAt`; a regression blocks automated writes and records a clock hold without modifying previous timestamps. Operator readback remains allowed.

  Name the revocation regression `revocation blocks a reservation without erasing its approval history`. With a fresh per-test store and valid fixture order, require:

  ```ts
  const pending = store.enqueue(order, 'fixture-store', 1000);
  assert.equal(store.reservePost(pending.jobId, 'worker', 1000).kind, 'blocked');
  const approved = store.approve(pending.jobId, pending.approvalRevision, 1000);
  store.revoke(approved.jobId, approved.approvalRevision, 'operator hold', 1001);
  assert.equal(store.reservePost(approved.jobId, 'worker', 1002).kind, 'blocked');
  assert.equal(store.snapshot(approved.jobId).postReservations, 0);
  assert.equal(store.snapshot(approved.jobId).approvalState, 'revoked');
  ```

- [ ] **Run red.** `node --test integration/tests/state.test.ts`; record the failures for missing behavior.
- [ ] **Implement the store interfaces.** Use parameterized SQL, the same transaction/lock settings as Task 2, unique identity constraints and transaction-local audit sequence IDs. Reserve budgets before I/O. First admission fixes a 30,000 ms deadline. Approval checks and conflict holds are evaluated at reservation; after-admission events never alter the admitted immutable body. Recovery marks an expired in-flight job as needing readback; it cannot directly claim another write. Keep authorization and observed outcome separate.
- [ ] **Verify and commit.** State and contract tests plus `npx tsc -p integration/tsconfig.json` and `npm run lint` pass. Commit `feat: persist relay approvals admissions and audit`.

## Task 4: Bounded transport, retries and readback

**Files:** Task 4 files above, `integration/tests/retry.test.ts` and `integration/tests/transport.test.ts`.

**Interfaces:**

- `VendorConnection = { port: number; token: string; storeId: string }`; derive only `http://127.0.0.1:<port>` internally. It is never serializable report data.
- `exchange(connection: VendorConnection, request: { method: 'GET' | 'POST'; path: string; requestId: string; order?: Order; key?: string }): Promise<HttpResult>` with a complete-body 750 ms bound and 64 KiB response cap. `HttpResult` is a discriminated union for bounded HTTP data or fixed timeout/network/protocol error; no raw headers/tokens escape.
- `retryDecision(input: { attempt: number; now: number; deadlineAt: number; retryAfter: string | null; random: number }): { kind: 'retry' | 'deferred_outside_deadline'; nextAttemptAt: number; reason: string }`; `random` is in `[0,1]`, supplied from a real random source outside policy unit tests.
- `dispatch(store: RelayStore, jobId: string, connection: VendorConnection, workerId: string): Promise<JobSnapshot>` consumes Tasks 1/3 and returns only a persisted snapshot. `inspectOrder(store: RelayStore, jobId: string, connection: VendorConnection): Promise<JobSnapshot>` is explicit operator readback, separately audited, and cannot call POST.

- [ ] **Write failing policy tests.** Assert full-jitter bounds, all retryable/permanent statuses from the spec, 0/positive/integer-seconds/HTTP-date/malformed Retry-After, huge values without overflow, and a delay beyond the 30-second deadline remaining deferred. A successful POST is insufficient; receipt/readback identity mismatch is a hold. Fresh approval checks occur after each wait.

  ```ts
  test('Retry-After beyond the deadline is never shortened', () => {
    const next = retryDecision({
      attempt: 1,
      now: 1000,
      deadlineAt: 31000,
      retryAfter: '60',
      random: 0,
    });
    assert.equal(next.kind, 'deferred_outside_deadline');
    assert.equal(next.nextAttemptAt, 61000);
  });
  ```

- [ ] **Write real HTTP transport tests.** Use Task 2's process and allowlisted faults: healthy readback, 429 then success, three transient reservations, permanent failure without retry, commit followed by lost response, malformed success, readback outage and false readback. Assert observed exact vendor payload and POST/GET counts. A slow-body response and an oversized response hit the deadline/size limit after headers arrive. Redirects, hostile paths and invalid ports cannot receive credentials. Never substitute a mocked fetch in tests labeled HTTP integration.
- [ ] **Run red.** `node --test integration/tests/retry.test.ts integration/tests/transport.test.ts` must fail on missing behavior; Python vendor tests remain green.
- [ ] **Implement transport and retry policy.** Use the pinned Node API, a total abort deadline that includes reading the body, streaming byte-count enforcement and manual redirect refusal. Parse only bounded, allowlisted Retry-After information. Valid Retry-After applies to the next vendor request, including automatic reconciliation reads, so a GET cannot evade vendor rate limiting. Keep every scheduled due time in SQLite, and check it before reserving any automatic request.
- [ ] **Implement dispatch.** Claim an exact approved immutable body, send, persist classification, then read back. After an ambiguous failure or expired in-flight lease, read before another POST. Only a valid absent observation plus active approval/due time/budgets permits same-key retry; a late original request remains protected by vendor uniqueness. Pending approval means no POST. Revocation or changed enqueue after admission allows readback but prevents future writes. A 2xx without verified readback never becomes delivered. Store replacement, stale updates and contract integrity failures hold writes. If automation is exhausted/deferred/expired, return that state with observation still truthful.
- [ ] **Verify and commit.** Contract/state/policy/HTTP tests, Python tests, type check and lint pass. Record actual elapsed response-loss/429 intervals and compare them with requested delays using a small scheduler tolerance, not exact timing equality. Commit `feat: verify vendor outcomes with bounded durable recovery`.

## Task 5: Reproducible launcher, process failures and evidence

**Files:** Task 5 files from the file map. Add `integration/tests/cli.test.ts`; add npm scripts `integration:check`, `integration:test`, `integration:demo` and `integration:cli` in `package.json`.

**Interfaces:**

- `launchExercise(options: { mode: 'new' | 'resume'; runId?: string; scenario: ScenarioName; scripted: boolean }): Promise<RunEvidence>` in `integration/launch.ts`. `ScenarioName` is a fixed union for walkthrough scenarios. A validated run ID selects only `.local/integration/<runId>`; reject traversal, absolute paths and symlink/reparse escapes.
- `buildChildEnv(role: 'relay' | 'vendor', token: string, adminToken: string): Record<string,string>` allowlists necessary Windows runtime variables and adds only the role's credentials. Admin remains in the parent and vendor, never relay.
- `buildEvidence(input: { metadata: RunMetadata; jobs: JobSnapshot[]; events: AuditEvent[]; vendorReadback: VendorListReadback; scenarioResults: ScenarioResult[] }): RunEvidence` and `writeEvidence(evidence: RunEvidence, directory: string): void` in `integration/relay/evidence.ts`. `RunEvidence` adds `schemaVersion: 1` to this input shape. `RunMetadata` holds source SHA/dirty flag, commands, versions, OS, date/timezone, fixture hashes and durations. `ScenarioResult` holds scenario name, expected/observed counts and payload, timing, passed/failed/skipped and reason. `VendorListReadback` holds read time, HTTP status, verified store ID, `orders: VendorReceipt[]`, `count: number | null` and an explicit verification/error state. Unavailable readback uses a null count, never a misleading zero. Evidence may contain only enumerated safe fields.
- CLI verbs: `fixture`, `approve`, `revoke`, `dispatch`, `inspect` and `report`; accept fixture names, generated job IDs and approval revisions, never arbitrary order JSON/file paths. Authentication comes from environment. A separately declared `--scripted` launcher mode records its approvals as harness approvals, never human actions.
- Test harness `startLab(options: { mode: 'new' | 'resume'; runId?: string }): Promise<LabHarness>` exposes `connection`, `configureFault`, `observeFault`, `releaseBarrier`, `startRelay`, `restartVendor`, `stop` and safe state/evidence locations. `startRelay({ fixture, scripted, stopAt? })` returns an owned process handle plus a result promise; `stopAt` is a test-only allowlisted admission/commit milestone. Child synchronization uses bounded IPC or admin observations, not arbitrary sleeps. Production CLI does not expose arbitrary hook/code execution.

- [ ] **Write failing lifecycle and adversarial tests.** Launch real child processes with isolated files/ports. Kill the relay after admission-before-send and after vendor-commit-before-local-confirmation, then resume; assert original budgets, readback first and one vendor order. Restart both services, replay the same job, and hold changed content after unknown/exhausted/success outcomes. Run direct vendor concurrent same/different-body POSTs and two relay workers; assert admitted approval revision separately from direct vendor validation.
- [ ] **Test cancellation and disclosure boundaries.** Revoke during a durable 429 wait and prove no second POST. Revoke/change enqueue after admission and prove only the original may commit; show exact vendor result without claiming cancellation. Test credential rotation on coordinated restart, invalid Host/Origin/admin access, malicious request IDs, unavailable/mismatched readback, missing/changed databases, state paths containing spaces, path escape, Ctrl+C and startup failure. Scan emitted artifacts against the actual runtime credentials in memory; scan must report a boolean/count, never print the credential. Verify cleanup by child PIDs and port closure; do not inspect or kill unrelated processes.

  For `timeout after vendor commit is verified without a duplicate`, the harness must first synchronize at commit and then let the client timeout; assert on its returned `RunEvidence`:

  ```ts
  assert.equal(evidence.vendorReadback.count, 1);
  assert.deepEqual(evidence.vendorReadback.orders[0].order, evidence.jobs[0].order);
  assert.equal(evidence.jobs[0].postReservations, 1);
  assert.equal(evidence.jobs[0].observed, 'present');
  assert.equal(
    evidence.jobs[0].receipt?.vendorOrderId,
    evidence.vendorReadback.orders[0].vendorOrderId,
  );
  ```

- [ ] **Run red.** `node --test integration/tests/cli.test.ts integration/tests/lifecycle.test.ts integration/tests/adversarial.test.ts`; failures must identify the missing process behavior.
- [ ] **Implement launcher and CLI.** Resolve the repository root from the module location, check Node 24.11.0/Python 3.14 availability, create named new state without overwriting, and spawn hidden owned children with filtered environments and explicit argument arrays. Authenticate readiness before starting the relay. The default demo runs an interactive synthetic workflow: display exact fields and obtain local approval before dispatch; `--scripted` reproduces the automatic evidence walkthrough. The PowerShell wrapper resolves its own path, launches the Node entry point, propagates exit status and does not change execution policy or install dependencies. On resume require existing state; regenerate credentials, verify persisted store IDs and continue within original budgets. Cleanup only owned children on success/error/Ctrl+C, preserving state and reports.
- [ ] **Implement aggregate verification and evidence.** `integration/tests/run-all.ts` discovers its own test files, invokes Node and Python suites with safe argument arrays, retains failure/skipped counts and returns nonzero if either fails. `integration:check` runs TypeScript plus Python compilation; `integration:test` runs that aggregate entry point. `integration:demo` launches the exercise; `integration:cli` invokes its local CLI. Evidence combines actual GET list readback and durable relay events, with explicit inspection request counts. Include the eight-step response-loss/conflict/revocation walkthrough from the spec and an executive-readable outcome table. Assert no credential reaches stdout, stderr, command arguments or output files.
- [ ] **Verify and commit.** Run `npm run integration:check`, `npm run integration:test`, then `npm run integration:demo -- --scripted` and a resume of that printed run ID. Exercise the PowerShell wrapper from a directory with spaces. Require exact readback and bounded request/timing assertions; retain failed experiments as failed evidence until superseded, rather than silently discarding them. Commit `feat: add reproducible local integration exercise and failure evidence`.

## Task 6: Whole-system acceptance and portfolio handoff

**Files:** Task 6 files from the map; new measured evidence under `docs/evidence/<actual-run-date>-mock-http/`. Update the existing `docs/PORTFOLIO_INTEGRATION_HANDOFF_2026-10-13.md` with an explicit later-state entry, preserving the dated design/baseline record. Do not overwrite historical QA logs or review dispositions.

**Interfaces:** Documentation consumes `RunEvidence`, actual command logs, the approved spec/plan and reviewed source commits. It publishes no live endpoint and introduces no runtime API.

- [ ] **Run the acceptance gates in sequence.** `npm run integration:check`, `npm run integration:test`, `npm run qa`, then the scripted demo/resume. Capture command, source SHA/dirty state, start/end, exit code and actual counts. Use `superpowers:verification-before-completion`. A failed gate is not counted as passed; repair required code through failing-then-passing regression tests and repeat only the affected gates before final completion.
- [ ] **Inspect the existing browser regression output.** Existing mobile/tablet/desktop Playwright journeys must remain passing; check compiled browser assets contain no integration modules or credentials. If any UI change became necessary, read/apply the user-specified interface, motion and visual-QA skills and perform a fresh real visual review at those sizes. Without a UI change, distinguish automated browser regression evidence from a manual visual audit.
- [ ] **Write the durable documentation.** Correct README/architecture delivery-first wording to match the existing reconciliation product. In brief/case study, keep browser memory-only limits attached to the browser workflows and describe the separate opt-in synthetic HTTP exercise accurately. Document exact commands, runtime warning/requirements, state/report locations, cleanup/resume, request/response examples with no token, failure walkthrough with actual vendor receipts, business-risk explanation and production gaps. Copy no unmeasured performance/customer claims into the portfolio handoff. Keep shared `domains.yaml` changes as a proposed local note only.
- [ ] **Complete independent whole-branch review.** Follow the chosen Superpowers execution skill; use `reviewer_sol` for authorization, transport, persistence and claim boundaries, with `qa_terra` where browser/launcher behavior needs review. Apply corrections with new reproductions, read back changed files and retain disposition of remaining limitations. One writer owns the repository throughout; reviewers are read-only.
- [ ] **Verify documentation and scope, then commit.** Run scoped Prettier, `git diff --check`, verify artifact links and report schema, and inspect the diff/status for unrelated changes. Commit `docs: record verified mock integration limits and portfolio handoff`. Report local/built/tested/measured/committed/pushed/deployed states separately. Do not push or deploy. Finish the development branch using the applicable skill within the user's existing local-only scope.

## Self-review and spec coverage

| Approved spec requirement                                                     | Implementation and proof                                                   |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Existing identity, fixture-only input, reuse rules                            | Task 1 intake and Task 6 browser regression/boundary copy                  |
| Explicit cross-language contracts and authenticated HTTP                      | Tasks 1 and 2, shared vectors and real server tests                        |
| Durable vendor uniqueness and changed-payload conflicts                       | Task 2 constraints/concurrency; Tasks 3/5 immutable jobs and restart races |
| Durable authorization, expiry, revocation, admission race                     | Task 3 state tests; Tasks 4/5 real dispatch and synchronized races         |
| Timeout after commit, actual state readback                                   | Tasks 2/4/5 HTTP GET while POST is delayed and crash recovery              |
| Lifetime budgets, Retry-After, transient/permanent distinction                | Tasks 3/4 counters/policy and Tasks 4/5 measured wire tests                |
| Atomic observability, bounded payloads, secret exclusion                      | Tasks 2/3 transactions; Tasks 4/5 transport/export/leak checks             |
| Reproducible local launcher, architecture, walkthrough, executive explanation | Tasks 5/6 evidence and documents                                           |
| Honest enterprise gaps and portfolio integration handoff                      | Task 6; no shared portfolio edit or publication                            |

Self-review completed during plan preparation: all spec sections map to tasks; interfaces use the same `Order`, `JobSnapshot`, `Admission`, `ReadReservation`, `VendorConnection` and evidence names throughout. Review-focus tests are assigned to their owning tasks. The plan adds no real vendor, browser backend or cloud deployment. Test counts and integration timings remain unmeasured.

## Execution choice for owner review

Recommended: **subagent-driven**, sequentially. A fresh implementer builds each task and a separate reviewer checks it before the next task, followed by a whole-branch review. This costs more review context but suits the six independently testable boundaries and the risk of false safety claims. Use `builder_terra` for normal implementation, the designated `reviewer_sol` for architecture/security boundaries and `qa_terra` for behavioral QA; no parallel repository writers.

Alternative: **native** execution. The main agent implements all six tasks with the same tests and evidence, then a fresh reviewer checks the complete branch. This uses fewer separate agent contexts but postpones independent review until the end.

After owner review and choice, execute the selected workflow continuously through all tasks and acceptance checks. Routine reversible implementation decisions do not require another confirmation; record them in the execution ledger. Existing restrictions on publication, paid calls, private data and other repositories remain in force.
