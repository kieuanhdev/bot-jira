/**
 * Jira Work Criteria Policy Definition & Quality Scoring.
 * Implements sections 18.1 - 18.9 of docs/AI_BULK_TASK_GENERATION_PLAN.md.
 */

import { parseJiraDuration } from "@/lib/worklogs/schema";
import { type ProjectCalendar, isValidDateString } from "./business-days";

export type JiraWorkCriteriaMode = "off" | "warn" | "enforce";

export type WorkCategory = "feature" | "defect" | "debt" | "risk";

export type WorkCategoryStrategy = "label" | "customField" | "issueType";

export type JiraWorkCriteriaRequiredField =
  | "originalEstimate"
  | "points"
  | "workCategory"
  | "fixVersion"
  | "dueDate";

export type JiraWorkCriteriaPolicy = {
  version: string;
  mode: JiraWorkCriteriaMode;
  requiredAtCreation: JiraWorkCriteriaRequiredField[];
  pointScale: number[];
  cycleTimeUpperDaysByPoint: Record<number, number>;
  cycleTimeWarningThresholdByPoint: Record<number, number>;
  workCategoryMapping: {
    strategy: WorkCategoryStrategy;
    fieldId?: string;
    values: {
      feature: string;
      defect: string;
      debt: string;
      risk: string;
    };
  };
};

export type AiBulkPlanningContext = {
  defaultWorkCategory?: WorkCategory;
  fixVersionId?: string;
  plannedStartDate?: string;
  businessDeadline?: string;
  businessDeadlineReason?: string;
  calendar?: ProjectCalendar;
};

export type AiWorkCriteriaDraftFields = {
  workCategory: WorkCategory;
  categoryReasoning?: string;
  originalEstimate?: string;
  points?: number;
};

export const DEFAULT_WORK_CRITERIA_POLICY_VERSION = "jira-work-criteria-v1";
export const DEFAULT_TECH_DEBT_LABEL = "tech-debt";

export const DEFAULT_POINT_SCALE = [1, 2, 3, 5, 8, 13];

export const DEFAULT_CYCLE_TIME_UPPER_DAYS: Record<number, number> = {
  1: 1,
  2: 1.5,
  3: 2.5,
  5: 4,
  8: 6,
  13: 9,
};

export const DEFAULT_CYCLE_TIME_WARNING_DAYS: Record<number, number> = {
  1: 1.5,
  2: 2.5,
  3: 4,
  5: 6,
  8: 9,
  13: 13,
};

export const DEFAULT_WORK_CATEGORY_MAPPING: JiraWorkCriteriaPolicy["workCategoryMapping"] = {
  strategy: "label",
  values: {
    feature: "work-feature",
    defect: "work-defect",
    debt: "tech-debt",
    risk: "work-risk",
  },
};

/**
 * Returns default draft Jira Work Criteria policy for projects.
 */
export function getDefaultWorkCriteriaPolicy(
  mode: JiraWorkCriteriaMode = "warn"
): JiraWorkCriteriaPolicy {
  return {
    version: DEFAULT_WORK_CRITERIA_POLICY_VERSION,
    mode,
    requiredAtCreation: [
      "workCategory",
      "points",
      "originalEstimate",
      "fixVersion",
      "dueDate",
    ],
    pointScale: [...DEFAULT_POINT_SCALE],
    cycleTimeUpperDaysByPoint: { ...DEFAULT_CYCLE_TIME_UPPER_DAYS },
    cycleTimeWarningThresholdByPoint: { ...DEFAULT_CYCLE_TIME_WARNING_DAYS },
    workCategoryMapping: {
      strategy: "label",
      values: { ...DEFAULT_WORK_CATEGORY_MAPPING.values },
    },
  };
}

export type QualityScoreBreakdown = {
  summary: number;
  description: number;
  acceptanceCriteria: number;
  workCategory: number;
  originalEstimate: number;
  storyPoints: number;
  fixVersion: number;
  dueDate: number;
};

export type QualityScoreStatus = "ready" | "review" | "blocked";

