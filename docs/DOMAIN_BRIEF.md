# Field Relay

Field Relay is a browser-local reconciliation desk for comparing a baseline CSV export with a candidate export before a handoff. The comparison workflow works with pasted or locally selected CSV files; its included examples and delivery lab are fictional. It never connects to vendors, retains source files after the tab closes, sends orders, or changes a downstream system.

Those memory-only and no-delivery limits describe the browser product. A separately launched, synthetic-only HTTP exercise now lives in this repository, with local integration and application verification recorded. It uses fictional fixture files, a local mock supplier and on-disk SQLite state. It has no browser data path and no real vendor connection. Its source-specific test evidence, independent review and known limits, including an unexplained failed demo, are in [the release record](integration/RELEASE.md).

## Primary workflow

Load or paste two CSV exports, explicitly map a business ID and fields on each side, then inspect exact results: unchanged records, changed values, records found only on one side, duplicate IDs, and blank IDs. IDs remain text, so `0007` and `7` are distinct. Quoted, multiline CSV cells retain their source row and cells. The comparison is blocked for malformed CSV, duplicate headers, header-only input, width mismatches, missing mappings, or no mapped comparison fields.

Every finding has baseline and candidate row evidence. Reviewers can record a local hold or expected difference on any finding. A candidate-current proposal is available only for a one-to-one changed record with evidence on both sides; duplicate, blank, and missing-side findings never receive an automatic resolution. Editing either input, a mapping, comparison field, or whitespace-normalisation choice clears review decisions in this memory-only tab.

Exports are explicit downloads: a formula-safe CSV findings report and a JSON review pack with complete inputs, mapping, evidence, differences, unresolved findings, and local review decisions. The pack stores one shared exact comparison reference; each decision points to it instead of copying source content. Fingerprints are diagnostic labels only. Files remain in the current tab; save a report before closing.

## Secondary lab

The separate Delivery simulator lab retains the earlier fictional partner-order exercise: parse, map, quarantine, approve, inject an outage, retry, and inspect a replay-safe local ledger. It does not consume reconciliation results or perform delivery.

## Interface direction

The primary desk leads with “Find what changed between two exports.” It keeps actual results, exact source evidence, clear limits, and a restrained paper/ink surface visible from phone to desktop. The simulator stays clearly labelled as a separate local lab.
