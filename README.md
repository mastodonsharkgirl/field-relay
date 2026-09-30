# Field Relay

A static, local-only demonstration of partner-order CSV intake and safe simulated delivery. It is served below `/labs/field-relay/` by default and contains no API, storage, account, vendor or real order connection.

## Run

`npm ci`, then `npm run dev`. Use `npm test` for deterministic fixture tests and `npm run qa` for type checks, linting, formatting, unit tests, build and Playwright checks. Install the browser once with `npx playwright install chromium` before running browser checks.

## Boundaries and limits

CSV input is limited to 500 KB and 5,000 rows. Supported valid regions are North, South, East, West and Central. Quantity is digits-only 1–10,000. Amounts must be positive decimal values up to 999,999,999.99 and are converted to integer minor units. The visible ledger keeps its newest 500 events; the local-only session registry retains idempotency bindings until reset. Northstar has 9 data rows: 2 standard ready records, 1 exact duplicate, 2 conflicting rows, 1 invalid quantity, 1 unknown region, and 2 manual-review records (Central and 500.00). Orbit has two standard ready records.

See [architecture](docs/ARCHITECTURE.md) and the [case study](docs/CASE_STUDY.md).
