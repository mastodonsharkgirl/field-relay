import { describe, expect, test } from 'vitest';
import {
  buildReviewPack,
  compareExports,
  safeReconciliationCsv,
  validReviewDecisions,
} from '../src/lib/reconcile';

const baseline = `order_no,sku,qty,total,status,note
00100,WIDGET-A,2,1250.00,confirmed,"Deliver to reception,
second floor"
00101,WIDGET-B,1,800.00,pending,Awaiting decision
00102,WIDGET-C,1,450.00,confirmed,First version
00102,WIDGET-C,2,900.00,confirmed,Conflicting version
00103,WIDGET-D,3,330.00,confirmed,Missing from candidate
0007,WIDGET-E,1,75.00,confirmed,Keep leading zeroes
=2+2,WIDGET-F,1,10.00,confirmed,Literal ID - never execute
,WIDGET-G,1,30.00,pending,Blank ID`;
const candidate = `external_id,item,units,amount,state,comment
00104,WIDGET-H,1,100.00,confirmed,Only in candidate
00100,WIDGET-A,2,1250.00,confirmed,"Deliver to reception,
second floor"
00101,WIDGET-B,1,820.00,confirmed,Approved by someone else
00102,WIDGET-C,1,450.00,confirmed,Does not resolve baseline conflict
0007,WIDGET-E,1,75.00,confirmed,Keep leading zeroes
7,WIDGET-E,1,75.00,confirmed,Different literal ID
=2+2,WIDGET-F,1,10.00,confirmed,Literal ID - never execute
,WIDGET-G,1,30.00,pending,Blank ID`;
const mapping = {
  baselineId: 'order_no',
  candidateId: 'external_id',
  fields: [
    { baseline: 'qty', candidate: 'units', label: 'Quantity' },
    { baseline: 'total', candidate: 'amount', label: 'Amount' },
    { baseline: 'status', candidate: 'state', label: 'Status' },
  ],
};

