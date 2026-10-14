# Synthetic local run run-e5777956-8502-46b8-b273-b7f4da59dd02

Overall result: passed. Scenarios passed: 3, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: 4e52364c7ce2e9bb139d141912630ebdceb3f046; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- f051d1d8-add5-4133-8ff7-a41a5cf615cb: sequence 2, revision 1, harness
- be0c3bad-9d70-41be-9f04-daada0d434e6: sequence 10, revision 1, harness
- 769fb9d0-0002-4c9a-b838-953346eb3093: sequence 16, revision 1, harness

| Scenario    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ----------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| resume-0007 | passed |               1 |               1 | true                        |              1 |              1 |         394 |
| resume-O-9  | passed |               0 |               0 | not applicable / unverified |              1 |              2 |         426 |
| resume-O-10 | passed |               1 |               1 | true                        |              1 |              1 |         371 |

Vendor inspection requests: 12. Total local workflow: 1734 ms, including injected delays. Not a production performance benchmark.

## resume-0007

Job: f051d1d8-add5-4133-8ff7-a41a5cf615cb. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 23.

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

Job: be0c3bad-9d70-41be-9f04-daada0d434e6. Final relay state: revoked / retryable / absent / no hold. Relevant audit sequences: 24, 25, 26.

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

Job: 769fb9d0-0002-4c9a-b838-953346eb3093. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 27.

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
