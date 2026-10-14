# Run and explain the local exercise

Status: local verification passed on 15 October 2026; independent final review is recorded in [RELEASE.md](RELEASE.md). The clean committed walkthrough and resume reports are in [the evidence folder](../evidence/2026-10-15-mock-http/README.md). This page explains the implemented workflow; consult the saved report for the result of any particular run.

## Start

From this independent Field Relay checkout, with dependencies and Node/Python prerequisites installed:

```powershell
npm run integration:demo
```

The default walkthrough shows each exact fictional order and asks you to type `APPROVE`. Without a terminal, use the explicitly scripted mode:

```powershell
npm run integration:demo -- --scripted
```

Scripted approvals are persisted as `harness` events. They are not human decisions. For a shorter response-loss-only demonstration:

```powershell
npm run integration:demo -- --scripted --scenario response-loss
```

The PowerShell wrapper resolves the checkout from its own location:

```powershell
& '.\scripts\start-integration-lab.ps1' --scripted --scenario response-loss
```

It does not install dependencies or change execution policy. Node's experimental SQLite warning remains visible.

## Follow the story in eight steps

1. Inspect Northstar order `0007`: North region, quantity 3, amountMinor 4250. The ID remains text, including leading zeroes.
2. Approve that exact revision. In scripted mode, identify the approval as a harness action.
3. The mock supplier commits the order and withholds the POST response. The launcher observes the committed state while the response is held.
4. The relay times out, preserves uncertainty and performs authenticated readback. A POST response alone cannot establish delivery.
5. Inspect the full saved receipt and exact fields. The full walkthrough restarts the supplier and uses a new relay process. Repeating dispatch of the already verified job creates zero additional POSTs and zero supplier replay acknowledgments. A separate late-commit test exercises a real supplier replay. Final evidence comes through HTTP, never by reading the supplier database.
6. The walkthrough attempts a fixed changed-amount proposal under the same order ID. It records a content conflict and retains the original approved payload and saved order.
7. A separate Orbit order receives 429. The launcher waits for the persisted retry schedule, revokes approval during the wait, and verifies that no second POST was reserved and no order was saved for that key.
8. Another Orbit order is held after admission but before commit. Approval is revoked and the supplier is released. The already admitted request may commit; the report records the actual saved result. Explain why this is not a promise of cancellation.

## Inspect and resume

The launcher prints a run ID and report directory. Keep both SQLite stores and `manifest.json` together under `.local/integration/<run-id>/`. JSON reports contain exact fields and audit records; Markdown reports provide an outcome table. Failed runs remain visible instead of overwriting earlier evidence.

```powershell
npm run integration:demo -- --scripted --resume RUN_ID
npm run integration:cli -- --run RUN_ID report
```

Resume starts the existing supplier store with new session credentials and checks its persistent identity. It preserves jobs, revisions, waits and lifetime budgets. Existing revoked or conflicting jobs stay constrained. Manual inspection can read status without creating an order.

The managed CLI also accepts `fixture northstar`, `fixture orbit`, `approve JOB_ID REVISION operator`, `revoke JOB_ID REVISION`, `dispatch JOB_ID` and `inspect JOB_ID` after `--run RUN_ID`. Use job IDs and revisions from the report. These local labels are not authenticated enterprise identities. The CLI accepts no arbitrary CSV path, order JSON or vendor URL.

## Read the evidence accurately

- `claimedReceipt` is what a valid POST response claimed; `receipt` is verified readback.
- `postReservations` counts permission reserved, including an attempt whose worker died before sending. It is not always the wire POST count.
- `getReservations` counts bounded automatic verification. Report listing/per-order inspections are separately counted.
- `approvalState: revoked` can coexist with `observed: present` after an admitted request commits.
- `count: null` means the report could not verify the listing. It does not mean zero orders.
- `dirty: true` means the run used uncommitted changes alongside the recorded base SHA. Keep that qualification with copied results.
- Every scenario includes expected-versus-observed checks, its own elapsed time, the related audit sequence numbers, and final relay state. Wire GET deltas account separately for automatic verification, operator inspection and evidence inspection.
- A successful scenario cannot override unavailable or mismatched final readback. Overall success also requires exact receipts, completed cleanup and credential scans of the owned artifacts and both report formats.

The launcher stops only owned children on normal exit and its SIGINT handler. The focused handler test injects a SIGINT event; it is not a manual physical-keyboard Ctrl+C certification. State and reports are preserved. A partial startup directory is not silently repaired; start a new named run or investigate preserved state. No reset or recursive deletion command is included.
