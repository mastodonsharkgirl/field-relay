# Synthetic local run run-d6cda970-cc12-4e75-81fb-e0562c995ba1

Overall result: passed. Scenarios passed: 5, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: 478a2079ca14be39583de3b684827b6a6e19b570; dirty: false.

Approval source: scripted harness. No real vendor or model called.

| Scenario                                    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ------------------------------------------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| response-loss                               | passed |               1 |               1 | true                        |              1 |              1 |        1035 |
| repeat-dispatch-after-both-process-restarts | passed |               1 |               1 | true                        |              1 |              1 |         332 |
| changed-payload-held                        | passed |               1 |               1 | true                        |              1 |              1 |         168 |
| revoked-during-429-wait                     | passed |               0 |               0 | not applicable / unverified |              1 |              1 |        1269 |
| revoked-after-admission-may-commit          | passed |               1 |               1 | true                        |              1 |              1 |         651 |

Vendor inspection requests: 21. Total local workflow: 4914 ms, including injected delays. Not a production performance benchmark.

## response-loss

Job: 08a73a9f-8f77-49d8-9b23-b66d61a821c7. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: 3, 4, 5, 6.

Wire totals for this key: POST 1, GET 2, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                                                        | Comparison | Expected | Observed | Result |
| ------------------------------------------------------------------ | ---------- | -------- | -------- | ------ |
| verified order count                                               | equal      | 1        | 1        | passed |
| exact original payload (null when absent)                          | equal      | true     | true     | passed |
| required final relay state                                         | equal      | true     | true     | passed |
| wire POST delta equals admitted delta                              | equal      | 1        | 1        | passed |
| reserved POST delta                                                | equal      | 1        | 1        | passed |
| automatic GET delta                                                | equal      | 1        | 1        | passed |
| operator GET delta                                                 | equal      | 0        | 0        | passed |
| evidence GETs for this key                                         | equal      | 1        | 1        | passed |
| wire GET delta including evidence                                  | equal      | 2        | 2        | passed |
| replay acknowledgment delta                                        | equal      | 0        | 0        | passed |
| lifetime POST reservations                                         | equal      | 1        | 1        | passed |
| lifetime automatic GET reservations                                | at-most    | 6        | 1        | passed |
| automatic recovery completes within original deadline              | equal      | true     | true     | passed |
| POST timeout elapsed ms (750 ms limit, 100 ms scheduler tolerance) | at-least   | 650      | 760      | passed |

## repeat-dispatch-after-both-process-restarts

Job: 08a73a9f-8f77-49d8-9b23-b66d61a821c7. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: .

Wire totals for this key: POST 1, GET 3, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                               | Comparison | Expected | Observed | Result |
| ----------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                      | equal      | 1        | 1        | passed |
| exact original payload (null when absent) | equal      | true     | true     | passed |
| required final relay state                | equal      | true     | true     | passed |
| wire POST delta equals admitted delta     | equal      | 0        | 0        | passed |
| reserved POST delta                       | equal      | 0        | 0        | passed |
| automatic GET delta                       | equal      | 0        | 0        | passed |
| operator GET delta                        | equal      | 0        | 0        | passed |
| evidence GETs for this key                | equal      | 1        | 1        | passed |
| wire GET delta including evidence         | equal      | 1        | 1        | passed |
| replay acknowledgment delta               | equal      | 0        | 0        | passed |
| lifetime POST reservations                | equal      | 1        | 1        | passed |
| lifetime automatic GET reservations       | at-most    | 6        | 1        | passed |

## changed-payload-held

Job: 08a73a9f-8f77-49d8-9b23-b66d61a821c7. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 7.

Wire totals for this key: POST 1, GET 4, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                               | Comparison | Expected | Observed | Result |
| ----------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                      | equal      | 1        | 1        | passed |
| exact original payload (null when absent) | equal      | true     | true     | passed |
| required final relay state                | equal      | true     | true     | passed |
| wire POST delta equals admitted delta     | equal      | 0        | 0        | passed |
| reserved POST delta                       | equal      | 0        | 0        | passed |
| automatic GET delta                       | equal      | 0        | 0        | passed |
| operator GET delta                        | equal      | 0        | 0        | passed |
| evidence GETs for this key                | equal      | 1        | 1        | passed |
| wire GET delta including evidence         | equal      | 1        | 1        | passed |
| replay acknowledgment delta               | equal      | 0        | 0        | passed |
| lifetime POST reservations                | equal      | 1        | 1        | passed |
| lifetime automatic GET reservations       | at-most    | 6        | 1        | passed |

## revoked-during-429-wait

Job: 6e48d7ed-7f0a-40fc-9550-9a10ef8ee6e4. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 11, 12, 13, 14, 15.

Wire totals for this key: POST 1, GET 1, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                                           | Comparison | Expected | Observed | Result |
| ----------------------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                                  | equal      | 0        | 0        | passed |
| exact original payload (null when absent)             | equal      | null     | null     | passed |
| required final relay state                            | equal      | true     | true     | passed |
| wire POST delta equals admitted delta                 | equal      | 1        | 1        | passed |
| reserved POST delta                                   | equal      | 1        | 1        | passed |
| automatic GET delta                                   | equal      | 1        | 1        | passed |
| operator GET delta                                    | equal      | 0        | 0        | passed |
| evidence GETs for this key                            | equal      | 0        | 0        | passed |
| wire GET delta including evidence                     | equal      | 1        | 1        | passed |
| replay acknowledgment delta                           | equal      | 0        | 0        | passed |
| lifetime POST reservations                            | equal      | 1        | 1        | passed |
| lifetime automatic GET reservations                   | at-most    | 6        | 1        | passed |
| automatic recovery completes within original deadline | equal      | true     | true     | passed |
| revocation occurs before retry due time               | equal      | true     | true     | passed |
| readback honors Retry-After                           | equal      | true     | true     | passed |

## revoked-after-admission-may-commit

Job: 7f1e9f5a-bcdb-48fa-a5f2-d1072b06e446. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 17, 18, 19, 20, 21, 22.

Wire totals for this key: POST 1, GET 3, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                                           | Comparison | Expected | Observed | Result |
| ----------------------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                                  | equal      | 1        | 1        | passed |
| exact original payload (null when absent)             | equal      | true     | true     | passed |
| required final relay state                            | equal      | true     | true     | passed |
| wire POST delta equals admitted delta                 | equal      | 1        | 1        | passed |
| reserved POST delta                                   | equal      | 1        | 1        | passed |
| automatic GET delta                                   | equal      | 1        | 1        | passed |
| operator GET delta                                    | equal      | 1        | 1        | passed |
| evidence GETs for this key                            | equal      | 1        | 1        | passed |
| wire GET delta including evidence                     | equal      | 3        | 3        | passed |
| replay acknowledgment delta                           | equal      | 0        | 0        | passed |
| lifetime POST reservations                            | equal      | 1        | 1        | passed |
| lifetime automatic GET reservations                   | at-most    | 6        | 1        | passed |
| automatic recovery completes within original deadline | equal      | true     | true     | passed |
| admission sequence precedes revocation                | equal      | true     | true     | passed |
| supplier commit at or after revocation                | equal      | true     | true     | passed |
