import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { projectRoot, runsRoot, resolvePython, ownedProcess, buildChildEnv } from '../runtime.ts';

const directory = join(runsRoot, 'test-runs', randomUUID());
mkdirSync(directory, { recursive: true });
const env = buildChildEnv('relay', '', '');
const files = readdirSync(join(projectRoot, 'integration/tests'))
  .filter((name) => name.endsWith('.test.ts'))
  .sort()
  .map((name) => join(projectRoot, 'integration/tests', name));
if (!files.length) throw Error('No integration tests discovered.');
const startedAt = new Date().toISOString();
const nodeStarted = Date.now();
const node = await ownedProcess(process.execPath, ['--test', '--test-concurrency=1', ...files], env)
  .result;
const nodeElapsedMs = Date.now() - nodeStarted;
writeFileSync(join(directory, 'node.log'), node.stdout + node.stderr);
process.stdout.write(node.stdout + node.stderr);
const pythonStarted = Date.now();
const python = await ownedProcess(
  await resolvePython(),
  ['-m', 'unittest', 'discover', '-s', 'integration/tests', '-p', 'test_*.py', '-v'],
  env,
).result;
const pythonElapsedMs = Date.now() - pythonStarted;
writeFileSync(join(directory, 'python.log'), python.stdout + python.stderr);
process.stdout.write(python.stdout + python.stderr);
const count = (output: string, pattern: RegExp) => Number(pattern.exec(output)?.[1] ?? 0);
const summary = {
  startedAt,
  finishedAt: new Date().toISOString(),
  commands: [
    'node --test --test-concurrency=1 integration/tests/*.test.ts',
    'python -m unittest discover -s integration/tests -p test_*.py -v',
  ],
  node: {
    elapsedMs: nodeElapsedMs,
    exit: node.code,
    tests: count(node.stdout, /tests (\d+)/),
    passed: count(node.stdout, /pass (\d+)/),
    failed: count(node.stdout, /fail (\d+)/),
    skipped: count(node.stdout, /skipped (\d+)/),
    cancelled: count(node.stdout, /cancelled (\d+)/),
  },
  python: {
    elapsedMs: pythonElapsedMs,
    exit: python.code,
    tests: count(python.stderr, /Ran (\d+) test/),
    failures: count(python.stderr, /failures=(\d+)/),
    errors: count(python.stderr, /errors=(\d+)/),
    skipped: count(python.stderr, /skipped=(\d+)/),
  },
};
writeFileSync(join(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
process.stdout.write('Aggregate results: ' + directory + '\n' + JSON.stringify(summary) + '\n');
if (node.code !== 0 || python.code !== 0 || !summary.node.tests || !summary.python.tests)
  process.exitCode = 1;
