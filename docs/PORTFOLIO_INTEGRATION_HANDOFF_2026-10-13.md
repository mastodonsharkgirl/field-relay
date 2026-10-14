# Field Relay: local portfolio integration handoff

Latest state, 15 October 2026: [published interview preview](https://field-relay-saran.pages.dev/labs/field-relay/walkthrough/), repaired source `b6ce889` pushed to `main`, branch/main CI successful, live static assets hash-verified. See [the latest release](integration/DEMO_REPAIR_AND_PREVIEW_2026-10-15.md). Earlier dated checkpoints below remain historical. The local HTTP backend is represented by recorded evidence and is not hosted.

Date: 13 October 2026, Asia/Calcutta.

Status: owner approved the architectural design; the implementation plan is prepared for review and execution-method selection. Mock HTTP implementation remains pending.

This handoff belongs to Field Relay. It is a source-backed input for a future portfolio editor; it does not authorize or perform edits to `saran-info`, `anthropic-saran-info`, their host copies or shared career evidence.

## What exists today

Field Relay's main product compares two CSV exports locally in the browser, keeps exact source evidence, and exports a manual review pack. A separate fictional delivery simulator demonstrates approval, conflict holds, outage retry and replay prevention in memory. Neither workflow sends an order to a vendor.

Read [the domain brief](DOMAIN_BRIEF.md), [the current case study](CASE_STUDY.md), and [the fresh baseline record](evidence/2026-10-13-integration-design/BASELINE.md). Source baseline is `a55564c6f4b0872c8c78c211c8b84fafccf73d64`.

## Proposed addition

[The integration design](superpowers/specs/2026-10-13-mock-http-integration-design.md) proposes an independently launched local exercise: reuse TypeScript intake rules, send fictional orders to a Python mock vendor over authenticated loopback HTTP, persist relay and vendor state separately in SQLite, and evaluate replay, conflicts, timeouts, rate limits, crashes and approval revocation. Actual vendor readback determines the result.

It has no model calls or live vendor account. It demonstrates integration safety reasoning, not Claude usage, model-quality evaluation, customer adoption or production operation. Python implementation, durable transport and adversarial tests remain proposed until built and run.

## Status ledger

| Category                          | State as of this handoff                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| Existing browser product          | Built in prior source commits; inspected today                              |
| Existing tests                    | Fresh full QA: 15 unit tests and 20 browser tests passed                    |
| New design                        | Written locally and approved by the owner on 13 October 2026                |
| New implementation plan           | Written and self-reviewed; pending owner review and execution-method choice |
| Mock HTTP transport / persistence | Not implemented                                                             |
| New adversarial integration tests | Specified, not implemented or executed                                      |
| New failure walkthrough           | Scripted in the design, not demonstrated                                    |
| New integration measurements      | None                                                                        |
| Source/deployment publication     | No push, CI dispatch, deployment or domain change performed                 |
| Real vendor integration           | None                                                                        |
| Paid or cloud calls               | None                                                                        |

Do not copy old or proposed test counts into a new passing-test claim. Do not label this package as a completed integration case while only the design is available.

The [implementation plan](superpowers/plans/2026-10-13-mock-http-integration.md) translates the approved design into six testable tasks. Planning checked the existing configuration and identified the missing Node development types. No product code or dependency was changed and no integration test was run. The baseline QA results above remain the results of the earlier recorded run; they were not rerun during planning.

## Suggested portfolio wording at this stage

“Field Relay compares two CSV exports in the browser and keeps row-level evidence for review. Its separate delivery lab simulates approval, retries and replay prevention. A further local mock-vendor integration exercise is designed but not yet implemented.”

After implementation, replace the final sentence only when source, test log and mock-vendor readback are available. A defensible future description could say that a local synthetic integration was tested against named failure scenarios, followed by the actual measured counts. Do not insert numbers in anticipation of those results.

## Explanation the owner should be able to defend

- An HTTP timeout means “I did not receive the answer,” not “the vendor did nothing.”
- Idempotency means repeated attempts preserve one intended order under a documented vendor contract.
- The original approved payload remains fixed. A changed payload under the same order ID becomes an investigation, not a silent replacement.
- A log records what the relay believed. Readback shows what the vendor actually stored.
- Approval must be checked again before each new attempt. Revocation after admission can still race with an in-flight request.
- SQLite is a deliberate local teaching and test choice. Enterprise hosting, identity, tenant isolation, backups and vendor-specific guarantees still need design and evidence.

These points help show enterprise integration judgment. They do not establish 10+ years of technical customer-facing experience; the supported profile remains 8+ years overall.

## Proposed control-plane note, not applied

The shared `domains.yaml` entry relates to Field Relay through the Jugaad host. Because this chat owns Field Relay only, leave that shared registry and host unchanged. A future authorized maintainer may add a dated note with:

- Scope: Field Relay standalone local integration design and implementation plan.
- State: spec approved; plan awaiting review and execution-method selection; no mock HTTP implementation or deployment.
- Source baseline: `a55564c6f4b0872c8c78c211c8b84fafccf73d64`.
- Fresh verification: existing source QA, 15 unit / 20 browser; zero new integration tests executed.
- Evidence: this repository's design and baseline record.
- Publication: local documents only; public host unchanged by this work.

No existing release counts or custom-domain states should be rewritten based on this local preparation.

## Required next handoff evidence

Before promoting the proposed exercise to “built,” retain approved design and plan, implementation source SHA, exact local launch instructions, integration test results with failures/skips visible, sanitized vendor readback, measured retry/admission timelines, independent review findings and their disposition, and updated local boundary documentation. Preserve explicit differences between local verification, committed code, pushed code, CI, preview deployment and a real customer rollout.

## Later checkpoint — 15 October 2026

This section supersedes the design-only state above while preserving that dated record. The cross-language contract, persistent mock supplier, relay state and recovery transport are implemented; their scoped reviews are clear through `2d19281`. Launcher, lifecycle evidence and interview documentation are now present. Focused checks have passed, including response loss, crash recovery, late commit, revocation, safe resume, credential rotation and owned-process cleanup. The aggregate suite, full application QA and final whole-branch review remain pending. See [RELEASE.md](integration/RELEASE.md) for exact overlapping focused counts and limitations.

The user explicitly asked this chat to check Compass before deciding about heavy checks. Compass is now complete and its release receipt confirms its task model was unloaded. The shared queue assigns another already-authorized inference task next, so this work remains at a lightweight checkpoint until its slot is available.

Suggested current wording: “Field Relay compares two CSV exports with row evidence. A separate synthetic local HTTP lab explores approved order delivery, response loss and recovery. Its core has passed scoped review and focused process tests; final whole-system acceptance is pending.” No live customer, Claude integration, cloud architecture, adoption or impact claim follows from this.

The previous numerical total-tenure wording is not a current verified claim and must not be copied forward. Acting and filmmaking count as professional experience overall. Any overall, technical customer-facing, PM or domain tenure needs its own verified nonoverlapping timeline.

Proposed shared-registry note, **not applied**: Field Relay local HTTP implementation checkpoint; core reviewed; launcher/lifecycle checks and interview guide available; final acceptance queued; no publication or custom-domain state change. This chat continues to own only Field Relay, not the shared registry or portfolio sites.

## Verified implementation handoff — 15 October 2026

This later entry supersedes the queued-compute checkpoint above. Compass completion and resource release were verified; the coordinator then admitted Field Relay after the next queued task stopped at its resource preflight. Field Relay completed serial local verification and released its slot. The release receipt is saved with the evidence.

Final reviewed implementation: `10733d171b7cc96189d305cabbb285d22d8f84a7` on `codex/field-relay-mock-http`. Scoped implementation review approved `3813cc0`; independent whole-branch review then found one missing retry-audit explanation. Its repair at `10733d1` passed focused re-review with zero remaining Critical, Important or Minor findings. [Final disposition](integration/RELEASE.md).

At source immediately committed as `478a207`, the integration aggregate passed 90 Node and 27 Python tests; application QA passed type/lint/format, 15 unit tests, the static build and 20 browser tests. Later bounded report/resume fixes passed their focused tests and renewed type/Python/lint checks. The retry-audit change has 64 affected-suite passes plus one walkthrough/report regression. Clean walkthrough and resume at `10733d1` verified the same two supplier orders. An earlier demo at that same source stopped before admission and remains unexplained; the reviewer accepted it as a documented local limitation, not an identified source defect. These are qualified observations at different commits, not a fabricated single final-run total. [Evidence and exact provenance](evidence/2026-10-15-mock-http/README.md).

Suggested portfolio wording: “Field Relay compares two CSV exports and shows the source rows behind each difference. I extended it with a separate, AI-assisted local HTTP experiment using fictional orders to test exact approval, response loss, duplicate prevention and verified recovery after process restarts. The saved tests and walkthrough show the local behavior; this is not a customer deployment or a live Claude integration.”

For interview explanation, use the [guide](integration/INTERVIEW_GUIDE.md): a hypothetical supply-chain coordinator encounters mismatched exports and an uncertain order submission. Keep the hypothetical label and AI assistance explicit. The project supports a discussion of business problem framing, typed integration contracts, evaluation criteria, human approval, failure handling and technical communication. It establishes no customer outcomes, production architecture experience or numerical tenure total.

Proposed current `domains.yaml` note, **not applied**: separate synthetic HTTP lab locally implemented and verified; source and review disposition in this repository; browser reconciliation interface unchanged; interview guide and measured local reports available; branch not pushed or deployed by this work; no change to custom-domain-live counts. A future authorized maintainer can apply that note without changing the existing site identity or launch state.
