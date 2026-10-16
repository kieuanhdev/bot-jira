/**
 * Canonical Jira URL builders for issues and release versions.
 * Client bundle safe: zero external dependencies, zero Node built-ins.
 */

export function trimBaseUrl(url?: string | null): string {
  if (!url) return "";
  return url.replace(/\/+$/, "");
}

/**
 * Build Jira deep link to view an issue.
 */
export function getJiraIssueUrl(
  jiraBaseUrl?: string | null,
  jiraKey?: string | null
): string | null {
  if (!jiraBaseUrl || !jiraKey) return null;
  const base = trimBaseUrl(jiraBaseUrl);
  return `${base}/browse/${encodeURIComponent(jiraKey)}`;
}

/**
 * Build Jira deep link to view a project version or fixVersion JQL query.
 */
export function getJiraVersionUrl(
  jiraBaseUrl?: string | null,
  projectKey?: string | null,
  jiraVersionId?: string | null,
  versionName?: string | null
): string | null {
  if (!jiraBaseUrl || !projectKey) return null;
  const base = trimBaseUrl(jiraBaseUrl);
  if (jiraVersionId) {
    return `${base}/projects/${encodeURIComponent(projectKey)}/versions/${encodeURIComponent(jiraVersionId)}`;
  }
  if (versionName) {
    return `${base}/issues/?jql=project%20%3D%20%22${encodeURIComponent(projectKey)}%22%20AND%20fixVersion%20%3D%20%22${encodeURIComponent(versionName)}%22`;
  }
  return null;
}
