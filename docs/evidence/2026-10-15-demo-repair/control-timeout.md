# Synthetic local run run-cfc37ce0-625f-41c5-8878-71be33aaff9e

Overall result: failed. Scenarios passed: 0, failed: 1, skipped: 0. Final supplier verification: unavailable; count: unknown.

Source: cfde951254be1e630dfca9bac7254c8e723cc90a; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- 4e9d2c43-ae2c-4202-81b4-6b3aa351de22: sequence 2, revision 1, harness

| Scenario             | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| -------------------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| exercise-interrupted | failed |               0 |      unverified | not applicable / unverified |              1 |              0 |        5482 |

Vendor inspection requests: 26. Total local workflow: 6953 ms, including injected delays. Not a production performance benchmark.

## exercise-interrupted

Failure code: control_timeout. Worker exit: unavailable. A local supplier control request exceeded its transport deadline.

Job: unavailable. Final relay state: unavailable. Relevant audit sequences: .

Wire totals for this key: POST unknown, GET unknown, replay acknowledgments unknown. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement | Comparison | Expected | Observed | Result |
| ----------- | ---------- | -------- | -------- | ------ |

## Persisted retry timeline

Delay is derived from the saved decision time and due time. An ignored schedule is evidence of a proposal, not permission to retry.

| Event | Job                                  | Disposition     | Reason      | Delay ms |  Due epoch ms |
| ----- | ------------------------------------ | --------------- | ----------- | -------: | ------------: |
| 5     | 4e9d2c43-ae2c-4202-81b4-6b3aa351de22 | retry_scheduled | full_jitter |       25 | 1792008886774 |
