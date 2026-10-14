# Field Relay

Field Relay helps someone answer: **what changed between these two CSV exports?** Its main product is a browser-local reconciliation desk, served below `/labs/field-relay/`. It shows original rows behind changed, missing, duplicate and blank-ID findings, with explicit local review decisions and downloadable reports.

The repository also contains two separate fictional learning exercises: the existing browser delivery simulator and an opt-in local HTTP lab. Browser files and approvals never enter the HTTP lab. No real supplier, customer account or model is connected.

Published interview preview: [open Field Relay](https://field-relay-saran.pages.dev/labs/field-relay/) or [start the five-minute walkthrough](https://field-relay-saran.pages.dev/labs/field-relay/walkthrough/). Repaired source `b6ce889` is pushed to `main`, both branch/main CI passed, and the tested static bundle is deployed. [Latest release and evidence](docs/integration/DEMO_REPAIR_AND_PREVIEW_2026-10-15.md). The older local checkpoint below remains historical.

## Run

`npm ci`, then `npm run dev`. Use `npm test` for deterministic fixture tests and `npm run qa` for type checks, linting, formatting, unit tests, build and Playwright checks. Install the browser once with `npx playwright install chromium` before running browser checks.

## Local HTTP exercise

Local verification, 15 October 2026: integration aggregation, application QA and clean scripted walkthrough/resume have passed at the source commits recorded in the [release record](docs/integration/RELEASE.md). Independent final review is complete with no remaining findings. One unexplained demo stop before admission is preserved alongside its successful repeat. This is a synthetic local prototype, not a production release.

Prerequisites: installed repository dependencies, Node 24.11 or compatible Node 25, and Python 3.14 available through the Windows `py` launcher. The tested Node 24.11 SQLite API emits an experimental warning. The lab starts a hidden Python mock supplier on an OS-assigned `127.0.0.1` port and separate Node relay processes.

```powershell
# Show each exact synthetic order and ask for local approval
npm run integration:demo

# Repeat the fixed exercise with explicitly labelled harness approvals
npm run integration:demo -- --scripted

# Reopen the printed run ID with fresh session credentials
npm run integration:demo -- --scripted --resume RUN_ID

# Integration verification commands
npm run integration:check
npm run integration:test
```

Every run keeps its SQLite files and reports in `.local/integration/<run-id>/`. Normal exit and the interruption handler stop owned children while preserving evidence. New runs never overwrite old ones. Use the [walkthrough](docs/integration/WALKTHROUGH.md), [contract](docs/integration/CONTRACT.md) and [interview guide](docs/integration/INTERVIEW_GUIDE.md) to inspect the behavior. The [executive brief](docs/integration/EXECUTIVE_BRIEF.md) explains the business risk.

## Browser simulator boundaries and limits

CSV input is limited to 500 KB and 5,000 rows. Supported valid regions are North, South, East, West and Central. Quantity is digits-only 1–10,000. Amounts must be positive decimal values up to 999,999,999.99 and are converted to integer minor units. The visible ledger keeps its newest 500 events; the local-only session registry retains idempotency bindings until reset. Northstar has 9 data rows: 2 standard ready records, 1 exact duplicate, 2 conflicting rows, 1 invalid quantity, 1 unknown region, and 2 manual-review records (Central and 500.00). Orbit has two standard ready records.

The limits and fixture counts above belong to the existing browser simulator. The HTTP lab has its own small synthetic fixtures, durable databases and bounded transport contract. See [architecture](docs/ARCHITECTURE.md) and the [case study](docs/CASE_STUDY.md).
