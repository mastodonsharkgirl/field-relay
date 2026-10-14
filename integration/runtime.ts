import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { setTimeout, clearTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { openRelayStore } from './relay/state.ts';
import type { VendorConnection } from './relay/transport.ts';

export const projectRoot = fileURLToPath(new URL('..', import.meta.url));
export const runsRoot = join(projectRoot, '.local', 'integration');
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const reservedName = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const runDirectory = (runId: string) => {
  if (!idPattern.test(runId) || reservedName.test(runId)) throw Error('Invalid run ID.');
  const target = resolve(runsRoot, runId);
  const parts = relative(projectRoot, target).split(sep);
  let current = resolve(projectRoot);
  for (const part of parts) {
    current = join(current, part);
    if (
      existsSync(current) &&
      (lstatSync(current).isSymbolicLink() ||
        realpathSync(current).toLowerCase() !== current.toLowerCase())
    )
      throw Error('Linked state paths are refused.');
  }
  for (const name of [
    'manifest.json',
    'relay.sqlite',
    'relay.sqlite-wal',
    'relay.sqlite-shm',
    'vendor',
    'reports',
  ]) {
    const path = join(target, name);
    if (existsSync(path) && lstatSync(path).isSymbolicLink())
      throw Error('Linked state files are refused.');
  }
  if (existsSync(join(target, 'vendor'))) {
    for (const name of ['vendor.sqlite', 'vendor.sqlite-wal', 'vendor.sqlite-shm']) {
      const path = join(target, 'vendor', name);
      if (existsSync(path) && lstatSync(path).isSymbolicLink())
        throw Error('Linked vendor state is refused.');
    }
  }
  return target;
};

export const buildChildEnv = (
  role: 'relay' | 'vendor',
  token: string,
  adminToken: string,
): Record<string, string> => {
  const environment: Record<string, string> = {};
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'temp', 'tmp', 'pathext']);
  for (const [key, value] of Object.entries(process.env))
    if (value && allowed.has(key.toLowerCase())) environment[key] = value;
  environment.FIELD_RELAY_VENDOR_TOKEN = token;
  if (role === 'vendor') {
    environment.FIELD_RELAY_VENDOR_ADMIN_TOKEN = adminToken;
    environment.PYTHONPATH = projectRoot;
  }
  return environment;
};

export type ProcessResult = { code: number | null; stdout: string; stderr: string };
export type OwnedProcess = {
  child: ChildProcess;
  result: Promise<ProcessResult>;
  stop: () => Promise<void>;
};

export const ownedProcess = (
  command: string,
  args: string[],
  env: Record<string, string>,
  ipc = false,
): OwnedProcess => {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    windowsHide: true,
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  let failed = false;
  const result = new Promise<ProcessResult>((resolveResult) => {
    const capture = (chunk: unknown, stream: 'stdout' | 'stderr') => {
      if (stream === 'stdout') stdout += String(chunk);
      else stderr += String(chunk);
      if (stdout.length + stderr.length > 256 * 1024) {
        failed = true;
        child.kill();
      }
    };
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => capture(chunk, 'stdout'));
    child.stderr?.on('data', (chunk) => capture(chunk, 'stderr'));
    child.once('error', () => {
      failed = true;
    });
    child.once('close', (code) => resolveResult({ code: failed ? 1 : code, stdout, stderr }));
  });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        result,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error('Owned child did not stop.')), 5_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return { child, result, stop };
};

let python: Promise<string> | undefined;
export const resolvePython = () => {
  python ??= (async () => {
    const probe = ownedProcess(
      'py',
      ['-3.14', '-c', 'import sys; print(sys.executable)'],
      buildChildEnv('relay', '', ''),
    );
    const timer = setTimeout(() => {
      void probe.stop();
    }, 5_000);
    try {
      const result = await probe.result;
      if (result.code !== 0 || !existsSync(result.stdout.trim()))
        throw Error('Python 3.14 is required.');
      return result.stdout.trim();
    } finally {
      clearTimeout(timer);
    }
  })();
  return python;
};

