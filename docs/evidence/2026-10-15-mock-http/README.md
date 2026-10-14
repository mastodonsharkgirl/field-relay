# Local verification evidence — 15 October 2026

All orders are fictional. These files record a local prototype, not customer adoption, production performance, cloud deployment or Claude use.

**Latest clean source:** `10733d171b7cc96189d305cabbb285d22d8f84a7`. The [audited evidence record](audited/README.md) preserves an initial failed walkthrough, a successful repeat and a successful resume at that exact source. The failed attempt stopped before any POST reservation; its cause remains unestablished. The repeat passed five scenarios and resume passed three, both verifying two supplier orders. Later focused state/transport/retry checks passed 64 tests, plus one walkthrough/report regression. These do not replace or extend the earlier aggregate totals.

Earlier clean checkpoint: `4e52364c7ce2e9bb139d141912630ebdceb3f046`. The [walkthrough](final/walkthrough.md) and [resume](final/resume.md) include the bounded reporting repairs described below. Both report `dirty: false`, overall passed, and two verified supplier orders. Run ID: `run-e5777956-8502-46b8-b273-b7f4da59dd02`; durations 5,248 ms and 1,734 ms. Actual invocation arguments are recorded. [Three focused checks](final/report-boundary-tests.log), [two approval provenance checks](final/approval-provenance-tests.log), and [compilation](final/integration-check.log) cover those fixes. The original aggregate and QA below remain associated with the earlier source; no later full rerun is implied.

Implementation commit: `478a2079ca14be39583de3b684827b6a6e19b570`. The aggregate/check/QA logs ran on the working tree immediately committed at that SHA. The scripted walkthrough and resume subsequently ran on that clean commit, as their `sourceSha` and `dirty: false` fields show. Later documentation commits do not change that provenance. UTC timestamps fall on 14 October; local Asia/Calcutta date is 15 October.

| Evidence                                                                               | Result                                                                                                                                       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| [Integration summary](integration-summary.json) and [full output](integration.log)     | 90 Node tests; 27 Python tests; zero failures/skips/cancellations; process durations 66.491 s and 24.287 s                                   |
| [Compilation](integration-check.log)                                                   | Integration TypeScript and Python compilation passed                                                                                         |
| [Application QA](application-qa.log)                                                   | Astro checks, lint, formatting, 15 unit tests, static build and 20 browser tests passed; one worker                                          |
| [Walkthrough](walkthrough.md) and [machine-readable report](walkthrough.json)          | Five scenarios passed; two exact supplier orders; 4,914 ms including deliberate waits                                                        |
| [Resume](resume.md) and [machine-readable report](resume.json)                         | Three jobs reconciled; same two supplier orders; 2,074 ms                                                                                    |
| [Walkthrough artifact scan](walkthrough-scan.json) and [resume scan](resume-scan.json) | Actual in-memory credentials absent from bounded owned run files, report contents, child output and arguments; only counts/booleans retained |

Run ID: `run-d6cda970-cc12-4e75-81fb-e0562c995ba1`. Commands:

```powershell
npm run integration:check
npm run integration:test
npm run qa
npm run integration:demo -- --scripted
npm run integration:demo -- --scripted --resume run-d6cda970-cc12-4e75-81fb-e0562c995ba1
```

Runtime: Node 24.11.0, Python 3.14.3, SQLite 3.50.4, Windows. Node's SQLite experimental warning is retained. The original per-run SQLite files stay ignored under `.local/integration/`; no credentials or database files are copied into this folder.

Subsequent scoped review strengthened report-only behavior: the response-loss check now enforces both timeout bounds (750 ms with 150 ms scheduler tolerance), invocation metadata distinguishes real CLI arguments from programmatic calls, and human reports derive approval history from persisted events. The final-readback negative test first proves its baseline can pass. Focused runs passed three checks for timeout/readback/invocation and two checks for saved approval provenance, including mixed operator/harness history across a scripted resume. Type/Python checks and lint passed again. These overlapping focused counts are not added to the earlier aggregate.

The preserved `478a207` reports used an equivalent reconstructed command, and its aggregate summary used a readable test glob instead of the actual expanded argument list. Those strings describe reproduction intent, not exact argv. Current source records validated launcher arguments and the aggregate's explicit executable/argument arrays. The old receipt is preserved without rewriting its historical fields.

A final bounded resume predicate repair permits an already approved, never-sent job to start its recovery clock on first admission. Existing non-null deadlines remain unchanged. The [two focused resume checks](final/first-admission-resume-tests.log) passed after a retained failing reproduction; type/Python checks and lint passed again. This repair follows the clean `4e52364` walkthrough above and does not change its existing-job scenario outcomes. It was not followed by another aggregate/build/browser run.

Browser regressions exercise phone, tablet and desktop sizes, enlarged text, keyboard/focus and downloads. UI source is unchanged from `a55564c6`; automated regression is not a fresh manual visual audit. A marker scan of ten compiled files found no integration environment names, HTTP runtime imports, SQLite runtime name or synthetic HTTP fault marker. This is a bounded build-isolation check, not a security audit.

Scenario elapsed times are separate measurements. Request totals are lifetime counts for each key; the expected-versus-observed tables assert per-scenario deltas and distinguish automatic, operator and report GETs. Repeating dispatch after verified delivery makes no new POST. The separate late-commit test proves a genuine supplier replay.

Review findings, known limits and final local release state are recorded in [RELEASE.md](../../integration/RELEASE.md). Earlier failed and partial experiments remain preserved in the development ledger and historical checkpoint; overlapping focused counts are not added to these totals.
