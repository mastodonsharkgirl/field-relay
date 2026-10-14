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
  jobId?: string;
  checks?: Measurement[];
  eventSequences?: number[];
  finalState?: string;
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
export type Measurement = {
  name: string;
  expected: string | number | boolean | null;
  observed: string | number | boolean | null;
  mode: 'equal' | 'at-most' | 'at-least';
};
export const measurementPassed = (check: Measurement) =>
  check.mode === 'equal'
    ? check.observed === check.expected
    : typeof check.expected === 'number' &&
      typeof check.observed === 'number' &&
      Number.isFinite(check.expected) &&
      Number.isFinite(check.observed) &&
      (check.mode === 'at-most'
        ? check.observed <= check.expected
        : check.observed >= check.expected);
export type RunEvidence = {
  status: 'passed' | 'failed';
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

export const runPassed = (evidence: RunEvidence): boolean => {
  const read = evidence.vendorReadback;
  return (
    evidence.metadata.cleanupVerified &&
    evidence.metadata.credentialScanPassed &&
    evidence.scenarioResults.length > 0 &&
    evidence.scenarioResults.every(
      (row) => row.status === 'passed' && row.checks?.length && row.checks.every(measurementPassed),
    ) &&
    read.verification === 'verified' &&
    read.count === read.orders.length &&
    read.storeId !== null &&
    read.count === evidence.jobs.filter((job) => job.observed === 'present').length &&
    evidence.jobs.every((job) => {
      const receipt = read.orders.find(
        (order) => order.idempotencyKey === job.identity.idempotencyKey,
      );
      if (job.observed === 'absent') return receipt === undefined;
      if (job.observed !== 'present' || !job.receipt || !receipt) return false;
      return (
        receipt.vendorOrderId === job.receipt.vendorOrderId &&
        receipt.committedAt === job.receipt.committedAt &&
        receipt.storeId === job.vendorStoreId &&
        receipt.payloadDigest === job.identity.payloadDigest &&
        JSON.stringify(validateOrder(receipt.order)) === JSON.stringify(validateOrder(job.order))
      );
    })
  );
};

export const buildEvidence = (
  input: Omit<RunEvidence, 'schemaVersion' | 'status'>,
): RunEvidence => {
  const evidence: RunEvidence = {
    status: 'failed',
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
        'scheduledDelayMs',
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
    scenarioResults: input.scenarioResults.map((result) => ({
      ...pick(result, [
        'jobId',
        'eventSequences',
        'finalState',
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
      checks: (result.checks ?? []).map((check) =>
        pick(check, ['name', 'expected', 'observed', 'mode']),
      ),
      status:
        result.status === 'passed' &&
        (!result.checks?.length || !result.checks.every(measurementPassed))
          ? 'failed'
          : result.status,
    })),
  };
  evidence.status = runPassed(evidence) ? 'passed' : 'failed';
  return evidence;
};

export const renderEvidence = (evidence: RunEvidence) => {
  const retryRows = evidence.events
    .filter((event) => event.kind === 'retry_scheduled' || event.kind === 'retry_schedule_ignored')
    .map(
      (event) =>
        `| ${event.sequence} | ${event.jobId} | ${event.kind} | ${event.reason} | ${event.scheduledDelayMs ?? 'unrepresentable'} | ${event.nextAttemptAt ?? 'unrepresentable'} |`,
    )
    .join('\n');
  const retryTimeline = `\n## Persisted retry timeline\n\nDelay is derived from the saved decision time and due time. An ignored schedule is evidence of a proposal, not permission to retry.\n\n| Event | Job | Disposition | Reason | Delay ms | Due epoch ms |\n| --- | --- | --- | --- | ---: | ---: |\n${retryRows || '| — | — | No retry schedule recorded | — | — | — |'}\n`;
  const approvals = evidence.jobs
    .map((job) => {
      const history = evidence.events
        .filter((event) => event.jobId === job.jobId && event.kind === 'approved')
        .map(
          (event) =>
            `sequence ${event.sequence}, revision ${event.approvalRevision}, ${event.reason === 'operator' || event.reason === 'harness' ? event.reason : 'source unrecorded'}`,
        );
      return `- ${job.jobId}: ${history.join('; ') || 'no approval recorded'}`;
    })
    .join('\n');
  const rows = evidence.scenarioResults
    .map(
      (result) =>
        `| ${result.name} | ${result.status} | ${result.expectedCount} | ${result.observedCount ?? 'unverified'} | ${result.exactPayload ?? 'not applicable / unverified'} | ${result.postCount} | ${result.automaticGetCount} | ${result.elapsedMs} |`,
    )
    .join('\n');
  const details = evidence.scenarioResults
    .map(
      (row) =>
        `\n## ${row.name}\n\nJob: ${row.jobId ?? 'unavailable'}. Final relay state: ${row.finalState ?? 'unavailable'}. Relevant audit sequences: ${(row.eventSequences ?? []).join(', ')}.\n\nWire totals for this key: POST ${row.wirePostCount ?? 'unknown'}, GET ${row.wireGetCount ?? 'unknown'}, replay acknowledgments ${row.replayAcknowledgments ?? 'unknown'}. GET totals include evidence inspections; deltas and their components are checked below.\n\n| Measurement | Comparison | Expected | Observed | Result |\n| --- | --- | --- | --- | --- |\n${(row.checks ?? []).map((check) => `| ${check.name} | ${check.mode} | ${String(check.expected)} | ${String(check.observed)} | ${measurementPassed(check) ? 'passed' : 'failed'} |`).join('\n')}\n`,
    )
    .join('\n');
  const totals = ['passed', 'failed', 'skipped']
    .map(
      (status) =>
        `${status}: ${evidence.scenarioResults.filter((row) => row.status === status).length}`,
    )
    .join(', ');
  return {
    json: JSON.stringify(evidence, null, 2) + '\n',
    markdown: `# Synthetic local run ${evidence.metadata.runId}\n\nOverall result: ${evidence.status}. Scenarios ${totals}. Final supplier verification: ${evidence.vendorReadback.verification}; count: ${evidence.vendorReadback.count ?? 'unknown'}.\n\nSource: ${evidence.metadata.sourceSha}; dirty: ${evidence.metadata.dirty}.\n\nLauncher mode: ${evidence.metadata.scripted ? 'scripted' : 'interactive'}. No real vendor or model called.\n\nPersisted approvals: each source below comes from its saved approval event, independent of the current launcher mode.\n\n${approvals}\n\n| Scenario | Result | Expected orders | Verified orders | Exact payload | Reserved POSTs | Automatic GETs | Scenario ms |\n| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |\n${rows}\n\nVendor inspection requests: ${evidence.vendorReadback.inspectionRequests}. Total local workflow: ${evidence.metadata.elapsedMs} ms, including injected delays. Not a production performance benchmark.\n${details}${retryTimeline}`,
  };
};

export const writeEvidence = (evidence: RunEvidence, directory: string): void => {
  if (!evidence.metadata.credentialScanPassed) throw Error('Evidence credential scan failed.');
  mkdirSync(directory, { recursive: true });
  const id = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const rendered = renderEvidence(evidence);
  writeFileSync(join(directory, id + '.json'), rendered.json, { flag: 'wx' });
  writeFileSync(join(directory, id + '.md'), rendered.markdown, { flag: 'wx' });
};
