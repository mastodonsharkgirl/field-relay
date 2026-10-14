# Focused development evidence

These files preserve selected local checks from the launcher development checkpoint on 15 October 2026 (Asia/Calcutta). They are not the final aggregate acceptance record.

Later review found that this checkpoint did not enforce every recorded wire/timing criterion, treated an empty payload comparison as true, and did not scan emitted file bytes. Those limitations were repaired at `478a207`. Preserve this historical record, but use [the later evidence](../2026-10-15-mock-http/README.md) for strict outcome claims.

- `focused-walkthrough.json`: actual HTTP readback from run `run-98e70ed9-8d72-4470-beb2-c6475e66ef19`. Source base `2d19281`, **dirty true**; Node 24.11.0, Python 3.14.3, SQLite 3.50.4. Its five scenario checks passed; final listing verified two orders. Credential comparison against the actual in-memory session values passed before writing the report. All data is fictional.
- `focused-walkthrough.log`: `node --test --test-concurrency=1 --test-name-pattern='walkthrough holds' integration/tests/adversarial.test.ts`, 1 passed, 0 failed. This check ran after the report counters and cleanup changes.
- `process-checks.log`: four selected lifecycle tests covering crash at admission, crash after supplier commit, competing relay workers and late commit. This earlier run predates the strengthened late-commit replay-acknowledgment assertion and later report counters. The stronger focused assertion subsequently passed; do not treat this older log as its proof.
- `entrypoint-checks.log`: the PowerShell wrapper and programmatically triggered SIGINT handler, 2 passed, 0 failed. This does not prove a manual physical-keyboard Ctrl+C interaction.

Read report fields literally. POST reservations are distinct from wire requests. Wire GET counts include report readbacks; the report separately counts 21 inspection HTTP requests across this walkthrough. Repeating an already delivered job after restart produces no extra POST and therefore no new supplier replay acknowledgment. The late-commit test separately exercises an actual supplier replay.

No current full integration, full application, browser regression or security-clean claim is made. See [release checkpoint](../../integration/RELEASE.md). Failed experiments and full working logs remain in the ignored plan workspace until final disposition.
