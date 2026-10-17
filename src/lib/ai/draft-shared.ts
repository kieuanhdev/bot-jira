/**
 * Small helpers shared by the AI form-fill prompts (task draft, sub-task split):
 * JSON shape guards for LLM output and the quiet normalization policy.
 */
import { getDefaultWorkCriteriaPolicy, type JiraWorkCriteriaPolicy } from "@/lib/bulk/work-criteria-policy";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** `"a", "b"` for a prompt list, or a "none" marker. */
export function listOrNone(values: string[]): string {
  return values.length > 0 ? values.map((v) => `"${v}"`).join(", ") : "(không có)";
}

/**
 * Policy for `normalizeAiDraftBatch` when the result only pre-fills a form: no
 * required-field warnings and no work-category label.
 */
export function quietDraftPolicy(): JiraWorkCriteriaPolicy {
  const policy = getDefaultWorkCriteriaPolicy("off");
  return {
    ...policy,
    requiredAtCreation: [],
    workCategoryMapping: { ...policy.workCategoryMapping, strategy: "issueType" },
  };
}
