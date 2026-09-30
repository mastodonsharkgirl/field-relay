# Architecture

The browser loads a static Astro page and one React workbench island. `src/lib/core.ts` owns all operational rules, so it is usable from tests without a browser. The user chooses either fixture schema, edits the source text, or reads a local CSV file. File contents never leave the browser. The client never calls a delivery API and state is only React memory.

CSV cells are parsed as text, including quoted commas, escaped quotes and CRLF. Values become a typed record only after column, quantity, amount and region validation. A partner plus order ID is the business key. Exact source-row duplicates are suppressed. Any non-identical rows sharing the key are all quarantined, so an arbitrary version cannot reach the destination.

Delivery binds the business key to its payload fingerprint at the first attempt. A session-long in-memory registry retains that binding even when the visible event ledger is capped at 500 entries. An injected outage appends a failed event; a changed retry is held. Evidence JSON contains the run, visible ledger, registry, and applied fingerprint-bound approvals. Quarantine CSV quotes each cell and prefixes spreadsheet-formula characters with an apostrophe.
