import { setTimeout as delay } from 'node:timers/promises';
import { runRelayCommand } from '../../relay/cli.ts';

const [mode, jobId] = process.argv.slice(2);
if (mode === 'fail') {
  process.stderr.write(JSON.stringify({ failureCode: 'relay_state_busy' }) + '\n');
  process.exitCode = 1;
} else {
  await delay(1_500);
  process.send?.({ kind: 'relay_ready' });
  await runRelayCommand(['dispatch', jobId]);
}
