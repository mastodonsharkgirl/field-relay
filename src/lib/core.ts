export type Mapping = { order: string; region: string; quantity: string; amount: string };
export type Record = {
  key: string;
  fingerprint: string;
  orderId: string;
  region: string;
  quantity: number;
  amountMinor: number;
  source: string;
  cells: string[];
  row: number;
  route: string;
  reason: string;
  approval: 'approved' | 'pending';
};
export type Quarantine = {
  code: string;
  reason: string;
  source: string;
  row: number;
  cells?: string[];
};
export type Ledger = {
  key: string;
  fingerprint: string;
  status: 'failed' | 'delivered' | 'skipped' | 'held';
  attempt: number;
  detail: string;
};
export type Registry = {
  [key: string]: { fingerprint: string; status: 'failed' | 'delivered'; attempt: number };
};
export type Run = {
  accepted: Record[];
  quarantine: Quarantine[];
  suppressed: Record[];
  errors: string[];
};
const regions = new Set(['North', 'South', 'East', 'West', 'Central']),
  max = 500000;
type Row = { cells: string[]; raw: string; row: number };
const read = (text: string): Row[] => {
  if (new TextEncoder().encode(text).length > max)
    throw Error('Input exceeds the 500 KB local limit.');
  const out: Row[] = [];
  let cells: string[] = [],
    cell = '',
    raw = '',
    row = 1,
    rowStart = 1,
    q = false,
    closed = false,
    start = false;
  const end = () => {
    cells.push(cell);
    if (cells.some(Boolean)) out.push({ cells, raw, row: rowStart });
    cells = [];
    cell = '';
    raw = '';
    q = closed = start = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    raw += c;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          raw += text[++i];
        } else {
          q = false;
          closed = true;
        }
      } else {
        cell += c;
        if (c === '\n') row++;
        else if (c === '\r' && text[i + 1] !== '\n') row++;
      }
      continue;
    }
    if (c === '"') {
      if (start || cell) throw Error(`Unexpected quote at source row ${row}.`);
      q = true;
      start = true;
      continue;
    }
    if (closed && c !== ',' && c !== '\r' && c !== '\n')
      throw Error(`Characters after closing quote at source row ${row}.`);
    if (c === ',') {
      cells.push(cell);
      cell = '';
      closed = start = false;
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') raw += text[++i];
      end();
      row++;
      rowStart = row;
    } else {
      cell += c;
      start = true;
    }
  }
  if (q) throw Error(`Unclosed quoted field at source row ${row}.`);
  if (raw || cells.length || cell) end();
  if (out.length > 5000) throw Error('Input exceeds the 5,000 row local limit.');
  return out;
};
export const parseCsv = (text: string) => read(text).map((x) => x.cells);
const minor = (v: string) => {
  const value = v.trim();
  return /^\d{1,9}(\.\d{1,2})?$/.test(value) && Number(value) > 0
    ? Math.round(Number(value) * 100)
    : null;
};
const decision = (region: string, amount: number): [string, string, 'approved' | 'pending'] =>
  region === 'Central' || amount >= 50000
    ? ['Manual review', 'Central region or orders at or above 500.00 require approval.', 'pending']
    : region === 'North'
      ? ['North hub', 'North region rule.', 'approved']
      : region === 'South'
        ? ['South cross-dock', 'South region rule.', 'approved']
        : region === 'East'
          ? ['East consolidation', 'East region rule.', 'approved']
          : ['West fulfilment', 'West region rule.', 'approved'];
