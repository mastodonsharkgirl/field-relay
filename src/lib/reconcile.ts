import { parseCsvRows } from './core';

export type FieldMap = { baseline: string; candidate: string; label: string };
export type ReconciliationMapping = {
  baselineId: string;
  candidateId: string;
  fields: FieldMap[];
};
export type SourceRow = {
  row: number;
  raw: string;
  cells: string[];
  values: Record<string, string>;
};
export type Change = { label: string; baseline: string; candidate: string };
export type ComparisonStatus =
  'unchanged' | 'changed' | 'baseline-only' | 'candidate-only' | 'ambiguous' | 'blank-id';
export type ComparisonItem = {
  id: string;
  key: string;
  status: ComparisonStatus;
  baseline: SourceRow[];
  candidate: SourceRow[];
  changes: Change[];
  reason: string;
};
export type ComparisonStats = {
  baselineRows: number;
  candidateRows: number;
  comparedGroups: number;
  unchanged: number;
  changed: number;
  baselineOnly: number;
  candidateOnly: number;
  ambiguousRows: number;
  blankIdRows: number;
};
export type ReconciliationReport = {
  blocked: string[];
  baseline: { fingerprint: string; headers: string[]; rows: SourceRow[] };
  candidate: { fingerprint: string; headers: string[]; rows: SourceRow[] };
  mapping: ReconciliationMapping;
  trimOuterWhitespace: boolean;
  revision: string;
  items: ComparisonItem[];
  stats: ComparisonStats;
};

export type ReviewDecision = {
  disposition: 'hold' | 'accept-candidate' | 'ignore';
  reason: string;
  revision: string;
};

export const canAcceptCandidate = (item: ComparisonItem) =>
  item.status === 'changed' && item.baseline.length === 1 && item.candidate.length === 1;

export const isValidReviewDecision = (
  item: ComparisonItem,
  decision: ReviewDecision,
  revision?: string,
) =>
  Boolean(
    decision.reason.trim() &&
    (!revision || decision.revision === revision) &&
    (decision.disposition !== 'accept-candidate' || canAcceptCandidate(item)),
  );

export const validReviewDecisions = (
  items: ComparisonItem[],
  decisions: Record<string, ReviewDecision>,
  revision?: string,
) =>
  Object.fromEntries(
    items.flatMap((item) => {
      const decision = decisions[item.id];
      return decision && isValidReviewDecision(item, decision, revision)
        ? [[item.id, decision]]
        : [];
    }),
  );

/**
 * Build the portable review pack without copying the full comparison binding into
 * every saved decision. `revision` is intentionally kept in memory for exact
 * invalidation; downloaded decisions refer to the one shared comparison record.
 */
export const buildReviewPack = ({
  report,
  baseline,
  candidate,
  baselineFileName,
  candidateFileName,
  decisions,
}: {
  report: ReconciliationReport;
  baseline: string;
  candidate: string;
  baselineFileName?: string;
  candidateFileName?: string;
  decisions: Record<string, ReviewDecision>;
}) => {
  const eligibleDecisions = validReviewDecisions(report.items, decisions, report.revision);
  const reportEvidence: Omit<ReconciliationReport, 'revision'> = {
    blocked: report.blocked,
    baseline: report.baseline,
    candidate: report.candidate,
    mapping: report.mapping,
    trimOuterWhitespace: report.trimOuterWhitespace,
    items: report.items,
    stats: report.stats,
  };
  const comparisonReference = 'comparison-1';
  const exportedDecisions = Object.fromEntries(
    Object.entries(eligibleDecisions).map(([findingId, decision]) => [
      findingId,
      {
        disposition: decision.disposition,
        reason: decision.reason,
        comparisonReference,
      },
    ]),
  );
  return {
    version: 'field-relay-reconciliation-review/v2',
    comparison: {
      reference: comparisonReference,
      inputs: {
        baseline: {
          fileName: baselineFileName || 'pasted-baseline.csv',
          content: baseline,
          diagnosticFingerprint: report.baseline.fingerprint,
        },
        candidate: {
          fileName: candidateFileName || 'pasted-candidate.csv',
          content: candidate,
          diagnosticFingerprint: report.candidate.fingerprint,
        },
      },
      mapping: report.mapping,
      trimOuterWhitespace: report.trimOuterWhitespace,
      binding:
        'Exact input content, mapping, and whitespace setting above define this comparison reference.',
    },
    report: reportEvidence,
    decisions: exportedDecisions,
  };
};

type Request = {
  baseline: string;
  candidate: string;
  mapping: ReconciliationMapping;
  trimOuterWhitespace: boolean;
};

