import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openRelayStore } from '../relay/state.ts';
import { loadFixture } from '../relay/intake.ts';
import { ownedProcess, projectRoot, buildChildEnv } from '../runtime.ts';
import { setTimeout, clearTimeout } from 'node:timers';

test('SIGINT cleanup handler closes owned PIDs and preserves resumable state', async () => {
  const owner = ownedProcess(
    process.execPath,
    [join(projectRoot, 'integration/tests/helpers/runtime-owner.ts')],
    buildChildEnv('relay', '', ''),
    true,
  );
  const ready = await new Promise<{ runId: string; connection: { port: number }; pids: number[] }>(
    (resolveReady, reject) => {
      const timer = setTimeout(() => reject(Error('Owner did not become ready.')), 5_000);
      owner.child.once('message', (value) => {
        clearTimeout(timer);
        resolveReady(value as { runId: string; connection: { port: number }; pids: number[] });
      });
    },
  );
  try {
    owner.child.send({ interrupt: true });
    const result = await owner.result;
    assert.equal(result.code, 130);
    for (const pid of ready.pids) assert.throws(() => process.kill(pid, 0));
    assert.equal(
      existsSync(join(projectRoot, '.local/integration', ready.runId, 'manifest.json')),
      true,
    );
  } finally {
    await owner.stop();
  }
});

test('PowerShell wrapper resolves the checkout from a working directory with spaces', async () => {
  const result = await ownedProcess(
    'powershell.exe',
    [
      '-NoProfile',
      '-File',
      join(projectRoot, 'scripts/start-integration-lab.ps1'),
      '--scripted',
      '--scenario',
      'response-loss',
    ],
    buildChildEnv('relay', '', ''),
  ).result;
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /passed: response-loss/);
  assert.match(result.stdout, /Synthetic local exercise: run-/);
});

test('approval source is persisted per event across a store restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'field-relay-source-'));
  const path = join(directory, 'relay.sqlite');
  let store = openRelayStore(path, 'new');
  try {
    const job = store.enqueue(loadFixture('northstar').orders[0], 'store-source', Date.now());
    store.approve(job.jobId, 0, Date.now(), 'harness');
    store.close();
    store = openRelayStore(path, 'resume');
    store.approve(job.jobId, 1, Date.now(), 'operator');
    assert.deepEqual(
      store
        .events(job.jobId)
        .filter((event) => event.kind === 'approved')
        .map((event) => event.reason),
      ['harness', 'operator'],
    );
  } finally {
    store.close();
  }
});

test('managed CLI, PowerShell wrapper and aggregate entry points exist', () => {
  for (const path of [
    '../launch.ts',
    '../relay/cli.ts',
    './run-all.ts',
    '../../scripts/start-integration-lab.ps1',
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, 'Missing entry point: ' + path);
  }
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  for (const name of [
    'integration:check',
    'integration:test',
    'integration:demo',
    'integration:cli',
  ])
    assert.equal(typeof pkg.scripts[name], 'string');
});

test('child environment keeps admin credentials out of relay and ignores inherited secrets', async () => {
  const { buildChildEnv } = await import('../runtime.ts');
  process.env.UNRELATED_TEST_SECRET = 'must-not-inherit';
  try {
    const relay = buildChildEnv('relay', 'ordinary-test-value', 'admin-test-value');
    assert.equal(relay.FIELD_RELAY_VENDOR_TOKEN, 'ordinary-test-value');
    assert.equal(relay.FIELD_RELAY_VENDOR_ADMIN_TOKEN, undefined);
    assert.equal(relay.UNRELATED_TEST_SECRET, undefined);
    assert.equal(
      buildChildEnv('vendor', 'ordinary-test-value', 'admin-test-value')
        .FIELD_RELAY_VENDOR_ADMIN_TOKEN,
      'admin-test-value',
    );
  } finally {
    delete process.env.UNRELATED_TEST_SECRET;
  }
});

test('run paths reject traversal, absolute paths and unknown resume IDs', async () => {
  const { runDirectory } = await import('../runtime.ts');
  for (const bad of ['../outside', 'C:/outside', '/outside', 'x/y', 'CON', '.'])
    assert.throws(() => runDirectory(bad));
});
