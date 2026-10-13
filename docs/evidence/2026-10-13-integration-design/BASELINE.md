# Field Relay integration preparation: verified baseline

Date: 13 October 2026, Asia/Calcutta.

## Scope

Read current Field Relay source and applicable repository instructions, original-direction records, the parent portfolio audit, and the current official role posting. Prepare a local design for a separately scoped synthetic HTTP exercise. No integration runtime has been implemented or tested in this stage.

Repository: `C:/Users/Kanak/Documents/Saran Websites/repos/field-relay`

Branch inspected: `codex/experience-revamp-2026-10-06`

Product source SHA: `a55564c6f4b0872c8c78c211c8b84fafccf73d64`

Initial repository worktree: clean.

## Newly executed checks

| Check                           | Observed outcome                                       |
| ------------------------------- | ------------------------------------------------------ |
| `npm run qa`                    | Exit 0; all configured stages completed                |
| Astro check                     | 15 files; zero errors, warnings or hints               |
| ESLint                          | Exit 0                                                 |
| Prettier                        | All matched baseline files passed                      |
| Vitest                          | 2 files, 15 tests passed; reported duration 283 ms     |
| Astro build                     | Static output, 2 pages built; completed successfully   |
| Playwright                      | 20 tests passed; reported duration 20.5 s              |
| Node runtime                    | v24.11.0                                               |
| npm runtime                     | 11.15.0                                                |
| Node in-memory SQLite API probe | SQLite 3.50.4; succeeded with experimental API warning |
| Python runtime/SQLite probe     | Python 3.14.3; SQLite 3.50.4                           |

Full application command output is retained in [baseline-qa.log](baseline-qa.log), with trailing whitespace normalized for Git. Runtime probes checked only availability using an in-memory database/version query. They do not prove persistent storage, transactions, process recovery or HTTP behavior.

Playwright exercised the existing browser workflows, including widths of 320, 375, 390, 768, 1024 and 1440 where specified by the existing tests. This is automated browser regression evidence. No new UI was implemented and no new manual visual review is claimed.

Non-fatal warnings retained: Vite reported that the base-prefixed Geist font URL was unresolved at build time and left for runtime resolution; Playwright child processes reported NO_COLOR/FORCE_COLOR precedence. No layout or font remediation was undertaken in this design stage.

## Source-qualified observations

The current brief and case study correctly establish CSV comparison as the primary product. The root README and architecture introduction still lead with the older order-delivery exercise. The design schedules a documentation alignment when implementation begins; product behavior was not changed to match old documentation.

Existing source correctly quarantines conflicting variants, binds simulated delivery to a stable business key and payload, and keeps session idempotency beyond a truncated visible ledger. Browser approval and retry state remain in memory. They do not establish persisted authorization, authenticated HTTP, vendor receipt verification or crash recovery.

The control-plane 7 October QA/release record and its test counts were read as historical evidence. The results in the table above come from a new local run, not from that record. The parent audit was read without modification. No sibling repository or shared registry was edited.

## Current external source check

The [official Anthropic Applied AI Architect posting](https://job-boards.greenhouse.io/anthropic/jobs/5443882008), read on this date, lists Bangalore and emphasizes technical discovery, enterprise integration, evaluations, Python, cloud architecture and audience-appropriate communication. It specifies 10+ years in technical customer-facing roles; this exercise cannot change the owner's supported 8+ years overall. No application or referral action was taken.

Version-specific official Node and Python documentation, HTTP RFCs and SQLite transaction documentation are linked in the design. Proposed limits, scenario coverage and architecture are design decisions; they are not measured integration results.
