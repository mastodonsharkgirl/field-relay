import { DatabaseSync } from 'node:sqlite';

const [action, databasePath, jobId, encodedOrder] = process.argv.slice(2);

if (!action || !databasePath || !jobId || !encodedOrder) {
  throw Error('state process harness requires an action, database path, job ID, and order');
}

const order = JSON.parse(encodedOrder);

const send = (message) => {
  if (process.send) process.send(message);
};

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));

const commandNow = (command) => {
  if (typeof command.now !== 'number' || !Number.isFinite(command.now)) {
    throw Error(
      `state process harness command ${String(command.operation)} requires a finite timestamp`,
    );
  }
  return command.now;
};

const waitForCommand = (label) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(Error(`timed out waiting for ${label} command`));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timeout);
      process.off('message', onMessage);
      process.off('disconnect', onDisconnect);
    };
    const onMessage = (command) => {
      if (typeof command !== 'object' || command === null || !('operation' in command)) return;
      cleanup();
      resolve(command);
    };
    const onDisconnect = () => {
      cleanup();
      reject(Error(`parent disconnected before ${label} command`));
    };
    process.once('message', onMessage);
    process.once('disconnect', onDisconnect);
  });

const runWorker = async () => {
  const { openRelayStore } = await import('../../relay/state.ts');
  const store = openRelayStore(databasePath, 'resume');
  let admission = null;
  try {
    send({ type: 'ready', operation: 'worker' });
    while (true) {
      const command = await waitForCommand('worker');
      if (command.operation === 'close') {
        send({ type: 'result', operation: 'close', result: { closed: true } });
        return;
      }
      if (command.operation === 'reserve') {
        const result = store.reservePost(jobId, `test-worker-${process.pid}`, commandNow(command));
        if (result.kind === 'admitted') admission = result;
        send({ type: 'result', operation: 'reserve', result });
        continue;
      }
      if (command.operation === 'settle') {
        if (admission === null)
          throw Error('state process harness cannot settle without an admission');
        const result = store.settle(
          admission,
          {
            classification: 'retryable',
            httpStatus: 503,
            nextAttemptAt: null,
            claimedReceipt: null,
          },
          commandNow(command),
        );
        admission = null;
        send({ type: 'result', operation: 'settle', result });
        continue;
      }
      if (command.operation === 'conflict') {
        const result = store.enqueue(
          { ...order, quantity: order.quantity + 1 },
          'fixture-store',
          commandNow(command),
        );
        send({ type: 'result', operation: 'conflict', result });
        continue;
      }
      throw Error(`unsupported state process harness command ${String(command.operation)}`);
    }
  } finally {
    store.close();
  }
};

const abortBetweenStateAndAudit = async () => {
  const originalPrepare = DatabaseSync.prototype.prepare;
  let barrierReached = false;
  DatabaseSync.prototype.prepare = function patchedPrepare(sql) {
    if (!barrierReached && typeof sql === 'string' && sql.includes('INSERT INTO audit_events')) {
      barrierReached = true;
      send({ type: 'barrier', operation: 'before-audit-insert' });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15_000);
    }
    return Reflect.apply(originalPrepare, this, [sql]);
  };
  const { openRelayStore } = await import('../../relay/state.ts');
  const store = openRelayStore(databasePath, 'resume');
  try {
    const pending = store.snapshot(jobId);
    const result = store.approve(jobId, pending.approvalRevision, 1_001);
    send({ type: 'result', operation: 'unexpected-approval', result });
  } finally {
    DatabaseSync.prototype.prepare = originalPrepare;
    store.close();
  }
};

const main = async () => {
  if (action === 'worker') return runWorker();
  if (action === 'abort-approval') return abortBetweenStateAndAudit();
  throw Error(`unsupported state process harness action ${action}`);
};

main().catch((error) => {
  send({ type: 'error', message: errorMessage(error) });
  process.exitCode = 1;
});
