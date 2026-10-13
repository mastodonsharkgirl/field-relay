import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { identify, parseReceipt, validateOrder } from '../relay/contract.ts';
import { assertFixtureHasOrders, loadFixture } from '../relay/intake.ts';
import { ingest } from '../../src/lib/core.ts';

type Vector = {
  order: Record<string, unknown>;
  businessKey: string;
  canonical: string;
  payloadDigest: string;
  idempotencyKey: string;
};

const vectors = JSON.parse(
  readFileSync(new URL('../fixtures/contract-vectors.json', import.meta.url), 'utf8'),
) as Vector[];
const valid = vectors[0]!.order;

test('shared vectors pin the compact cross-language identity', () => {
  for (const vector of vectors) {
    assert.deepEqual(identify(validateOrder(vector.order)), {
      businessKey: vector.businessKey,
      canonical: vector.canonical,
      payloadDigest: vector.payloadDigest,
      idempotencyKey: vector.idempotencyKey,
    });
  }
  const python = JSON.parse(
    execFileSync(
      'py',
      [
        '-3.14',
        '-c',
        [
          'import json',
          'from integration.vendor.contract import identify, validate_order',
          "vectors=json.load(open('integration/fixtures/contract-vectors.json', encoding='utf-8'))",
          "print(json.dumps([identify(validate_order(v['order'])) for v in vectors], separators=(',', ':')))",
        ].join(';'),
      ],
      { encoding: 'utf8' },
    ),
  );
  assert.deepEqual(
    python,
    vectors.map((vector) => ({
      businessKey: vector.businessKey,
      canonical: vector.canonical,
      payloadDigest: vector.payloadDigest,
      idempotencyKey: vector.idempotencyKey,
    })),
  );
});

test('identity preserves a leading-zero ID and binds changed content', () => {
  const order = validateOrder(valid);
  const first = identify(order);
  const changed = identify({ ...order, quantity: 4 });
  assert.equal(first.canonical, '[1,"northstar","0007","North",3,4250]');
  assert.equal(changed.idempotencyKey, first.idempotencyKey);
  assert.notEqual(changed.payloadDigest, first.payloadDigest);
  assert.notEqual(identify({ ...order, orderId: '7' }).idempotencyKey, first.idempotencyKey);
});

test('order validation permits only the exact wire schema and bounds', () => {
  const fields = ['schemaVersion', 'partner', 'orderId', 'region', 'quantity', 'amountMinor'];
  for (const field of fields) {
    const missing = { ...valid };
    delete missing[field];
    assert.throws(() => validateOrder(missing));
  }
  assert.deepEqual(validateOrder({ ...valid, quantity: 1, amountMinor: 1 }), {
    ...valid,
    quantity: 1,
    amountMinor: 1,
  });
  assert.deepEqual(validateOrder({ ...valid, quantity: 10000, amountMinor: 99999999999 }), {
    ...valid,
    quantity: 10000,
    amountMinor: 99999999999,
  });
  for (const candidate of [
    { ...valid, extra: 'no' },
    { ...valid, schemaVersion: '1' },
    { ...valid, partner: 1 },
    { ...valid, orderId: 7 },
    { ...valid, region: {} },
    { ...valid, quantity: '3' },
    { ...valid, amountMinor: '4250' },
    { ...valid, schemaVersion: 2 },
    { ...valid, partner: 'other' },
    { ...valid, orderId: '' },
    { ...valid, orderId: '-bad' },
    { ...valid, orderId: 'a'.repeat(65) },
    { ...valid, orderId: 'é' },
    { ...valid, region: 'north' },
    { ...valid, quantity: 0 },
    { ...valid, quantity: 10001 },
    { ...valid, amountMinor: 0 },
    { ...valid, amountMinor: 100000000000 },
    { ...valid, quantity: true },
    { ...valid, amountMinor: false },
    { ...valid, quantity: 1.5 },
    { ...valid, amountMinor: 1.5 },
    { ...valid, quantity: Number.NaN },
    { ...valid, amountMinor: Infinity },
  ])
    assert.throws(() => validateOrder(candidate));
});

test('receipt parsing binds every identity field and rejects unsafe substitutions', () => {
  const order = validateOrder(valid);
  const identity = identify(order);
  const receiptIdentity = {
    businessKey: identity.businessKey,
    payloadDigest: identity.payloadDigest,
    idempotencyKey: identity.idempotencyKey,
  };
  const receipt = {
    schemaVersion: 1,
    vendorOrderId: 'vendor-0007',
    ...receiptIdentity,
    order,
    committedAt: '2026-10-13T00:00:00.000Z',
    storeId: 'store-1',
    replayed: true,
  };
  assert.deepEqual(parseReceipt(receipt, order, 'store-1'), receipt);
  const expectedWithDifferentInsertionOrder = {
    amountMinor: order.amountMinor,
    region: order.region,
    partner: order.partner,
    quantity: order.quantity,
    orderId: order.orderId,
    schemaVersion: order.schemaVersion,
  } as typeof order;
  const getReceipt = {
    schemaVersion: receipt.schemaVersion,
    vendorOrderId: receipt.vendorOrderId,
    ...receiptIdentity,
    order: receipt.order,
    committedAt: receipt.committedAt,
    storeId: receipt.storeId,
  };
  assert.deepEqual(
    parseReceipt(getReceipt, expectedWithDifferentInsertionOrder, 'store-1'),
    getReceipt,
  );
  for (const unsafe of [
    { ...receipt, vendorOrderId: '' },
    { ...receipt, storeId: 'store-2' },
    { ...receipt, businessKey: identify({ ...order, orderId: '7' }).businessKey },
    { ...receipt, payloadDigest: '0'.repeat(64) },
    { ...receipt, idempotencyKey: '0'.repeat(64) },
    { ...receipt, order: { ...order, quantity: 4 } },
    { ...receipt, committedAt: 'not-a-date' },
    { ...receipt, replayed: 'yes' },
    { ...receipt, extra: true },
  ])
    assert.throws(() => parseReceipt(unsafe, order, 'store-1'));
});

test('fixture intake reuses accepted, quarantined, and suppressed existing records', () => {
  const northstar = loadFixture('northstar');
  assert.deepEqual(
    northstar.orders.map((order) => order.orderId),
    ['0007'],
  );
  assert.equal(northstar.quarantineCount, 3);
  assert.equal(northstar.suppressedCount, 1);
  assert.equal(loadFixture('orbit').orders.length, 2);
  assert.throws(() => loadFixture('unknown' as never));
  assert.throws(() => assertFixtureHasOrders(ingest('', 'northstar')));
  assert.throws(() =>
    assertFixtureHasOrders(ingest('Order ID,Region,Quantity,Amount\n', 'northstar')),
  );
});