describe('export reconciliation', () => {
  test('keeps literal identifiers and classifies mapped source evidence', () => {
    const report = compareExports({ baseline, candidate, mapping, trimOuterWhitespace: false });
    expect(report.blocked).toEqual([]);
    expect(report.stats).toMatchObject({ baselineRows: 8, candidateRows: 8, comparedGroups: 8 });
    expect(report.items.find((item) => item.key === '00100')?.status).toBe('unchanged');
    expect(report.items.find((item) => item.key === '00101')?.changes).toEqual([
      { label: 'Amount', baseline: '800.00', candidate: '820.00' },
      { label: 'Status', baseline: 'pending', candidate: 'confirmed' },
    ]);
    expect(report.items.find((item) => item.key === '0007')?.status).toBe('unchanged');
    expect(report.items.find((item) => item.key === '7')?.status).toBe('candidate-only');
    expect(report.items.find((item) => item.key === '00102')?.status).toBe('ambiguous');
    expect(report.items.filter((item) => item.status === 'blank-id')).toHaveLength(2);
  });

  test('blocks missing mappings instead of reporting a clean comparison', () => {
    const report = compareExports({
      baseline,
      candidate,
      mapping: { ...mapping, candidateId: 'missing' },
      trimOuterWhitespace: false,
    });
    expect(report.blocked).toContain('Candidate ID column is not present: missing');
    expect(report.items).toEqual([]);
  });

  test('blocks header-only exports and mismatched record widths with source-row evidence', () => {
    const narrowed = {
      ...mapping,
      baselineId: 'order_no',
      fields: [{ baseline: 'qty', candidate: 'units', label: 'Quantity' }],
    };
    const headerOnly = compareExports({
      baseline: 'order_no,qty',
      candidate,
      mapping: narrowed,
      trimOuterWhitespace: false,
    });
    expect(headerOnly.blocked).toContain('Baseline export has a header but no data records.');
    const uneven = compareExports({
      baseline: 'order_no,qty\n001,1,unexpected',
      candidate,
      mapping: narrowed,
      trimOuterWhitespace: false,
    });
    expect(uneven.blocked).toContain('Baseline source record 2 has 3 cells; the header has 2.');
  });

  test('blocks duplicate comparison columns or labels instead of double-counting a difference', () => {
    const report = compareExports({
      baseline,
      candidate,
      mapping: {
        ...mapping,
        fields: [
          { baseline: 'qty', candidate: 'units', label: 'Quantity' },
          { baseline: 'qty', candidate: 'amount', label: 'Quantity' },
        ],
      },
      trimOuterWhitespace: false,
    });
    expect(report.blocked).toContain('Each Baseline comparison column can be mapped only once.');
    expect(report.blocked).toContain('Each comparison label must be unique.');
  });

  test('keeps crafted FNV-collision keys as independent review identities', () => {
    const collisionMapping = {
      baselineId: 'id',
      candidateId: 'id',
      fields: [{ baseline: 'value', candidate: 'value', label: 'Value' }],
    };
    const collisionBaseline = 'id,value\nA2c7j,old-a\nB11x7,old-b';
    const collisionCandidate = 'id,value\nA2c7j,new-a\nB11x7,new-b';
    const report = compareExports({
      baseline: collisionBaseline,
      candidate: collisionCandidate,
      mapping: collisionMapping,
      trimOuterWhitespace: false,
    });
    const a = report.items.find((item) => item.key === 'A2c7j')!;
    const b = report.items.find((item) => item.key === 'B11x7')!;
    expect(a.id).not.toBe(b.id);
    const decisions = {
      [a.id]: { disposition: 'hold' as const, reason: 'A only', revision: report.revision },
      [b.id]: { disposition: 'ignore' as const, reason: 'B only', revision: report.revision },
    };
    expect(validReviewDecisions(report.items, decisions, report.revision)).toEqual(decisions);
    const csv = safeReconciliationCsv(report.items, decisions, report.revision);
    expect(csv.match(/A only/g)).toHaveLength(1);
    expect(csv.match(/B only/g)).toHaveLength(1);
  });

  test('exports one shared exact comparison binding instead of copying source text into decisions', () => {
    const report = compareExports({ baseline, candidate, mapping, trimOuterWhitespace: false });
    const changed = report.items.find((item) => item.key === '00101')!;
    const pack = buildReviewPack({
      report,
      baseline,
      candidate,
      baselineFileName: 'baseline.csv',
      candidateFileName: 'candidate.csv',
      decisions: {
        [changed.id]: {
          disposition: 'hold',
          reason: 'Confirm with the partner.',
          revision: report.revision,
        },
      },
    });
    const decision = pack.decisions[changed.id] as {
      comparisonReference: string;
      reason: string;
    };
    expect(pack.comparison.inputs.baseline.content).toBe(baseline);
    expect(pack.comparison.inputs.candidate.content).toBe(candidate);
    expect(pack.report).not.toHaveProperty('revision');
    expect(decision).toEqual({
      disposition: 'hold',
      reason: 'Confirm with the partner.',
      comparisonReference: 'comparison-1',
    });
    expect(pack.comparison.inputs.baseline.content).toBe(baseline);
    expect(JSON.stringify(pack.decisions)).not.toContain(baseline);
  });

  test('rejects candidate acceptance without one candidate row in core exports', () => {
    const report = compareExports({ baseline, candidate, mapping, trimOuterWhitespace: false });
    const missingCandidate = report.items.find((item) => item.key === '00103');
    expect(missingCandidate?.status).toBe('baseline-only');
    const invalid = {
      [missingCandidate!.id]: {
        disposition: 'accept-candidate' as const,
        reason: 'There is no candidate row.',
        revision: report.revision,
      },
    };
    expect(validReviewDecisions(report.items, invalid, report.revision)).toEqual({});
    expect(safeReconciliationCsv(report.items, invalid, report.revision)).not.toContain(
      'accept-candidate',
    );
  });

  test('exports formula-like evidence as inert CSV cells', () => {
    const report = compareExports({ baseline, candidate, mapping, trimOuterWhitespace: false });
    const target = report.items.find((item) => item.key === '00101');
    expect(
      safeReconciliationCsv(report.items, {
        [target!.id]: { disposition: 'hold', reason: '=do not execute', revision: report.revision },
      }),
    ).toContain("'=do not execute");
    expect(safeReconciliationCsv(report.items)).toContain("'=2+2");
  });
});
