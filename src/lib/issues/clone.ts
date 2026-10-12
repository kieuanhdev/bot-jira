import type {
  JiraCreateMetaField,
  JiraIssue,
  JiraIssueLink,
  JiraIssueLinkType,
} from "@/lib/jira/types";

/** Prefix Jira itself puts on a cloned summary. */
export const CLONE_SUMMARY_PREFIX = "CLONE - ";

/** System fields a clone carries over when the create screen accepts them. */
export const CLONE_SYSTEM_FIELDS = [
  "description",
  "priority",
  "labels",
  "components",
  "fixVersions",
  "versions",
  "assignee",
  "duedate",
  "environment",
  "parent",
] as const;

/**
 * Fields copied when `createmeta` is unavailable. Deliberately narrow: an
 * unexpected field on a create screen makes Jira answer 400.
 */
export const CLONE_FALLBACK_FIELDS = ["description", "priority", "labels", "duedate"] as const;

/**
 * Never copied, even when passed in as an extra field: Jira owns these on a new
 * issue, or they need permissions the caller may not hold.
 */
const CLONE_DENIED_FIELDS = new Set([
  "project",
  "summary",
  "issuetype",
  "status",
  "resolution",
  "resolutiondate",
  "reporter",
  "creator",
  "created",
  "updated",
  "statuscategorychangedate",
  "comment",
  "attachment",
  "worklog",
  "timetracking",
  "timespent",
  "timeestimate",
  "timeoriginalestimate",
  "issuelinks",
  "subtasks",
  "votes",
  "watches",
  "progress",
]);

export type CloneFieldsOptions = {
  /** Summary for the copy; falls back to the prefixed source summary. */
  summary?: string | null;
  /** Project-specific ids to copy too (people fields, epic link, story points). */
  extraFieldIds?: readonly string[];
  /** Field ids the create screen accepts; `null` falls back to the narrow list. */
  allowedFieldIds?: ReadonlySet<string> | null;
  /**
   * Ids the create screen marks required (Epic Name, a project's mandatory
   * custom fields). Copied even when they are not otherwise on the list, or
   * Jira answers 400 "field is required".
   */
  requiredFieldIds?: readonly string[];
};

export type CloneFields = {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  fields: Record<string, unknown>;
  /** Copyable source fields the create screen refused. */
  skipped: string[];
};

/** `CLONE - <summary>`, without stacking the prefix on an already cloned issue. */
export function cloneSummary(summary: string | null | undefined): string {
  const text = (summary ?? "").trim();
  if (!text) return CLONE_SUMMARY_PREFIX.trim();
  return text.toUpperCase().startsWith(CLONE_SUMMARY_PREFIX.toUpperCase())
    ? text
    : `${CLONE_SUMMARY_PREFIX}${text}`;
}

/** Reduce a Jira read value to the shape the create API accepts. */
function normalizeFieldValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const items = value.map(normalizeFieldValue).filter((item) => item !== null);
    return items.length > 0 ? items : null;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const prop of ["id", "name", "key", "value"] as const) {
      if (typeof object[prop] === "string" && object[prop]) return { [prop]: object[prop] };
    }
    return null;
  }
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

export type CreateScreenFields = {
  /** Ids the create screen accepts, or `null` when Jira told us nothing usable. */
  allowed: Set<string> | null;
  /** Ids the create screen marks required. */
  required: string[];
};

type CreateMetaField = JiraCreateMetaField & { key?: string; id?: string };

/**
 * Read a `createmeta` payload, in either the map shape (`issuetypes[].fields`)
 * or the paged list shape (`values`).
 */
export function createScreenFields(
  fields: Record<string, CreateMetaField> | CreateMetaField[] | null | undefined
): CreateScreenFields {
  const entries: Array<[string, CreateMetaField]> = Array.isArray(fields)
    ? fields.flatMap((field) => {
        const id = field.fieldId || field.key || field.id;
        return id ? [[id, field] as [string, CreateMetaField]] : [];
      })
    : Object.entries(fields ?? {}).map(([id, field]) => [field?.fieldId || id, field]);

  if (entries.length === 0) return { allowed: null, required: [] };
  return {
    allowed: new Set(entries.map(([id]) => id)),
    required: entries.filter(([, field]) => field?.required).map(([id]) => id),
  };
}

/**
 * Build the create payload for a copy of `source`: the fields worth carrying
 * over, intersected with what the target create screen accepts.
 */
export function buildCloneFields(source: JiraIssue, options: CloneFieldsOptions = {}): CloneFields {
  const raw = (source.fields ?? {}) as Record<string, unknown>;
  const projectKey =
    (raw.project as { key?: string } | undefined)?.key ?? source.key?.split("-")[0] ?? "";
  const issueTypeId = (raw.issuetype as { id?: string } | undefined)?.id ?? "";

  const candidates = [
    ...CLONE_SYSTEM_FIELDS,
    ...(options.extraFieldIds ?? []),
    ...(options.requiredFieldIds ?? []),
  ].filter((id, index, all) => Boolean(id) && !CLONE_DENIED_FIELDS.has(id) && all.indexOf(id) === index);
  const allowed =
    options.allowedFieldIds ?? new Set<string>(CLONE_FALLBACK_FIELDS as readonly string[]);

  const fields: Record<string, unknown> = {};
  const skipped: string[] = [];
  for (const id of candidates) {
    const value = normalizeFieldValue(raw[id]);
    if (value === null) continue;
    if (!allowed.has(id)) {
      skipped.push(id);
      continue;
    }
    fields[id] = value;
  }

  return {
    projectKey,
    issueTypeId,
    summary: options.summary?.trim() || cloneSummary(raw.summary as string | undefined),
    fields,
    skipped,
  };
}

/** The "Cloners" link type, or the closest usable stand-in on this Jira. */
export function resolveCloneLinkType(
  types: JiraIssueLinkType[] | null | undefined
): JiraIssueLinkType | null {
  const list = (types ?? []).filter((type) => type && type.name);
  const named = (value: string | undefined) => (value ?? "").trim().toLowerCase();
  return (
    list.find((type) => named(type.name) === "cloners") ??
    list.find((type) => named(type.outward) === "clones") ??
    list.find((type) => named(type.inward) === "is cloned by") ??
    list.find((type) => named(type.name) === "relates") ??
    list.find((type) => named(type.outward).startsWith("relates")) ??
    null
  );
}

/**
 * How an issue's own link list describes its relation to `otherKey`
 * (e.g. `"clones"`), read back from Jira so the UI never guesses the direction.
 */
export function describeLinkTo(
  links: JiraIssueLink[] | null | undefined,
  otherKey: string
): string | null {
  const wanted = otherKey.toUpperCase();
  for (const link of links ?? []) {
    if (link?.outwardIssue?.key?.toUpperCase() === wanted) return link.type?.outward ?? null;
    if (link?.inwardIssue?.key?.toUpperCase() === wanted) return link.type?.inward ?? null;
  }
  return null;
}
