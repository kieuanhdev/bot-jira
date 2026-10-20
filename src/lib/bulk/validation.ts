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
import { z } from "zod";
import { isDateKey } from "@/lib/date";

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
  return isDateKey(value);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type ActionParser = (raw: Record<string, unknown>, errors: string[]) => BulkAction | undefined;

const SELECTOR_ERROR = "selector must be an object";

const SelectorSchema = z.discriminatedUnion(
  "mode",
  [
    z.looseObject({
      mode: z.literal("keys"),
      keys: z.array(z.unknown(), { error: "selector.keys must be an array" }),
    }),
    z.looseObject({
      mode: z.literal("filter"),
      project: z
        .string({ error: "selector.project must be a non-empty string" })
        .trim()
        .min(1, { error: "selector.project must be a non-empty string" })
        .transform((p) => p.toUpperCase()),
      filters: z.unknown().optional().transform((f) => (isPlainObject(f) ? f : {})),
    }),
  ],
  {
    error: (iss) =>
      isPlainObject(iss.input) ? `unknown selector mode: ${String(iss.input.mode)}` : SELECTOR_ERROR,
  }
);

function parseDependencyScope(raw: Record<string, unknown>, errors: string[]): DependencyScope {
  if (raw.dependencyScope === undefined) return "recursive";
  if (["none", "direct", "recursive"].includes(String(raw.dependencyScope))) return raw.dependencyScope as DependencyScope;
  errors.push("dependencyScope must be 'none', 'direct', or 'recursive'");
  return "recursive";
}

function parseUpdateFields(raw: Record<string, unknown>, errors: string[], keys: string[]): BulkAction | undefined {
  const v = raw.value;
  if (!isPlainObject(v)) {
    errors.push("update-fields.value must be an object");
    return undefined;
  }
  if (new Set(keys.map((k) => k.split("-")[0])).size > 1) errors.push("all keys must belong to the same project");
  const fields: BulkFieldValues = {};
  if ("assignee" in v) {
    if (v.assignee === null || (isNonEmptyString(v.assignee) && v.assignee.length <= MAX_STRING_FIELD)) fields.assignee = v.assignee as string | null;
    else errors.push("update-fields.value.assignee must be a string or null");
  }
  for (const role of ["reporter", "approver", "tester"] as const) {
    if (!(role in v)) continue;
    const person = v[role];
    if (person === null || (isNonEmptyString(person) && person.length <= MAX_STRING_FIELD)) fields[role] = person === null ? null : person.trim();
    else errors.push(`update-fields.value.${role} must be a string or null`);
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
    if (v.epic === null || (isNonEmptyString(v.epic) && JIRA_KEY_RE.test(v.epic.trim()))) {
      fields.epic = v.epic === null ? null : v.epic.trim().toUpperCase();
    } else {
      errors.push("update-fields.value.epic must be a valid Jira issue key or null");
    }
  }
  if (Object.keys(fields).length === 0) errors.push("update-fields.value must contain at least one field");
  return { kind: "update-fields", value: fields };
}

const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/i;

function parseLabelsAction(kind: "add-labels" | "remove-labels"): ActionParser {
  return (raw, errors) => {
    if (!Array.isArray(raw.value)) {
      errors.push(`${kind}.value must be an array of strings`);
      return undefined;
    }
    const labels = Array.from(
      new Set(raw.value.filter((l): l is string => typeof l === "string").map((l) => l.trim()).filter(Boolean))
    ).slice(0, MAX_LABELS_PER_ACTION);
    if (labels.length === 0) errors.push(`${kind}.value must contain at least one label`);
    if (labels.some((l) => l.length > MAX_LABEL_LENGTH)) errors.push("label too long");
    return { kind, value: labels } as BulkAction;
  };
}

function parseTextAction(kind: "set-priority" | "transition" | "add-comment"): ActionParser {
  return (raw, errors) => {
    const v = raw.value;
    if (!isNonEmptyString(v)) {
      errors.push(`${kind}.value must be a non-empty string`);
      return undefined;
    }
    if (v.length > (kind === "add-comment" ? MAX_COMMENT_LENGTH : MAX_STRING_FIELD)) {
      errors.push(`${kind}.value too long`);
      return undefined;
    }
    return { kind, value: v } as BulkAction;
  };
}

function parseFixVersionAction(kind: "add-fix-version" | "remove-fix-version"): ActionParser {
  return (raw, errors) => {
    const v = raw.value;
    if (!isNonEmptyString(v)) {
      errors.push(`${kind}.value must be a non-empty string`);
      return undefined;
    }
    if (v.length > MAX_STRING_FIELD) {
      errors.push(`${kind}.value too long`);
      return undefined;
    }
    const dependencyScope = parseDependencyScope(raw, errors);
    if (kind === "add-fix-version") return { kind, value: v, dependencyScope };
    return { kind, value: v, dependencyScope, forceRemove: raw.forceRemove === true };
  };
}

