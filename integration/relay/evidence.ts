import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseReceipt, validateOrder, type VendorReceipt } from './contract.ts';
import { exchange, type VendorConnection } from './transport.ts';
import type { JobSnapshot, AuditEvent } from './state-types.ts';
import { controlRequest } from '../runtime.ts';

export type RunMetadata = {
  runId: string;
  mode: 'new' | 'resume';
  scripted: boolean;
  sourceSha: string;
  dirty: boolean;
  commands: string[];
  nodeVersion: string;
  pythonVersion: string;
  sqliteVersion: string;
  os: string;
  startedAt: string;
  finishedAt: string;
  timezone: string;
  elapsedMs: number;
  fixtureHashes: { northstar: string; orbit: string };
  credentialScanPassed: boolean;
  cleanupVerified: boolean;
};
export type VendorListReadback = {
  readAt: string;
  httpStatus: number | null;
  storeId: string | null;
  orders: VendorReceipt[];
  count: number | null;
  inspectionRequests: number;
  verification: 'verified' | 'unavailable' | 'invalid';
};
export type ScenarioResult = {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  reason: string;
  expectedCount: number;
  observedCount: number | null;
  exactPayload: boolean | null;
  postCount: number;
  automaticGetCount: number;
  elapsedMs: number;
  wirePostCount: number | null;
  wireGetCount: number | null;
  replayAcknowledgments: number | null;
};
export type RunEvidence = {
  schemaVersion: 1;
  metadata: RunMetadata;
  jobs: JobSnapshot[];
  events: AuditEvent[];
  vendorReadback: VendorListReadback;
  scenarioResults: ScenarioResult[];
};

export const readVendorList = async (connection: VendorConnection): Promise<VendorListReadback> => {
  const result: VendorListReadback = {
    readAt: new Date().toISOString(),
    httpStatus: null,
    storeId: null,
    orders: [],
    count: null,
    inspectionRequests: 1,
    verification: 'unavailable',
  };
  try {
    const response = await controlRequest(connection, '/v1/orders');
    result.httpStatus = response.status;
    if (response.status !== 200) return result;
    result.verification = 'invalid';
    const list = response.body;
    if (
      list.schemaVersion !== 1 ||
      list.storeId !== connection.storeId ||
      !Array.isArray(list.orders) ||
      !Number.isInteger(list.count) ||
      list.count !== list.orders.length ||
      list.orders.length > 100 ||
      Object.keys(list).length !== 4
    )
      return result;
    const receipts: VendorReceipt[] = [];
    const keys = new Set<string>();
    for (const value of list.orders) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
      const row = value as Record<string, unknown>;
      if (
        Object.keys(row).length !== 5 ||
        typeof row.idempotencyKey !== 'string' ||
        !/^[a-f0-9]{64}$/.test(row.idempotencyKey) ||
        keys.has(row.idempotencyKey)
      )
        return result;
      keys.add(row.idempotencyKey);
      result.inspectionRequests++;
      const read = await exchange(connection, {
        method: 'GET',
        path: '/v1/orders/' + row.idempotencyKey,
        requestId: randomUUID(),
        key: row.idempotencyKey,
      });
      if (
        read.kind !== 'response' ||
        read.status !== 200 ||
        !read.body ||
        typeof read.body !== 'object'
      )
        return result;
      const receipt = parseReceipt(
        read.body,
        validateOrder((read.body as Record<string, unknown>).order),
        connection.storeId,
      );
      for (const field of [
        'idempotencyKey',
        'businessKey',
        'payloadDigest',
        'vendorOrderId',
        'committedAt',
      ] as const)
        if (row[field] !== receipt[field]) return result;
      receipts.push(receipt);
    }
    return {
      ...result,
      storeId: connection.storeId,
      orders: receipts,
      count: receipts.length,
      verification: 'verified',
    };
  } catch {
    return result;
  }
};

const pick = <T extends object, K extends keyof T>(value: T, keys: readonly K[]): Pick<T, K> =>
  Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
