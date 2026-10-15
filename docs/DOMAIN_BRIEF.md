# Field Relay

Field Relay is a browser-local reconciliation desk for comparing a baseline CSV export with a candidate export before a handoff. The comparison workflow works with pasted or locally selected CSV files; its included examples and delivery lab are fictional. It never connects to vendors, retains source files after the tab closes, sends orders, or changes a downstream system.

Those memory-only and no-delivery limits describe the browser product. A separately launched, synthetic-only HTTP exercise now lives in this repository, with local integration and application verification recorded. It uses fictional fixture files, a local mock supplier and on-disk SQLite state. It has no browser data path and no real vendor connection. Its source-specific test evidence, independent review and known limits, including an unexplained failed demo, are in [the release record](integration/RELEASE.md).

## Primary workflow

Load or paste two CSV exports, explicitly map a business ID and fields on each side, then inspect exact results: unchanged records, changed values, records found only on one side, duplicate IDs, and blank IDs. IDs remain text, so `0007` and `7` are distinct. Quoted, multiline CSV cells retain their source row and cells. The comparison is blocked for malformed CSV, duplicate headers, header-only input, width mismatches, missing mappings, or no mapped comparison fields.

Every finding has baseline and candidate row evidence. Reviewers can record a local hold or expected difference on any finding. A candidate-current proposal is available only for a one-to-one changed record with evidence on both sides; duplicate, blank, and missing-side findings never receive an automatic resolution. Editing either input, a mapping, comparison field, or whitespace-normalisation choice clears review decisions in this memory-only tab.

Exports are explicit downloads: a formula-safe CSV findings report and a JSON review pack with complete inputs, mapping, evidence, differences, unresolved findings, and local review decisions. The pack stores one shared exact comparison reference; each decision points to it instead of copying source content. Fingerprints are diagnostic labels only. Files remain in the current tab; save a report before closing.

## Secondary lab

The separate Delivery simulator lab retains the earlier fictional partner-order exercise: parse, map, quarantine, approve, inject an outage, retry, and inspect a replay-safe local ledger. It does not consume reconciliation results or perform delivery.

## Interface direction — 15 October 2026 redesign

The user requested a substantial redesign informed by their Model Signal prompts and all four Saran skills. The intended audience is a person reviewing an export handoff or walking an interviewer through the prototype. The primary task remains finding a difference, inspecting its source rows, recording a reason, then downloading the evidence.

The direction is an editorial navy-and-ivory workspace with a quiet lavender gradient, an owned relay mark, locally served Geist typography, modest radii, thin dividers and raised button feedback. This supersedes the earlier paper/green/serif presentation. The Model Signal reference supplies hierarchy, depth and craftsmanship; its model rankings, logos, data pipeline and appearance controls are not Field Relay features.

The desk leads with “Find what changed.” Its five summary values derive from the actual comparison. The two document shapes identify the current input names; their decorative lines are not data. Keep the findings area dominant, with a distinct evidence inspector on desktop and the existing focused detail/back flow on phones. Native phone filters and full-width reflow preserve usability at 320px and enlarged text. Source counting details remain available in a labelled disclosure. Keep readable numbers and text rather than forcing all content into a short viewport through tiny labels.

Motion uses finite 240–360ms entrances and 140–180ms control feedback with the same decelerating easing. Data values never count up or animate their order. There are no ambient loops, new graphics dependencies or hidden model calls. Reduced motion disables entrances, transitions and hover/press movement while preserving final states.

The [interview walkthrough](https://field-relay-saran.pages.dev/labs/field-relay/walkthrough/) and case study use the same brand and an editorial numbered reading order. They retain the hypothetical coordinator, AI coding assistance, recorded local experiment and proposed-only Claude extension. The simulator stays explicitly separate and fictional. Backend repair evidence remains in [the earlier release record](integration/DEMO_REPAIR_AND_PREVIEW_2026-10-15.md); it is not proof of this redesign's verification.

## Copy guidance

Use plain, direct language. Say what the person does and what happens next. Prefer comparing files, checking rows and choosing a decision to abstract operations jargon. Preserve the made-up scenario, AI coding help, browser-only file handling and separate server-test limits.
