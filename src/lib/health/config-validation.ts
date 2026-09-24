import { env } from "@/lib/env";

/**
 * OPS-02 — Startup fail-fast configuration validation.
 *
 * The worker MUST have a database and Jira configured to run; if they are
 * missing it should crash loudly on boot (so the orchestrator can restart it)
 * rather than silently no-op every scheduled job and look healthy. The web
 * process is more forgiving: it can boot with partial config and report
 * `not_configured` for the integrations it cannot reach.
 *
 * `validateRequiredConfig` returns the list of *names* of missing variables
 * (never the values) so an error can safely be logged.
 */

/** Variables the standalone worker cannot operate without. */
export const WORKER_REQUIRED = ["DATABASE_URL", "JIRA_BASE_URL", "JIRA_USER", "JIRA_TOKEN"] as const;

export function missingWorkerRequired(): string[] {
  const map: Record<string, string> = {
    DATABASE_URL: env.databaseUrl,
    JIRA_BASE_URL: env.jiraBaseUrl,
    JIRA_USER: env.jiraUser,
    JIRA_TOKEN: env.jiraToken,
  };
  return WORKER_REQUIRED.filter((name) => !map[name]);
}

export function validateWorkerStartup(): string[] {
  return missingWorkerRequired();
}

/** True when the worker's required config is present. */
export function workerConfigComplete(): boolean {
  return missingWorkerRequired().length === 0;
}