const safeReceipt = (receipt: VendorReceipt | null) =>
  receipt === null
    ? null
    : {
        ...pick(receipt, [
          'schemaVersion',
          'vendorOrderId',
          'idempotencyKey',
          'businessKey',
          'payloadDigest',
          'committedAt',
          'storeId',
        ]),
        order: validateOrder(receipt.order),
        ...(receipt.replayed === undefined ? {} : { replayed: receipt.replayed }),
      };

export const buildEvidence = (input: Omit<RunEvidence, 'schemaVersion'>): RunEvidence => ({
  schemaVersion: 1,
  metadata: {
    ...pick(input.metadata, [
      'runId',
      'mode',
      'scripted',
      'sourceSha',
      'dirty',
      'nodeVersion',
      'pythonVersion',
      'sqliteVersion',
      'os',
      'startedAt',
      'finishedAt',
      'timezone',
      'elapsedMs',
      'credentialScanPassed',
      'cleanupVerified',
    ]),
    commands: [...input.metadata.commands],
    fixtureHashes: pick(input.metadata.fixtureHashes, ['northstar', 'orbit']),
  },
  jobs: input.jobs.map((job) => ({
    ...pick(job, [
      'jobId',
      'vendorStoreId',
      'approvalRevision',
      'approvalState',
      'approvalExpiresAt',
      'holdReason',
      'postReservations',
      'getReservations',
      'firstAdmissionAt',
      'deadlineAt',
      'nextAttemptAt',
      'leaseId',
      'leaseExpiresAt',
      'observed',
      'outcome',
    ]),
    order: validateOrder(job.order),
    identity: pick(job.identity, ['businessKey', 'canonical', 'payloadDigest', 'idempotencyKey']),
    claimedReceipt: safeReceipt(job.claimedReceipt),
    receipt: safeReceipt(job.receipt),
  })),
  events: input.events.map((event) =>
    pick(event, [
      'sequence',
      'jobId',
      'kind',
      'at',
      'approvalRevision',
      'attempt',
      'outcome',
      'httpStatus',
      'nextAttemptAt',
      'reason',
      'observed',
      'vendorOrderId',
      'requestId',
    ]),
  ),
  vendorReadback: {
    ...pick(input.vendorReadback, [
      'readAt',
      'httpStatus',
      'storeId',
      'count',
      'inspectionRequests',
      'verification',
    ]),
    orders: input.vendorReadback.orders.map((receipt) => safeReceipt(receipt)!),
  },
  scenarioResults: input.scenarioResults.map((result) =>
    pick(result, [
      'name',
      'status',
      'reason',
      'expectedCount',
      'observedCount',
      'exactPayload',
      'postCount',
      'automaticGetCount',
      'elapsedMs',
      'wirePostCount',
      'wireGetCount',
      'replayAcknowledgments',
    ]),
  ),
});

export const writeEvidence = (evidence: RunEvidence, directory: string): void => {
  if (!evidence.metadata.credentialScanPassed) throw Error('Evidence credential scan failed.');
  mkdirSync(directory, { recursive: true });
  const id = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  writeFileSync(join(directory, id + '.json'), JSON.stringify(evidence, null, 2) + '\n', {
    flag: 'wx',
  });
  const rows = evidence.scenarioResults
    .map(
      (result) =>
        `| ${result.name} | ${result.status} | ${result.expectedCount} | ${result.observedCount ?? 'unverified'} | ${result.postCount} | ${result.automaticGetCount} | ${result.reason} |`,
    )
    .join('\n');
  writeFileSync(
    join(directory, id + '.md'),
    `# Synthetic local run ${evidence.metadata.runId}\n\nSource: ${evidence.metadata.sourceSha}; dirty: ${evidence.metadata.dirty}.\n\nApproval source: ${evidence.metadata.scripted ? 'scripted harness' : 'local operator'}. No real vendor or model called.\n\n| Scenario | Result | Expected orders | Verified orders | Reserved POSTs | Automatic GETs | Explanation |\n| --- | --- | ---: | ---: | ---: | ---: | --- |\n${rows}\n\nVendor inspection requests: ${evidence.vendorReadback.inspectionRequests}. Total local workflow: ${evidence.metadata.elapsedMs} ms, including injected delays. Not a production performance benchmark.\n`,
    { flag: 'wx' },
  );
};
