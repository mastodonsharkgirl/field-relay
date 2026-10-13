import assert from 'node:assert/strict';
import test from 'node:test';

import { isRetryableStatus, retryDecision } from '../relay/retry.ts';

test('retry policy limits full jitter to the documented exponential caps', () => {
  const caps = [
    [1, 250],
    [2, 500],
    [3, 1_000],
    [4, 2_000],
    [5, 2_000],
    [30, 2_000],
  ];
  for (const [attempt, cap] of caps) {
    const low = retryDecision({
      attempt,
      now: 1_000,
      deadlineAt: 40_000,
      retryAfter: null,
      random: 0,
    });
    const high = retryDecision({
      attempt,
      now: 1_000,
      deadlineAt: 40_000,
      retryAfter: null,
      random: 1,
    });
    assert.equal(low.kind, 'retry');
    assert.equal(high.kind, 'retry');
    if (low.kind !== 'retry' || high.kind !== 'retry') throw Error('expected retry decisions');
    assert.equal(low.nextAttemptAt, 1_000);
    assert.equal(high.nextAttemptAt, 1_000 + cap);
  }
});

test('retry policy recognizes every retryable status and rejects permanent write statuses', () => {
  for (const status of [408, 429, 502, 503, 504]) assert.equal(isRetryableStatus(status), true);
  for (const status of [400, 401, 403, 404, 409, 413, 415, 422, 500, 501]) {
    assert.equal(isRetryableStatus(status), false);
  }
});

test('Retry-After accepts zero, longer integer seconds, and a valid HTTP date', () => {
  const zero = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 40_000,
    retryAfter: '0',
    random: 0.5,
  });
  const seconds = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 40_000,
    retryAfter: '2',
    random: 0,
  });
  const date = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 40_000,
    retryAfter: 'Thu, 01 Jan 1970 00:00:31 GMT',
    random: 0,
  });
  assert.equal(zero.kind, 'retry');
  assert.equal(seconds.kind, 'retry');
  assert.equal(date.kind, 'retry');
  if (zero.kind !== 'retry' || seconds.kind !== 'retry' || date.kind !== 'retry') {
    throw Error('expected retry decisions');
  }
  assert.equal(zero.nextAttemptAt, 1_125);
  assert.equal(seconds.nextAttemptAt, 3_000);
  assert.equal(date.nextAttemptAt, 31_000);
});

test('malformed Retry-After falls back to local jitter without evading the deadline', () => {
  const malformed = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 40_000,
    retryAfter: 'tomorrow morning',
    random: 0.5,
  });
  assert.equal(malformed.kind, 'retry');
  if (malformed.kind !== 'retry') throw Error('expected a fallback retry');
  assert.equal(malformed.nextAttemptAt, 1_125);
});

test('Retry-After beyond the deadline is never shortened', () => {
  const next = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 31_000,
    retryAfter: '60',
    random: 0,
  });
  assert.deepEqual(next, {
    kind: 'deferred_outside_deadline',
    nextAttemptAt: 61_000,
    reason: 'retry_after_beyond_deadline',
  });
});

test('unrepresentable Retry-After remains a durable null-due deferral', () => {
  const next = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 31_000,
    retryAfter: '999999999999999999999999999999999999999999999999999999999999999999',
    random: 0,
  });
  assert.deepEqual(next, {
    kind: 'deferred_outside_deadline',
    nextAttemptAt: null,
    reason: 'retry_after_unrepresentable',
  });
});

test('an overlong but valid integer Retry-After remains a null-due deferral', () => {
  const next = retryDecision({
    attempt: 1,
    now: 1_000,
    deadlineAt: 31_000,
    retryAfter: '9'.repeat(129),
    random: 0,
  });
  assert.deepEqual(next, {
    kind: 'deferred_outside_deadline',
    nextAttemptAt: null,
    reason: 'retry_after_unrepresentable',
  });
});