export type QualityScoreResult = {
  score: number;
  breakdown: QualityScoreBreakdown;
  status: QualityScoreStatus;
  reasons: string[];
};

export type QualityScoreInput = {
  summary?: string | null;
  description?: string | null;
  acceptanceCriteria?: string[] | null;
  workCategory?: string | null;
  originalEstimate?: string | null;
  points?: number | null;
  fixVersionId?: string | null;
  hasValidFixVersion?: boolean;
  dueDate?: string | null;
  hasValidDueDate?: boolean;
  policy?: JiraWorkCriteriaPolicy;
};

// Section headers expected in standard description template (Section 18.8)
const TEMPLATE_SECTION_MARKERS = [
  ["mục tiêu", "objective", "goal"],
  ["phạm vi", "scope"],
  ["ngoài phạm vi", "out of scope"],
  ["tiêu chí nghiệm thu", "acceptance criteria"],
  ["rủi ro", "phụ thuộc", "risks", "dependencies"],
  ["giả định", "assumptions"],
];

/**
 * Checks if a description text adheres to the structured description template (Section 18.8).
 */
export function checkDescriptionTemplate(description: string | null | undefined): {
  isValid: boolean;
  matchedSectionsCount: number;
  missingSections: string[];
} {
  if (!description || description.trim().length === 0) {
    return {
      isValid: false,
      matchedSectionsCount: 0,
      missingSections: ["Mục tiêu", "Phạm vi", "Ngoài phạm vi", "Tiêu chí nghiệm thu", "Rủi ro/Phụ thuộc", "Giả định cần xác nhận"],
    };
  }

  const lower = description.toLowerCase();
  const sectionNames = [
    "Mục tiêu",
    "Phạm vi",
    "Ngoài phạm vi",
    "Tiêu chí nghiệm thu",
    "Rủi ro / Phụ thuộc",
    "Giả định cần xác nhận",
  ];
  const missingSections: string[] = [];
  let matchedCount = 0;

  TEMPLATE_SECTION_MARKERS.forEach((synonyms, index) => {
    const found = synonyms.some((syn) => lower.includes(syn));
    if (found) {
      matchedCount++;
    } else {
      missingSections.push(sectionNames[index]);
    }
  });

  // Considered valid if at least 4 key sections are present (or all for strict matching)
  const isValid = matchedCount >= 4;

  return { isValid, matchedSectionsCount: matchedCount, missingSections };
}

/**
 * Rule-based, deterministic quality score calculation (Section 18.9).
 * Max score = 100:
 * - Summary rõ ràng, không trùng: 15
 * - Description đúng template: 15
 * - Acceptance criteria kiểm chứng được: 20
 * - Work category hợp lệ: 10
 * - Original Estimate hợp lệ: 10
 * - Story Points hợp lệ: 10
 * - Fix Version hợp lệ: 10
 * - Due Date có căn cứ: 10
 */
