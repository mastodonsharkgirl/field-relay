# Synthetic local run run-1dbe1bf9-f734-444c-ab35-869ea2541dad

Overall result: passed. Scenarios passed: 5, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: b6ce88951f46270bf94e98e4ef3487fe961a04f1; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- 4555d3bb-f199-45b8-ac27-e3a37c19b799: sequence 2, revision 1, harness
- 2235060f-de7e-435a-b6b5-4de6a70a2092: sequence 11, revision 1, harness
- f1bcaf50-74fe-4c83-9ae6-3b89bfb1819a: sequence 18, revision 1, harness

| Scenario                                    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ------------------------------------------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| response-loss                               | passed |               1 |               1 | true                        |              1 |              1 |        1167 |
| repeat-dispatch-after-both-process-restarts | passed |               1 |               1 | true                        |              1 |              1 |         331 |
| changed-payload-held                        | passed |               1 |               1 | true                        |              1 |              1 |         202 |
| revoked-during-429-wait                     | passed |               0 |               0 | not applicable / unverified |              1 |              1 |        1297 |
| revoked-after-admission-may-commit          | passed |               1 |               1 | true                        |              1 |              1 |         671 |

Vendor inspection requests: 17. Total local workflow: 5001 ms, including injected delays. Not a production performance benchmark.

## response-loss

Job: 4555d3bb-f199-45b8-ac27-e3a37c19b799. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: 3, 4, 5, 6, 7.

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
| POST timeout lower bound ms (750 ms minus 150 ms scheduler tolerance) | at-least   | 600      | 763      | passed |
| POST timeout upper bound ms (750 ms plus 150 ms scheduler tolerance)  | at-most    | 900      | 763      | passed |

## repeat-dispatch-after-both-process-restarts

Job: 4555d3bb-f199-45b8-ac27-e3a37c19b799. Final relay state: approved / delivered / present / no hold. Relevant audit sequences: .

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

Job: 4555d3bb-f199-45b8-ac27-e3a37c19b799. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 8.

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

Job: 2235060f-de7e-435a-b6b5-4de6a70a2092. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 12, 13, 14, 15, 16, 17.

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

Job: f1bcaf50-74fe-4c83-9ae6-3b89bfb1819a. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 19, 20, 21, 22, 23, 24.

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
| 5     | 4555d3bb-f199-45b8-ac27-e3a37c19b799 | retry_scheduled | full_jitter |      161 | 1792009870295 |
| 14    | 2235060f-de7e-435a-b6b5-4de6a70a2092 | retry_scheduled | retry_after |     1000 | 1792009872438 |
