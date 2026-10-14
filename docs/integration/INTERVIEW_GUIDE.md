# Explain Field Relay in an interview

This guide describes an AI-assisted portfolio prototype. The supply-chain story below is fictional. It is a way to explain the problem, not a claim about a real friend, employer, customer interview or deployment. The HTTP lab is still undergoing launcher and whole-system acceptance work; use the release record for current verification status.

## Start with the problem

Imagine a friend who coordinates orders at a small supply-chain company. Every morning, they compare a supplier's export with their team's sheet. An order quantity has changed, one order is missing, and another ID appears twice. They need to understand those differences before handing work to the next person.

Now imagine the next step: sending an approved order to a supplier system. The screen says the request timed out. Did the supplier reject the order, or save it and lose the reply? Sending again with a new identity could create a duplicate. Doing nothing could leave a real order untracked.

Field Relay explores these two problems in separate local workflows:

- The **browser reconciliation desk** compares two CSV exports and shows the exact rows behind each difference. It works in the current browser tab.
- The **synthetic HTTP lab** uses fictional fixture orders, a relay and a separate mock supplier service. It tests approval, uncertain delivery and recovery across process restarts. Browser uploads and browser approvals never enter this lab.

They share a business context. They are not a connected live order-management product.

## A 60-second answer

“I built Field Relay with AI coding assistance to understand a practical operations problem: how do you know what changed, and what do you do when an order request times out?

“The browser part compares two CSV exports and shows the source rows behind each difference. The separate local integration lab asks a harder question: what if the supplier saved an order but the reply never arrived?

“The lab records the exact approved order, keeps the same identity across retries, and asks the supplier what it actually saved. It has a small retry budget, preserves its state through restarts, and holds cases where the evidence does not agree. I deliberately inject failures to test these decisions.

“It is a synthetic local prototype. There is no live customer integration or Claude call. Its value for me is learning to turn a business risk into explicit contracts, controls and checks I can explain.”

## Expand to three minutes

1. **Problem and user:** use the hypothetical coordinator above. Explain the cost of uncertainty as a risk, without inventing revenue loss or time savings.
2. **Workflow:** compare exports, inspect source evidence, and review differences. Then introduce the separate delivery experiment using fictional orders.
3. **Decision boundary:** approval applies to one exact version of an order. Changing the amount under the same order ID creates a conflict; it does not quietly become a new approved order.
4. **Failure:** a timeout is uncertainty. The supplier can have saved the order even though the relay received no confirmation. The relay reads the supplier's saved record before deciding whether another write is justified.
5. **Tradeoff:** bounded retries can leave unresolved work. That is deliberate: an operator should investigate rather than let a program retry indefinitely.
6. **Evidence and limits:** show an actual saved run report when available. Explain the tested local boundaries, AI assistance and production gaps. Do not describe planned scenarios as passed.

## Terms in everyday language

| Term            | Meaning here                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| API             | The agreed way one program asks another to do something.                                                                              |
| Contract        | The exact fields, types and outcomes both sides accept.                                                                               |
| Idempotency key | A stable order reference that lets the supplier recognize a repeat.                                                                   |
| Readback        | Asking the supplier what is actually stored.                                                                                          |
| Durable state   | Saving decisions and attempts on disk so restarting does not erase them.                                                              |
| Admission       | The moment the relay reserves permission for a specific send attempt.                                                                 |
| Audit trail     | A record of approvals, reservations and outcomes that can be checked later.                                                           |
| Evaluation      | Measuring behavior against defined criteria. This project currently uses deterministic software tests, not model-quality evaluations. |

## Questions an interviewer might ask

**Why not just retry?** A request can succeed at the supplier and still time out at the client. A retry needs a stable identity and a supplier contract that recognizes it. The lab also checks the saved result before another write.

**Does this guarantee exactly-once delivery?** No. The mock supplier enforces at most one saved order per business key within its persistent store. That is a narrow, testable guarantee. It does not prove that a real supplier's fulfilment side effects happen exactly once, or that deleting both databases is safe.

**Why is a successful response insufficient?** The lab treats the response as a claim. It reads back the saved order and checks the full payload and receipt identity. A mismatch stays unresolved instead of being reported as success.

