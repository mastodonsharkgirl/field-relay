# Synthetic local run run-e5777956-8502-46b8-b273-b7f4da59dd02

Overall result: passed. Scenarios passed: 5, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: 4e52364c7ce2e9bb139d141912630ebdceb3f046; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- f051d1d8-add5-4133-8ff7-a41a5cf615cb: sequence 2, revision 1, harness
- be0c3bad-9d70-41be-9f04-daada0d434e6: sequence 10, revision 1, harness
- 769fb9d0-0002-4c9a-b838-953346eb3093: sequence 16, revision 1, harness

| Scenario                                    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ------------------------------------------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| response-loss                               | passed |               1 |               1 | true                        |              1 |              1 |        1088 |
| repeat-dispatch-after-both-process-restarts | passed |               1 |               1 | true                        |              1 |              1 |         345 |
| changed-payload-held                        | passed |               1 |               1 | true                        |              1 |              1 |         175 |
| revoked-during-429-wait                     | passed |               0 |               0 | not applicable / unverified |              1 |              1 |        1410 |
| revoked-after-admission-may-commit          | passed |               1 |               1 | true                        |              1 |              1 |         621 |

Vendor inspection requests: 21. Total local workflow: 5248 ms, including injected delays. Not a production performance benchmark.

## response-loss

Job: f051d1d8-add5-4133-8ff7-a41a5cf615cb. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: 3, 4, 5, 6.

Wire totals for this key: POST 1, GET 2, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                                                           | Comparison | Expected | Observed | Result |
| --------------------------------------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                                                  | equal      | 1        | 1        | passed |
| exact original payload (null when absent)                             | equal      | true     | true     | passed |
| required final relay state                                            | equal      | true     | true     | passed |
| wire POST delta equals admitted delta                                 | equal      | 1        | 1        | passed |
| reserved POST delta                                                   | equal      | 1        | 1        | passed |
| automatic GET delta                                                   | equal      | 1        | 1        | passed |
| operator GET delta                                                    | equal      | 0        | 0        | passed |
| evidence GETs for this key                                            | equal      | 1        | 1        | passed |
| wire GET delta including evidence                                     | equal      | 2        | 2        | passed |
| replay acknowledgment delta                                           | equal      | 0        | 0        | passed |
| lifetime POST reservations                                            | equal      | 1        | 1        | passed |
| lifetime automatic GET reservations                                   | at-most    | 6        | 1        | passed |
| automatic recovery completes within original deadline                 | equal      | true     | true     | passed |
| POST timeout lower bound ms (750 ms minus 150 ms scheduler tolerance) | at-least   | 600      | 765      | passed |
| POST timeout upper bound ms (750 ms plus 150 ms scheduler tolerance)  | at-most    | 900      | 765      | passed |

## repeat-dispatch-after-both-process-restarts

Job: f051d1d8-add5-4133-8ff7-a41a5cf615cb. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: .

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

Job: f051d1d8-add5-4133-8ff7-a41a5cf615cb. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 7.

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

Job: be0c3bad-9d70-41be-9f04-daada0d434e6. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 11, 12, 13, 14, 15.

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

Job: 769fb9d0-0002-4c9a-b838-953346eb3093. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 17, 18, 19, 20, 21, 22.

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