const fingerprint = (text: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${text.length}`;
};
const blankStats = (): ComparisonStats => ({
  baselineRows: 0,
  candidateRows: 0,
  comparedGroups: 0,
  unchanged: 0,
  changed: 0,
  baselineOnly: 0,
  candidateOnly: 0,
  ambiguousRows: 0,
  blankIdRows: 0,
});
const emptySource = (text: string) => ({
  fingerprint: fingerprint(text),
  headers: [],
  rows: [] as SourceRow[],
});
const safeCell = (value: string) => (/^[\s]*[=+\-@]/.test(value) ? `'${value}` : value);

const source = (text: string, name: 'Baseline' | 'Candidate') => {
  try {
    const parsed = parseCsvRows(text);
    if (!parsed.length)
      return { source: emptySource(text), errors: [`${name} export needs a header row.`] };
    const header = parsed[0].cells;
    if (!header.some((item) => item.length))
      return { source: emptySource(text), errors: [`${name} export needs a header row.`] };
    if (new Set(header).size !== header.length)
      return { source: emptySource(text), errors: [`${name} export has duplicate header names.`] };
    const rows = parsed.slice(1).map((item) => ({
      row: item.row,
      raw: item.raw,
      cells: item.cells,
      values: Object.fromEntries(header.map((field, index) => [field, item.cells[index] ?? ''])),
    }));
    const errors: string[] = [];
    if (!rows.length) errors.push(`${name} export has a header but no data records.`);
    for (const record of rows)
      if (record.cells.length !== header.length)
        errors.push(
          `${name} source record ${record.row} has ${record.cells.length} cells; the header has ${header.length}.`,
        );
    return { source: { fingerprint: fingerprint(text), headers: header, rows }, errors };
  } catch (error) {
    return {
      source: emptySource(text),
      errors: [
        error instanceof Error
          ? `${name} export: ${error.message}`
          : `${name} export could not be read.`,
      ],
    };
  }
};

const blankItem = (
  side: 'baseline' | 'candidate',
  record: SourceRow,
  ordinal: number,
): ComparisonItem => ({
  id: `${side}-blank-${record.row}-${ordinal}`,
  key: '(blank ID)',
  status: 'blank-id',
  baseline: side === 'baseline' ? [record] : [],
  candidate: side === 'candidate' ? [record] : [],
  changes: [],
  reason: `${side === 'baseline' ? 'Baseline' : 'Candidate'} row has no business ID and cannot be matched.`,
});

export const compareExports = ({
  baseline,
  candidate,
  mapping,
  trimOuterWhitespace,
}: Request): ReconciliationReport => {
  const baselineSource = source(baseline, 'Baseline');
  const candidateSource = source(candidate, 'Candidate');
  const blocked = [...baselineSource.errors, ...candidateSource.errors];
  const baselineHeaders = baselineSource.source.headers;
  const candidateHeaders = candidateSource.source.headers;
  if (!mapping.baselineId) blocked.push('Choose a Baseline business ID column.');
  else if (!baselineHeaders.includes(mapping.baselineId))
    blocked.push(`Baseline ID column is not present: ${mapping.baselineId}`);
  if (!mapping.candidateId) blocked.push('Choose a Candidate business ID column.');
  else if (!candidateHeaders.includes(mapping.candidateId))
    blocked.push(`Candidate ID column is not present: ${mapping.candidateId}`);
  if (!mapping.fields.length) blocked.push('Choose at least one mapped field to compare.');
  const baselineFieldNames = mapping.fields.map((field) => field.baseline).filter(Boolean);
  const candidateFieldNames = mapping.fields.map((field) => field.candidate).filter(Boolean);
  const fieldLabels = mapping.fields.map((field) => field.label.trim()).filter(Boolean);
  if (new Set(baselineFieldNames).size !== baselineFieldNames.length)
    blocked.push('Each Baseline comparison column can be mapped only once.');
  if (new Set(candidateFieldNames).size !== candidateFieldNames.length)
    blocked.push('Each Candidate comparison column can be mapped only once.');
  if (new Set(fieldLabels).size !== fieldLabels.length)
    blocked.push('Each comparison label must be unique.');
  for (const field of mapping.fields) {
    if (!field.baseline || !baselineHeaders.includes(field.baseline))
      blocked.push(`Baseline comparison field is not present: ${field.baseline || '(blank)'}`);
    if (!field.candidate || !candidateHeaders.includes(field.candidate))
      blocked.push(`Candidate comparison field is not present: ${field.candidate || '(blank)'}`);
  }
  // Exact source and mapping text controls review invalidation. FNV values are diagnostic
  // labels only; a 32-bit hash is not an identity or integrity guarantee.
  const revision = JSON.stringify({ baseline, candidate, mapping, trimOuterWhitespace });
  if (blocked.length)
    return {
      blocked,
      baseline: baselineSource.source,
      candidate: candidateSource.source,
      mapping,
      trimOuterWhitespace,
      revision,
      items: [],
      stats: blankStats(),
    };

  const normalize = (value: string) => (trimOuterWhitespace ? value.trim() : value);
  const baselineByKey = new Map<string, SourceRow[]>();
  const candidateByKey = new Map<string, SourceRow[]>();
  const blankItems: ComparisonItem[] = [];
  const group = (
    records: SourceRow[],
    id: string,
    side: 'baseline' | 'candidate',
    target: Map<string, SourceRow[]>,
  ) => {
    records.forEach((record, ordinal) => {
      const value = record.values[id] ?? '';
      const key = normalize(value);
      if (!key) blankItems.push(blankItem(side, record, ordinal));
      else target.set(key, [...(target.get(key) ?? []), record]);
    });
  };
  group(baselineSource.source.rows, mapping.baselineId, 'baseline', baselineByKey);
  group(candidateSource.source.rows, mapping.candidateId, 'candidate', candidateByKey);
  const keys = [...new Set([...baselineByKey.keys(), ...candidateByKey.keys()])].sort((a, b) =>
    a.localeCompare(b),
  );
  const items = keys.map((key) => {
    const baselineRows = baselineByKey.get(key) ?? [];
    const candidateRows = candidateByKey.get(key) ?? [];
    // Structural state identities keep distinct findings independent even when diagnostic
    // FNV labels collide.
    const id = `finding:${JSON.stringify({
      key,
      baselineLines: baselineRows.map((row) => row.row),
      candidateLines: candidateRows.map((row) => row.row),
    })}`;
    if (baselineRows.length > 1 || candidateRows.length > 1)
      return {
        id,
        key,
        status: 'ambiguous' as const,
        baseline: baselineRows,
        candidate: candidateRows,
        changes: [],
        reason: 'Duplicate business ID. No row was chosen automatically.',
      };
    if (!baselineRows.length)
      return {
        id,
        key,
        status: 'candidate-only' as const,
        baseline: [],
        candidate: candidateRows,
        changes: [],
        reason: 'Present only in Candidate export.',
      };
    if (!candidateRows.length)
      return {
        id,
        key,
        status: 'baseline-only' as const,
        baseline: baselineRows,
        candidate: [],
        changes: [],
        reason: 'Present only in Baseline export.',
      };
    const changes = mapping.fields.flatMap((field) => {
      const before = baselineRows[0].values[field.baseline] ?? '';
      const after = candidateRows[0].values[field.candidate] ?? '';
      return normalize(before) === normalize(after)
        ? []
        : [
            {
              label: field.label || `${field.baseline} → ${field.candidate}`,
              baseline: before,
              candidate: after,
            },
          ];
    });
    return {
      id,
      key,
      status: changes.length ? ('changed' as const) : ('unchanged' as const),
      baseline: baselineRows,
      candidate: candidateRows,
      changes,
      reason: changes.length
        ? `${changes.length} mapped value${changes.length === 1 ? '' : 's'} changed.`
        : 'Mapped values are unchanged.',
    };
  });
  const all = [...items, ...blankItems];
  if (new Set(all.map((item) => item.id)).size !== all.length)
    return {
      blocked: [
        'Comparison created duplicate finding identities. Change the mapping and validate again.',
      ],
      baseline: baselineSource.source,
      candidate: candidateSource.source,
      mapping,
      trimOuterWhitespace,
      revision,
      items: [],
      stats: blankStats(),
    };
  const stats = blankStats();
  stats.baselineRows = baselineSource.source.rows.length;
  stats.candidateRows = candidateSource.source.rows.length;
  stats.comparedGroups = keys.length;
  for (const item of all) {
    if (item.status === 'unchanged') stats.unchanged++;
    if (item.status === 'changed') stats.changed++;
    if (item.status === 'baseline-only') stats.baselineOnly++;
    if (item.status === 'candidate-only') stats.candidateOnly++;
    if (item.status === 'ambiguous')
      stats.ambiguousRows += item.baseline.length + item.candidate.length;
    if (item.status === 'blank-id')
      stats.blankIdRows += item.baseline.length + item.candidate.length;
  }
  return {
    blocked,
    baseline: baselineSource.source,
    candidate: candidateSource.source,
    mapping,
    trimOuterWhitespace,
    revision,
    items: all,
    stats,
  };
};

export const safeReconciliationCsv = (
  items: ComparisonItem[],
  decisions: Record<string, ReviewDecision> = {},
  revision?: string,
) => {
  const eligibleDecisions = validReviewDecisions(items, decisions, revision);
  const rows = [
    [
      'status',
      'business_id',
      'reason',
      'changed_fields',
      'baseline_csv_lines',
      'candidate_csv_lines',
      'baseline_cells',
      'candidate_cells',
      'disposition',
      'reviewer_note',
    ],
  ];
  for (const item of items) {
    const decision = eligibleDecisions[item.id];
    rows.push([
      item.status,
      item.key,
      item.reason,
      item.changes
        .map((change) => `${change.label}: ${change.baseline} → ${change.candidate}`)
        .join(' | '),
      item.baseline.map((record) => String(record.row)).join(', '),
      item.candidate.map((record) => String(record.row)).join(', '),
      item.baseline.map((record) => record.cells.join(' | ')).join(' || '),
      item.candidate.map((record) => record.cells.join(' | ')).join(' || '),
      decision?.disposition ?? '',
      decision?.reason ?? '',
    ]);
  }
  return rows
    .map((row) => row.map((cell) => `"${safeCell(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
};
