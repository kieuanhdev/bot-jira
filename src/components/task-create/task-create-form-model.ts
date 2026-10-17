/**
 * Pure helpers behind the shared task create form (board, Sentry, bulk detail sheet).
 * Kept free of React so every rule can be unit-tested.
 */
import {
  MAX_SUMMARY_LENGTH,
  type BulkCreateProjectMetadata,
  type BulkCreateRowInput,
  type BulkCreateValidationError,
  type BulkCreateValidationWarning,
} from "@/lib/bulk/create-types";
import { SYSTEM_FIELD_IDS } from "@/lib/bulk/create-custom-fields";

export type TaskCreatePrefill = Partial<Omit<BulkCreateRowInput, "clientRef">>;

export type CanSubmitResult = { ok: true } | { ok: false; reason: string };

/** Client ref for the one-row batch a single create sends through the bulk pipeline. */
export const SINGLE_CLIENT_REF = "single-1";

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function emptyRow(meta: BulkCreateProjectMetadata): BulkCreateRowInput {
  return {
    clientRef: SINGLE_CLIENT_REF,
    summary: "",
    issueTypeId: meta.defaultIssueTypeId ?? undefined,
    labels: [],
  };
}

/** Re-add locked labels (e.g. Sentry dedup labels) so the user cannot remove them. */
export function withLockedLabels(
  row: BulkCreateRowInput,
  lockedLabels: readonly string[] | undefined
): BulkCreateRowInput {
  if (!lockedLabels || lockedLabels.length === 0) return row;
  return { ...row, labels: dedupe([...(row.labels ?? []), ...lockedLabels]) };
}

/** Overlay prefill values (undefined keys are ignored) and merge locked labels. */
export function applyPrefill(
  row: BulkCreateRowInput,
  prefill: TaskCreatePrefill | undefined,
  lockedLabels?: readonly string[]
): BulkCreateRowInput {
  const next: BulkCreateRowInput = { ...row };
  if (prefill) {
    for (const [key, value] of Object.entries(prefill)) {
      if (value === undefined || key === "clientRef") continue;
      (next as Record<string, unknown>)[key] = value;
    }
  }
  next.labels = dedupe(next.labels ?? []);
  return withLockedLabels(next, lockedLabels);
}

/**
 * Id of the non-subtask issue type whose name matches (trimmed, case-insensitive),
 * e.g. "Bug" for Sentry. Undefined when absent so the project default applies.
 */
export function resolveIssueTypeIdByName(
  meta: Pick<BulkCreateProjectMetadata, "issueTypes">,
  name: string | undefined
): string | undefined {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  return meta.issueTypes.find((t) => !t.subtask && t.name.trim().toLowerCase() === wanted)?.id;
}

