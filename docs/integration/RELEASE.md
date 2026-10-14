# Local verification record — 15 October 2026

The local integration and application gates pass at implementation commit `478a2079ca14be39583de3b684827b6a6e19b570`. The clean scripted walkthrough and resume both pass. Scoped re-review and final whole-branch review remain pending; this is not a production release.

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

## Source and execution state

- Browser product baseline: `a55564c6f4b0872c8c78c211c8b84fafccf73d64`.
- Branch: `codex/field-relay-mock-http`, in the isolated `.worktrees/mock-http` checkout.
- Last reviewed recovery commit: `2d19281`. Its predecessor fixes invalid 404 bodies; this commit also requires the exact echoed request ID.
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

## Remaining acceptance

1. Complete scoped re-review of the Task 5 reporting and lifecycle fixes.
2. Complete independent whole-branch review and record its disposition.
3. Commit the documentation/evidence handoff and save the explicit compute release receipt after owned processes have ended.

## Known limits

Node 24.11's SQLite API is experimental and its warning remains visible. Python's standard-library HTTP server is for this loopback exercise. Relay schema 3 and supplier schema 2 reject incompatible resume; no migration or recovery promise after deliberate database loss is included.

A read-only audit dated 13 October reported `http-cache-semantics@4.2.0` via Astro with advisory `GHSA-ch52-4w7c-c8xp`. The official advisory then listed no patched version while npm advertised a fix. This is a dated unresolved dependency finding, not a fresh security assessment. No blind `npm audit fix` was applied.

## Decisions carried forward

1. Add a simple interview guide with a clearly fictional friend scenario. It supports explanation, not a claim of real discovery or impact. If the framing misses the user's intention, narrative revision is needed.
2. Represent an unrepresentable Retry-After time as null plus a blocking deferred reason. Never shorten the wait or serialize Infinity. Changing this decision requires policy/test adjustment; no vendor action follows from it.
3. Continue implementation inline after the original worker remained uninitialized, preserving scoped review and final independent review. If the handoff missed context, another bounded review may be needed; scope and guarantees are unchanged.

This project establishes no personal-tenure total. Acting and filmmaking are professional experience, but overall, technical customer-facing, formal PM and domain-specific tenure require separate verified timelines before numerical claims.
