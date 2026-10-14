import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, symlinkSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { startRuntime, runDirectory, runsRoot, controlRequest } from '../runtime.ts';
import { readVendorList, buildEvidence } from '../relay/evidence.ts';

test('final unverified supplier evidence cannot produce a passing run', () => {
  const input = JSON.parse(
    readFileSync(
      new URL(
        '../../docs/evidence/2026-10-15-mock-http-checkpoint/focused-walkthrough.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const row of input.scenarioResults)
    row.checks = [{ name: 'fixture baseline', expected: true, observed: true, mode: 'equal' }];
  assert.equal(buildEvidence(input).status, 'passed');
  input.vendorReadback = {
    ...input.vendorReadback,
    verification: 'unavailable',
    count: null,
    orders: [],
  };
  assert.equal(Reflect.get(buildEvidence(input), 'status'), 'failed');
});

test('scenario measurements override a stale pass label and appear in the human report', async () => {
  const { renderEvidence } = await import('../relay/evidence.ts');
  const input = JSON.parse(
    readFileSync(
      new URL(
        '../../docs/evidence/2026-10-15-mock-http-checkpoint/focused-walkthrough.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  input.scenarioResults[0].checks = [
    { name: 'wire POST delta', expected: 1, observed: 2, mode: 'equal' },
  ];
  const evidence = buildEvidence(input);
  assert.equal(evidence.scenarioResults[0].status, 'failed');
  assert.equal(evidence.status, 'failed');
  const markdown = renderEvidence(evidence).markdown;
  assert.match(markdown, /wire POST delta/);
  assert.match(markdown, /failed/);
});

test('human evidence uses persisted approval events even when launcher mode differs', async () => {
  const { renderEvidence } = await import('../relay/evidence.ts');
  const input = JSON.parse(
    readFileSync(
      new URL(
        '../../docs/evidence/2026-10-15-mock-http-checkpoint/focused-walkthrough.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  input.events.find((event: { kind: string }) => event.kind === 'approved').reason = 'operator';
  input.metadata.scripted = true;
  const markdown = renderEvidence(buildEvidence(input)).markdown;
  assert.match(markdown, /Launcher mode: scripted/);
  assert.match(markdown, /Persisted approvals:[\s\S]*operator/);
  assert.doesNotMatch(markdown, /Approval source: scripted harness/);
});

test('overlapping cleanup calls both wait for the owned processes to close', async () => {
  const lab = await startRuntime({ mode: 'new' });
  const completed: string[] = [];
  await Promise.all([
    lab.stop().then(() => completed.push('first')),
    lab.stop().then(() => completed.push('second')),
  ]);
  assert.deepEqual(completed, ['first', 'second']);
  await assert.rejects(controlRequest(lab.connection, '/v1/health'));
});

test('coordinated restart rotates credentials and rejects the prior session', async () => {
  const lab = await startRuntime({ mode: 'new' });
  try {
    const previous = lab.connection;
    await lab.restartVendor();
    assert.notEqual(lab.connection.token, previous.token);
    assert.equal(lab.connection.storeId, previous.storeId);
    assert.equal((await controlRequest(lab.connection, '/v1/health')).status, 200);
    assert.equal(
      (await controlRequest({ ...lab.connection, token: previous.token }, '/v1/health')).status,
      401,
    );
    assert.equal(
      (
        await controlRequest(lab.connection, '/__lab/scenarios', {
          action: 'observe',
          idempotencyKey: '0'.repeat(64),
        })
      ).status,
      403,
    );
    assert.equal(lab.scanCredentials([JSON.stringify({ runId: lab.runId })]), true);
    assert.equal(lab.scanCredentials([previous.token]), false);
    const scan = await lab.scanArtifacts(['safe synthetic report']);
    assert.equal(scan.passed, true);
    assert.ok(scan.files >= 3);
    assert.ok(scan.bytes > 0);
    assert.equal((await lab.scanArtifacts([previous.token])).passed, false);
    const report = await lab.command(['report']);
    assert.equal(report.code, 0);
    assert.equal(lab.scanCredentials([report.stdout, report.stderr]), true);
  } finally {
    await lab.stop();
  }
});

test('unavailable or mismatched list readback has a null count', async () => {
  const lab = await startRuntime({ mode: 'new' });
  const connection = lab.connection;
  try {
    const mismatch = await readVendorList({ ...connection, storeId: 'store-other' });
    assert.equal(mismatch.verification, 'invalid');
    assert.equal(mismatch.count, null);
    assert.deepEqual(mismatch.orders, []);
  } finally {
    await lab.stop();
  }
  const unavailable = await readVendorList(connection);
  assert.equal(unavailable.verification, 'unavailable');
  assert.equal(unavailable.count, null);
});

test('resume refuses missing or changed state and preserves the files', async () => {
  await assert.rejects(startRuntime({ mode: 'resume', runId: 'missing-' + randomUUID() }));
  const lab = await startRuntime({ mode: 'new' });
  await lab.stop();
  const manifestPath = join(lab.directory, 'manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const database = readFileSync(join(lab.directory, 'vendor/vendor.sqlite'));
  let failedPort = 0;
  try {
    writeFileSync(
      manifestPath,
      JSON.stringify({ schemaVersion: 1, runId: lab.runId, storeId: 'store-deadbeef' }),
    );
    await assert.rejects(startRuntime({ mode: 'resume', runId: lab.runId }), (error: unknown) => {
      const failure = error as Error & {
        cleanup?: { pids: number[]; port: number; verified: boolean };
      };
      assert.match(failure.message, /startup failed/);
      assert.equal(failure.cleanup?.verified, true);
      assert.ok(failure.cleanup!.pids.length > 0);
      for (const pid of failure.cleanup!.pids) assert.throws(() => process.kill(pid, 0));
      assert.ok(failure.cleanup!.port > 0);
      failedPort = failure.cleanup!.port;
      return true;
    });
    await assert.rejects(controlRequest({ ...lab.connection, port: failedPort }, '/v1/health'));
    assert.deepEqual(readFileSync(join(lab.directory, 'vendor/vendor.sqlite')), database);
    assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).storeId, 'store-deadbeef');
  } finally {
    writeFileSync(manifestPath, original);
  }
});

test('state directories reject a junction escape and CLI rejects arbitrary input', async () => {
  const target = join(runsRoot, 'junction-target-' + randomUUID());
  const linkedId = 'junction-link-' + randomUUID();
  mkdirSync(target, { recursive: true });
  symlinkSync(target, join(runsRoot, linkedId), 'junction');
  assert.throws(() => runDirectory(linkedId), /Linked/);
  const lab = await startRuntime({ mode: 'new' });
  try {
    assert.ok(lab.directory.includes('Saran Websites'));
    for (const args of [
      ['fixture', '../private.csv'],
      ['fixture', '{"order":1}'],
      ['dispatch', 'not-a-generated-job'],
      ['report', 'unexpected'],
    ]) {
      const result = await lab.command(args);
      assert.equal(result.code, 1);
      assert.equal(lab.scanCredentials([result.stdout, result.stderr]), true);
    }
    assert.equal((await readVendorList(lab.connection)).count, 0);
  } finally {
    await lab.stop();
  }
});

test('walkthrough holds changed payload, stops after 429 revocation and reports in-flight commit honestly', async () => {
  const { launchExercise } = await import('../launch.ts');
  const evidence = await launchExercise({ mode: 'new', scenario: 'walkthrough', scripted: true });
  assert.equal(evidence.vendorReadback.count, 2);
  assert.equal(evidence.jobs[0].holdReason, 'content_conflict');
  assert.equal(evidence.jobs[1].postReservations, 1);
  assert.equal(evidence.jobs[1].approvalState, 'revoked');
  assert.equal(evidence.jobs[1].observed, 'absent');
  assert.equal(evidence.jobs[2].approvalState, 'revoked');
  assert.equal(evidence.jobs[2].observed, 'present');
  assert.equal(
    evidence.scenarioResults.every((result) => result.status === 'passed'),
    true,
  );
  assert.equal(evidence.metadata.credentialScanPassed, true);
  assert.equal(evidence.metadata.cleanupVerified, true);
  assert.equal(evidence.status, 'passed');
  const { renderEvidence } = await import('../relay/evidence.ts');
  assert.equal(
    evidence.events.find((event) => event.kind === 'retry_scheduled' && event.httpStatus === 429)
      ?.reason,
    'retry_after',
  );
  assert.match(renderEvidence(evidence).markdown, /retry_after \| 1000/);
  assert.match(evidence.metadata.commands[0], /^launchExercise\(/);
  const timeoutUpper = evidence.scenarioResults[0].checks?.find(
    (check) =>
      check.name === 'POST timeout upper bound ms (750 ms plus 150 ms scheduler tolerance)',
  );
  assert.equal(timeoutUpper?.expected, 900);
  assert.equal(timeoutUpper?.mode, 'at-most');
  assert.equal(
    buildEvidence({
      ...evidence,
      scenarioResults: evidence.scenarioResults.map((row, index) =>
        index === 0
          ? {
              ...row,
              checks: row.checks?.map((check) =>
                check === timeoutUpper ? { ...check, observed: 9000 } : check,
              ),
            }
          : row,
      ),
    }).status,
    'failed',
  );
  const projected = buildEvidence({
    ...evidence,
    metadata: { ...evidence.metadata, unexpectedSecret: 'drop-me' },
  } as Parameters<typeof buildEvidence>[0]);
  assert.equal(JSON.stringify(projected).includes('drop-me'), false);
  assert.equal(existsSync(join(runDirectory(evidence.metadata.runId), 'reports')), true);
});
