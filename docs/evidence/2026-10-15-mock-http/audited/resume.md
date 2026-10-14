# Synthetic local run run-a1d8087d-085d-4604-9218-7449d396ac57

Overall result: passed. Scenarios passed: 3, failed: 0, skipped: 0. Final supplier verification: verified; count: 2.

Source: 10733d171b7cc96189d305cabbb285d22d8f84a7; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- b6fc163a-68aa-4850-a4af-bd8109c4e3a0: sequence 2, revision 1, harness
- 94174cd9-b652-40cd-aefd-bc096e815ba9: sequence 11, revision 1, harness
- e1b7c71f-2074-4c2a-9be0-780485e665d1: sequence 18, revision 1, harness

| Scenario    | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| ----------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| resume-0007 | passed |               1 |               1 | true                        |              1 |              1 |         539 |
| resume-O-9  | passed |               0 |               0 | not applicable / unverified |              1 |              1 |         567 |
| resume-O-10 | passed |               1 |               1 | true                        |              1 |              1 |         631 |

Vendor inspection requests: 12. Total local workflow: 2517 ms, including injected delays. Not a production performance benchmark.

## resume-0007

Job: b6fc163a-68aa-4850-a4af-bd8109c4e3a0. Final relay state: approved / delivered / present / content_conflict. Relevant audit sequences: 25.

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

Job: 94174cd9-b652-40cd-aefd-bc096e815ba9. Final relay state: revoked / retryable / absent / deadline_expired. Relevant audit sequences: 26, 27.

Wire totals for this key: POST 1, GET 2, replay acknowledgments 0. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement                               | Comparison | Expected | Observed | Result |
| ----------------------------------------- | ---------- | -------- | -------- | ------ |
| verified order count                      | equal      | 0        | 0        | passed |
| exact original payload (null when absent) | equal      | null     | null     | passed |
| required final relay state                | equal      | true     | true     | passed |
| wire POST delta equals admitted delta     | equal      | 0        | 0        | passed |
| reserved POST delta                       | at-most    | 0        | 0        | passed |
| automatic GET delta                       | at-most    | 5        | 0        | passed |
| operator GET delta                        | equal      | 1        | 1        | passed |
| evidence GETs for this key                | equal      | 0        | 0        | passed |
| wire GET delta including evidence         | equal      | 1        | 1        | passed |
| replay acknowledgment delta               | equal      | 0        | 0        | passed |
| lifetime POST reservations                | at-most    | 3        | 1        | passed |
| lifetime automatic GET reservations       | at-most    | 6        | 1        | passed |

## resume-O-10

Job: e1b7c71f-2074-4c2a-9be0-780485e665d1. Final relay state: revoked / delivered / present / no hold. Relevant audit sequences: 28.

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
| 5     | b6fc163a-68aa-4850-a4af-bd8109c4e3a0 | retry_scheduled | full_jitter |       77 | 1792006974882 |
| 14    | 94174cd9-b652-40cd-aefd-bc096e815ba9 | retry_scheduled | retry_after |     1000 | 1792006978579 |
