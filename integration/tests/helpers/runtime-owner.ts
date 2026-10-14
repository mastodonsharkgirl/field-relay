import { startRuntime } from '../../runtime.ts';

const lab = await startRuntime({ mode: 'new' });
process.send?.({
  runId: lab.runId,
  connection: { port: lab.connection.port },
  pids: lab.ownedPids(),
});
process.once('message', async () => {
  // Exercise the launcher's actual SIGINT listener without relying on Windows kill() semantics.
  process.emit('SIGINT');
  try {
    await lab.stop();
  } finally {
    process.disconnect?.();
  }
});