export const controlRequest = async (
  connection: VendorConnection,
  path: '/v1/health' | '/v1/orders' | '/__lab/scenarios',
  payload?: object,
  adminToken?: string,
) => {
  const signal = globalThis.AbortSignal.timeout(750);
  const response = await globalThis.fetch('http://127.0.0.1:' + connection.port + path, {
    method: payload ? 'POST' : 'GET',
    redirect: 'manual',
    signal,
    headers: {
      Authorization: 'Bearer ' + (adminToken ?? connection.token),
      'Content-Type': 'application/json',
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  if (response.headers.get('content-type')?.split(';')[0] !== 'application/json')
    throw Error('Invalid control response.');
  const reader = response.body?.getReader();
  if (!reader) throw Error('Missing control response.');
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.length;
      if (length > 64 * 1024) {
        await reader.cancel();
        throw Error('Control response exceeds limit.');
      }
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    reader.releaseLock();
  }
  return {
    status: response.status,
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>,
  };
};

/* eslint-disable no-unused-vars -- Parameter names document the public runtime API. */
export type Runtime = {
  runId: string;
  directory: string;
  relayPath: string;
  connection: VendorConnection;
  pythonExecutable: string;
  command: (args: string[]) => Promise<ProcessResult>;
  startRelay: (args: string[]) => OwnedProcess;
  configureFault: (key: string, scenarios: string[]) => Promise<Record<string, unknown>>;
  observeFault: (key: string) => Promise<Record<string, unknown>>;
  releaseBarrier: (key: string) => Promise<Record<string, unknown>>;
  restartVendor: () => Promise<void>;
  scanCredentials: (contents: string[]) => boolean;
  scanArtifacts: (contents: string[]) => Promise<{ passed: boolean; files: number; bytes: number }>;
  ownedPids: () => number[];
  stop: () => Promise<void>;
};
/* eslint-enable no-unused-vars */

export const startRuntime = async (options: {
  mode: 'new' | 'resume';
  runId?: string;
}): Promise<Runtime> => {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || major >= 26 || (major === 24 && minor < 11))
    throw Error('Node 24.11 or compatible Node 25 is required.');
  const executable = await resolvePython();
  const runId = options.runId ?? (options.mode === 'new' ? 'run-' + randomUUID() : '');
  const directory = runDirectory(runId);
  const relayPath = join(directory, 'relay.sqlite');
  const manifestPath = join(directory, 'manifest.json');
  let expectedStoreId: string | undefined;
  if (options.mode === 'new') {
    mkdirSync(runsRoot, { recursive: true });
    mkdirSync(directory);
    openRelayStore(relayPath, 'new').close();
  } else {
    if (
      !existsSync(manifestPath) ||
      !existsSync(relayPath) ||
      !existsSync(join(directory, 'vendor', 'vendor.sqlite'))
    )
      throw Error('Resume requires complete existing state.');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    if (
      manifest.schemaVersion !== 1 ||
      manifest.runId !== runId ||
      typeof manifest.storeId !== 'string' ||
      !/^store-[a-f0-9]+$/.test(manifest.storeId)
    )
      throw Error('Invalid run manifest.');
    expectedStoreId = manifest.storeId;
    openRelayStore(relayPath, 'resume').close();
  }
  let token = '',
    adminToken = '';
  const credentials: string[] = [];
  const children = new Set<OwnedProcess>();
  const outputs: string[] = [];
  const argumentsSeen: string[] = [];
  let vendor: OwnedProcess;
  let connection: VendorConnection = { port: 0, token: '', storeId: '' };
  let stopped = false;
  let stopping: Promise<void> | undefined;
  const track = (owned: OwnedProcess) => {
    children.add(owned);
    argumentsSeen.push(...owned.child.spawnargs);
    void owned.result.then((result) => {
      outputs.push(result.stdout, result.stderr);
    });
    return owned;
  };
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      stopped = true;
      process.off('SIGINT', interrupted);
      process.off('SIGTERM', interrupted);
      let failed = false;
      for (const owned of children) {
        try {
          await owned.stop();
        } catch {
          failed = true;
        }
      }
      if (connection.port) {
        const closed = await new Promise<boolean>((resolveClosed) => {
          const socket = createConnection({ host: '127.0.0.1', port: connection.port });
          socket.once('connect', () => {
            socket.destroy();
            resolveClosed(false);
          });
          socket.once('error', (error: Error & { code?: string }) =>
            resolveClosed(error.code === 'ECONNREFUSED'),
          );
          socket.setTimeout(750, () => {
            socket.destroy();
            resolveClosed(false);
          });
        });
        if (!closed) failed = true;
      }
      if (failed) throw Error('Owned lab cleanup could not be verified.');
    })();
    return stopping;
  };
  const interrupted = () => {
    void stop().then(() => {
      process.exitCode = 130;
    });
  };
  process.on('SIGINT', interrupted);
  process.on('SIGTERM', interrupted);
  const bootVendor = async (mode: 'new' | 'resume') => {
    runDirectory(runId);
    token = randomBytes(32).toString('hex');
    adminToken = randomBytes(32).toString('hex');
    credentials.push(token, adminToken);
    vendor = track(
      ownedProcess(
        executable,
        [
          '-m',
          'integration.vendor.server',
          '--state-dir',
          join(directory, 'vendor'),
          '--mode',
          mode,
        ],
        buildChildEnv('vendor', token, adminToken),
      ),
    );
    const ready = await new Promise<Record<string, unknown>>((resolveReady, reject) => {
      let buffer = '';
      const timer = setTimeout(() => {
        cleanup();
        reject(Error('Vendor readiness timed out.'));
      }, 5_000);
      const onData = (data: unknown) => {
        buffer += String(data);
        if (buffer.length > 4096) {
          cleanup();
          reject(Error('Invalid vendor readiness.'));
          return;
        }
        if (!buffer.includes('\n')) return;
        cleanup();
        try {
          resolveReady(JSON.parse(buffer.split('\n')[0]));
        } catch {
          reject(Error('Invalid vendor readiness.'));
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        vendor.child.stdout?.off('data', onData);
      };
      vendor.child.stdout?.on('data', onData);
      void vendor.result.then(() => {
        cleanup();
        reject(Error('Vendor exited before readiness.'));
      });
    });
    if (
      !Number.isInteger(ready.port) ||
      Number(ready.port) < 1 ||
      Number(ready.port) > 65535 ||
      typeof ready.storeId !== 'string' ||
      !/^store-[a-f0-9]+$/.test(ready.storeId)
    )
      throw Error('Invalid vendor readiness.');
    connection = { port: Number(ready.port), token, storeId: ready.storeId };
    const health = await controlRequest(connection, '/v1/health');
    if (
      health.status !== 200 ||
      health.body.storeId !== connection.storeId ||
      health.body.instanceId !== ready.instanceId ||
      health.body.contractVersion !== 1 ||
      health.body.service !== 'field-relay-mock-vendor' ||
      (expectedStoreId && expectedStoreId !== connection.storeId)
    )
      throw Error('Vendor store verification failed.');
    expectedStoreId = connection.storeId;
  };
  try {
    await bootVendor(options.mode);
    if (options.mode === 'new')
      writeFileSync(
        manifestPath,
        JSON.stringify({ schemaVersion: 1, runId, storeId: connection.storeId }),
        { flag: 'wx' },
      );
  } catch {
    await stop();
    throw Object.assign(Error('Local lab startup failed; existing state was preserved.'), {
      cleanup: {
        verified: true,
        port: connection.port,
        pids: [...children].flatMap((owned) => (owned.child.pid ? [owned.child.pid] : [])),
      },
    });
  }
  const startRelay = (args: string[]) => {
    if (stopped) throw Error('Lab has stopped.');
    runDirectory(runId);
    const env = buildChildEnv('relay', token, adminToken);
    Object.assign(env, {
      FIELD_RELAY_RUN_ID: runId,
      FIELD_RELAY_VENDOR_PORT: String(connection.port),
      FIELD_RELAY_VENDOR_STORE_ID: connection.storeId,
    });
    return track(
      ownedProcess(process.execPath, [join(projectRoot, 'integration/relay/cli.ts'), ...args], env),
    );
  };
  const admin = async (
    action: 'configure' | 'observe' | 'release',
    key: string,
    scenario?: string[],
  ) => {
    const response = await controlRequest(
      connection,
      '/__lab/scenarios',
      { action, idempotencyKey: key, ...(scenario ? { scenario } : {}) },
      adminToken,
    );
    if (response.status !== 200) throw Error('Synthetic scenario control failed.');
    return response.body;
  };
  return {
    runId,
    directory,
    relayPath,
    pythonExecutable: executable,
    get connection() {
      return { ...connection };
    },
    startRelay,
    command: async (args) => {
      const owned = startRelay(args);
      const timeout = setTimeout(() => {
        void owned.stop();
      }, 35_000);
      try {
        return await owned.result;
      } finally {
        clearTimeout(timeout);
      }
    },
    configureFault: (key, scenarios) => admin('configure', key, scenarios),
    observeFault: (key) => admin('observe', key),
    releaseBarrier: (key) => admin('release', key),
    restartVendor: async () => {
      for (const owned of children)
        if (owned !== vendor && owned.child.exitCode === null && owned.child.signalCode === null)
          throw Error('Stop active relay workers before rotating credentials.');
      await vendor.stop();
      await bootVendor('resume');
    },
    scanCredentials: (contents) =>
      !credentials.some((credential) =>
        [...contents, ...outputs, ...argumentsSeen].some((content) => content.includes(credential)),
      ),
    scanArtifacts: async (contents) => {
      let files = 0,
        bytes = 0;
      const matches = (content: Buffer) =>
        credentials.some((value) => content.includes(Buffer.from(value)));
      try {
        runDirectory(runId);
        if (
          [...contents, ...outputs, ...argumentsSeen].some((value) => matches(Buffer.from(value)))
        )
          return { passed: false, files, bytes };
        const visit = (path: string, depth: number): boolean => {
          if (depth > 3) return false;
          for (const name of readdirSync(path)) {
            const file = join(path, name);
            const stat = lstatSync(file);
            if (stat.isSymbolicLink() || realpathSync(file).toLowerCase() !== file.toLowerCase())
              return false;
            if (stat.isDirectory()) {
              if (!visit(file, depth + 1)) return false;
            } else {
              if (!stat.isFile() || ++files > 256 || stat.size > 32 * 1024 * 1024) return false;
              bytes += stat.size;
              if (bytes > 64 * 1024 * 1024 || matches(readFileSync(file))) return false;
            }
          }
          return true;
        };
        return { passed: visit(directory, 0), files, bytes };
      } catch {
        return { passed: false, files, bytes };
      }
    },
    ownedPids: () => [...children].flatMap((owned) => (owned.child.pid ? [owned.child.pid] : [])),
    stop,
  };
};

export const waitUntil = async (check: () => Promise<boolean> | boolean, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() >= deadline) throw Error('Expected lab milestone did not arrive.');
    await delay(20);
  }
};