const ACTION_PARSERS: Record<Exclude<BulkActionKind, "update-fields">, ActionParser> = {
  assign: (raw, errors) => {
    if (raw.value != null && !isNonEmptyString(raw.value)) {
      errors.push("assign.value must be a string or null");
      return undefined;
    }
    const v = raw.value as string | null;
    if (v != null && v.length > MAX_STRING_FIELD) errors.push("assign.value too long");
    return { kind: "assign", value: v };
  },
  "add-labels": parseLabelsAction("add-labels"),
  "remove-labels": parseLabelsAction("remove-labels"),
  "set-points": (raw, errors) => {
    const v = raw.value;
    if (v == null || (typeof v === "number" && Number.isInteger(v) && v >= 0)) return { kind: "set-points", value: (v ?? null) as number | null };
    errors.push("set-points.value must be a non-negative integer or null");
    return undefined;
  },
  "set-estimate": (raw, errors) => {
    const v = raw.value;
    if (isNonEmptyString(v) && JIRA_DURATION_RE.test(v.trim())) return { kind: "set-estimate", value: v.trim() };
    errors.push("set-estimate.value must be a Jira duration such as 2h or 1d 4h");
    return undefined;
  },
  "set-due-date": (raw, errors) => {
    const v = raw.value;
    if (v === null || (typeof v === "string" && isValidIsoDate(v))) return { kind: "set-due-date", value: v };
    errors.push("set-due-date.value must be an ISO date (YYYY-MM-DD) or null");
    return undefined;
  },
  "log-work": (raw, errors) => {
    const v = raw.value;
    if (!isPlainObject(v) || !isNonEmptyString(v.timeSpent) || !JIRA_DURATION_RE.test(v.timeSpent.trim())) {
      errors.push("log-work.value.timeSpent must be a Jira duration such as 30m or 2h");
      return undefined;
    }
    if (v.started !== undefined && (typeof v.started !== "string" || isNaN(new Date(v.started).getTime()))) {
      errors.push("log-work.value.started must be a valid ISO date or datetime");
    }
    if (v.comment !== undefined && (typeof v.comment !== "string" || v.comment.length > MAX_WORKLOG_COMMENT_LENGTH)) {
      errors.push("log-work.value.comment is invalid or too long");
    }
    return {
      kind: "log-work",
      value: {
        timeSpent: v.timeSpent.trim(),
        ...(typeof v.started === "string" ? { started: v.started } : {}),
        ...(typeof v.comment === "string" && v.comment.trim() ? { comment: v.comment.trim() } : {}),
      },
    };
  },
  "set-priority": parseTextAction("set-priority"),
  transition: parseTextAction("transition"),
  "add-comment": parseTextAction("add-comment"),
  "set-epic": (raw, errors) => {
    const v = raw.value;
    if (v === null || (isNonEmptyString(v) && JIRA_KEY_RE.test(v.trim()))) return { kind: "set-epic", value: v === null ? null : v.trim().toUpperCase() };
    errors.push("set-epic.value must be a valid Jira issue key or null");
    return undefined;
  },
  "add-fix-version": parseFixVersionAction("add-fix-version"),
  "remove-fix-version": parseFixVersionAction("remove-fix-version"),
  "create-branches": (raw, errors) => {
    const v = raw.value;
    if (!isPlainObject(v)) {
      errors.push("create-branches.value must be an object");
      return undefined;
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
      if (isNonEmptyString(v.nameTemplate) && v.nameTemplate.length <= MAX_BRANCH_TEMPLATE_LENGTH) bp.nameTemplate = v.nameTemplate.trim();
      else errors.push("create-branches.value.nameTemplate must be a non-empty string");
    }
    if (v.comment !== undefined) {
      if (typeof v.comment === "boolean") bp.comment = v.comment;
      else errors.push("create-branches.value.comment must be a boolean");
    }
    return { kind: "create-branches", value: bp };
  },
};

/** One discriminatedUnion variant per action kind; each variant's parser reports the original messages. */
function actionVariant(kind: BulkActionKind, parse: ActionParser) {
  return z.looseObject({ kind: z.literal(kind) }).transform((raw, ctx) => {
    const errors: string[] = [];
    const action = parse(raw, errors);
    for (const message of errors) ctx.addIssue({ code: "custom", message });
    return action ?? z.NEVER;
  });
}

function actionSchema(keys: string[]) {
  const variants = KNOWN_ACTION_KINDS.map((kind) =>
    actionVariant(kind, kind === "update-fields" ? (raw, errors) => parseUpdateFields(raw, errors, keys) : ACTION_PARSERS[kind])
  );
  return z.discriminatedUnion("kind", variants as unknown as [(typeof variants)[number], ...(typeof variants)[number][]], {
    error: (iss) => `unknown action kind: ${String(isPlainObject(iss.input) ? iss.input.kind : undefined)}`,
  });
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
  const rawAction = body.action;

  let selector: BulkSelector | undefined;
  let targetKeys: unknown = body.keys;
  let isFilterMode = false;

  if (rawSelector !== undefined) {
    if (!isPlainObject(rawSelector)) return { ok: false, errors: [SELECTOR_ERROR] };
    const parsed = SelectorSchema.safeParse(rawSelector);
    if (!parsed.success) return { ok: false, errors: [parsed.error.issues[0].message] };
    if (parsed.data.mode === "keys") {
      selector = { mode: "keys", keys: parsed.data.keys as string[] };
      targetKeys = parsed.data.keys;
    } else {
      selector = { mode: "filter", project: parsed.data.project, filters: parsed.data.filters as Extract<BulkSelector, { mode: "filter" }>["filters"] };
      isFilterMode = true;
      targetKeys = resolvedKeys !== undefined ? resolvedKeys : [];
    }
  }

  if (!Array.isArray(targetKeys)) return { ok: false, errors: ["keys must be an array"] };

  const errors: string[] = [];

  const uniqueKeys = Array.from(
    new Set(targetKeys.filter((k): k is string => typeof k === "string").map(normalizeKey).filter(Boolean))
  );
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
    const parsed = actionSchema(uniqueKeys).safeParse(rawAction);
    if (parsed.success) action = parsed.data as BulkAction;
    else errors.push(...parsed.error.issues.map((i) => i.message));
  }

  if (errors.length > 0 || action == null) return { ok: false, errors };
  return { ok: true, keys: uniqueKeys, action, ...(selector ? { selector } : {}) };
}
