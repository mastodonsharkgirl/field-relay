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
  runPassed,
  renderEvidence,
  measurementPassed,
  type Measurement,
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
  const observe = async (job: JobSnapshot) => {
    const data = await lab.observeFault(job.identity.idempotencyKey);
    const counts = data.lifetimeRequestCount as Record<string, unknown> | undefined;
    const effects = data.effects as Record<string, unknown> | undefined;
    if (
      ![counts?.post, counts?.get, effects?.replay].every(
        (value) => Number.isSafeInteger(value) && Number(value) >= 0,
      )
    )
      throw Error('Invalid supplier observation.');
    return {
      post: Number(counts!.post),
      get: Number(counts!.get),
      replay: Number(effects!.replay),
    };
  };
  const begin = async (job: JobSnapshot) => ({
    start: Date.now(),
    counters: await observe(job),
    job: store.snapshot(job.jobId),
    sequence: store.events(job.jobId).at(-1)?.sequence ?? 0,
  });
  const record = async (
    name: string,
    jobId: string,
    expectedCount: number,
    requireState: JobPredicate,
    baseline: Awaited<ReturnType<typeof begin>>,
    expected: {
      postDelta: number;
      autoDelta: number;
      bounded?: boolean;
      manualGets?: number;
      postLifetime?: number;
      extras?: Measurement[];
    },
  ) => {
    const readback = await readVendorList(lab.connection);
    inspectionRequests += readback.inspectionRequests;
    const job = store.snapshot(jobId);
    const orders = readback.orders.filter(
      (receipt) => receipt.idempotencyKey === job.identity.idempotencyKey,
    );
    const count = readback.verification === 'verified' ? orders.length : null;
    const exact =
      count === null || count === 0
        ? null
        : orders.every((receipt) => identify(receipt.order).canonical === job.identity.canonical);
    const counts = await observe(job);
    const events = store.events(jobId).filter((event) => event.sequence > baseline.sequence);
    const checks: Measurement[] = [];
    const check = (
      name: string,
      wanted: Measurement['expected'],
      actual: Measurement['observed'],
      mode: Measurement['mode'] = 'equal',
    ) => checks.push({ name, expected: wanted, observed: actual, mode });
    check('verified order count', expectedCount, count);
    check('exact original payload (null when absent)', expectedCount === 0 ? null : true, exact);
    check('required final relay state', true, requireState(job));
    const postDelta = job.postReservations - baseline.job.postReservations;
    const autoDelta = job.getReservations - baseline.job.getReservations;
    check('wire POST delta equals admitted delta', postDelta, counts.post - baseline.counters.post);
    check(
      'reserved POST delta',
      expected.postDelta,
      postDelta,
      expected.bounded ? 'at-most' : 'equal',
    );
    check(
      'automatic GET delta',
      expected.autoDelta,
      autoDelta,
      expected.bounded ? 'at-most' : 'equal',
    );
    check(
      'operator GET delta',
      expected.manualGets ?? 0,
      events.filter((event) => event.kind === 'operator_inspection').length,
    );
    check('evidence GETs for this key', expectedCount, orders.length);
    check(
      'wire GET delta including evidence',
      autoDelta + (expected.manualGets ?? 0) + expectedCount,
      counts.get - baseline.counters.get,
    );
    check('replay acknowledgment delta', 0, counts.replay - baseline.counters.replay);
    check(
      'lifetime POST reservations',
      expected.postLifetime ?? 3,
      job.postReservations,
      expected.postLifetime === undefined ? 'at-most' : 'equal',
    );
    check('lifetime automatic GET reservations', 6, job.getReservations, 'at-most');
    const recoveryEvents = events.filter(
      (event) => event.kind === 'post_settled' || event.kind === 'read_settled',
    );
    if (recoveryEvents.length)
      check(
        'automatic recovery completes within original deadline',
        true,
        job.deadlineAt !== null && recoveryEvents.every((event) => event.at <= job.deadlineAt!),
      );
    checks.push(...(expected.extras ?? []));
    const passed = checks.every(measurementPassed);
    results.push({
      jobId,
      checks,
      eventSequences: events.map((event) => event.sequence),
      finalState: [job.approvalState, job.outcome, job.observed, job.holdReason ?? 'no hold'].join(
        ' / ',
      ),
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
      elapsedMs: Date.now() - baseline.start,
      wirePostCount: counts.post,
      wireGetCount: counts.get,
      replayAcknowledgments: counts.replay,
    });
  };
  try {
    if (options.mode === 'resume') {
      const existing = store.list();
      if (!existing.length) throw Error('This run has no exercise jobs.');
      for (const job of existing) {
        const baseline = await begin(job);
        await command(lab, ['dispatch', job.jobId]);
        await command(lab, ['inspect', job.jobId]);
        const reconciled = store.snapshot(job.jobId);
        await record(
          'resume-' + job.order.orderId,
          job.jobId,
          reconciled.observed === 'present' ? 1 : 0,
          (current) =>
            current.observed !== 'unknown' &&
            current.deadlineAt === job.deadlineAt &&
            current.postReservations >= job.postReservations &&
            current.postReservations <= 3,
          baseline,
          {
            postDelta:
              job.observed === 'present' ||
              job.approvalState !== 'approved' ||
              job.holdReason === 'content_conflict'
                ? 0
                : 3 - job.postReservations,
            autoDelta: 6 - job.getReservations,
            bounded: true,
            manualGets: 1,
          },
        );
      }
    } else {
      const [loss] = await command<JobSnapshot[]>(lab, ['fixture', 'northstar']);
      await approve(loss);
      await lab.configureFault(loss.identity.idempotencyKey, ['hold_after_commit']);
      const lossBaseline = await begin(loss);
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
        lossBaseline,
        {
          postDelta: 1,
          autoDelta: 1,
          postLifetime: 1,
          extras: [
            {
              name: 'POST timeout lower bound ms (750 ms minus 150 ms scheduler tolerance)',
              expected: 600,
              observed:
                store.events(loss.jobId).find((event) => event.kind === 'post_settled')!.at -
                store.events(loss.jobId).find((event) => event.kind === 'post_reserved')!.at,
              mode: 'at-least',
            },
            {
              name: 'POST timeout upper bound ms (750 ms plus 150 ms scheduler tolerance)',
              expected: 900,
              observed:
                store.events(loss.jobId).find((event) => event.kind === 'post_settled')!.at -
                store.events(loss.jobId).find((event) => event.kind === 'post_reserved')!.at,
              mode: 'at-most',
            },
          ],
        },
      );
      if (options.scenario === 'walkthrough') {
        const repeatBaseline = await begin(store.snapshot(loss.jobId));
        await lab.restartVendor();
        await command(lab, ['dispatch', loss.jobId]);
        await record(
          'repeat-dispatch-after-both-process-restarts',
          loss.jobId,
          1,
          (job) => job.outcome === 'delivered' && job.postReservations === 1,
          repeatBaseline,
          { postDelta: 0, autoDelta: 0, postLifetime: 1 },
        );
        const conflictBaseline = await begin(store.snapshot(loss.jobId));
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
          conflictBaseline,
          { postDelta: 0, autoDelta: 0, postLifetime: 1 },
        );
        const [backoff, inflight] = await command<JobSnapshot[]>(lab, ['fixture', 'orbit']);
        await approve(backoff);
        await lab.configureFault(backoff.identity.idempotencyKey, ['429_once']);
        const backoffBaseline = await begin(backoff);
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
          backoffBaseline,
          {
            postDelta: 1,
            autoDelta: 1,
            postLifetime: 1,
            extras: [
              {
                name: 'revocation occurs before retry due time',
                expected: true,
                observed:
                  store.events(backoff.jobId).find((event) => event.kind === 'revoked')!.at <
                  store.events(backoff.jobId).find((event) => event.kind === 'post_settled')!
                    .nextAttemptAt!,
                mode: 'equal',
              },
              {
                name: 'readback honors Retry-After',
                expected: true,
                observed:
                  store.events(backoff.jobId).find((event) => event.kind === 'read_reserved')!.at >=
                  store.events(backoff.jobId).find((event) => event.kind === 'post_settled')!
                    .nextAttemptAt!,
                mode: 'equal',
              },
            ],
          },
        );
        await approve(inflight);
        await lab.configureFault(inflight.identity.idempotencyKey, ['hold_before_commit']);
        const inflightBaseline = await begin(inflight);
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
          inflightBaseline,
          {
            postDelta: 1,
            autoDelta: 1,
            manualGets: 1,
            postLifetime: 1,
            extras: [
              {
                name: 'admission sequence precedes revocation',
                expected: true,
                observed:
                  store.events(inflight.jobId).find((event) => event.kind === 'post_reserved')!
                    .sequence <
                  store.events(inflight.jobId).find((event) => event.kind === 'revoked')!.sequence,
                mode: 'equal',
              },
              {
                name: 'supplier commit at or after revocation',
                expected: true,
                observed:
                  Date.parse(store.snapshot(inflight.jobId).receipt!.committedAt) >=
                  store.events(inflight.jobId).find((event) => event.kind === 'revoked')!.at,
                mode: 'equal',
              },
            ],
          },
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
          process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
            ? ['node', 'integration/launch.ts', ...process.argv.slice(2)].join(' ')
            : 'launchExercise(' +
              JSON.stringify({
                mode: options.mode,
                runId: options.runId,
                scenario: options.scenario,
                scripted: options.scripted,
              }) +
              ')',
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
    evidence.metadata.credentialScanPassed = true;
    evidence.status = runPassed(evidence) ? 'passed' : 'failed';
    const rendered = renderEvidence(evidence);
    const scan = await lab.scanArtifacts([rendered.json, rendered.markdown]);
    evidence.metadata.credentialScanPassed = scan.passed;
    evidence.status = runPassed(evidence) ? 'passed' : 'failed';
    writeEvidence(evidence, join(lab.directory, 'reports'));
    const emittedScan = await lab.scanArtifacts([]);
    if (!emittedScan.passed) throw Error('Emitted artifact credential scan failed.');
    // The receipt contains only counts and a boolean, never a matched credential.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(
      join(lab.directory, 'reports', 'scan-' + Date.now() + '.json'),
      JSON.stringify(emittedScan) + '\n',
      { flag: 'wx' },
    );
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
  process.stdout.write('Overall verified result: ' + evidence.status + '\n');
  if (evidence.status !== 'passed') process.exitCode = 1;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  void main().catch(() => {
    process.stderr.write(
      'Local exercise could not start. Check prerequisites and saved run state.\n',
    );
    process.exitCode = 1;
  });
