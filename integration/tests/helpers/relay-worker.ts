import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadFixture } from '../../relay/intake.ts';
import { openRelayStore } from '../../relay/state.ts';
import { dispatch } from '../../relay/dispatch.ts';
import { exchange } from '../../relay/transport.ts';
import { runDirectory } from '../../runtime.ts';

const main = async () => {
  const [fixture, milestone] = process.argv.slice(2);
  if (
    (fixture !== 'northstar' && fixture !== 'orbit') ||
    !['before-admission', 'admission', 'commit', 'dispatch'].includes(milestone)
  )
    throw Error('Invalid test worker options.');
  const connection = {
    port: Number(process.env.FIELD_RELAY_VENDOR_PORT),
    token: process.env.FIELD_RELAY_VENDOR_TOKEN ?? '',
    storeId: process.env.FIELD_RELAY_VENDOR_STORE_ID ?? '',
  };
  const store = openRelayStore(
    join(runDirectory(process.env.FIELD_RELAY_RUN_ID ?? ''), 'relay.sqlite'),
    'resume',
  );
  try {
    let job = store.enqueue(loadFixture(fixture).orders[0], connection.storeId, Date.now());
    if (job.approvalState === 'pending')
      job = store.approve(job.jobId, job.approvalRevision, Date.now(), 'harness');
    if (milestone === 'dispatch') {
      process.send?.({ jobId: job.jobId });
      return await dispatch(store, job.jobId, connection, randomUUID());
    }
    if (milestone === 'before-admission') {
      const continued = new Promise<void>((resolveContinue) =>
        process.once('message', () => resolveContinue()),
      );
      process.send?.({ jobId: job.jobId });
      await continued;
    }
    const admission = store.reservePost(job.jobId, randomUUID(), Date.now());
    if (admission.kind !== 'admitted') {
      if (milestone === 'before-admission') return store.snapshot(job.jobId);
      throw Error('Test admission was blocked.');
    }
    const continued =
      milestone === 'admission'
        ? new Promise<void>((resolveContinue) => {
            process.once('message', () => resolveContinue());
          })
        : Promise.resolve();
    process.send?.({ jobId: job.jobId });
    await continued;
    const result = await exchange(connection, {
      method: 'POST',
      path: '/v1/orders',
      key: admission.identity.idempotencyKey,
      order: admission.order,
      requestId: admission.requestId,
    });
    // Commit-mode tests kill this worker while the real server withholds its response.
    store.settle(
      admission,
      {
        classification: result.kind === 'response' && result.status < 300 ? 'unknown' : 'retryable',
        httpStatus: result.kind === 'response' ? result.status : result.httpStatus,
        nextAttemptAt: null,
        claimedReceipt: null,
      },
      Date.now(),
    );
    return await dispatch(store, job.jobId, connection, randomUUID());
  } finally {
    store.close();
  }
};
void main()
  .then((result) => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.disconnect?.();
  })
  .catch(() => {
    process.stderr.write('Test worker failed.\n');
    process.exitCode = 1;
    process.disconnect?.();
  });
