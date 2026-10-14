# Local mock HTTP contract

Version 1. This is a synthetic loopback protocol. The Python standard-library HTTP server is a local test fixture, not a production service.

## Order identity

| Field         | Accepted value                                                                            |
| ------------- | ----------------------------------------------------------------------------------------- |
| schemaVersion | Integer 1                                                                                 |
| partner       | `northstar` or `orbit`                                                                    |
| orderId       | 1–64 ASCII characters; begins with a letter or digit, then letters, digits, `.`, `_`, `-` |
| region        | North, South, East, West or Central                                                       |
| quantity      | Integer 1–10,000                                                                          |
| amountMinor   | Integer 1–99,999,999,999                                                                  |

No extra or missing fields, booleans in numeric fields, nonfinite values or duplicate JSON keys are accepted. `0007` and `7` are distinct IDs. Amounts are integer minor units: `4250` represents 42.50 in the fictional fixture; no currency or exchange-rate inference occurs.

The business key is the JSON array `[partner, orderId]`. Canonical payload is `[1, partner, orderId, region, quantity, amountMinor]`. The idempotency key is SHA-256 of `["field-relay-mock-v1", partner, orderId]` encoded as compact JSON. The payload digest hashes canonical content. Full canonical equality is checked as well as the digest. Changing the amount under the same business key never creates a legitimate new key.

## HTTP endpoints

| Method and path         | Purpose                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| GET `/v1/health`        | Authenticated service, contract, process and persistent-store identity         |
| POST `/v1/orders`       | Create an exact order, acknowledge identical replay, or reject a conflict      |
| GET `/v1/orders/<key>`  | Retrieve a full saved receipt or a request-correlated 404                      |
| GET `/v1/orders`        | Bounded compact listing; evidence then reads each full receipt                 |
| POST `/__lab/scenarios` | Separate administration credential; configure, observe or release fixed faults |

Ordinary calls require the in-memory session bearer credential. Keyed GET and POST use an ASCII request ID of 1–64 characters. POST also carries the 64-character lowercase hexadecimal idempotency key. The launcher provides a literal loopback port; arbitrary URLs and redirects are refused. Browser Origin requests and hostile Host headers are rejected.

Example body, with no credential:

```json
{
  "schemaVersion": 1,
  "partner": "northstar",
  "orderId": "0007",
  "region": "North",
  "quantity": 3,
  "amountMinor": 4250
}
```

A receipt includes version, full order, business key, idempotency key, digest, vendor order ID, commit time and store ID. Identical POST replay adds `replayed: true`. Delivery is verified only after GET agrees with the exact order, store and any previously claimed receipt identity. A valid 404 has exactly `schemaVersion`, `code: "not_found"`, the matching `requestId`, and the fixed synthetic error message. Invalid evidence stays unknown or held.

## Admission and recovery limits

- Every job starts pending approval. Approval applies to the exact immutable order and current revision for ten minutes. Each approval event records `operator` or `harness` when it occurs; old events without a source remain unlabeled.
- Admission reserves the attempt and request ID atomically. Revocation before admission blocks it. An admitted request may still commit after revocation; no future POST is admitted under the revoked revision.
- Lifetime limits: three POST reservations, six automatic verification GET reservations, a 750 ms total deadline per HTTP exchange, a 5-second relay lease and a 30-second recovery window beginning at first admission. Reapproval and restart never reset them.
- Only timeouts, connection failures and 408/429/502/503/504 are retryable. A valid absent readback is required before another write after uncertainty. Other statuses end automatic writes. A malformed 2xx requires readback and cannot justify blind resend.
- Jitter ranges from zero to `min(2000, 250 * 2^(attempt-1))` ms. Valid Retry-After seconds or HTTP dates can lengthen the wait, including before GET. A wait beyond the recovery window is deferred. Unrepresentable timestamps use a null due time and a blocking deferred reason, never a shortened wait.
- Requests are capped at 16 KiB, responses at 64 KiB and saved supplier orders at 100 per state directory. Delayed mock responses wait outside transactions and are bounded to five seconds.

## Persistence and evidence

The relay and supplier own different SQLite files. Relay schema 3 and supplier schema 2 require explicit compatible state; resume does not replace missing, corrupt or incompatible files. Both use transactions for state changes and related audit events. Operation generations prevent stale reads from authorizing a newer write or erasing a newer wait.

Reports contain safe fixed fields, provenance, source SHA and dirty state, fixture hashes, approval/audit events, scenario results and actual HTTP readback. An unavailable or invalid listing has a null count, not zero. Saved reports are additive. Tests and local timings do not establish customer impact, production capacity or LLM quality.
