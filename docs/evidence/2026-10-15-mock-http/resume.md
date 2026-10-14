# Synthetic local run run-d6cda970-cc12-4e75-81fb-e0562c995ba1

Overall result: passed. Scenarios passed: 3, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: 478a2079ca14be39583de3b684827b6a6e19b570; dirty: false.

Approval source: scripted harness. No real vendor or model called.

| Scenario    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ----------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| resume-0007 | passed |               1 |               1 | true                        |              1 |              1 |         417 |
| resume-O-9  | passed |               0 |               0 | not applicable / unverified |              1 |              2 |         398 |
| resume-O-10 | passed |               1 |               1 | true                        |              1 |              1 |         404 |

Vendor inspection requests: 12. Total local workflow: 2074 ms, including injected delays. Not a production performance benchmark.

## resume-0007

Job: 08a73a9f-8f77-49d8-9b23-b66d61a821c7. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 23.

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

Job: 6e48d7ed-7f0a-40fc-9550-9a10ef8ee6e4. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 24, 25, 26.

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

Job: 7f1e9f5a-bcdb-48fa-a5f2-d1072b06e446. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 27.

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
