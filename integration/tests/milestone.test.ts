import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import {
  startRuntime,
  ownedProcess,
  buildChildEnv,
  projectRoot,
  waitUntil,
  controlRequest,
} from '../runtime.ts';
import { openRelayStore } from '../relay/state.ts';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildEvidence, renderEvidence, type RunEvidence } from '../relay/evidence.ts';

// Catches a startup delay being charged against the supplier-commit timeout.
test('a slow starting relay gets its full milestone window after readiness', async () => {
  const lab = await startRuntime({ mode: 'new' });
  let worker;
  try {
    const fixture = await lab.command(['fixture', 'northstar']);
    assert.equal(fixture.code, 0);
    const [job] = JSON.parse(fixture.stdout);
    assert.equal((await lab.command(['approve', job.jobId, '0', 'harness'])).code, 0);
    const env = buildChildEnv('relay', lab.connection.token, '');
    Object.assign(env, {
      FIELD_RELAY_RUN_ID: lab.runId,
      FIELD_RELAY_VENDOR_PORT: String(lab.connection.port),
      FIELD_RELAY_VENDOR_STORE_ID: lab.connection.storeId,
    });
    worker = ownedProcess(
      process.execPath,
      [join(projectRoot, 'integration/tests/helpers/delayed-cli.ts'), 'slow', job.jobId],
      env,
      true,
    );
    // The third argument describes the actual child, not a fake HTTP response.
    await Reflect.apply(waitUntil, undefined, [
      async () => (await controlRequest(lab.connection, '/v1/orders')).body.count === 1,
      1_000,
      worker,
    ]);
    assert.equal((await worker.result).code, 0);
    const store = openRelayStore(lab.relayPath, 'resume');
    try {
      assert.equal(store.snapshot(job.jobId).postReservations, 1);
    } finally {
      store.close();
    }
  } finally {
    await worker?.stop();
    await lab.stop();
  }
});

test('a real SQLite lock is diagnosed without admitting a supplier POST', async () => {
  const lab = await startRuntime({ mode: 'new' });
  const blocker = new DatabaseSync(lab.relayPath);
  let worker;
  try {
    const [job] = JSON.parse((await lab.command(['fixture', 'northstar'])).stdout);
    assert.equal((await lab.command(['approve', job.jobId, '0', 'harness'])).code, 0);
    blocker.exec('BEGIN IMMEDIATE');
    worker = lab.startRelay(['dispatch', job.jobId]);
    await assert.rejects(
      waitUntil(() => false, 2_000, worker),
      (error: unknown) => {
        assert.equal((error as { code: string }).code, 'relay_state_busy');
        assert.equal((error as { workerExitCode: number }).workerExitCode, 1);
        return true;
      },
    );
    blocker.exec('ROLLBACK');
    const store = openRelayStore(lab.relayPath, 'resume');
    try {
      assert.equal(store.snapshot(job.jobId).postReservations, 0);
    } finally {
      store.close();
    }
    assert.equal((await controlRequest(lab.connection, '/v1/orders')).body.count, 0);
  } finally {
    if (blocker.isTransaction) blocker.exec('ROLLBACK');
    blocker.close();
    await worker?.stop();
    await lab.stop();
  }
});

test('failed report retains safe diagnostic code in both JSON and the human report', () => {
  const original = JSON.parse(
    readFileSync(
      join(projectRoot, 'docs/evidence/2026-10-15-mock-http/audited/failed-initial.json'),
      'utf8',
    ),
  ) as RunEvidence;
  original.scenarioResults[0].failure = { code: 'relay_state_busy', workerExitCode: 1 };
  const evidence = buildEvidence(original);
  assert.deepEqual(evidence.scenarioResults[0].failure, {
    code: 'relay_state_busy',
    workerExitCode: 1,
  });
  assert.match(renderEvidence(evidence).markdown, /relay_state_busy/);
  assert.equal(evidence.status, 'failed');
});

// Catches an exited worker being hidden behind a generic milestone timeout.
test('a failed relay is reported promptly with an allowlisted failure code', async () => {
  const worker = ownedProcess(
    process.execPath,
    [join(projectRoot, 'integration/tests/helpers/delayed-cli.ts'), 'fail'],
    buildChildEnv('relay', '', ''),
    true,
  );
  const started = Date.now();
  try {
    await assert.rejects(
      Reflect.apply(waitUntil, undefined, [() => false, 2_000, worker]),
      (error: unknown) => {
        const failure = error as { code?: string; workerExitCode?: number };
        assert.equal(failure.code, 'relay_state_busy');
        assert.equal(failure.workerExitCode, 1);
        return true;
      },
    );
    assert.ok(
      Date.now() - started < 1_500,
      'Dead worker must not consume the full milestone timeout',
    );
  } finally {
    await worker.stop();
  }
});
