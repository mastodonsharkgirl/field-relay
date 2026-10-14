import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadFixture } from './intake.ts';
import { openRelayStore } from './state.ts';
import { dispatch, inspectOrder } from './dispatch.ts';
import { readVendorList } from './evidence.ts';
import { runDirectory, startRuntime } from '../runtime.ts';
import { safeFailure } from '../failures.ts';

export const runRelayCommand = async (args: string[]): Promise<unknown> => {
  const runId = process.env.FIELD_RELAY_RUN_ID ?? '';
  const directory = runDirectory(runId);
  const connection = {
    port: Number(process.env.FIELD_RELAY_VENDOR_PORT),
    token: process.env.FIELD_RELAY_VENDOR_TOKEN ?? '',
    storeId: process.env.FIELD_RELAY_VENDOR_STORE_ID ?? '',
  };
  if (
    !Number.isInteger(connection.port) ||
    connection.port < 1 ||
    connection.port > 65535 ||
    !connection.token ||
    !/^store-[a-f0-9]+$/.test(connection.storeId)
  )
    throw Error('Managed lab connection is required.');
  const [verb, argument, revision, source] = args;
  if (!['fixture', 'approve', 'revoke', 'dispatch', 'inspect', 'report'].includes(verb))
    throw Error('Unknown command.');
  const store = openRelayStore(join(directory, 'relay.sqlite'), 'resume');
  try {
    if (verb === 'fixture') {
      if (args.length !== 2 || (argument !== 'northstar' && argument !== 'orbit'))
        throw Error('Choose an included fixture.');
      return loadFixture(argument).orders.map((order) =>
        store.enqueue(order, connection.storeId, Date.now()),
      );
    }
    if (verb === 'report') {
      if (args.length !== 1) throw Error('Report takes no arguments.');
      const jobs = store.list();
      return {
        jobs,
        events: jobs.flatMap((job) => store.events(job.jobId)),
        vendorReadback: await readVendorList(connection),
      };
    }
    if (!/^[a-f0-9-]{36}$/.test(argument ?? '')) throw Error('A generated job ID is required.');
    if (store.snapshot(argument).vendorStoreId !== connection.storeId)
      throw Error('Vendor store mismatch.');
    if (verb === 'approve' || verb === 'revoke') {
      if (!/^\d+$/.test(revision ?? '') || !Number.isSafeInteger(Number(revision)))
        throw Error('An exact approval revision is required.');
      if (verb === 'approve') {
        if (args.length !== 4 || (source !== 'operator' && source !== 'harness'))
          throw Error('Approval source is required.');
        return store.approve(argument, Number(revision), Date.now(), source);
      }
      if (args.length !== 3) throw Error('Invalid revoke arguments.');
      return store.revoke(argument, Number(revision), 'authorization_revoked', Date.now());
    }
    if (args.length !== 2) throw Error('Invalid command arguments.');
    process.send?.({ kind: 'relay_ready' });
    return verb === 'dispatch'
      ? await dispatch(store, argument, connection, randomUUID())
      : await inspectOrder(store, argument, connection);
  } finally {
    store.close();
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  if (process.env.FIELD_RELAY_RUN_ID) return runRelayCommand(args);
  if (args[0] !== '--run' || !args[1]) throw Error('Use --run RUN_ID followed by a command.');
  const runtime = await startRuntime({ mode: 'resume', runId: args[1] });
  try {
    const result = await runtime.command(args.slice(2));
    if (result.code !== 0 || !runtime.scanCredentials([result.stdout]))
      throw Error('Relay command failed.');
    return JSON.parse(result.stdout);
  } finally {
    await runtime.stop();
  }
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .then((result) => process.stdout.write(JSON.stringify(result) + '\n'))
    .catch((error: unknown) => {
      process.stderr.write(
        'Local relay command failed. Check the command, revision and saved run; state was preserved.\n',
      );
      process.stderr.write(JSON.stringify({ failureCode: safeFailure(error).code }) + '\n');
      process.exitCode = 1;
    });
}
