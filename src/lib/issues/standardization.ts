/**
 * Task Standardization Evaluator Module
 *
 * Implements standardization rules and policy evaluation according to
 * docs/TASK_STANDARDIZATION_IN_STALE_ANALYSIS_PLAN.md
 */

export type RequirementCode = "ESTIMATION" | "WORKLOG" | "FIX_VERSION" | "DUE_DATE";

export type StandardizationStatus = "complete" | "incomplete" | "unknown";

export type PolicyId = "planned-work" | "maintenance-work" | "default";

export const POLICY_VERSION = "1.0";

export const PLANNED_WORK_LABELS = new Set(["flow-feature", "flow-support"]);
export const MAINTENANCE_WORK_LABELS = new Set(["flow-bug", "flow-defect", "flow-debt"]);

export const POLICY_REQUIREMENTS: Record<PolicyId, RequirementCode[]> = {
  "planned-work": ["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"],
  "maintenance-work": ["WORKLOG", "FIX_VERSION", "DUE_DATE"],
  default: ["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"],
};

export const POLICY_NAMES: Record<PolicyId, string> = {
  "planned-work": "Kế hoạch tính năng (Planned)",
  "maintenance-work": "Bảo trì / Sửa lỗi (Maintenance)",
  default: "Tiêu chuẩn mặc định",
};

export const REQUIREMENT_LABELS: Record<RequirementCode, string> = {
  ESTIMATION: "Estimate / Story point",
  WORKLOG: "Worklog",
  FIX_VERSION: "Fix Version",
  DUE_DATE: "Due date",
};

export const REQUIREMENT_DESCRIPTIONS: Record<RequirementCode, string> = {
  ESTIMATION: "Thiếu Estimate/Story point/Task Points",
  WORKLOG: "Chưa log Worklog",
  FIX_VERSION: "Thiếu Fix Version",
  DUE_DATE: "Thiếu Due date",
};

export const REQUIREMENT_ACTIONS: Record<RequirementCode, string> = {
  ESTIMATION: "Đặt Points hoặc Original Estimate",
  WORKLOG: "Ghi Worklog",
  FIX_VERSION: "Gán Fix Version",
  DUE_DATE: "Đặt Due date",
};

/**
 * Mapping from requirement code to relevant Bulk Edit field identifiers.
 */
export const REQUIREMENT_BULK_FIELDS: Record<RequirementCode, string[]> = {
  ESTIMATION: ["points", "estimate"],
  WORKLOG: ["worklog"],
  FIX_VERSION: ["fixVersions"],
  DUE_DATE: ["dueDate"],
};

export interface StandardizationInput {
  points?: number | null;
  originalEstimateSeconds?: number | null;
  timeSpent?: number | null;
  fixVersionIds?: string[] | null;
  fixVersionNames?: string[] | null;
  dueDate?: Date | string | null;
  labels?: string[] | null;
  isUnknown?: boolean;
}

export interface StandardizationResult {
  status: StandardizationStatus;
  policyId: PolicyId;
  policyVersion: string;
  required: RequirementCode[];
  missing: RequirementCode[];
  satisfied: RequirementCode[];
  unknown: RequirementCode[];
  warnings: string[];
}

/**
 * Determine policy and warnings from issue labels according to section 4.2:
 * 1. Normalize labels to lowercase.
 * 2. Precedence: planned-work > maintenance-work > default.
 * 3. Add AMBIGUOUS_POLICY_LABEL warning if labels match multiple profiles.
 */
export function resolvePolicy(labels?: string[] | null): {
  policyId: PolicyId;
  warnings: string[];
} {
  const normalizedLabels = (labels ?? [])
    .map((l) => l.trim().toLowerCase())
    .filter(Boolean);

  const hasPlanned = normalizedLabels.some((l) => PLANNED_WORK_LABELS.has(l));
  const hasMaintenance = normalizedLabels.some((l) => MAINTENANCE_WORK_LABELS.has(l));

  const warnings: string[] = [];

  if (hasPlanned && hasMaintenance) {
    warnings.push("AMBIGUOUS_POLICY_LABEL");
    return { policyId: "planned-work", warnings };
  }

  if (hasPlanned) {
    return { policyId: "planned-work", warnings };
  }

  if (hasMaintenance) {
    return { policyId: "maintenance-work", warnings };
  }

  return { policyId: "default", warnings };
}

/**
 * Evaluates whether an issue meets the standardization requirements.
 * Pure function with no side-effects.
 */
export function evaluateStandardization(input: StandardizationInput): StandardizationResult {
  const { policyId, warnings } = resolvePolicy(input.labels);
  const required = [...POLICY_REQUIREMENTS[policyId]];

  if (input.isUnknown) {
    return {
      status: "unknown",
      policyId,
      policyVersion: POLICY_VERSION,
      required,
      missing: [],
      satisfied: [],
      unknown: required,
      warnings,
    };
  }

  const satisfied: RequirementCode[] = [];
  const missing: RequirementCode[] = [];

  for (const req of required) {
    switch (req) {
      case "ESTIMATION": {
        const hasPoints = input.points != null && input.points > 0;
        const hasEstimate = input.originalEstimateSeconds != null && input.originalEstimateSeconds > 0;
        if (hasPoints || hasEstimate) {
          satisfied.push("ESTIMATION");
        } else {
          missing.push("ESTIMATION");
        }
        break;
      }

      case "WORKLOG": {
        if (input.timeSpent != null && input.timeSpent > 0) {
          satisfied.push("WORKLOG");
        } else {
          missing.push("WORKLOG");
        }
        break;
      }

      case "FIX_VERSION": {
        const hasId = Array.isArray(input.fixVersionIds) && input.fixVersionIds.some((id) => id && id.trim() !== "");
        const hasName = Array.isArray(input.fixVersionNames) && input.fixVersionNames.some((name) => name && name.trim() !== "");
        if (hasId || hasName) {
          satisfied.push("FIX_VERSION");
        } else {
          missing.push("FIX_VERSION");
        }
        break;
      }

      case "DUE_DATE": {
        if (input.dueDate != null) {
          const d = input.dueDate instanceof Date ? input.dueDate : new Date(input.dueDate);
          if (!isNaN(d.getTime())) {
            satisfied.push("DUE_DATE");
            break;
          }
        }
        missing.push("DUE_DATE");
        break;
      }
    }
  }

  const status: StandardizationStatus = missing.length === 0 ? "complete" : "incomplete";

  return {
    status,
    policyId,
    policyVersion: POLICY_VERSION,
    required,
    missing,
    satisfied,
    unknown: [],
    warnings,
  };
}

/**
 * Format a human-readable summary of missing fields in Vietnamese.
 * Example: "Thiếu 3 mục: Worklog, Fix Version, Due date"
 */
export function formatMissingSummary(missing: RequirementCode[]): string {
  if (missing.length === 0) return "Đã đạt chuẩn";
  const names = missing.map((code) => REQUIREMENT_LABELS[code]);
  return `Thiếu ${missing.length} mục: ${names.join(", ")}`;
}
