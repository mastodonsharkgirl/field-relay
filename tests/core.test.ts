import { describe, expect, test } from 'vitest';
import { ingest, parseCsv, safeCsv, simulateDelivery } from '../src/lib/core';

const standard =
  'Order ID,Region,Quantity,Amount\nA-1,North,2,12.50\nA-1,North,2,12.50\nA-2,South,2,12.50\nA-2,North,2,12.50\nA-3,West,0,10.00\nA-4,Unknown,1,5.00';
describe('Field Relay core', () => {
  test('parses quoted CRLF cells and escaped quotes', () =>
    expect(parseCsv('a,b\r\n"x, y","he said ""yes"""')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "yes"'],
    ]));
  test('suppresses exact duplicate and quarantines every conflicting business key record', () => {
    const run = ingest(standard, 'northstar');
    expect(run.accepted).toHaveLength(1);
    expect(run.suppressed).toHaveLength(1);
    expect(run.quarantine.filter((x) => x.code === 'CONFLICT')).toHaveLength(2);
    expect(run.quarantine.some((x) => x.code === 'QUANTITY')).toBe(true);
    expect(run.quarantine.some((x) => x.code === 'REGION')).toBe(true);
  });
  test('keeps a successful stable delivery out of replay and retries an outage with same key', () => {
    const run = ingest('Order ID,Region,Quantity,Amount\nB-1,North,1,10.00', 'northstar');
    const failed = simulateDelivery(run.accepted, [], true);
    expect(failed.ledger[0].status).toBe('failed');
    const retry = simulateDelivery(run.accepted, failed.ledger, false);
    expect(retry.ledger.at(-1)?.status).toBe('delivered');
    const replay = simulateDelivery(run.accepted, retry.ledger, false);
    expect(replay.ledger.filter((x) => x.status === 'delivered')).toHaveLength(1);
  });
  test('holds invalid variants of a known business key and routes by region with approval', () => {
    const run = ingest(
      'id,area,qty,value\nK-1,South,1,10.00\nK-1,South,0,10.00\nK-2,Central,1,600.00',
      'partner',
      { order: 'id', region: 'area', quantity: 'qty', amount: 'value' },
    );
    expect(run.quarantine.filter((x) => x.code === 'CONFLICT')).toHaveLength(2);
    expect(run.accepted[0]?.route).toBe('Manual review');
    expect(run.accepted[0]?.approval).toBe('pending');
  });
  test('holds a changed payload after a delivered key and protects whitespace formula cells', () => {
    const original = ingest('Order ID,Region,Quantity,Amount\nR-1,East,1,10.00', 'p');
    const delivered = simulateDelivery(original.accepted, [], false).ledger;
    const changed = ingest('Order ID,Region,Quantity,Amount\nR-1,East,2,10.00', 'p');
    expect(simulateDelivery(changed.accepted, delivered, false).ledger.at(-1)?.status).toBe('held');
    expect(safeCsv([{ row: 2, code: 'SCHEMA', reason: 'bad', source: ' \t=SUM(1)' }])).toContain(
      "' ",
    );
  });
  test('keeps idempotency registry beyond bounded ledger and binds a failed attempt fingerprint', () => {
    const record = ingest('Order ID,Region,Quantity,Amount\nL-1,North,1,1.00', 'p').accepted;
    let state = simulateDelivery(record, [], false);
    for (let i = 0; i < 501; i++)
      state = simulateDelivery(record, state.ledger, false, state.registry);
    expect(
      simulateDelivery(record, state.ledger, false, state.registry).ledger.at(-1)?.status,
    ).toBe('skipped');
    const failed = simulateDelivery(record, [], true);
    const changed = ingest('Order ID,Region,Quantity,Amount\nL-1,North,2,1.00', 'p').accepted;
    expect(
      simulateDelivery(changed, failed.ledger, false, failed.registry).ledger.at(-1)?.status,
    ).toBe('held');
  });
  test('rejects ambiguous mapping, strict quantity syntax, and retains physical duplicate rows', () => {
    expect(
      ingest('id,id,qty,value\nA,A,1,1.00', 'p', {
        order: 'id',
        region: 'id',
        quantity: 'qty',
        amount: 'value',
      }).errors[0],
    ).toMatch(/distinct|ambiguous/i);
    expect(
      ingest('Order ID,Region,Quantity,Amount\nA,North,1e3,1.00', 'p').quarantine[0]?.code,
    ).toBe('QUANTITY');
    const run = ingest(
      'Order ID,Region,Quantity,Amount\nA,North,1,1.00\n\nA,North,1,1.00\nB,East,1,1.00',
      'p',
    );
    expect(run.suppressed[0]?.row).toBe(4);
    expect(run.accepted.find((x) => x.orderId === 'B')?.row).toBe(5);
  });
});
