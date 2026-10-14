# Synthetic local run run-c319693a-a3a5-4733-9ee7-946ac09408cb

Overall result: failed. Scenarios passed: 0, failed: 1, skipped: 0. Final supplier verification: verified; count: 0.

Source: 10733d171b7cc96189d305cabbb285d22d8f84a7; dirty: false.

Launcher mode: scripted. No real vendor or model called.

Persisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.

- 469fcb08-3e9a-4fb2-8f21-954ef0588123: sequence 2, revision 1, harness

| Scenario             | Result | Expected orders | Verified orders | Exact payload               | Reserved POSTs | Automatic GETs | Scenario ms |
| -------------------- | ------ | --------------: | --------------: | --------------------------- | -------------: | -------------: | ----------: |
| exercise-interrupted | failed |               0 |      unverified | not applicable / unverified |              0 |              0 |        5818 |

Vendor inspection requests: 163. Total local workflow: 6035 ms, including injected delays. Not a production performance benchmark.

## exercise-interrupted

Job: unavailable. Final relay state: unavailable. Relevant audit sequences: .

Wire totals for this key: POST unknown, GET unknown, replay acknowledgments unknown. GET totals include evidence inspections; deltas and their components are checked below.

| Measurement | Comparison | Expected | Observed | Result |
| ----------- | ---------- | -------- | -------- | ------ |

## Persisted retry timeline

Delay is derived from the saved decision time and due time. An ignored schedule is evidence of a proposal, not permission to retry.

| Event | Job | Disposition                | Reason | Delay ms | Due epoch ms |
| ----- | --- | -------------------------- | ------ | -------: | -----------: |
| —     | —   | No retry schedule recorded | —      |        — |            — |
