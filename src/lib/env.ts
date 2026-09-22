// Central, typed access to environment variables.
// Read process.env once at module load; consumers import these helpers.

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v === undefined || v === "" ? Number.NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  nodeEnv: str("NODE_ENV", "development"),
  databaseUrl: str("DATABASE_URL"),
  nextAuthSecret: str("NEXTAUTH_SECRET"),
  nextAuthUrl: str("NEXTAUTH_URL", "http://localhost:3000"),

  // Jira Server / Data Center
  jiraBaseUrl: str("JIRA_BASE_URL"),
  jiraUser: str("JIRA_USER"),
  jiraToken: str("JIRA_TOKEN"),
  // "Bearer" (default) or "basic". This Jira DC accepts a raw Bearer token.
  jiraAuth: str("JIRA_AUTH", "Bearer"),
  // Comma-separated project keys to sync + show on the board.
  // Mobile projects by default.
  jiraProjectKeys: str("JIRA_PROJECT_KEYS", "CICM,EDM,EMA,EPM,ETM,MHRM,MR"),
  // Optional extra JQL filter applied to the default poll query.
  jiraJqlExtra: str("JIRA_JQL_EXTRA"),
  // Jira custom field id used to store story points, e.g. "customfield_10016".
  jiraPointsFieldId: str("JIRA_POINTS_FIELD_ID"),
  // Timeout for one Jira HTTP request.
  jiraRequestTimeoutMs: int("JIRA_REQUEST_TIMEOUT_MS", 15000),
  // Incremental sync overlaps its previous cursor to avoid losing updates that
  // share a timestamp or arrive while a page is being processed.
  jiraSyncOverlapSeconds: int("JIRA_SYNC_OVERLAP_SECONDS", 300),
  // Cache freshness SLA surfaced by the Board and release gates.
  jiraFreshnessMinutes: int("JIRA_FRESHNESS_MINUTES", 5),
  // Board columns per project, matching the project's Jira board. Format:
  //   PROJECT_COLUMNS=EPM:Backlog|Selected for Development|In Progress|Waiting For Deploy|ToDo Test|Done,MR:...
  // Each entry is "KEY:col1|col2|...". Columns are raw workflow status names,
  // shown in this order. Projects not listed here use an auto-derived set.
  jiraProjectColumns: str("JIRA_PROJECT_COLUMNS"),

  // Bitbucket Server / Data Center
  bitbucketBaseUrl: str("BITBUCKET_BASE_URL"),
  bitbucketUser: str("BITBUCKET_USER"),
  bitbucketToken: str("BITBUCKET_TOKEN"),
  // Comma-separated project/repo slugs, e.g. "team/app1,team/app2"
  bitbucketRepos: str("BITBUCKET_REPOS"),
  // Default base branch considered "merged into" for the branch check.
  bitbucketBaseBranch: str("BITBUCKET_BASE_BRANCH", "main"),

  // Sentry
  sentryOrg: str("SENTRY_ORG"),
  sentryProject: str("SENTRY_PROJECT"),
  sentryToken: str("SENTRY_TOKEN"),
  // Sentry base url override (self-hosted). Empty => https://sentry.io
  sentryBaseUrl: str("SENTRY_BASE_URL", "https://sentry.io"),

  // AI / LLM. LLM_PROVIDER selects the active provider: "openai" (default)
  // or "ollama".
  llmProvider: str("LLM_PROVIDER", "openai"),
  // OpenAI-compatible API (OpenAI, Azure OpenAI, vLLM, LM Studio, litellm…).
  openaiBaseUrl: str("OPENAI_BASE_URL", "https://api.openai.com/v1"),
  openaiApiKey: str("OPENAI_API_KEY"),
  openaiModel: str("OPENAI_MODEL", "gpt-4o-mini"),
  // Ollama (only used when LLM_PROVIDER=ollama)
  ollamaBaseUrl: str("OLLAMA_BASE_URL", "http://localhost:11434"),
  ollamaModel: str("OLLAMA_MODEL", "llama3.1:8b"),
  // Comma-separated allowed point values, e.g. "1,2,3,5,8,13"
  pointScale: str("POINT_SCALE", "1,2,3,5,8,13"),
  // When true, the ai-score cron auto-scores new unscored issues.
  aiAutoScore: bool("AI_AUTO_SCORE", false),

  // Stale detection
  staleDays: int("STALE_DAYS", 7),

  // Release policy (M2-02)
  releaseDoneCategories: str("RELEASE_DONE_CATEGORIES", "done"),
  releaseBlockingPriorities: str("RELEASE_BLOCKING_PRIORITIES", "Blocker,Critical"),
  releaseDataFreshnessMinutes: int("RELEASE_DATA_FRESHNESS_MINUTES", 5),
  sentryBlockingLevels: str("SENTRY_BLOCKING_LEVELS", "fatal"),

  // Polling
  pollIntervalMs: int("POLL_INTERVAL_MS", 60000),

  // M4 — bulk operations. Max concurrent Jira/Bitbucket calls per operation.
  bulkConcurrency: int("BULK_CONCURRENCY", 4),
  // M4 — default branch name template for bulk branch creation.
  bulkBranchTemplate: str("BULK_BRANCH_TEMPLATE", "{project}-{number}"),

  // Web Push (VAPID)
  vapidPublicKey: str("VAPID_PUBLIC_KEY"),
  vapidPrivateKey: str("VAPID_PRIVATE_KEY"),
  // The "from" address for push notifications.
  vapidSubject: str("VAPID_SUBJECT", "mailto:admin@team.local"),

  // M5 — Webhook verification. Each source has its own shared secret; the
  // endpoint returns 401 when the signature check fails (or when no secret is
  // configured and the source mandates verification).
  jiraWebhookSecret: str("JIRA_WEBHOOK_SECRET"),
  sentryWebhookSecret: str("SENTRY_WEBHOOK_SECRET"),
  bitbucketWebhookSecret: str("BITBUCKET_WEBHOOK_SECRET"),
  ciWebhookSecret: str("CI_WEBHOOK_SECRET"),
  // Cap on the raw payload stored in IntegrationEvent (bytes).
  webhookMaxPayloadBytes: int("WEBHOOK_MAX_PAYLOAD_BYTES", 64 * 1024),
  // M5 — notification delivery retry policy.
  notifyMaxAttempts: int("NOTIFY_MAX_ATTEMPTS", 5),
  notifyBackoffBaseMs: int("NOTIFY_BACKOFF_BASE_MS", 60_000),

  // Admin bootstrap (used by seed script)
  adminEmail: str("ADMIN_EMAIL", "admin@team.local"),
  adminPassword: str("ADMIN_PASSWORD", "admin123"),
  adminName: str("ADMIN_NAME", "Admin"),

  // Master key for encrypting per-user Jira/Bitbucket credentials at rest.
  credEncryptionKey: str("CRED_ENCRYPTION_KEY"),
};

