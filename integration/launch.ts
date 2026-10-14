import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import {
  startRuntime,
  buildChildEnv,
  ownedProcess,
  projectRoot,
  waitUntil,
  controlRequest,
  type Runtime,
} from './runtime.ts';
import { openRelayStore } from './relay/state.ts';
import { identify } from './relay/contract.ts';
import type { JobSnapshot } from './relay/state-types.ts';
import {
  buildEvidence,
  readVendorList,
  writeEvidence,
  type RunEvidence,
  type ScenarioResult,
} from './relay/evidence.ts';

export type ScenarioName = 'response-loss' | 'walkthrough';
// eslint-disable-next-line no-unused-vars -- Callback parameter documents the predicate.
type JobPredicate = (job: JobSnapshot) => boolean;

const command = async <T>(lab: Runtime, args: string[]): Promise<T> => {
  const result = await lab.command(args);
  if (result.code !== 0 || !lab.scanCredentials([result.stdout, result.stderr]))
    throw Error('Relay command failed.');
  return JSON.parse(result.stdout) as T;
};

export const launchExercise = async (options: {
  mode: 'new' | 'resume';
  runId?: string;
  scenario: ScenarioName;
  scripted: boolean;
}): Promise<RunEvidence> => {
  if (!['response-loss', 'walkthrough'].includes(options.scenario))
    throw Error('Unknown synthetic scenario.');
  const started = Date.now();
  const lab = await startRuntime(options);
  let store;
  try {
    store = openRelayStore(lab.relayPath, 'resume');
  } catch {
    await lab.stop();
    throw Error('Relay state could not be opened.');
  }
  const results: ScenarioResult[] = [];
  let exerciseFailed = false;
  const approve = async (job: JobSnapshot) => {
    if (!options.scripted) {
      if (!process.stdin.isTTY)
        throw Error(
          'Interactive approval requires a terminal; use --scripted for labelled harness approvals.',
        );
      process.stdout.write(
        '\nExact synthetic order to approve:\n' +
          JSON.stringify(job.order, null, 2) +
          '\nRevision: ' +
          job.approvalRevision +
          '\n',
      );
      const prompt = createInterface({ input: process.stdin, output: process.stdout });
      let answer: string;
      try {
        answer = await prompt.question('Type APPROVE to allow this exact order: ');
      } finally {
        prompt.close();
      }
      if (answer !== 'APPROVE') throw Error('Approval was not given.');
    }
    await command(lab, [
      'approve',
      job.jobId,
      String(job.approvalRevision),
      options.scripted ? 'harness' : 'operator',
    ]);
  };
  let inspectionRequests = 0;
  const record = async (
    name: string,
    jobId: string,
    expectedCount: number,
    requireState: JobPredicate,
    start: number,
  ) => {
    const readback = await readVendorList(lab.connection);
    inspectionRequests += readback.inspectionRequests;
    const job = store.snapshot(jobId);
    const orders = readback.orders.filter(
      (receipt) => receipt.idempotencyKey === job.identity.idempotencyKey,
    );
    const count = readback.verification === 'verified' ? orders.length : null;
    const exact =
      count === null
        ? null
        : orders.every((receipt) => identify(receipt.order).canonical === job.identity.canonical);
    const passed = count === expectedCount && exact === true && requireState(job);
    const observation = await lab.observeFault(job.identity.idempotencyKey);
    const counts = observation.requestCount as { post: number; get: number };
    const effects = observation.effects as { replay: number };
    results.push({
      name,
      status: passed ? 'passed' : 'failed',
      reason: passed
        ? 'Verified local outcome matches the scenario.'
        : 'Expected outcome was not established.',
      expectedCount,
      observedCount: count,
      exactPayload: exact,
      postCount: job.postReservations,
      automaticGetCount: job.getReservations,
      elapsedMs: Date.now() - start,
      wirePostCount: counts.post,
      wireGetCount: counts.get,
      replayAcknowledgments: effects.replay,
    });
  };
  try {
    if (options.mode === 'resume') {
      const existing = store.list();
      if (!existing.length) throw Error('This run has no exercise jobs.');
      for (const job of existing) {
        await command(lab, ['dispatch', job.jobId]);
        await command(lab, ['inspect', job.jobId]);
        await record(
          'resume-' + job.order.orderId,
          job.jobId,
          job.receipt ? 1 : 0,
          (current) =>
            current.postReservations >= job.postReservations && current.postReservations <= 3,
          started,
        );
      }
    } else {
      const [loss] = await command<JobSnapshot[]>(lab, ['fixture', 'northstar']);
      await approve(loss);
      await lab.configureFault(loss.identity.idempotencyKey, ['hold_after_commit']);
      const sending = lab.startRelay(['dispatch', loss.jobId]);
      // Observe committed vendor state while the POST response is still withheld.
      await waitUntil(async () => {
        inspectionRequests++;
        return (await controlRequest(lab.connection, '/v1/orders')).body.count === 1;
      });
      const sent = await sending.result;
      if (sent.code !== 0) throw Error('Response-loss worker failed.');
      await lab.releaseBarrier(loss.identity.idempotencyKey);
      await record(
        'response-loss',
        loss.jobId,
        1,
        (job) => job.outcome === 'delivered' && job.postReservations === 1,
        started,
      );
      if (options.scenario === 'walkthrough') {
        const phase = Date.now();
        await lab.restartVendor();
        await command(lab, ['dispatch', loss.jobId]);
        await record(
          'replay-after-both-process-restarts',
          loss.jobId,
          1,
          (job) => job.outcome === 'delivered' && job.postReservations === 1,
          phase,
        );
        store.enqueue(
          { ...loss.order, amountMinor: loss.order.amountMinor + 1 },
          lab.connection.storeId,
          Date.now(),
        );
        await command(lab, ['dispatch', loss.jobId]);
        await record(
          'changed-payload-held',
          loss.jobId,
          1,
          (job) => job.holdReason === 'content_conflict' && job.postReservations === 1,
          phase,
        );
        const [backoff, inflight] = await command<JobSnapshot[]>(lab, ['fixture', 'orbit']);
        await approve(backoff);
        await lab.configureFault(backoff.identity.idempotencyKey, ['429_once']);
        const retrying = lab.startRelay(['dispatch', backoff.jobId]);
        await waitUntil(() =>
          store
            .events(backoff.jobId)
            .some((event) => event.kind === 'post_settled' && event.httpStatus === 429),
        );
        await command(lab, [
          'revoke',
          backoff.jobId,
          String(store.snapshot(backoff.jobId).approvalRevision),
        ]);
        if ((await retrying.result).code !== 0) throw Error('Backoff worker failed.');
        await record(
          'revoked-during-429-wait',
          backoff.jobId,
          0,
          (job) => job.approvalState === 'revoked' && job.postReservations === 1,
          phase,
        );
        await approve(inflight);
        await lab.configureFault(inflight.identity.idempotencyKey, ['hold_before_commit']);
        const admitted = lab.startRelay(['dispatch', inflight.jobId]);
        await waitUntil(
          async () =>
            Number(
              (
                (await lab.observeFault(inflight.identity.idempotencyKey)).requestCount as Record<
                  string,
                  unknown
                >
              ).post,
            ) === 1,
        );
        await command(lab, [
          'revoke',
          inflight.jobId,
          String(store.snapshot(inflight.jobId).approvalRevision),
        ]);
        await lab.releaseBarrier(inflight.identity.idempotencyKey);
        if ((await admitted.result).code !== 0) throw Error('In-flight worker failed.');
        await command(lab, ['inspect', inflight.jobId]);
        await record(
          'revoked-after-admission-may-commit',
          inflight.jobId,
          1,
          (job) =>
            job.approvalState === 'revoked' &&
            job.observed === 'present' &&
            job.postReservations === 1,
          phase,
        );
      }
    }
  } catch {
    exerciseFailed = true;
    results.push({
      name: 'exercise-interrupted',
      status: 'failed',
      reason: 'Exercise did not complete; inspect saved state before retrying.',
      expectedCount: 0,
      observedCount: null,
      exactPayload: null,
      postCount: store.list().reduce((sum, job) => sum + job.postReservations, 0),
      automaticGetCount: 0,
      elapsedMs: Date.now() - started,
      wirePostCount: null,
      wireGetCount: null,
      replayAcknowledgments: null,
    });
  }
  try {
    const jobs = store.list();
    const events = jobs
      .flatMap((job) => store.events(job.jobId))
      .sort((a, b) => a.sequence - b.sequence);
    const vendorReadback = await readVendorList(lab.connection);
    vendorReadback.inspectionRequests += inspectionRequests;
    const env = buildChildEnv('relay', '', '');
    const sha = await ownedProcess('git', ['rev-parse', 'HEAD'], env).result;
    const dirty = await ownedProcess('git', ['status', '--porcelain'], env).result;
    const versions = await ownedProcess(
      lab.pythonExecutable,
      [
        '-c',
        'import sys,sqlite3,json; print(json.dumps([sys.version.split()[0],sqlite3.sqlite_version]))',
      ],
      env,
    ).result;
    if (sha.code !== 0 || dirty.code !== 0 || versions.code !== 0)
      throw Error('Runtime provenance could not be collected.');
    const [pythonVersion, sqliteVersion] = JSON.parse(versions.stdout) as [string, string];
    await lab.stop();
    const evidence = buildEvidence({
      metadata: {
        runId: lab.runId,
        mode: options.mode,
        scripted: options.scripted,
        sourceSha: sha.stdout.trim(),
        dirty: dirty.stdout.trim().length > 0,
        commands: [
          'npm run integration:demo -- ' +
            (options.scripted ? '--scripted ' : '') +
            (options.mode === 'resume' ? '--resume ' + lab.runId + ' ' : '') +
            '--scenario ' +
            options.scenario,
        ],
        nodeVersion: process.versions.node,
        pythonVersion,
        sqliteVersion,
        os: platform() + ' ' + release(),
        startedAt: new Date(started).toISOString(),
        finishedAt: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        elapsedMs: Date.now() - started,
        fixtureHashes: {
          northstar: createHash('sha256')
            .update(readFileSync(new URL('./fixtures/northstar.csv', import.meta.url)))
            .digest('hex'),
          orbit: createHash('sha256')
            .update(readFileSync(new URL('./fixtures/orbit.csv', import.meta.url)))
            .digest('hex'),
        },
        credentialScanPassed: false,
        cleanupVerified: true,
      },
      jobs,
      events,
      vendorReadback,
      scenarioResults: results,
    });
    evidence.metadata.credentialScanPassed = lab.scanCredentials([JSON.stringify(evidence)]);
    writeEvidence(evidence, join(lab.directory, 'reports'));
    if (exerciseFailed)
      process.stderr.write('Exercise failure was retained in the saved report.\n');
    return evidence;
  } finally {
    store.close();
    await lab.stop();
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  let runId: string | undefined,
    scenario: ScenarioName = 'walkthrough',
    scripted = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scripted') scripted = true;
    else if (args[i] === '--resume') {
      runId = args[++i];
      if (!runId) throw Error('Missing run ID.');
    } else if (args[i] === '--scenario') {
      const value = args[++i];
      if (value !== 'walkthrough' && value !== 'response-loss') throw Error('Unknown scenario.');
      scenario = value;
    } else throw Error('Unknown option.');
  }
  const evidence = await launchExercise({
    mode: runId ? 'resume' : 'new',
    runId,
    scenario,
    scripted,
  });
  process.stdout.write(
    'Synthetic local exercise: ' +
      evidence.metadata.runId +
      '\nReports: ' +
      join(projectRoot, '.local', 'integration', evidence.metadata.runId, 'reports') +
      '\n',
  );
  for (const result of evidence.scenarioResults)
    process.stdout.write(
      result.status +
        ': ' +
        result.name +
        ' (verified orders ' +
        (result.observedCount ?? 'unknown') +
        ')\n',
    );
  if (evidence.scenarioResults.some((result) => result.status === 'failed')) process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  void main().catch(() => {
    process.stderr.write(
      'Local exercise could not start. Check prerequisites and saved run state.\n',
    );
    process.exitCode = 1;
  });
