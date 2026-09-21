/**
 * Pure helper for rendering bulk branch names from a template. Kept in its own
 * file (no Prisma/env imports) so it is trivially unit-testable.
 */

const DEFAULT_TEMPLATE = "{project}-{number}";

export function defaultBranchTemplate(): string {
  return DEFAULT_TEMPLATE;
}

/**
 * Render a branch name from a template. Supported placeholders:
 *   {issue}   full Jira key (EPM-123)
 *   {project} project key (EPM)
 *   {number}  issue number (123)
 *   {status}  workflow status, lowercased, spaces -> dashes
 *
 * The result is sanitized to a safe git ref (keeps letters, digits, /, _, ., -).
 */
export function renderBranchName(template: string, key: string, status: string): string {
  const project = key.split("-")[0] ?? key;
  const number = key.includes("-") ? key.slice(key.indexOf("-") + 1) : key;
  const safeStatus = status.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const name = template
    .replaceAll("{issue}", key)
    .replaceAll("{project}", project)
    .replaceAll("{number}", number)
    .replaceAll("{status}", safeStatus || "task");
  return name.replace(/[^a-zA-Z0-9/_.-]/g, "-");
}
