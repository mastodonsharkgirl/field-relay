# Synthetic local run run-a1d8087d-085d-4604-9218-7449d396ac57

Overall result: passed. Scenarios passed: 5, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: 10733d171b7cc96189d305cabbb285d22d8f84a7; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- b6fc163a-68aa-4850-a4af-bd8109c4e3a0: sequence 2, revision 1, harness
- 94174cd9-b652-40cd-aefd-bc096e815ba9: sequence 11, revision 1, harness
- e1b7c71f-2074-4c2a-9be0-780485e665d1: sequence 18, revision 1, harness

| Scenario                                    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ------------------------------------------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| response-loss                               | passed |               1 |               1 | true                        |              1 |              1 |        1120 |
| repeat-dispatch-after-both-process-restarts | passed |               1 |               1 | true                        |              1 |              1 |         409 |
| changed-payload-held                        | passed |               1 |               1 | true                        |              1 |              1 |         231 |
| revoked-during-429-wait                     | passed |               0 |               0 | not applicable / unverified |              1 |              1 |        1632 |
| revoked-after-admission-may-commit          | passed |               1 |               1 | true                        |              1 |              1 |         990 |

Vendor inspection requests: 22. Total local workflow: 8299 ms, including injected delays. Not a production performance benchmark.

## response-loss

Job: b6fc163a-68aa-4850-a4af-bd8109c4e3a0. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: 3, 4, 5, 6, 7.

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
| POST timeout lower bound ms (750 ms minus 150 ms scheduler tolerance) | at-least   | 600      | 774      | passed |
| POST timeout upper bound ms (750 ms plus 150 ms scheduler tolerance)  | at-most    | 900      | 774      | passed |

## repeat-dispatch-after-both-process-restarts

Job: b6fc163a-68aa-4850-a4af-bd8109c4e3a0. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: .

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

Job: b6fc163a-68aa-4850-a4af-bd8109c4e3a0. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 8.

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

Job: 94174cd9-b652-40cd-aefd-bc096e815ba9. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 12, 13, 14, 15, 16, 17.

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

Job: e1b7c71f-2074-4c2a-9be0-780485e665d1. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 19, 20, 21, 22, 23, 24.

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

## Persisted retry timeline

Delay is derived from the saved decision time and due time. An ignored schedule is evidence of a proposal, not permission to retry.

| Event | Job                                  | Disposition     | Reason      | Delay ms |  Due epoch ms |
| ----- | ------------------------------------ | --------------- | ----------- | -------: | ------------: |
| 5     | b6fc163a-68aa-4850-a4af-bd8109c4e3a0 | retry_scheduled | full_jitter |       77 | 1792006974882 |
| 14    | 94174cd9-b652-40cd-aefd-bc096e815ba9 | retry_scheduled | retry_after |     1000 | 1792006978579 |
