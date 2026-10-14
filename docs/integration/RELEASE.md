# Local verification record — 15 October 2026

This earlier local record is preserved. The subsequent demo repair, successful full hosted checks and published interview preview are recorded in [the latest release](DEMO_REPAIR_AND_PREVIEW_2026-10-15.md). Source `b6ce889` is pushed to `main` and deployed at [Field Relay](https://field-relay-saran.pages.dev/labs/field-relay/). Its historical unknown failure is still not retroactively diagnosed.

The local integration and application gates pass at implementation commit `478a2079ca14be39583de3b684827b6a6e19b570`. Subsequent bounded fixes have focused passing checks. Scoped re-review approved implementation `3813cc0`; whole-branch review then found one missing retry-audit explanation, repaired in `10733d1`. Independent re-review closed that finding with zero remaining Critical, Important or Minor issues. A clean walkthrough and resume at that source pass, while an earlier failed attempt at the same source remains unexplained and preserved below. Local implementation and review are complete with these stated limits; this is not a production release.

At the user's request, this chat checked Compass and verified its completion and explicit compute release. The coordinator subsequently assigned the slot to Field Relay after project #10 stopped at its resource preflight. Verification ran serially with one worker. No unrelated process was stopped and no model inference was run.

## Current measured acceptance

| Command or inspection        | Result                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run integration:check`  | TypeScript and Python compilation passed                                                                                                                      |
| `npm run integration:test`   | 90 Node tests and 27 Python tests passed; zero failures, skips or cancellations; 66.491 s and 24.287 s process durations                                      |
| `npm run qa`                 | Astro check: zero errors/warnings; lint/format passed; 15 unit tests passed; static build passed; 20 browser tests passed using one worker in 22.1 s          |
| Clean scripted walkthrough   | Five scenarios passed, two exact supplier orders; 4,914 ms local workflow including injected waits                                                            |
| Resume of the printed run ID | Three reconciled jobs passed, same two supplier orders; 2,074 ms                                                                                              |
| Compiled output boundary     | Ten compiled files; zero matches for integration runtime, environment or synthetic HTTP fault markers; browser source unchanged from the baseline             |
| Credential exclusion         | JSON/Markdown content, child stdout/stderr/arguments and bounded owned artifact bytes scanned against actual credentials in memory; emitted-file scans passed |

The aggregate and QA ran on the working tree immediately committed as `478a207`; the demo and resume ran on that exact clean commit (`dirty: false`). These are distinct observations, not a claim that the aggregate ran after the commit. Runtime: Node 24.11.0, Python 3.14.3, SQLite 3.50.4. Browser regression covers mobile/tablet/desktop and enlarged text; no fresh manual visual audit is claimed because UI source is unchanged.

The [saved evidence](../evidence/2026-10-15-mock-http/README.md) contains the actual reports, commands, counts and source provenance. The prior focused evidence below remains a historical development checkpoint and must not be added to the aggregate totals.

After the aggregate, scoped review found bounded reporting gaps: enforce the timeout upper bound; record actual invocation arguments; and render saved per-event approval sources instead of inferring them from the latest launcher mode. These fixes passed focused three-test and two-test runs plus renewed type/Python checks and lint. The aggregate/build/browser results above remain associated with `478a207`; no second full run is claimed. The compute slot has been released, with [an explicit receipt](../evidence/2026-10-15-mock-http/COMPUTE_RELEASE.json), while read-only review and documentation continue.

The subsequent clean implementation commit `4e52364c7ce2e9bb139d141912630ebdceb3f046` passed a new [five-scenario walkthrough](../evidence/2026-10-15-mock-http/final/walkthrough.md) and [three-job resume](../evidence/2026-10-15-mock-http/final/resume.md). Both verified the same two supplier orders, with elapsed local workflows of 5,248 ms and 1,734 ms. These short single-process exercises did not restart a full build/browser run after compute release.

The first-admission resume predicate was repaired in `3813cc0`, with a retained failing reproduction followed by two passing focused cases. At `10733d1`, retry policy reasons are persisted atomically with settlement and displayed alongside the due time. The affected state/transport/retry suite passed 64 tests; one additional walkthrough/report regression passed, as did renewed TypeScript/Python compilation and lint. No database migration was needed.

At clean `10733d171b7cc96189d305cabbb285d22d8f84a7`, the [latest walkthrough](../evidence/2026-10-15-mock-http/audited/walkthrough.md) passed five scenarios in 8,299 ms and [resume](../evidence/2026-10-15-mock-http/audited/resume.md) passed three in 2,517 ms, both verifying the same two exact supplier orders. These are local durations including injected waits, not performance claims. The [complete latest evidence record](../evidence/2026-10-15-mock-http/audited/README.md) includes the unsuccessful first attempt, focused outputs and cleanup receipts. The original full gates were not repeated after the compute slot was released.

## Source and execution state

- Browser product baseline: `a55564c6f4b0872c8c78c211c8b84fafccf73d64`.
- Branch: `codex/field-relay-mock-http`, in the isolated `.worktrees/mock-http` checkout.
- Scoped recovery review passed at `2d19281`; scoped launcher/lifecycle review passed at `3813cc0`. Final whole-branch disposition belongs to [REVIEW_RECORD.md](REVIEW_RECORD.md).
- Earlier launcher observations below used uncommitted Task 5 source on that base. They are development evidence; the current acceptance observations are separately listed above.
- No push, CI dispatch, deployment, DNS change, live vendor request, private-data processing or paid/model call was performed for this work.
- Browser UI code is unchanged. No new manual visual audit is claimed.

## Evidence observed at this checkpoint

| Scoped check                                                                    | Result and limit                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| State and transport after invalid-404 fix                                       | 53 passed, 0 failed; before the final small request-ID fix                                        |
| Exact-ID fix and invalid-404/429 regressions                                    | 6 passed, 0 failed; requested 1000 ms wait observed at 1014 ms in the valid retry case            |
| Initial launcher, walkthrough, resume and CLI tests                             | 6 passed, 0 failed                                                                                |
| Real relay crash at admission/commit, competing workers and late commit         | 4 passed, 0 failed                                                                                |
| Strengthened late-commit completion proof                                       | 1 passed after a failing assertion; supplier audit confirms one commit and one replay             |
| Rotation, unavailable/mismatched listing, unsafe resume and path/CLI boundaries | 4 passed, 0 failed                                                                                |
| Overlapping cleanup calls                                                       | 1 passed after a failing assertion; both now wait for cleanup                                     |
| SIGINT handler and PowerShell wrapper                                           | 2 passed, 0 failed; handler signal injected programmatically, wrapper run from a path with spaces |

These are separate overlapping focused runs. **Do not add them as a unique test total.** Timings include local faults and are not benchmarks. Earlier fixes do not all retain behavioral test-first evidence; no perfect-TDD claim is made.

The execution ledger and logs remain under ignored `.superpowers/sdd/2026-10-13-mock-http-integration/` until the final review record is preserved. Exercise reports live under `.local/integration/<run-id>/reports/`; their source SHA and dirty flag travel with each result.

## Final disposition

Independent whole-branch review covered `cbb7007..3813cc0`; focused re-review covered the sole resulting repair through `10733d171b7cc96189d305cabbb285d22d8f84a7`. The reviewer closed the finding and identified no arising Critical, Important or Minor issue. The unexplained failed demo was assessed as a non-blocking local reliability/diagnostic limitation, not evidence of an identified source defect. That disposition does not promise repeatability or production readiness. [Review record](REVIEW_RECORD.md).

The branch and isolated checkout are retained for local use. The [original compute release](../evidence/2026-10-15-mock-http/COMPUTE_RELEASE.json) and [supplemental cleanup readback](../evidence/2026-10-15-mock-http/audited/FOCUSED_CLEANUP.json) are saved. The latter found no absolute-checkout process candidates; the saved runs independently verified owned child closure and supplier port refusal. No second heavy verification run, publication or shared-registry edit followed.

## Known limits

The initial clean `10733d1` demo failed before any POST admission, after 6,035 ms. Its report verified zero supplier orders, successful cleanup and successful credential scans. A direct diagnostic dispatch and an unchanged new walkthrough/resume then passed. The generic interruption report did not preserve the initial failure's cause, so it remains unexplained. This is a local reliability and diagnostic limitation, not a fixed defect or proof that every run succeeds. Preserve the [failed report](../evidence/2026-10-15-mock-http/audited/failed-initial.md) when sharing the successful results.

Node 24.11's SQLite API is experimental and its warning remains visible. Python's standard-library HTTP server is for this loopback exercise. Relay schema 3 and supplier schema 2 reject incompatible resume; no migration or recovery promise after deliberate database loss is included.

A read-only audit dated 13 October reported `http-cache-semantics@4.2.0` via Astro with advisory `GHSA-ch52-4w7c-c8xp`. The official advisory then listed no patched version while npm advertised a fix. This is a dated unresolved dependency finding, not a fresh security assessment. No blind `npm audit fix` was applied.

## Decisions carried forward

1. Add a simple interview guide with a clearly fictional friend scenario. It supports explanation, not a claim of real discovery or impact. If the framing misses the user's intention, narrative revision is needed.
2. Represent an unrepresentable Retry-After time as null plus a blocking deferred reason. Never shorten the wait or serialize Infinity. Changing this decision requires policy/test adjustment; no vendor action follows from it.
3. Continue implementation inline after the original worker remained uninitialized, preserving scoped review and final independent review. If the handoff missed context, another bounded review may be needed; scope and guarantees are unchanged.

This project establishes no personal-tenure total. Acting and filmmaking are professional experience, but overall, technical customer-facing, formal PM and domain-specific tenure require separate verified timelines before numerical claims.
