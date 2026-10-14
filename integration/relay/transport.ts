import { identify, validateOrder, type Order } from './contract.ts';

export type VendorConnection = { port: number; token: string; storeId: string };

export type HttpResult =
  | {
      kind: 'response';
      status: number;
      body: unknown;
      retryAfter: string | null;
      elapsedMs: number;
    }
  | { kind: 'timeout'; httpStatus: number | null; retryAfter: string | null; elapsedMs: number }
  | {
      kind: 'network_error';
      httpStatus: number | null;
      retryAfter: string | null;
      elapsedMs: number;
    }
  | {
      kind: 'protocol_error';
      reason:
        | 'invalid_connection'
        | 'invalid_request'
        | 'redirect_refused'
        | 'invalid_content_type'
        | 'invalid_json'
        | 'response_too_large';
      httpStatus: number | null;
      retryAfter: string | null;
      elapsedMs: number;
    };

export type VendorRequest = {
  method: 'GET' | 'POST';
  path: string;
  requestId: string;
  order?: Order;
  key?: string;
};

const timeoutMs = 750;
const maxResponseBytes = 64 * 1024;
const maxRequestBytes = 16 * 1024;
const maxRetryAfterLength = 128;
const requestIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
const keyPattern = /^[a-f0-9]{64}$/;
type FetchBody = Awaited<ReturnType<typeof globalThis.fetch>>['body'];
const unrepresentableRetryAfter = '9'.repeat(maxRetryAfterLength);

class ProtocolError extends Error {
  readonly reason: 'invalid_content_type' | 'invalid_json' | 'response_too_large';

  constructor(reason: 'invalid_content_type' | 'invalid_json' | 'response_too_large') {
    super(reason);
    this.reason = reason;
  }
}

const elapsed = (startedAt: number) => Math.round(globalThis.performance.now() - startedAt);

const validConnection = (connection: VendorConnection) =>
  Number.isInteger(connection.port) &&
  connection.port > 0 &&
  connection.port <= 65_535 &&
  typeof connection.token === 'string' &&
  connection.token.length > 0 &&
  connection.token.length <= 1_024 &&
  !/[\r\n]/.test(connection.token) &&
  typeof connection.storeId === 'string' &&
  connection.storeId.length > 0 &&
  connection.storeId.length <= 256;

const encodeRequest = (
  request: VendorRequest,
): { headers: Record<string, string>; body?: string } | null => {
  if (!requestIdPattern.test(request.requestId)) return null;
  if (request.method === 'GET') {
    if (
      typeof request.key !== 'string' ||
      !keyPattern.test(request.key) ||
      request.path !== '/v1/orders/' + request.key ||
      request.order !== undefined
    ) {
      return null;
    }
    return { headers: { 'X-Request-Id': request.requestId } };
  }
  if (
    request.path !== '/v1/orders' ||
    typeof request.key !== 'string' ||
    !keyPattern.test(request.key) ||
    request.order === undefined
  ) {
    return null;
  }
  let order: Order;
  try {
    order = validateOrder(request.order);
  } catch {
    return null;
  }
  if (identify(order).idempotencyKey !== request.key) return null;
  const body = JSON.stringify(order);
  if (Buffer.byteLength(body, 'utf8') > maxRequestBytes) return null;
  return {
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': request.key,
      'X-Request-Id': request.requestId,
    },
    body,
  };
};

const readBoundedJson = async (body: FetchBody): Promise<unknown> => {
  if (body === null) throw new ProtocolError('invalid_json');
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ProtocolError('response_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new ProtocolError('invalid_json');
  }
};

const boundedRetryAfter = (header: string | null) => {
  if (header === null || header.length <= maxRetryAfterLength) return header;
  if (!/^\d+$/.test(header)) return null;
  const seconds = header.replace(/^0+/, '') || '0';
  return seconds.length > maxRetryAfterLength ? unrepresentableRetryAfter : seconds;
};

export const exchange = async (
  connection: VendorConnection,
  request: VendorRequest,
): Promise<HttpResult> => {
  const startedAt = globalThis.performance.now();
  const invalid = (reason: 'invalid_connection' | 'invalid_request'): HttpResult => ({
    kind: 'protocol_error',
    reason,
    httpStatus: null,
    retryAfter: null,
    elapsedMs: elapsed(startedAt),
  });
  if (!validConnection(connection)) return invalid('invalid_connection');
  const encoded = encodeRequest(request);
  if (!encoded) return invalid('invalid_request');

  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  let metadata: { httpStatus: number | null; retryAfter: string | null } = {
    httpStatus: null,
    retryAfter: null,
  };
  try {
    const headers = new globalThis.Headers(encoded.headers);
    headers.set('Authorization', 'Bearer ' + connection.token);
    headers.set('Cache-Control', 'no-store');
    const response = await globalThis.fetch(
      'http://127.0.0.1:' + String(connection.port) + request.path,
      {
        method: request.method,
        headers,
        body: encoded.body,
        signal: controller.signal,
        redirect: 'manual',
        cache: 'no-store',
      },
    );
    metadata = {
      httpStatus: response.status,
      retryAfter: boundedRetryAfter(response.headers.get('retry-after')),
    };
    if (response.status >= 300 && response.status < 400) {
      return {
        kind: 'protocol_error',
        reason: 'redirect_refused',
        ...metadata,
        elapsedMs: elapsed(startedAt),
      };
    }
    const contentType = response.headers.get('content-type');
    if (contentType?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return {
        kind: 'protocol_error',
        reason: 'invalid_content_type',
        ...metadata,
        elapsedMs: elapsed(startedAt),
      };
    }
    let body: unknown;
    try {
      body = await readBoundedJson(response.body);
    } catch (error) {
      if (error instanceof ProtocolError) {
        return {
          kind: 'protocol_error',
          reason: error.reason,
          ...metadata,
          elapsedMs: elapsed(startedAt),
        };
      }
      throw error;
    }
    return {
      kind: 'response',
      status: response.status,
      body,
      retryAfter: metadata.retryAfter,
      elapsedMs: elapsed(startedAt),
    };
  } catch (error) {
    if (error instanceof ProtocolError) {
      return {
        kind: 'protocol_error',
        reason: error.reason,
        ...metadata,
        elapsedMs: elapsed(startedAt),
      };
    }
    if (controller.signal.aborted)
      return { kind: 'timeout', ...metadata, elapsedMs: elapsed(startedAt) };
    return { kind: 'network_error', ...metadata, elapsedMs: elapsed(startedAt) };
  } finally {
    globalThis.clearTimeout(timer);
  }
};
