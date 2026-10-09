import {
  type BulkAction,
  type BulkActionKind,
  type BulkFieldValues,
  type BranchParams,
  type DependencyScope,
  type BulkSelector,
  type ValidationResult,
  MAX_KEYS,
  MAX_FILTER_KEYS,
} from "./contracts";

export type { ValidationResult } from "./contracts";

export const KNOWN_ACTION_KINDS: readonly BulkActionKind[] = [
  "update-fields",
  "assign",
  "add-labels",
  "remove-labels",
  "set-points",
  "set-estimate",
  "log-work",
  "set-due-date",
  "set-priority",
  "set-epic",
  "transition",
  "add-fix-version",
  "remove-fix-version",
  "add-comment",
  "create-branches",
] as const;

export const MAX_LABELS_PER_ACTION = 50;
export const MAX_LABEL_LENGTH = 100;
export const MAX_COMMENT_LENGTH = 4000;
export const MAX_STRING_FIELD = 200;
export const MAX_BRANCH_TEMPLATE_LENGTH = 100;
export const MAX_WORKLOG_COMMENT_LENGTH = 4000;
export const JIRA_DURATION_RE = /^(?=.*\d)(?:\d+(?:w|d|h|m)\s*)+$/i;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeKey(k: string): string {
  return k.trim().toUpperCase();
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validate a bulk request body. Returns normalized keys (trimmed, uppercased,
 * deduplicated) and a validated action, or a list of field errors. Empty keys
 * after normalization are rejected rather than silently producing nothing, and
 * the list must not exceed MAX_KEYS.
 */
export function validateBulkRequest(body: unknown, resolvedKeys?: string[]): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, errors: ["request body must be an object"] };

  const rawSelector = body.selector;
  const rawKeys = body.keys;
  const rawAction = body.action;

  let selector: BulkSelector | undefined;
  let targetKeys: unknown = rawKeys;
  let isFilterMode = false;

  if (rawSelector !== undefined) {
    if (!isPlainObject(rawSelector)) {
      return { ok: false, errors: ["selector must be an object"] };
    }
    const mode = rawSelector.mode;
    if (mode === "keys") {
      if (!Array.isArray(rawSelector.keys)) {
        return { ok: false, errors: ["selector.keys must be an array"] };
      }
      selector = { mode: "keys", keys: rawSelector.keys as string[] };
      targetKeys = rawSelector.keys;
    } else if (mode === "filter") {
      if (typeof rawSelector.project !== "string" || !rawSelector.project.trim()) {
        return { ok: false, errors: ["selector.project must be a non-empty string"] };
      }
      selector = {
        mode: "filter",
        project: rawSelector.project.trim().toUpperCase(),
        filters: (isPlainObject(rawSelector.filters) ? rawSelector.filters : {}) as BulkSelector extends { mode: "filter" } ? BulkSelector["filters"] : never,
      };
      isFilterMode = true;
      targetKeys = resolvedKeys !== undefined ? resolvedKeys : [];
    } else {
      return { ok: false, errors: [`unknown selector mode: ${String(mode)}`] };
    }
  }

  if (!Array.isArray(targetKeys)) return { ok: false, errors: ["keys must be an array"] };

  const errors: string[] = [];

  const keys = targetKeys
    .filter((k): k is string => typeof k === "string")
    .map(normalizeKey)
    .filter(Boolean);
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) {
    errors.push(isFilterMode ? "no matching keys found for selector filter" : "keys must contain at least one non-empty key");
  }
  const keyLimit = isFilterMode ? MAX_FILTER_KEYS : MAX_KEYS;
  if (uniqueKeys.length > keyLimit) {
    errors.push(`too many keys: ${uniqueKeys.length} (max ${keyLimit})`);
  }

  let action: BulkAction | null = null;
  if (!isPlainObject(rawAction)) {
    errors.push("action must be an object");
  } else {
    const kind = rawAction.kind;
    if (typeof kind !== "string" || !(KNOWN_ACTION_KINDS as readonly string[]).includes(kind)) {
      errors.push(`unknown action kind: ${String(kind)}`);
    } else {
      switch (kind) {
        case "update-fields": {
          const v = rawAction.value;
          if (!isPlainObject(v)) {
            errors.push("update-fields.value must be an object");
            break;
          }
          const projectKeys = new Set(uniqueKeys.map((k) => k.split("-")[0]));
          if (projectKeys.size > 1) {
            errors.push("all keys must belong to the same project");
          }
          const fields: BulkFieldValues = {};
          if ("assignee" in v) {
            if (v.assignee === null || (isNonEmptyString(v.assignee) && v.assignee.length <= MAX_STRING_FIELD)) fields.assignee = v.assignee as string | null;
            else errors.push("update-fields.value.assignee must be a string or null");
          }
          if ("labels" in v) {
            if (Array.isArray(v.labels) && v.labels.every((item) => typeof item === "string")) {
              const values = Array.from(new Set(v.labels.map((item) => item.trim()).filter(Boolean)));
              if (values.length > MAX_LABELS_PER_ACTION) errors.push("update-fields.value.labels has too many values");
              else if (values.some((item) => item.length > MAX_LABEL_LENGTH)) errors.push("label too long");
              else fields.labels = values;
            } else errors.push("update-fields.value.labels must be an array of strings");
          }
          if ("priority" in v) {
            if (isNonEmptyString(v.priority) && v.priority.length <= MAX_STRING_FIELD) fields.priority = v.priority.trim();
            else errors.push("update-fields.value.priority must be a non-empty string");
          }
          if ("issueType" in v) {
            if (isNonEmptyString(v.issueType) && v.issueType.length <= MAX_STRING_FIELD) fields.issueType = v.issueType.trim();
            else errors.push("update-fields.value.issueType must be a non-empty string");
          }
          if ("points" in v) {
            if (v.points === null || (typeof v.points === "number" && Number.isInteger(v.points) && v.points >= 0)) fields.points = v.points as number | null;
            else errors.push("update-fields.value.points must be a non-negative integer or null");
          }
          if ("estimate" in v) {
            if (isNonEmptyString(v.estimate) && JIRA_DURATION_RE.test(v.estimate.trim())) fields.estimate = v.estimate.trim();
            else errors.push("update-fields.value.estimate must be a Jira duration");
          }
          if ("dueDate" in v) {
            if (v.dueDate === null || (typeof v.dueDate === "string" && isValidIsoDate(v.dueDate))) fields.dueDate = v.dueDate as string | null;
            else errors.push("update-fields.value.dueDate must be an ISO date or null");
          }
          if ("fixVersions" in v) {
            if (Array.isArray(v.fixVersions) && v.fixVersions.every((item) => isNonEmptyString(item))) fields.fixVersions = Array.from(new Set(v.fixVersions.map((item) => item.trim())));
            else errors.push("update-fields.value.fixVersions must be an array of strings");
          }
          if ("epic" in v) {
            if (v.epic === null || (isNonEmptyString(v.epic) && /^[A-Z][A-Z0-9_]+-\d+$/i.test(v.epic.trim()))) {
              fields.epic = v.epic === null ? null : v.epic.trim().toUpperCase();
            } else {
              errors.push("update-fields.value.epic must be a valid Jira issue key or null");
            }
          }
          if (Object.keys(fields).length === 0) errors.push("update-fields.value must contain at least one field");
          action = { kind, value: fields };
          break;
        }
        case "assign":
          if (rawAction.value == null || isNonEmptyString(rawAction.value)) {
            const v = rawAction.value as string | null;
            if (v != null && v.length > MAX_STRING_FIELD)
              errors.push("assign.value too long");
            action = { kind, value: v };
          } else {
            errors.push("assign.value must be a string or null");
          }
          break;
        case "add-labels":
        case "remove-labels":
          if (!Array.isArray(rawAction.value)) {
            errors.push(`${kind}.value must be an array of strings`);
          } else {
            const labels = Array.from(
              new Set(
                rawAction.value
                  .filter((l): l is string => typeof l === "string")
                  .map((l) => l.trim())
                  .filter(Boolean)
              )
            ).slice(0, MAX_LABELS_PER_ACTION);
            if (labels.length === 0) errors.push(`${kind}.value must contain at least one label`);
            if (labels.some((l) => l.length > MAX_LABEL_LENGTH)) errors.push("label too long");
            action = { kind, value: labels } as BulkAction;
          }
          break;
        case "set-points": {
          const v = rawAction.value;
          if (v == null || (typeof v === "number" && Number.isInteger(v) && v >= 0)) {
            action = { kind, value: (v ?? null) as number | null };
          } else {
            errors.push("set-points.value must be a non-negative integer or null");
          }
          break;
        }
        case "set-estimate": {
          const v = rawAction.value;
          if (isNonEmptyString(v) && JIRA_DURATION_RE.test(v.trim())) {
            action = { kind, value: v.trim() };
          } else {
            errors.push("set-estimate.value must be a Jira duration such as 2h or 1d 4h");
          }
          break;
        }
        case "set-due-date": {
          const v = rawAction.value;
          if (v === null || (typeof v === "string" && isValidIsoDate(v))) {
            action = { kind, value: v };
          } else {
            errors.push("set-due-date.value must be an ISO date (YYYY-MM-DD) or null");
          }
          break;
        }
        case "log-work": {
          const v = rawAction.value;
          if (!isPlainObject(v) || !isNonEmptyString(v.timeSpent) || !JIRA_DURATION_RE.test(v.timeSpent.trim())) {
            errors.push("log-work.value.timeSpent must be a Jira duration such as 30m or 2h");
            break;
          }
          if (v.started !== undefined && (typeof v.started !== "string" || isNaN(new Date(v.started).getTime()))) {
            errors.push("log-work.value.started must be a valid ISO date or datetime");
          }
          if (v.comment !== undefined && (typeof v.comment !== "string" || v.comment.length > MAX_WORKLOG_COMMENT_LENGTH)) {
            errors.push("log-work.value.comment is invalid or too long");
          }
          action = {
            kind,
            value: {
              timeSpent: v.timeSpent.trim(),
              ...(typeof v.started === "string" ? { started: v.started } : {}),
              ...(typeof v.comment === "string" && v.comment.trim() ? { comment: v.comment.trim() } : {}),
            },
          };
          break;
        }
        case "set-priority":
        case "transition":
        case "add-comment": {
          const v = rawAction.value;
          if (isNonEmptyString(v)) {
            const max = kind === "add-comment" ? MAX_COMMENT_LENGTH : MAX_STRING_FIELD;
            if (v.length > max) errors.push(`${kind}.value too long`);
            else action = { kind, value: v } as BulkAction;
          } else {
            errors.push(`${kind}.value must be a non-empty string`);
          }
          break;
        }
        case "set-epic": {
          const v = rawAction.value;
          if (v === null || (isNonEmptyString(v) && /^[A-Z][A-Z0-9_]+-\d+$/i.test(v.trim()))) {
            action = { kind, value: v === null ? null : v.trim().toUpperCase() };
          } else {
            errors.push("set-epic.value must be a valid Jira issue key or null");
          }
          break;
        }
        case "add-fix-version": {
          const v = rawAction.value;
          if (isNonEmptyString(v)) {
            if (v.length > MAX_STRING_FIELD) {
              errors.push("add-fix-version.value too long");
            } else {
              let scope: DependencyScope = "recursive";
              if (rawAction.dependencyScope !== undefined) {
                if (["none", "direct", "recursive"].includes(String(rawAction.dependencyScope))) {
                  scope = rawAction.dependencyScope as DependencyScope;
                } else {
                  errors.push("dependencyScope must be 'none', 'direct', or 'recursive'");
                }
              }
              action = { kind: "add-fix-version", value: v, dependencyScope: scope };
            }
          } else {
            errors.push("add-fix-version.value must be a non-empty string");
          }
          break;
        }
        case "remove-fix-version": {
          const v = rawAction.value;
          if (isNonEmptyString(v)) {
            if (v.length > MAX_STRING_FIELD) {
              errors.push("remove-fix-version.value too long");
            } else {
              let scope: DependencyScope = "recursive";
              if (rawAction.dependencyScope !== undefined) {
                if (["none", "direct", "recursive"].includes(String(rawAction.dependencyScope))) {
                  scope = rawAction.dependencyScope as DependencyScope;
                } else {
                  errors.push("dependencyScope must be 'none', 'direct', or 'recursive'");
                }
              }
              const force = rawAction.forceRemove === true;
              action = { kind: "remove-fix-version", value: v, dependencyScope: scope, forceRemove: force };
            }
          } else {
            errors.push("remove-fix-version.value must be a non-empty string");
          }
          break;
        }
        case "create-branches": {
          const v = rawAction.value;
          if (!isPlainObject(v)) {
            errors.push("create-branches.value must be an object");
            break;
          }
          const bp: BranchParams = {};
          if (v.repo !== undefined) {
            if (isNonEmptyString(v.repo) && v.repo.length <= MAX_STRING_FIELD) bp.repo = v.repo.trim();
            else errors.push("create-branches.value.repo must be a non-empty string");
          }
          if (v.base !== undefined) {
            if (isNonEmptyString(v.base) && v.base.length <= MAX_STRING_FIELD) bp.base = v.base.trim();
            else errors.push("create-branches.value.base must be a non-empty string");
          }
          if (v.nameTemplate !== undefined) {
            if (isNonEmptyString(v.nameTemplate) && v.nameTemplate.length <= MAX_BRANCH_TEMPLATE_LENGTH)
              bp.nameTemplate = v.nameTemplate.trim();
            else errors.push("create-branches.value.nameTemplate must be a non-empty string");
          }
          if (v.comment !== undefined) {
            if (typeof v.comment === "boolean") bp.comment = v.comment;
            else errors.push("create-branches.value.comment must be a boolean");
          }
          action = { kind, value: bp };
          break;
        }
        default:
          // unreachable — kind already validated
          break;
      }
    }
  }

  if (errors.length > 0 || action == null) return { ok: false, errors };
  return { ok: true, keys: uniqueKeys, action, ...(selector ? { selector } : {}) };
}
