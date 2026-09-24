// M2 — Sentry project -> Jira project mapping.
//
// The raw config is a comma-separated list of "sentryProject:jiraProject"
// pairs, e.g. "mobile-app:EPM,employee-app:MHRM". Parsing is pure and tested
// here so the import worker and any admin UI share identical semantics.

export type SentryMapping = {
  sentryProject: string;
  jiraProject: string;
};

/** Parse the raw SENTRY_PROJECT_MAPPINGS string into typed pairs. */
export function parseSentryMappings(raw: string): SentryMapping[] {
  const out: SentryMapping[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue; // malformed entry; skip (validated at startup)
    const sentryProject = trimmed.slice(0, idx).trim();
    const jiraProject = trimmed.slice(idx + 1).trim().toUpperCase();
    if (!sentryProject || !jiraProject) continue;
    if (seen.has(sentryProject)) continue; // first wins on duplicate keys
    seen.add(sentryProject);
    out.push({ sentryProject, jiraProject });
  }
  return out;
}

/**
 * Resolve the Jira project a Sentry issue should be filed into.
 *
 * - If the mapping is non-empty and the sentry project matches a pair, use the
 *   mapped Jira project.
 * - If the mapping is non-empty but the sentry project is NOT mapped, return
 *   `null` — the caller must mark the issue "ignored"/"no mapping" rather than
 *   filing it into a guess (plan §INT-02: unmapped projects are clearly
 *   failed/ignored, never silently filed into project[0]).
 * - If the mapping is empty, fall back to `fallback` (JIRA_PROJECT_KEYS[0]).
 */
export function resolveJiraProject(
  sentryProject: string,
  mappings: SentryMapping[],
  fallback: string | null
): string | null {
  if (mappings.length === 0) return fallback;
  const match = mappings.find((m) => m.sentryProject.toLowerCase() === sentryProject.toLowerCase());
  return match ? match.jiraProject : null;
}

/**
 * Validate a raw mapping string at startup. Returns the list of malformed
 * entries (never the values of *valid* entries, only the offenders).
 */
export function invalidSentryMappings(raw: string): string[] {
  const invalid: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    const sentryProject = idx === -1 ? "" : trimmed.slice(0, idx).trim();
    const jiraProject = idx === -1 ? "" : trimmed.slice(idx + 1).trim();
    if (idx === -1 || !sentryProject || !jiraProject) invalid.push(trimmed);
  }
  return invalid;
}