export const pointScale: number[] = env.pointScale
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n));

/** Midpoint of the configured point scale, used as the AI fallback. */
export const defaultPoint: number =
  pointScale.length > 0
    ? pointScale[Math.floor((pointScale.length - 1) / 2)]
    : 3;

export const bitbucketRepoList: string[] = env.bitbucketRepos
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Jira project keys (mobile projects) to sync + show, in display order. */
export const jiraProjectList: string[] = env.jiraProjectKeys
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

/**
 * Manually configured board columns per project (matching the project's Jira
 * board), parsed from JIRA_PROJECT_COLUMNS. A project absent from this map has
 * no manual columns and the board falls back to auto-deriving them.
 */
export const projectColumns: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const part of env.jiraProjectColumns.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim().toUpperCase();
    const cols = trimmed
      .slice(idx + 1)
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    if (key && cols.length > 0) out[key] = cols;
  }
  return out;
})();

/** True when a JQL board/search query should be scoped to a single project. */
export function isKnownProject(key: string): boolean {
  return jiraProjectList.includes(key.toUpperCase());
}

export function hasJiraConfig(): boolean {
  return Boolean(env.jiraBaseUrl && env.jiraUser && env.jiraToken);
}

export function hasBitbucketConfig(): boolean {
  return Boolean(env.bitbucketBaseUrl && env.bitbucketToken);
}

export function hasSentryConfig(): boolean {
  return Boolean(env.sentryOrg && env.sentryProject && env.sentryToken);
}

/** Jira status category keys that count as "done" for release gates. */
export const releaseDoneCategories: string[] = env.releaseDoneCategories
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** Jira priority names that block a release (case-insensitive comparison). */
export const releaseBlockingPriorities: string[] = env.releaseBlockingPriorities
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Sentry levels that block a release (case-insensitive comparison). */
export const sentryBlockingLevels: string[] = env.sentryBlockingLevels
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function hasOllamaConfig(): boolean {
  return Boolean(env.ollamaBaseUrl && env.ollamaModel);
}

export function hasOpenAiConfig(): boolean {
  return Boolean(env.openaiBaseUrl && env.openaiApiKey && env.openaiModel);
}

/** Whether the selected LLM provider has the config it needs. */
export function hasLLMConfig(): boolean {
  return env.llmProvider === "ollama" ? hasOllamaConfig() : hasOpenAiConfig();
}
