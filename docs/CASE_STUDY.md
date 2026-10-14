# Case study: two exports, one inspectable review

Field Relay is a browser-local desk for a narrow operational question: what changed between two CSV exports before someone acts on a handoff? An analyst can paste exports or choose local CSV files, map their own business ID and comparison fields, inspect every discrepancy, and explicitly download a review pack. The comparison workflow is usable with those local files; the included examples and separate delivery lab are fictional. No connected system is updated.

## What it compares

The desk calls the inputs **Baseline** and **Candidate**. Neither is assumed to be correct. It compares literal IDs and selected field values exactly, preserving leading zeroes, quoted values, and multiline cells. Optional outer-whitespace trimming is visible and review-bound; it never converts dates, amounts, or identifiers.

A result remains useful because it carries original row numbers and cells on both sides. Missing records, candidate-only records, changed fields, duplicate IDs, and blank IDs are separate findings. Duplicate and blank IDs are ambiguous by design: the desk never selects a winner or offers a proposed replacement for them.

## Review and handoff

A reviewer may record a hold, a proposal to treat Candidate as current, or an expected difference for a one-to-one finding, with a reason. Any edit to either source, mapping, compared field set, or normalisation choice clears those memory-only decisions. The JSON review pack includes source content once in a shared exact comparison reference, then maps each review to that reference alongside its mappings, findings, original rows, unresolved work, and notes. Diagnostic fingerprints are labels, not integrity proof. The CSV report applies spreadsheet-formula protection to every exported user-controlled cell.

## Separate delivery lab

The original delivery simulation remains available as a separate fictional lab. It demonstrates parser validation, conflict quarantine, local approval, outage retry, and replay-safe event history. It does not read reconciliation output and does not send anything.

## Local integration experiment

A separate Node/Python HTTP lab explores what happens when a supplier saves an order but the reply is lost. It keeps the approved fields and order identity fixed, records attempts on disk, and checks the mock supplier's actual saved result. Focused local tests cover response loss, process crashes, competing workers, changed payloads and revocation timing. Whole-system acceptance is still pending; see the dated [release checkpoint](integration/RELEASE.md).

This is an AI-assisted learning prototype using fictional fixtures. The friend-at-a-supply-chain-company scenario in the [interview guide](integration/INTERVIEW_GUIDE.md) is hypothetical. No customer discovery, adoption, commercial result, Claude integration or enterprise deployment is claimed.
