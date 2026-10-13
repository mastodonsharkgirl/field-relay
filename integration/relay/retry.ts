export type RetryDecision =
  | {
      kind: 'retry';
      nextAttemptAt: number;
      reason: 'full_jitter' | 'retry_after' | 'malformed_retry_after_fallback';
    }
  | {
      kind: 'deferred_outside_deadline';
      nextAttemptAt: number | null;
      reason:
        'retry_after_beyond_deadline' | 'retry_after_unrepresentable' | 'backoff_beyond_deadline';
    };

const retryableStatuses = new Set([408, 429, 502, 503, 504]);
const integerSeconds = /^\d+$/;
const imfFixdate =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const maxRetryAfterLength = 128;

type RetryAfter =
  { kind: 'valid'; dueAt: number } | { kind: 'invalid' } | { kind: 'unrepresentable' };

const parseRetryAfter = (value: string, now: number): RetryAfter => {
  if (integerSeconds.test(value)) {
    const seconds = value.replace(/^0+/, '') || '0';
    if (seconds.length > maxRetryAfterLength) return { kind: 'unrepresentable' };
    const due = BigInt(now) + BigInt(seconds) * 1_000n;
    if (due > BigInt(Number.MAX_SAFE_INTEGER)) return { kind: 'unrepresentable' };
    return { kind: 'valid', dueAt: Number(due) };
  }
  if (value.length > maxRetryAfterLength) return { kind: 'invalid' };
  if (!imfFixdate.test(value)) return { kind: 'invalid' };
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toUTCString() !== value) {
    return { kind: 'invalid' };
  }
  return { kind: 'valid', dueAt: Math.max(now, parsed) };
};

const localDelay = (attempt: number, random: number) => {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw Error('retry attempt must be a positive safe integer');
  }
  if (!Number.isFinite(random) || random < 0 || random > 1) {
    throw Error('retry random must be within [0,1]');
  }
  const cap = Math.min(2_000, 250 * 2 ** Math.min(attempt - 1, 3));
  return Math.floor(cap * random);
};

export const isRetryableStatus = (status: number) => retryableStatuses.has(status);

export const retryDecision = (input: {
  attempt: number;
  now: number;
  deadlineAt: number;
  retryAfter: string | null;
  random: number;
}): RetryDecision => {
  const { attempt, now, deadlineAt, retryAfter, random } = input;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(deadlineAt)) {
    throw Error('retry timestamps must be safe integers');
  }
  const fallbackDueAt = now + localDelay(attempt, random);
  let dueAt = fallbackDueAt;
  let reason: RetryDecision['reason'] = 'full_jitter';
  if (retryAfter !== null) {
    const parsed = parseRetryAfter(retryAfter, now);
    if (parsed.kind === 'unrepresentable') {
      return {
        kind: 'deferred_outside_deadline',
        nextAttemptAt: null,
        reason: 'retry_after_unrepresentable',
      };
    }
    if (parsed.kind === 'valid' && parsed.dueAt > dueAt) {
      dueAt = parsed.dueAt;
      reason = 'retry_after';
    } else if (parsed.kind === 'invalid') {
      reason = 'malformed_retry_after_fallback';
    }
  }
  if (dueAt >= deadlineAt) {
    return {
      kind: 'deferred_outside_deadline',
      nextAttemptAt: dueAt,
      reason: reason === 'retry_after' ? 'retry_after_beyond_deadline' : 'backoff_beyond_deadline',
    };
  }
  return { kind: 'retry', nextAttemptAt: dueAt, reason };
};
