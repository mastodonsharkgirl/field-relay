import { join } from 'node:path';
import { setTimeout, clearTimeout } from 'node:timers';
import {
  startRuntime,
  ownedProcess,
  buildChildEnv,
  projectRoot,
  type OwnedProcess,
} from '../runtime.ts';

export const startLab = async (options: { mode: 'new' | 'resume'; runId?: string }) => {
  const runtime = await startRuntime(options);
  const children: OwnedProcess[] = [];
  return {
    ...runtime,
    get connection() {
      return runtime.connection;
    },
    startRelay: (options: {
      fixture: 'northstar' | 'orbit';
      scripted: boolean;
      stopAt?: 'before-admission' | 'admission' | 'commit';
    }) => {
      if (!options.scripted) throw Error('Test harness approvals must be labelled scripted.');
      const connection = runtime.connection;
      const env = buildChildEnv('relay', connection.token, '');
      Object.assign(env, {
        FIELD_RELAY_RUN_ID: runtime.runId,
        FIELD_RELAY_VENDOR_PORT: String(connection.port),
        FIELD_RELAY_VENDOR_STORE_ID: connection.storeId,
      });
      const owned = ownedProcess(
        process.execPath,
        [
          join(projectRoot, 'integration/tests/helpers/relay-worker.ts'),
          options.fixture,
          options.stopAt ?? 'dispatch',
        ],
        env,
        true,
      );
      children.push(owned);
      const admitted = new Promise<{ jobId: string }>((resolveAdmitted, reject) => {
        const timer = setTimeout(
          () => reject(Error('Relay admission milestone timed out.')),
          5_000,
        );
        owned.child.on('message', (value: unknown) => {
          if (
            value &&
            typeof value === 'object' &&
            'jobId' in value &&
            typeof value.jobId === 'string'
          ) {
            clearTimeout(timer);
            resolveAdmitted({ jobId: value.jobId });
          }
        });
        void owned.result.then(() => {
          clearTimeout(timer);
          reject(Error('Relay ended before admission milestone.'));
        });
      });
      // A caller may only need the result for a competing worker.
      void admitted.catch(() => undefined);
      return { ...owned, admitted };
    },
    restartVendor: async () => {
      if (
        children.some((owned) => owned.child.exitCode === null && owned.child.signalCode === null)
      )
        throw Error('Stop test workers before restarting.');
      await runtime.restartVendor();
    },
    stop: async () => {
      try {
        for (const owned of children) await owned.stop();
      } finally {
        await runtime.stop();
      }
    },
  };
};
