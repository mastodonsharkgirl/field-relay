# Synthetic local run run-1dbe1bf9-f734-444c-ab35-869ea2541dad

Overall result: passed. Scenarios passed: 3, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: b6ce88951f46270bf94e98e4ef3487fe961a04f1; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- 4555d3bb-f199-45b8-ac27-e3a37c19b799: sequence 2, revision 1, harness
- 2235060f-de7e-435a-b6b5-4de6a70a2092: sequence 11, revision 1, harness
- f1bcaf50-74fe-4c83-9ae6-3b89bfb1819a: sequence 18, revision 1, harness

| Scenario    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ----------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| resume-0007 | passed |               1 |               1 | true                        |              1 |              1 |         476 |
| resume-O-9  | passed |               0 |               0 | not applicable / unverified |              1 |              2 |         452 |
| resume-O-10 | passed |               1 |               1 | true                        |              1 |              1 |         406 |

Vendor inspection requests: 12. Total local workflow: 1782 ms, including injected delays. Not a production performance benchmark.

## resume-0007

Job: 4555d3bb-f199-45b8-ac27-e3a37c19b799. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 25.

Wire totals for this key: POST 1, GET 9, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                               | Comparison | Expected | Observed | Result |
| ----------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                      | equal      | 1        | 1        | passed |
| exact original payload (null when absent) | equal      | true     | true     | passed |
| required final relay state                | equal      | true     | true     | passed |
| wire POST delta equals admitted delta     | equal      | 0        | 0        | passed |
| reserved POST delta                       | at-most    | 0        | 0        | passed |
| automatic GET delta                       | at-most    | 5        | 0        | passed |
| operator GET delta                        | equal      | 1        | 1        | passed |
| evidence GETs for this key                | equal      | 1        | 1        | passed |
| wire GET delta including evidence         | equal      | 2        | 2        | passed |
| replay acknowledgment delta               | equal      | 0        | 0        | passed |
| lifetime POST reservations                | at-most    | 3        | 1        | passed |
| lifetime automatic GET reservations       | at-most    | 6        | 1        | passed |

## resume-O-9

Job: 2235060f-de7e-435a-b6b5-4de6a70a2092. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 26, 27, 28.

Wire totals for this key: POST 1, GET 3, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                                           | Comparison | Expected | Observed | Result |
| ----------------------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                                  | equal      | 0        | 0        | passed |
| exact original payload (null when absent)             | equal      | null     | null     | passed |
| required final relay state                            | equal      | true     | true     | passed |
| wire POST delta equals admitted delta                 | equal      | 0        | 0        | passed |
| reserved POST delta                                   | at-most    | 0        | 0        | passed |
| automatic GET delta                                   | at-most    | 5        | 1        | passed |
| operator GET delta                                    | equal      | 1        | 1        | passed |
| evidence GETs for this key                            | equal      | 0        | 0        | passed |
| wire GET delta including evidence                     | equal      | 2        | 2        | passed |
| replay acknowledgment delta                           | equal      | 0        | 0        | passed |
| lifetime POST reservations                            | at-most    | 3        | 1        | passed |
| lifetime automatic GET reservations                   | at-most    | 6        | 2        | passed |
| automatic recovery completes within original deadline | equal      | true     | true     | passed |

## resume-O-10

Job: f1bcaf50-74fe-4c83-9ae6-3b89bfb1819a. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 29.

Wire totals for this key: POST 1, GET 8, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                               | Comparison | Expected | Observed | Result |
| ----------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                      | equal      | 1        | 1        | passed |
| exact original payload (null when absent) | equal      | true     | true     | passed |
| required final relay state                | equal      | true     | true     | passed |
| wire POST delta equals admitted delta     | equal      | 0        | 0        | passed |
| reserved POST delta                       | at-most    | 0        | 0        | passed |
| automatic GET delta                       | at-most    | 5        | 0        | passed |
| operator GET delta                        | equal      | 1        | 1        | passed |
| evidence GETs for this key                | equal      | 1        | 1        | passed |
| wire GET delta including evidence         | equal      | 2        | 2        | passed |
| replay acknowledgment delta               | equal      | 0        | 0        | passed |
| lifetime POST reservations                | at-most    | 3        | 1        | passed |
| lifetime automatic GET reservations       | at-most    | 6        | 1        | passed |

## Persisted retry timeline

Delay is derived from the saved decision time and due time. An ignored schedule is evidence of a proposal, not permission to retry.

| Event | Job                                  | Disposition     | Reason      | Delay ms |  Due epoch ms |
| ----- | ------------------------------------ | --------------- | ----------- | -------: | ------------: |
| 5     | 4555d3bb-f199-45b8-ac27-e3a37c19b799 | retry_scheduled | full_jitter |      161 | 1792009870295 |
| 14    | 2235060f-de7e-435a-b6b5-4de6a70a2092 | retry_scheduled | retry_after |     1000 | 1792009872438 |