export const ingest = (
  text: string,
  partner: string,
  map: Mapping = { order: 'Order ID', region: 'Region', quantity: 'Quantity', amount: 'Amount' },
): Run => {
  let t: Row[];
  try {
    t = read(text);
  } catch (e) {
    return {
      accepted: [],
      quarantine: [],
      suppressed: [],
      errors: [e instanceof Error ? e.message : 'CSV could not be parsed.'],
    };
  }
  const h = t.shift();
  if (!h)
    return {
      accepted: [],
      quarantine: [],
      suppressed: [],
      errors: ['CSV must contain a header row.'],
    };
  if (new Set(Object.values(map)).size !== 4)
    return {
      accepted: [],
      quarantine: [],
      suppressed: [],
      errors: ['Mapped columns must be four distinct selections.'],
    };
  if (new Set(h.cells).size !== h.cells.length)
    return {
      accepted: [],
      quarantine: [],
      suppressed: [],
      errors: ['Duplicate header names are ambiguous; rename a column before mapping.'],
    };
  const pos = (x: string) => h.cells.indexOf(x),
    missing = Object.values(map).filter((x) => pos(x) < 0);
  if (missing.length)
    return {
      accepted: [],
      quarantine: [],
      suppressed: [],
      errors: [`Missing mapped columns: ${missing.join(', ')}`],
    };
  const grouped = new Map<string, { rows: Row[]; valids: Record[]; issues: Quarantine[] }>();
  for (const x of t) {
    const id = x.cells[pos(map.order)]?.trim() ?? '',
      key = id ? JSON.stringify([partner, id]) : `row:${x.row}`,
      e = grouped.get(key) ?? { rows: [], valids: [], issues: [] };
    e.rows.push(x);
    const region = x.cells[pos(map.region)]?.trim() ?? '',
      quantityText = x.cells[pos(map.quantity)]?.trim() ?? '',
      quantity = /^\d+$/.test(quantityText) ? Number(quantityText) : Number.NaN,
      amount = minor(x.cells[pos(map.amount)] ?? '');
    let issue: Quarantine | undefined;
    if (!id)
      issue = {
        code: 'SCHEMA',
        reason: 'Order ID is required.',
        source: x.raw,
        row: x.row,
        cells: x.cells,
      };
    else if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000)
      issue = {
        code: 'QUANTITY',
        reason: 'Quantity must be a whole number from 1 to 10,000.',
        source: x.raw,
        row: x.row,
        cells: x.cells,
      };
    else if (amount === null)
      issue = {
        code: 'AMOUNT',
        reason: 'Amount must be a positive decimal with two places.',
        source: x.raw,
        row: x.row,
        cells: x.cells,
      };
    else if (!regions.has(region))
      issue = {
        code: 'REGION',
        reason: 'Region is not configured.',
        source: x.raw,
        row: x.row,
        cells: x.cells,
      };
    if (issue) e.issues.push(issue);
    else {
      const safeAmount = amount as number;
      const [route, reason, approval] = decision(region, safeAmount);
      e.valids.push({
        key,
        fingerprint: `${id}|${region}|${quantity}|${amount}`,
        orderId: id,
        region,
        quantity,
        amountMinor: safeAmount,
        source: x.raw,
        cells: x.cells,
        row: x.row,
        route,
        reason,
        approval,
      });
    }
    grouped.set(key, e);
  }
  const accepted: Record[] = [],
    quarantine: Quarantine[] = [],
    suppressed: Record[] = [];
  for (const e of grouped.values()) {
    if (
      e.rows.length > 1 &&
      (e.issues.length || new Set(e.rows.map((x) => JSON.stringify(x.cells))).size > 1)
    ) {
      quarantine.push(
        ...e.rows.map((x) => ({
          code: 'CONFLICT',
          reason:
            'Every row with this business key is held because variants conflict or one is invalid.',
          source: x.raw,
          row: x.row,
          cells: x.cells,
        })),
      );
      continue;
    }
    if (e.issues.length) {
      quarantine.push(...e.issues);
      continue;
    }
    if (e.valids.length) {
      accepted.push(e.valids[0]);
      suppressed.push(...e.valids.slice(1));
    }
  }
  return { accepted, quarantine, suppressed, errors: [] };
};
export const approve = (r: Record[], key: string, yes: boolean): Record[] =>
  r.map((x) =>
    x.key === key
      ? {
          ...x,
          approval: yes ? 'approved' : 'pending',
          reason: yes ? `${x.reason} Approved for local simulation.` : 'Blocked by reviewer.',
        }
      : x,
  );
export const simulateDelivery = (
  records: Record[],
  ledger: Ledger[],
  outage: boolean,
  registry: Registry = {},
) => {
  const next = [...ledger];
  const nextRegistry: Registry = { ...registry };
  for (const event of ledger)
    if (event.status === 'failed' || event.status === 'delivered')
      nextRegistry[event.key] = {
        fingerprint: event.fingerprint,
        status: event.status,
        attempt: event.attempt,
      };
  for (const r of records) {
    if (r.approval === 'pending') {
      next.push({
        key: r.key,
        fingerprint: r.fingerprint,
        status: 'held',
        attempt: 0,
        detail: 'Manual review is pending.',
      });
      continue;
    }
    const prior = nextRegistry[r.key];
    if (prior && (prior.fingerprint !== r.fingerprint || prior.status === 'delivered')) {
      next.push({
        key: r.key,
        fingerprint: r.fingerprint,
        status: prior.fingerprint === r.fingerprint ? 'skipped' : 'held',
        attempt: 0,
        detail:
          prior.fingerprint === r.fingerprint
            ? 'Already delivered; replay is idempotent.'
            : prior.status === 'failed'
              ? 'Payload changed after a failed attempt; held for investigation.'
              : 'Payload changed after success; held for investigation.',
      });
      continue;
    }
    const event: Ledger = {
      key: r.key,
      fingerprint: r.fingerprint,
      status: outage ? 'failed' : 'delivered',
      attempt: prior ? prior.attempt + 1 : 1,
      detail: outage
        ? 'Injected endpoint outage. Retry keeps the same fingerprint.'
        : `Simulated route: ${r.route}.`,
    };
    next.push(event);
    nextRegistry[r.key] = {
      fingerprint: r.fingerprint,
      status: event.status as 'failed' | 'delivered',
      attempt: event.attempt,
    };
  }
  return { ledger: next.slice(-500), registry: nextRegistry };
};
export const safeCsv = (items: Quarantine[]) =>
  [
    'row,code,reason,source',
    ...items.map((x) =>
      [x.row, x.code, x.reason, x.source]
        .map((v) => {
          const s = String(v),
            safe = /^[\s]*[=+\-@]/.test(s) ? `'${s}` : s;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(','),
    ),
  ].join('\r\n');
