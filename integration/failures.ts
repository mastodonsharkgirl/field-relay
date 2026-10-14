import type { ProcessResult } from './runtime.ts';

const messages = {
  relay_startup_timeout: 'The relay did not become ready within the bounded startup window.',
  relay_child_failed:
    'The relay worker exited unsuccessfully; inspect the saved run before retrying.',
  relay_state_busy: 'The relay database was busy; no automatic restart or resend was attempted.',
  relay_state_unavailable:
    'The relay state could not be opened or validated; existing files were preserved.',
  relay_milestone_missing: 'The relay finished without the expected supplier milestone.',
  milestone_timeout: 'The expected supplier milestone did not arrive within its bounded window.',
  control_timeout: 'A local supplier control request exceeded its transport deadline.',
  exercise_failed: 'The exercise did not complete; inspect saved state before retrying.',
} as const;
export type FailureCode = keyof typeof messages;
export type FailureDetails = { code: FailureCode; workerExitCode: number | null };
export const normalizeFailure = (input: unknown): FailureDetails => {
  const value = input as { code?: unknown; workerExitCode?: unknown } | null;
  return {
    code:
      typeof value?.code === 'string' && Object.hasOwn(messages, value.code)
        ? (value.code as FailureCode)
        : 'exercise_failed',
    workerExitCode:
      typeof value?.workerExitCode === 'number' &&
      Number.isInteger(value.workerExitCode) &&
      Math.abs(value.workerExitCode) <= 2_147_483_648
        ? value.workerExitCode
        : null,
  };
};
export class LabFailure extends Error {
  readonly code: FailureCode;
  readonly workerExitCode: number | null;
  constructor(code: FailureCode, workerExitCode: number | null = null) {
    super(messages[code]);
    this.code = code;
    this.workerExitCode = workerExitCode;
  }
}
export const safeFailure = (error: unknown): FailureDetails => {
  if (error instanceof LabFailure)
    return { code: error.code, workerExitCode: error.workerExitCode };
  const value = error as {
    code?: unknown;
    errcode?: unknown;
    name?: unknown;
    message?: unknown;
  } | null;
  if (value?.message === 'relay database has an unknown schema version')
    return { code: 'relay_state_unavailable', workerExitCode: null };
  if (value?.code === 'ERR_SQLITE_ERROR')
    return {
      code:
        value.errcode === 5 || value.errcode === 6 ? 'relay_state_busy' : 'relay_state_unavailable',
      workerExitCode: null,
    };
  if (value?.name === 'TimeoutError') return { code: 'control_timeout', workerExitCode: null };
  return { code: 'exercise_failed', workerExitCode: null };
};
export const childFailure = (result: ProcessResult): LabFailure => {
  // Read only a fixed code. Raw child output, stack traces and credential values
  // never become report fields or public error messages.
  for (const line of result.stderr.split(/\r?\n/).reverse()) {
    try {
      const value = JSON.parse(line) as { failureCode?: unknown };
      if (
        value &&
        Object.keys(value).length === 1 &&
        typeof value.failureCode === 'string' &&
        Object.hasOwn(messages, value.failureCode)
      )
        return new LabFailure(value.failureCode as FailureCode, result.code);
    } catch {
      /* Other output is not diagnostic input. */
    }
  }
  return new LabFailure('relay_child_failed', result.code);
};
export const failureMessage = (failure: FailureDetails) => messages[failure.code];