export function effectiveIssueTypeId(
  row: BulkCreateRowInput,
  meta: BulkCreateProjectMetadata
): string | undefined {
  return row.issueTypeId || meta.defaultIssueTypeId || undefined;
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Client-side gate for the "Tạo task" button. Mirrors the cheap server checks
 * (summary, permission, required custom fields); the preview stays authoritative.
 */
export function canSubmit(row: BulkCreateRowInput, meta: BulkCreateProjectMetadata): CanSubmitResult {
  if (!meta.canCreate) {
    return { ok: false, reason: meta.permissionReason || "Bạn không có quyền tạo task trong dự án này" };
  }

  const summary = row.summary ?? "";
  if (!summary.trim()) return { ok: false, reason: "Nhập tiêu đề task" };
  if (/[\r\n]/.test(summary)) return { ok: false, reason: "Tiêu đề chỉ được một dòng" };
  if (summary.trim().length > MAX_SUMMARY_LENGTH) {
    return { ok: false, reason: `Tiêu đề tối đa ${MAX_SUMMARY_LENGTH} ký tự` };
  }

  const issueTypeId = effectiveIssueTypeId(row, meta);
  if (!issueTypeId) return { ok: false, reason: "Chọn loại task" };

  const issueType = meta.issueTypes.find((t) => t.id === issueTypeId);
  if (issueType?.subtask && !row.parent) {
    return { ok: false, reason: "Sub-task cần chọn task cha" };
  }

  const fields = meta.fieldsByIssueType[issueTypeId] ?? [];
  for (const f of fields) {
    if (!f.required) continue;
    if (SYSTEM_FIELD_IDS.has(f.id)) continue;
    if (meta.pointsFieldId && f.id === meta.pointsFieldId) continue;
    if (meta.epicLinkFieldId && f.id === meta.epicLinkFieldId) continue;
    if (isEmptyValue(row.customFields?.[f.id])) {
      return { ok: false, reason: `Thiếu trường bắt buộc "${f.name}"` };
    }
  }

  return { ok: true };
}

/** Row fields the form renders with an inline error slot. */
export type TaskCreateFieldKey =
  | "summary"
  | "issueTypeId"
  | "parent"
  | "assignee"
  | "priorityId"
  | "labels"
  | "fixVersionIds"
  | "componentIds"
  | "points"
  | "originalEstimate"
  | "dueDate"
  | "description";

function isFieldRendered(field: string, meta: BulkCreateProjectMetadata): field is TaskCreateFieldKey {
  switch (field) {
    case "summary":
    case "issueTypeId":
    case "parent":
    case "assignee":
    case "priorityId":
    case "labels":
    case "description":
      return true;
    case "fixVersionIds":
      return meta.versionOptions.length > 0;
    case "componentIds":
      return (meta.components?.length ?? 0) > 0;
    case "points":
      return Boolean(meta.pointsFieldId);
    case "originalEstimate":
      return meta.supportsTimeTracking;
    case "dueDate":
      return meta.supportsDueDate;
    default:
      return false;
  }
}

/**
 * Split preview errors into inline field errors (first message per field) and a
 * general list for errors without a visible field (custom fields, request-level).
 */
export function splitPreviewErrors(
  errors: readonly BulkCreateValidationError[],
  meta: BulkCreateProjectMetadata
): { fieldErrors: Record<string, string>; general: BulkCreateValidationError[] } {
  const fieldErrors: Record<string, string> = {};
  const general: BulkCreateValidationError[] = [];
  for (const err of errors) {
    if (err.field && isFieldRendered(err.field, meta)) {
      if (!(err.field in fieldErrors)) fieldErrors[err.field] = err.message;
    } else {
      general.push(err);
    }
  }
  return { fieldErrors, general };
}

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9_]+-\d+)\b/;

/** Existing issue a duplicate warning points at (explicit key, else parsed from the message). */
export function duplicateKeyFromWarning(
  warning: BulkCreateValidationWarning & { existingDuplicateKey?: string }
): string | null {
  if (warning.existingDuplicateKey) return warning.existingDuplicateKey;
  return warning.message.match(JIRA_KEY_RE)?.[1] ?? null;
}

const AI_OVERWRITE_KEYS = ["summary", "description"] as const;

/**
 * Whether applying an AI prefill would replace summary/description the user
 * already wrote with different text (identical text after trimming is no loss).
 */
export function aiOverwriteNeedsConfirm(row: BulkCreateRowInput, prefill: TaskCreatePrefill): boolean {
  return AI_OVERWRITE_KEYS.some((key) => {
    const next = prefill[key]?.trim();
    const current = row[key]?.trim();
    return Boolean(next && current && next !== current);
  });
}

/**
 * Merge an AI suggestion into the form. Summary and description are replaced
 * (callers confirm first via `aiOverwriteNeedsConfirm`); every other field is
 * only filled when empty. The project's default issue type counts as empty, and
 * locked labels are ignored when deciding whether labels are empty, then kept.
 */
export function mergeAiPrefill(
  row: BulkCreateRowInput,
  prefill: TaskCreatePrefill,
  opts: { lockedLabels?: readonly string[]; defaultIssueTypeId?: string | null } = {}
): BulkCreateRowInput {
  const next: BulkCreateRowInput = { ...row };
  const locked = new Set(opts.lockedLabels ?? []);

  for (const [key, value] of Object.entries(prefill)) {
    if (key === "clientRef" || isEmptyValue(value)) continue;
    const field = key as keyof TaskCreatePrefill;
    let fillable: boolean;
    if (field === "summary" || field === "description") {
      fillable = true;
    } else if (field === "issueTypeId") {
      fillable = !row.issueTypeId || row.issueTypeId === opts.defaultIssueTypeId;
    } else if (field === "labels") {
      fillable = (row.labels ?? []).every((label) => locked.has(label));
    } else {
      fillable = isEmptyValue(row[field]);
    }
    if (fillable) (next as Record<string, unknown>)[field] = value;
  }

  next.labels = dedupe(next.labels ?? []);
  return withLockedLabels(next, opts.lockedLabels);
}
