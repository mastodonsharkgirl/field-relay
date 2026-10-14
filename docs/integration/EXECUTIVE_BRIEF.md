# Why this experiment exists

A timeout leaves an operations team with two possible realities: the supplier did nothing, or it saved the order and the reply was lost. Blind retries risk duplicate work. Treating every timeout as failure can hide work already accepted.

Field Relay's separate local HTTP experiment makes that uncertainty visible. It records the exact approved order, preserves one order identity through retries, and checks what the mock supplier actually saved. Changed content, missing evidence and exhausted recovery budgets remain cases for investigation.

The main browser product answers a related earlier question: what changed between two exports? The browser and HTTP experiment are separate workflows. No browser upload is transmitted to the mock supplier.

| Decision                                  | Reason                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Approve exact fields and revision         | A later edit must not inherit permission for different content.           |
| Reuse one stable order identity           | Repeating a request should not create a new intended order.               |
| Verify supplier readback                  | A relay log or successful response can be incomplete or wrong.            |
| Limit recovery attempts                   | A failure should become an explicit exception instead of an endless loop. |
| Separate revocation from observed outcome | Stopping future sends cannot undo an already admitted request.            |

This is an AI-assisted local prototype with fictional fixtures and injected failures. Focused checks have demonstrated specific local outcomes; final whole-system acceptance remains pending. No customer has adopted it, no savings are measured, and no Claude or cloud integration is deployed.

Before a real pilot, confirm the supplier's duplicate-key retention and readback semantics, approval ownership, correction/cancellation process and exception owner. Then add production identity, secret management, HTTPS, hosting, durable queueing, tenant isolation, backups, monitoring and vendor-specific failure tests. Agree acceptance criteria with the customer instead of borrowing the lab's limits as production requirements.