export function calculateRuleQualityScore(input: QualityScoreInput): QualityScoreResult {
  const policy = input.policy ?? getDefaultWorkCriteriaPolicy();
  const reasons: string[] = [];

  const breakdown: QualityScoreBreakdown = {
    summary: 0,
    description: 0,
    acceptanceCriteria: 0,
    workCategory: 0,
    originalEstimate: 0,
    storyPoints: 0,
    fixVersion: 0,
    dueDate: 0,
  };

  // 1. Summary: 15 pts
  const summary = input.summary?.trim() ?? "";
  if (summary.length >= 5 && !/^(task|todo|issue|new\s*task)\b/i.test(summary)) {
    breakdown.summary = 15;
  } else if (summary.length > 0) {
    breakdown.summary = 8;
    reasons.push("Summary còn ngắn hoặc mang tính placeholder chung chung");
  } else {
    reasons.push("Thiếu Summary");
  }

  // 2. Description đúng template: 15 pts
  const templateCheck = checkDescriptionTemplate(input.description);
  if (templateCheck.matchedSectionsCount >= 5) {
    breakdown.description = 15;
  } else if (templateCheck.matchedSectionsCount >= 3) {
    breakdown.description = 10;
    reasons.push(`Description thiếu cấu trúc: ${templateCheck.missingSections.join(", ")}`);
  } else if (input.description && input.description.trim().length > 20) {
    breakdown.description = 5;
    reasons.push("Description chưa theo cấu trúc template chuẩn của Jira Work Criteria");
  } else {
    reasons.push("Description còn trống hoặc quá ngắn");
  }

  // 3. Acceptance criteria kiểm chứng được: 20 pts
  const acList = input.acceptanceCriteria ?? [];
  const hasChecklistInDesc = input.description ? /- \[[ xX]\]/i.test(input.description) : false;
  const validAcCount = acList.filter((c) => c && c.trim().length > 3).length;

  if (validAcCount >= 2 || (validAcCount >= 1 && hasChecklistInDesc)) {
    breakdown.acceptanceCriteria = 20;
  } else if (validAcCount >= 1 || hasChecklistInDesc) {
    breakdown.acceptanceCriteria = 12;
    reasons.push("Tiêu chí nghiệm thu còn ít (khuyến nghị >= 2 tiêu chí rõ ràng)");
  } else {
    reasons.push("Chưa có tiêu chí nghiệm thu (Acceptance Criteria)");
  }

  // 4. Work category hợp lệ: 10 pts
  const cat = input.workCategory?.toLowerCase();
  if (cat && ["feature", "defect", "debt", "risk"].includes(cat)) {
    breakdown.workCategory = 10;
  } else {
    reasons.push("Chưa phân loại công việc hợp lệ (Feature/Defect/Debt/Risk)");
  }

  // 5. Original Estimate hợp lệ: 10 pts
  if (input.originalEstimate) {
    const seconds = parseJiraDuration(input.originalEstimate);
    if (seconds && seconds > 0) {
      breakdown.originalEstimate = 10;
    } else {
      reasons.push(`Original Estimate không đúng định dạng Jira ("${input.originalEstimate}")`);
    }
  } else {
    reasons.push("Chưa có Original Estimate");
  }

  // 6. Story Points hợp lệ: 10 pts
  if (input.points !== undefined && input.points !== null) {
    if (policy.pointScale.includes(input.points)) {
      breakdown.storyPoints = 10;
    } else if (input.points > 13) {
      breakdown.storyPoints = 0;
      reasons.push(`Story Points (${input.points}) vượt quá ngưỡng 13 điểm, bắt buộc phân rã`);
    } else {
      breakdown.storyPoints = 5;
      reasons.push(`Story Points (${input.points}) không thuộc thang điểm chuẩn [${policy.pointScale.join(", ")}]`);
    }
  } else {
    reasons.push("Chưa có Story Points");
  }

  // 7. Fix Version hợp lệ: 10 pts
  const hasVersion = input.hasValidFixVersion ?? Boolean(input.fixVersionId && input.fixVersionId.trim().length > 0);
  if (hasVersion) {
    breakdown.fixVersion = 10;
  } else {
    reasons.push("Chưa có Fix Version mục tiêu hợp lệ");
  }

  // 8. Due Date có căn cứ: 10 pts
  const hasDueDate = input.hasValidDueDate ?? (Boolean(input.dueDate) && isValidDateString(input.dueDate));
  if (hasDueDate) {
    breakdown.dueDate = 10;
  } else {
    reasons.push("Chưa có Due Date hợp lệ tính từ baseline hoặc deadline");
  }

  const totalScore =
    breakdown.summary +
    breakdown.description +
    breakdown.acceptanceCriteria +
    breakdown.workCategory +
    breakdown.originalEstimate +
    breakdown.storyPoints +
    breakdown.fixVersion +
    breakdown.dueDate;

  let status: QualityScoreStatus;
  if (totalScore >= 90) {
    status = "ready";
  } else if (totalScore >= 70) {
    status = "review";
  } else {
    status = "blocked";
  }

  return {
    score: totalScore,
    breakdown,
    status,
    reasons,
  };
}
