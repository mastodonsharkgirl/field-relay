import { buildChildEnv, ownedProcess, resolvePython } from './runtime.ts';

const env = buildChildEnv('relay', '', '');
const typescript = await ownedProcess(
  process.execPath,
  ['node_modules/typescript/bin/tsc', '-p', 'integration/tsconfig.json'],
  env,
).result;
process.stdout.write(typescript.stdout + typescript.stderr);
const python = await ownedProcess(
  await resolvePython(),
  ['-m', 'compileall', '-q', 'integration/vendor', 'integration/tests'],
  env,
).result;
process.stdout.write(python.stdout + python.stderr);
if (typescript.code !== 0 || python.code !== 0) process.exitCode = 1;
else process.stdout.write('Integration TypeScript and Python compilation passed.\n');