**Can a user cancel after clicking send?** Revocation before admission blocks the attempt. Once an attempt is admitted, it may already be on its way. Revocation blocks future attempts; it cannot promise to undo the supplier's work. Real cancellation would need a vendor-supported operation or compensation process.

**Why Python and TypeScript?** Separate processes force the exercise to cross a real HTTP boundary. TypeScript handles the relay and reuses the existing intake rules. Python provides a small independent mock supplier. The design is a learning choice, not evidence that two languages are required for production.

**Why SQLite?** It provides local transactions and persistent state without installing a database service. It makes process-restart and atomic-update tests practical. This is not a demonstrated distributed queue, cloud database or high-availability design.

**What did you personally do?** Describe only what you can defend: the problem framing, decisions you reviewed, tests you observed, and explanations you now understand. State that AI helped generate and review code. Do not claim to have independently written every line or operated this in production.

**What would you ask a real customer first?** Who owns the order ID? How long does the supplier remember duplicate keys? Is readback authoritative? Which errors can be retried? Who approves changes and handles unresolved cases? What happens if cancellation arrives after dispatch? Which data fields are actually necessary?

## How this relates to Anthropic work

The Applied AI Architect posting emphasizes customer discovery, integration design, customer evaluations, Python, cloud architecture and communication with technical and executive audiences. Field Relay offers a small artifact for discussing several of those themes. It does not establish the role's required tenure or production experience. [Anthropic role posting, checked 14 October 2026](https://job-boards.greenhouse.io/anthropic/jobs/5443882008).

| Relevant skill                     | Concrete discussion point                                                                    | Limit to state                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Business discovery                 | Translate duplicate-order and uncertain-status risks into questions and acceptance criteria. | The scenario is hypothetical; no customer discovery has occurred.                  |
| Integration design                 | Exact contracts, stable identities, verified readback and bounded retries.                   | Local synthetic HTTP, no enterprise integration.                                   |
| Python and technical collaboration | Explain how the separate supplier process stores and returns orders.                         | AI-assisted implementation; demonstrate understanding before claiming proficiency. |
| Evaluation thinking                | Test explicit failure cases and inspect actual outcomes.                                     | Deterministic tests are not LLM evaluations.                                       |
| Human control                      | Bind approval to exact fields and distinguish revocation before and after admission.         | Local operator labels are not enterprise identity or RBAC.                         |
| Communication                      | Explain the same failure with a business story, a request trace and a technical contract.    | No invented adoption, customer impact or executive presentation history.           |
| Cloud architecture                 | Discuss what would change for queueing, identity, secrets, monitoring and recovery.          | Proposed architecture only; this lab is not cloud-deployed.                        |

## Where Claude could fit later

A useful proposed extension would turn a messy supplier message into a typed order proposal or an explanation of an export discrepancy. Application code would validate the proposal, a human would approve exact fields, and the deterministic relay would handle delivery and verified status. Treat this as a design exercise: no Claude API call exists in the current project.

Claude's custom client tools let a model request an operation that the application executes and reports back. This makes the application a useful place to enforce the approval boundary. The architecture above is our proposal, not an Anthropic endorsement. [Claude tool-use documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview).

Structured outputs can constrain the shape of a proposal. They do not establish that the content is true or authorized. The application would still check business values and handle refusal or incomplete output. [Structured outputs documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Before using that extension, create held-out fictional messages with known answers: clean orders, missing amounts, ambiguous quantities, changed orders, duplicate IDs and malicious instructions embedded in source text. Measure field accuracy, appropriate abstention, unauthorized-action prevention and whether status explanations match verified evidence. Also measure latency and cost. Set thresholds with a baseline and business owner; do not invent achieved scores. [Anthropic's evaluation guidance](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests).

## Teach it back before the interview

- Explain a timeout-after-save using your own words and a drawing of two programs.
- Find one order's exact approved fields and its vendor readback in a saved report.
- Explain why an identical replay and a changed amount have different outcomes.
- Show where approval ends and a send attempt begins.
- Explain why a revoked order can still be present at the supplier.
- Identify one failed or unresolved result without hiding it.
- Separate what you framed, what AI generated, what tests demonstrated and what remains unbuilt.

If you cannot explain a component yet, say you are learning it. A precise explanation of a small system is more defensible than a broad claim of enterprise expertise.
