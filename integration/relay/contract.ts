import { createHash } from 'node:crypto';

export type Order = {
  schemaVersion: 1;
  partner: 'northstar' | 'orbit';
  orderId: string;
  region: 'North' | 'South' | 'East' | 'West' | 'Central';
  quantity: number;
  amountMinor: number;
};

export type OrderIdentity = {
  businessKey: string;
  canonical: string;
  payloadDigest: string;
  idempotencyKey: string;
};

export type VendorReceipt = Omit<OrderIdentity, 'canonical'> & {
  schemaVersion: 1;
  vendorOrderId: string;
  order: Order;
  committedAt: string;
  storeId: string;
  replayed?: boolean;
};

const partners = new Set(['northstar', 'orbit']);
const regions = new Set(['North', 'South', 'East', 'West', 'Central']);
const orderId = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

export const validateOrder = (value: unknown): Order => {
  const keys = ['schemaVersion', 'partner', 'orderId', 'region', 'quantity', 'amountMinor'];
  if (!isObject(value) || !exactKeys(value, keys))
    throw Error('Order must contain only the required schema fields.');
  const { schemaVersion, partner, orderId: id, region, quantity, amountMinor } = value;
  if (schemaVersion !== 1) throw Error('schemaVersion must be 1.');
  if (typeof partner !== 'string' || !partners.has(partner))
    throw Error('partner is not allowlisted.');
  if (typeof id !== 'string' || !orderId.test(id)) throw Error('orderId has invalid syntax.');
  if (typeof region !== 'string' || !regions.has(region)) throw Error('region is not configured.');
  if (
    typeof quantity !== 'number' ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > 10000
  )
    throw Error('quantity must be an integer from 1 to 10,000.');
  if (
    typeof amountMinor !== 'number' ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    amountMinor > 99999999999
  )
    throw Error('amountMinor must be an integer from 1 to 99,999,999,999.');
  return {
    schemaVersion,
    partner: partner as Order['partner'],
    orderId: id,
    region: region as Order['region'],
    quantity,
    amountMinor,
  };
};

export const identify = (order: Order): OrderIdentity => {
  const businessKey = JSON.stringify([order.partner, order.orderId]);
  const canonical = JSON.stringify([
    1,
    order.partner,
    order.orderId,
    order.region,
    order.quantity,
    order.amountMinor,
  ]);
  return {
    businessKey,
    canonical,
    payloadDigest: sha256(canonical),
    idempotencyKey: sha256(JSON.stringify(['field-relay-mock-v1', order.partner, order.orderId])),
  };
};

export const parseReceipt = (value: unknown, expected: Order, storeId: string): VendorReceipt => {
  const keys = [
    'schemaVersion',
    'vendorOrderId',
    'idempotencyKey',
    'businessKey',
    'payloadDigest',
    'order',
    'committedAt',
    'storeId',
  ];
  if (
    !isObject(value) ||
    !exactKeys(value, Object.hasOwn(value, 'replayed') ? [...keys, 'replayed'] : keys)
  )
    throw Error('Receipt has unexpected fields.');
  const receipt = value as Record<string, unknown>;
  if (
    receipt.schemaVersion !== 1 ||
    typeof receipt.vendorOrderId !== 'string' ||
    !orderId.test(receipt.vendorOrderId)
  )
    throw Error('Receipt vendorOrderId is invalid.');
  if (typeof receipt.storeId !== 'string' || receipt.storeId !== storeId)
    throw Error('Receipt storeId does not match.');
  if (typeof receipt.committedAt !== 'string' || Number.isNaN(Date.parse(receipt.committedAt)))
    throw Error('Receipt committedAt is invalid.');
  if (Object.hasOwn(receipt, 'replayed') && typeof receipt.replayed !== 'boolean')
    throw Error('Receipt replayed is invalid.');
  const order = validateOrder(receipt.order);
  const identity = identify(expected);
  if (JSON.stringify(order) !== JSON.stringify(expected))
    throw Error('Receipt order does not match expected order.');
  for (const key of ['businessKey', 'payloadDigest', 'idempotencyKey'] as const)
    if (receipt[key] !== identity[key])
      throw Error(`Receipt ${key} does not match expected identity.`);
  return receipt as VendorReceipt;
};
