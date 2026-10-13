import { readFileSync } from 'node:fs';
import { ingest, type Run } from '../../src/lib/core.ts';
import { validateOrder, type Order } from './contract.ts';

const fixtures = {
  northstar: new URL('../fixtures/northstar.csv', import.meta.url),
  orbit: new URL('../fixtures/orbit.csv', import.meta.url),
} as const;

export const assertFixtureHasOrders = (run: Run) => {
  if (run.errors.length || !run.accepted.length)
    throw Error('Fixture must contain at least one accepted record.');
  return run;
};

export const loadFixture = (name: 'northstar' | 'orbit') => {
  if (!Object.hasOwn(fixtures, name)) throw Error('Fixture name is not allowlisted.');
  const run = assertFixtureHasOrders(ingest(readFileSync(fixtures[name], 'utf8'), name));
  const orders: Order[] = run.accepted.map((record) =>
    validateOrder({
      schemaVersion: 1,
      partner: name,
      orderId: record.orderId,
      region: record.region,
      quantity: record.quantity,
      amountMinor: record.amountMinor,
    }),
  );
  return { orders, quarantineCount: run.quarantine.length, suppressedCount: run.suppressed.length };
};
