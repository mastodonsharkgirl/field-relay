import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* eslint-disable no-unused-vars -- Callable helper parameter names document its public contract. */
export type VendorProcess = {
  connection: { port: number; token: string; storeId: string };
  configure(key: string, scenario: string[]): Promise<ScenarioObservation>;
  observe(key: string): Promise<ScenarioObservation>;
  stop(): Promise<void>;
};
/* eslint-enable no-unused-vars */

export type ScenarioObservation = {
  phase: 'configured' | 'healthy';
  sequence: { post: number; get: number };
  requestCount: { post: number; get: number };
  requestIds: { post: string[]; get: string[] };
};

type Ready = { port: number; instanceId: string; storeId: string };
type AdminResponse = { status: number; body: unknown };

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
let pythonExecutable: Promise<string> | undefined;

const isReady = (value: unknown): value is Ready => {
  if (typeof value !== 'object' || value === null) return false;
  const ready = value as Record<string, unknown>;
  return (
    Number.isInteger(ready.port) &&
    typeof ready.instanceId === 'string' &&
    typeof ready.storeId === 'string'
  );
};

const isObservation = (value: unknown): value is ScenarioObservation => {
  if (typeof value !== 'object' || value === null) return false;
  const observed = value as Record<string, unknown>;
  const sequence = observed.sequence as Record<string, unknown> | undefined;
  const requestCount = observed.requestCount as Record<string, unknown> | undefined;
  const requestIds = observed.requestIds as Record<string, unknown> | undefined;
  return (
    (observed.phase === 'configured' || observed.phase === 'healthy') &&
    typeof sequence === 'object' &&
    sequence !== null &&
    Number.isInteger(sequence.post) &&
    Number.isInteger(sequence.get) &&
    typeof requestCount === 'object' &&
    requestCount !== null &&
    Number.isInteger(requestCount.post) &&
    Number.isInteger(requestCount.get) &&
    typeof requestIds === 'object' &&
    requestIds !== null &&
    ['post', 'get'].every(
      (route) =>
        Array.isArray(requestIds[route]) &&
        (requestIds[route] as unknown[]).every(
          (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id),
        ),
    )
  );
};

const redact = (value: string, tokens: string[]) => {
  let result = value;
  for (const token of tokens) result = result.replaceAll(token, '[redacted]');
  return result;
};

const run = (command: string, args: string[]) =>
  new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });

const resolvePython = () => {
  if (!pythonExecutable) {
    pythonExecutable = run('py', ['-3.14', '-c', 'import sys; print(sys.executable)']).then(
      ({ code, stdout, stderr }) => {
        const executable = stdout.trim();
        if (code !== 0 || !executable) {
          throw Error('Python 3.14 resolution failed: ' + stderr.trim());
        }
        return executable;
      },
    );
  }
  return pythonExecutable;
};

const waitForReady = (child: ChildProcess, tokens: string[]) =>
  new Promise<Ready>((resolve, reject) => {
    if (!child.stdout) {
      reject(Error('vendor child has no stdout pipe'));
      return;
    }
    let stdout = '';
    let stderr = '';
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    child.stdout.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    const cleanup = () => {
      if (timeout) globalThis.clearTimeout(timeout);
      child.stdout?.off('data', onStdout);
      child.stderr?.off('data', onStderr);
      child.off('exit', onExit);
      child.off('error', onError);
    };
    const fail = (message: string) => {
      cleanup();
      reject(Error(redact(message + (stderr ? '\nchild stderr: ' + stderr : ''), tokens)));
    };
    const onStdout = (chunk: unknown) => {
      stdout += String(chunk);
      const newline = stdout.indexOf('\n');
      if (newline < 0) return;
      let ready: unknown;
      try {
        ready = JSON.parse(stdout.slice(0, newline));
      } catch {
        fail('vendor child emitted invalid readiness JSON');
        return;
      }
      if (!isReady(ready)) {
        fail('vendor child emitted invalid readiness data');
        return;
      }
      cleanup();
      resolve(ready);
    };
    const onStderr = (chunk: unknown) => {
      stderr += String(chunk);
    };
    const onExit = (code: number | null, signal: string | null) => {
      fail(
        'vendor child exited before readiness (code ' +
          String(code) +
          ', signal ' +
          String(signal) +
          ')',
      );
    };
    const onError = () => fail('vendor child failed before readiness');
    child.stdout.on('data', onStdout);
    child.stderr?.on('data', onStderr);
    child.once('exit', onExit);
    child.once('error', onError);
    // Test infrastructure can start slowly on shared runners; relay deadlines are unchanged.
    timeout = globalThis.setTimeout(() => fail('vendor child did not become ready'), 15_000);
  });

const waitForExit = (child: ChildProcess, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = globalThis.setTimeout(() => {
      child.off('exit', onExit);
      reject(Error('owned vendor child did not exit in time'));
    }, timeoutMs);
    const onExit = () => {
      globalThis.clearTimeout(timer);
      resolve();
    };
    child.once('exit', onExit);
  });

const vendorEnvironment = (
  token: string,
  adminToken: string,
): Record<string, string | undefined> => {
  const environment: Record<string, string | undefined> = {};
  for (const key of ['PATH', 'SystemRoot', 'SYSTEMROOT', 'WINDIR', 'ComSpec', 'TEMP', 'TMP']) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  environment.PYTHONPATH = projectRoot;
  environment.FIELD_RELAY_VENDOR_TOKEN = token;
  environment.FIELD_RELAY_VENDOR_ADMIN_TOKEN = adminToken;
  return environment;
};

export const startVendor = async (): Promise<VendorProcess> => {
  const python = await resolvePython();
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'field-relay-vendor-'));
  const stateDirectory = join(temporaryRoot, 'state');
  const token = randomBytes(24).toString('hex');
  const adminToken = randomBytes(24).toString('hex');
  const child = spawn(
    python,
    ['-m', 'integration.vendor.server', '--state-dir', stateDirectory, '--mode', 'new'],
    {
      cwd: projectRoot,
      env: vendorEnvironment(token, adminToken),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        try {
          await waitForExit(child, 5_000);
        } catch {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
          await waitForExit(child, 5_000);
        }
      }
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  };
  let ready: Ready;
  try {
    ready = await waitForReady(child, [token, adminToken]);
  } catch (error) {
    await stop();
    throw error;
  }
  const adminRequest = async (payload: Record<string, unknown>): Promise<AdminResponse> => {
    const response = await globalThis.fetch(
      'http://127.0.0.1:' + String(ready.port) + '/__lab/scenarios',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + adminToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: globalThis.AbortSignal.timeout(10_000),
      },
    );
    const body = JSON.parse(await response.text()) as unknown;
    return { status: response.status, body };
  };
  const requestObservation = async (payload: Record<string, unknown>) => {
    const response = await adminRequest(payload);
    if (response.status !== 200 || !isObservation(response.body)) {
      throw Error('vendor scenario request was rejected');
    }
    return response.body;
  };
  return {
    connection: { port: ready.port, token, storeId: ready.storeId },
    configure: (key, scenario) =>
      requestObservation({ action: 'configure', idempotencyKey: key, scenario }),
    observe: (key) => requestObservation({ action: 'observe', idempotencyKey: key }),
    stop,
  };
};

// eslint-disable-next-line no-unused-vars -- Callable test helper shape.
export const withVendor = async <T>(runWithVendor: (vendor: VendorProcess) => Promise<T>) => {
  const vendor = await startVendor();
  try {
    return await runWithVendor(vendor);
  } finally {
    await vendor.stop();
  }
};
