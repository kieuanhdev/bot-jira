

/**
 * OPS-02 — Startup fail-fast configuration validation.
 *
 * The worker MUST have a database and valid Jira sync timing configuration to run.
 * If invalid or missing, it should crash loudly on boot rather than silently
 * operating in a degraded or misconfigured state.
 *
 * All validation returns only variable names and descriptive errors (never secret values).
 */

/**
 * Variables the standalone worker cannot operate without (database connection).
 *
 * Accepts an envSource so that tests and startup code can pass a custom
 * environment record without depending on process.env at import time.
 */
export const WORKER_REQUIRED = ["DATABASE_URL"] as const;

export function missingWorkerRequired(
  envSource: Record<string, string | undefined> = process.env
): string[] {
  return WORKER_REQUIRED.filter((name) => !envSource[name]);
}

export type TimingValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

export function validateJiraSyncTiming(
  envSource: Record<string, string | undefined> = process.env
): TimingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawExpire = envSource.JIRA_SYNC_EXPIRE_SECONDS;
  const rawHeartbeat = envSource.JIRA_HEARTBEAT_SECONDS;

  let expireSeconds = 900;
  if (rawExpire !== undefined && rawExpire !== "") {
    const num = Number(rawExpire);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      errors.push("JIRA_SYNC_EXPIRE_SECONDS must be an integer");
    } else if (num < 0) {
      errors.push("JIRA_SYNC_EXPIRE_SECONDS cannot be negative");
    } else if (num < 120) {
      errors.push("JIRA_SYNC_EXPIRE_SECONDS must be at least 120 seconds");
    } else {
      expireSeconds = num;
    }
  }

  let heartbeatSeconds = 60;
  if (rawHeartbeat !== undefined && rawHeartbeat !== "") {
    const num = Number(rawHeartbeat);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      errors.push("JIRA_HEARTBEAT_SECONDS must be an integer");
    } else if (num < 0) {
      errors.push("JIRA_HEARTBEAT_SECONDS cannot be negative");
    } else if (num < 10) {
      errors.push("JIRA_HEARTBEAT_SECONDS must be at least 10 seconds");
    } else {
      heartbeatSeconds = num;
    }
  }

  if (errors.length === 0) {
    if (heartbeatSeconds >= expireSeconds) {
      errors.push("JIRA_HEARTBEAT_SECONDS must be strictly less than JIRA_SYNC_EXPIRE_SECONDS");
    } else if (heartbeatSeconds > Math.floor(expireSeconds / 3)) {
      warnings.push("JIRA_HEARTBEAT_SECONDS is recommended to be <= JIRA_SYNC_EXPIRE_SECONDS / 3");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateWorkerStartup(
  envSource: Record<string, string | undefined> = process.env
): string[] {
  const missing = missingWorkerRequired(envSource);
  const timing = validateJiraSyncTiming(envSource);
  return [...missing, ...timing.errors];
}

/** True when the worker's required config is present and valid. */
export function workerConfigComplete(
  envSource: Record<string, string | undefined> = process.env
): boolean {
  return validateWorkerStartup(envSource).length === 0;
}

