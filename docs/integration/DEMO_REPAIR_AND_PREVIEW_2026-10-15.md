# Field Relay interview preview — 15 October 2026

The browser site is published at [Field Relay](https://field-relay-saran.pages.dev/labs/field-relay/), with a [five-minute interview walkthrough](https://field-relay-saran.pages.dev/labs/field-relay/walkthrough/). Implementation `b6ce88951f46270bf94e98e4ef3487fe961a04f1` is pushed to GitHub `main` and the retained implementation branch. The deployed bundle is the successful CI artifact from that exact source. The Python/SQLite experiment remains a locally executed synthetic lab; the website displays recorded evidence.

## Repair and evidence

The historical `10733d1` failure discarded its exception. Its exact cause cannot be reconstructed and its report is preserved unchanged. Investigation reproduced two weaknesses: the launcher started the supplier milestone timeout before its relay child was ready, and an exited child was concealed by a generic timeout. Three diagnostic dispatches passed before the controlled reproductions; they did not establish the historical cause.

All three background demo workers now signal readiness after connection, arguments, database and job validation. Startup has a finite ten-second window; the existing five-second milestone window starts after readiness. The 750 ms HTTP deadline, approval checks, lease duration, retry budgets and recovery deadline are unchanged. Child exit codes and a fixed failure-code allowlist survive into JSON and Markdown. Raw error text, stack traces and credentials are excluded.

Retained failing reproductions cover delayed initialization, a dead worker whose code was hidden, and dropped report diagnostics. A real SQLite write lock proves `relay_state_busy` with no POST admission. Review found two later scenarios still on the old path; both were repaired. A launcher-level regression changes the schema marker only in a new synthetic run after the earlier scenario passes, then checks `relay_state_unavailable`, exit 1, zero affected POSTs, failed overall status, cleanup and credential scans. Its first lock-based harness variant interfered with artifact scanning; that unsuccessful experiment remains in the scratch ledger. The final test avoids a held write transaction during report scans.

A subsequent desktop demo recorded `control_timeout`. That is a separate observed supplier-control deadline failure, not an explanation of the earlier run. The laptop was concurrently serving another project's model evaluation, so the final full gates ran on hosted GitHub runners. No timeout was increased to make that observation pass.

## Verified release

[Successful branch CI](https://github.com/mastodonsharkgirl/field-relay/actions/runs/38632319586) and [successful main CI](https://github.com/mastodonsharkgirl/field-relay/actions/runs/38632979548) both refer to `b6ce889`. The branch CI artifacts are preserved in [the evidence folder](../evidence/2026-10-15-demo-repair/README.md).

| Gate                            | Observed result                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Integration compilation         | TypeScript and Python passed                                                                                                                           |
| Full integration suite          | 101 Node tests and 27 Python tests passed; zero failures/skips/cancellations                                                                           |
| Website `npm run qa`            | Astro: zero errors/warnings; lint/format, 15 unit tests, static build, 21 browser tests passed                                                         |
| Three fresh hosted walkthroughs | Each passed five scenarios with two exact supplier orders; 4,881 / 4,959 / 5,001 ms                                                                    |
| Hosted resume                   | Three reconciliations passed, same two orders; 1,782 ms                                                                                                |
| Independent review              | Sole arising Important finding closed; zero remaining Critical, Important or Minor findings                                                            |
| Build provenance                | Thirteen packaged files matched the CI SHA-256 inventory; three JavaScript bundles contained zero integration runtime markers                          |
| Live asset readback             | Eleven served files matched those same build hashes                                                                                                    |
| Live browser exercise           | Working comparison, row evidence, simulator outage/retry/replay and JSON download verified                                                             |
| Responsive/visual review        | Rendered 320 / 768 / 1440 px; no horizontal overflow; screenshots visually inspected; no page errors or external origins observed in this bounded flow |

All four hosted demo/resume reports show source `b6ce889`, `dirty: false`, verified final readback, successful cleanup and credential scans. Times include injected faults; they are not production performance claims. The walkthrough page deliberately shows an earlier saved `10733d1` report and labels its source; fresh repaired-source results are in the evidence folder. These are distinct observations, not rewritten history or a blanket reliability guarantee.

The first CI run failed on a browser-test lint reference and an older assertion that every checkout path must contain `Saran Websites`; 99/100 Node and 27 Python tests passed there. Only the irrelevant folder-name assumption was removed. Real junction rejection, arbitrary-input refusal and the PowerShell working-directory-with-spaces check remain. The new test uses `document.documentElement.clientWidth` for overflow. The failed run remains at [its original CI URL](https://github.com/mastodonsharkgirl/field-relay/actions/runs/38631252780).

## Hosting and limits

Cloudflare project: `field-relay-saran`. Deployment: `8e9d1bec-b9c3-4437-87ff-b325ceb6cfd2`; [immutable deployment](https://8e9d1bec.field-relay-saran.pages.dev/labs/field-relay/). Its readback identifies `main`, source `b6ce889`, and the production environment of this dedicated preview project. No custom-domain DNS change was made.

The first project-create command in Wrangler 4.151 delegated to Workers and failed without deploying. Installed CLI code and the [official Pages command reference](https://developers.cloudflare.com/workers/wrangler/commands/pages/) were checked before creating the required Pages project directly. The upload used only the verified static bundle. Wrangler warned that local documentation was uncommitted; those files were not in the artifact, whose clean CI source and live hashes are recorded separately.

The portfolio control plane's `domains.yaml` now has a narrow Field Relay interview-release entry. That file already contained uncommitted user work; it was preserved and left uncommitted rather than included in this independent repository's push.

Node's experimental SQLite warning, Python's local mock-server scope and the dated unresolved dependency advisory in [RELEASE.md](RELEASE.md) remain. No live supplier, customer account or Claude call is connected. The site is a public, noindex interview preview; the story is hypothetical and the code was built with AI assistance.
