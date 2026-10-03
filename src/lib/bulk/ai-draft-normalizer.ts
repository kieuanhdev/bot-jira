/**
 * AI Draft Normalizer & Jira Work Criteria Evaluation.
 * Implements sections 18.1 - 18.10 of docs/AI_BULK_TASK_GENERATION_PLAN.md.
 */

import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
  type BulkCreateValidationWarning,
  type BulkCreateValidationError,
  MAX_SUMMARY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_LABEL_LENGTH,
  MAX_LABELS_COUNT,
} from "./create-types";
import { parseJiraDuration } from "@/lib/worklogs/schema";
import {
  type JiraWorkCriteriaPolicy,
  type AiBulkPlanningContext,
  type WorkCategory,
  type QualityScoreResult,
  DEFAULT_TECH_DEBT_LABEL,
  getDefaultWorkCriteriaPolicy,
  calculateRuleQualityScore,
} from "./work-criteria-policy";
import {
  addBusinessDays,
  isValidDateString,
} from "./business-days";

export type RawAiDraftTaskItem = {
  clientRef?: string;
  summary: string;
  description?: string;
  acceptanceCriteria?: string[];
  workCategory?: WorkCategory | string;
  categoryReasoning?: string;
  issueTypeName?: string;
  issueTypeId?: string;
  parentRef?: string;
  priorityName?: string;
  priorityId?: string;
  labels?: string[];
  points?: number;
  originalEstimate?: string;
  dueDate?: string;
  fixVersionId?: string;
  fixVersionName?: string;
  componentNames?: string[];
  componentIds?: string[];
  confidence?: number;
  reasoning?: string;
  // Lifecycle fields forbidden at creation
  worklogs?: unknown;
  timeSpent?: unknown;
  spentSeconds?: unknown;
};

export type NormalizedAiDraftItem = {
  clientRef: string;
  rowInput: BulkCreateRowInput;
  classification: "ready" | "review" | "blocked";
  qualityScore: QualityScoreResult;
  workCategory: WorkCategory;
  categoryReasoning?: string;
  warnings: BulkCreateValidationWarning[];
  errors: BulkCreateValidationError[];
  confidence: number;
};

export type NormalizeAiDraftBatchInput = {
  items: RawAiDraftTaskItem[];
  policy?: JiraWorkCriteriaPolicy;
  context?: AiBulkPlanningContext;
  metadata?: Partial<BulkCreateProjectMetadata>;
};

export type NormalizeAiDraftBatchResult = {
  items: NormalizedAiDraftItem[];
  summary: {
    total: number;
    readyCount: number;
    reviewCount: number;
    blockedCount: number;
    averageQualityScore: number;
  };
  policyVersion: string;
  policyMode: JiraWorkCriteriaPolicy["mode"];
};

/**
 * Normalizes an individual raw AI draft item against Jira metadata and Work Criteria policy.
 */
export function normalizeAiDraftItem(
  rawItem: RawAiDraftTaskItem,
  index: number,
  policy: JiraWorkCriteriaPolicy,
  context: AiBulkPlanningContext = {},
  metadata?: Partial<BulkCreateProjectMetadata>
): NormalizedAiDraftItem {
  const warnings: BulkCreateValidationWarning[] = [];
  const errors: BulkCreateValidationError[] = [];

  const clientRef = rawItem.clientRef?.trim() || `ai-task-${index + 1}`;

  // 1. Guard against lifecycle worklog fields at creation time (Section 18.2, 18.11)
  if (
    rawItem.worklogs !== undefined ||
    rawItem.timeSpent !== undefined ||
    rawItem.spentSeconds !== undefined
  ) {
    warnings.push({
      field: "worklogs",
      code: "WORKLOG_FORBIDDEN_AT_CREATION",
      message: "Task mới không được chứa Worklog/Time Spent; dữ liệu này đã bị loại bỏ.",
    });
  }

  // 2. Summary normalization
  let summary = (rawItem.summary || "").trim();
  if (!summary) {
    errors.push({
      field: "summary",
      code: "REQUIRED_SUMMARY",
      message: "Tiêu đề (Summary) không được để trống.",
    });
  } else if (summary.length > MAX_SUMMARY_LENGTH) {
    warnings.push({
      field: "summary",
      code: "SUMMARY_TRUNCATED",
      message: `Tiêu đề vượt quá ${MAX_SUMMARY_LENGTH} ký tự, đã được cắt ngắn.`,
    });
    summary = summary.slice(0, MAX_SUMMARY_LENGTH);
  }

  // 3. Description & Acceptance Criteria formatting
  let description = (rawItem.description || "").trim();
  const acList = Array.isArray(rawItem.acceptanceCriteria)
    ? rawItem.acceptanceCriteria.map((c) => c.trim()).filter(Boolean)
    : [];

  if (acList.length > 0 && !description.includes("- [ ]") && !description.includes("Tiêu chí nghiệm thu")) {
    const acSection = `\n\nTiêu chí nghiệm thu:\n` + acList.map((c) => `- [ ] ${c}`).join("\n");
    description = (description + acSection).trim();
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    warnings.push({
      field: "description",
      code: "DESCRIPTION_TRUNCATED",
      message: `Mô tả vượt quá ${MAX_DESCRIPTION_LENGTH} ký tự.`,
    });
    description = description.slice(0, MAX_DESCRIPTION_LENGTH);
  }

  // 4. Work Category resolution (Section 18.4)
  const rawCat = (rawItem.workCategory || context.defaultWorkCategory || "feature").toString().toLowerCase();
  let workCategory: WorkCategory = "feature";
  if (["feature", "defect", "debt", "risk"].includes(rawCat)) {
    workCategory = rawCat as WorkCategory;
  } else {
    warnings.push({
      field: "workCategory",
      code: "INVALID_WORK_CATEGORY",
      message: `Nhóm công việc "${rawItem.workCategory}" không thuộc chuẩn [Feature, Defect, Debt, Risk], chuyển về Feature.`,
    });
  }

  // 5. Labels and category mapping
  const labelsSet = new Set<string>();
  if (Array.isArray(rawItem.labels)) {
    rawItem.labels.forEach((lbl) => {
      const trimmed = lbl.trim().toLowerCase().replace(/\s+/g, "-").slice(0, MAX_LABEL_LENGTH);
      if (trimmed) labelsSet.add(trimmed);
    });
  }

  // Apply Work Category mapping according to policy
  const customFields: Record<string, unknown> = {};
  const mapping = policy.workCategoryMapping;

  if (mapping.strategy === "label") {
    const mappedLabel = mapping.values[workCategory];
    if (mappedLabel) {
      labelsSet.add(mappedLabel);
    }
  } else if (mapping.strategy === "customField" && mapping.fieldId) {
    customFields[mapping.fieldId] = mapping.values[workCategory];
  }

  // CRITICAL RULE (Section 18.4, 18.11): Debt ALWAYS includes label "tech-debt" regardless of strategy!
  if (workCategory === "debt") {
    labelsSet.add(DEFAULT_TECH_DEBT_LABEL);
  }

  const finalLabels = Array.from(labelsSet).slice(0, MAX_LABELS_COUNT);

  // 6. Story Points validation & 13-point threshold
  let points: number | null = null;
  if (rawItem.points !== undefined && rawItem.points !== null) {
    const p = Number(rawItem.points);
    if (!Number.isFinite(p) || p <= 0) {
      warnings.push({
        field: "points",
        code: "INVALID_POINTS",
        message: `Story Points "${rawItem.points}" không hợp lệ.`,
      });
    } else if (p > 13) {
      const msg = `Task có ${p} điểm (> 13 điểm): bắt buộc phải phân rã thành nhiều task nhỏ hơn.`;
      if (policy.mode === "enforce") {
        errors.push({ field: "points", code: "POINTS_EXCEED_LIMIT", message: msg });
      } else {
        warnings.push({ field: "points", code: "POINTS_EXCEED_LIMIT", message: msg });
      }
      points = p;
    } else {
      if (p === 13) {
        warnings.push({
          field: "points",
          code: "POINTS_HIGH_WARNING",
          message: "Task 13 điểm: khuyến nghị phân rã nhỏ hơn hoặc cần nêu rõ lý do kỹ thuật.",
        });
      }
      if (!policy.pointScale.includes(p)) {
        warnings.push({
          field: "points",
          code: "POINTS_NOT_IN_SCALE",
          message: `Story Points (${p}) không nằm trong thang điểm quy định [${policy.pointScale.join(", ")}].`,
        });
      }
      points = p;
    }
  } else if (policy.requiredAtCreation.includes("points") && policy.mode !== "off") {
    const msg = "Chưa có Story Points cho task.";
    if (policy.mode === "enforce") {
      errors.push({ field: "points", code: "MISSING_REQUIRED_POINTS", message: msg });
    } else {
      warnings.push({ field: "points", code: "MISSING_POINTS", message: msg });
    }
  }

  // 7. Original Estimate validation
  let originalEstimate: string | undefined = undefined;
  if (rawItem.originalEstimate) {
    const trimmedEst = rawItem.originalEstimate.trim();
    const durationSeconds = parseJiraDuration(trimmedEst);
    if (!durationSeconds || durationSeconds <= 0) {
      const msg = `Original Estimate "${trimmedEst}" không đúng định dạng Jira (ví dụ: "1d", "4h", "2h 30m").`;
      if (policy.mode === "enforce") {
        errors.push({ field: "originalEstimate", code: "INVALID_ESTIMATE", message: msg });
      } else {
        warnings.push({ field: "originalEstimate", code: "INVALID_ESTIMATE", message: msg });
      }
    } else {
      originalEstimate = trimmedEst;
    }
  } else if (policy.requiredAtCreation.includes("originalEstimate") && policy.mode !== "off") {
    const msg = "Chưa có Original Estimate cho task.";
    if (policy.mode === "enforce") {
      errors.push({ field: "originalEstimate", code: "MISSING_REQUIRED_ESTIMATE", message: msg });
    } else {
      warnings.push({ field: "originalEstimate", code: "MISSING_ESTIMATE", message: msg });
    }
  }

  // 8. Fix Version resolution & validation (Section 18.7)
  let fixVersionIds: string[] = [];
  const targetVersionId = rawItem.fixVersionId || context.fixVersionId;
  let hasValidFixVersion = false;

  if (targetVersionId) {
    if (metadata?.versionOptions && metadata.versionOptions.length > 0) {
      const matched = metadata.versionOptions.find(
        (v) => v.id === targetVersionId || v.name.toLowerCase() === targetVersionId.toLowerCase()
      );
      if (!matched) {
        warnings.push({
          field: "fixVersion",
          code: "UNKNOWN_VERSION",
          message: `Fix Version "${targetVersionId}" không tìm thấy trong metadata Jira của project.`,
        });
      } else if (matched.archived) {
        const msg = `Fix Version "${matched.name}" đã được lưu trữ (archived), không thể gán cho task mới.`;
        if (policy.mode === "enforce") {
          errors.push({ field: "fixVersion", code: "VERSION_ARCHIVED", message: msg });
        } else {
          warnings.push({ field: "fixVersion", code: "VERSION_ARCHIVED", message: msg });
        }
      } else if (matched.released) {
        const msg = `Fix Version "${matched.name}" đã được phát hành (released), không nên gán cho task mới.`;
        if (policy.mode === "enforce") {
          errors.push({ field: "fixVersion", code: "VERSION_RELEASED", message: msg });
        } else {
          warnings.push({ field: "fixVersion", code: "VERSION_RELEASED", message: msg });
        }
      } else {
        fixVersionIds = [matched.id];
        hasValidFixVersion = true;
      }
    } else {
      fixVersionIds = [targetVersionId];
      hasValidFixVersion = true;
    }
  } else if (policy.requiredAtCreation.includes("fixVersion") && policy.mode !== "off") {
    const msg = "Chưa chọn Fix Version mục tiêu cho task.";
    if (policy.mode === "enforce") {
      errors.push({ field: "fixVersion", code: "MISSING_REQUIRED_VERSION", message: msg });
    } else {
      warnings.push({ field: "fixVersion", code: "MISSING_VERSION", message: msg });
    }
  }

  // 9. Due Date calculation via server & deadline evaluation (Section 18.6)
  let dueDate: string | null = null;
  let hasValidDueDate = false;

  const plannedStartDate = context.plannedStartDate;
  let calculatedBaselineDate: string | null = null;

  if (plannedStartDate && isValidDateString(plannedStartDate)) {
    const pointVal = points ?? 1;
    const upperDays = policy.cycleTimeUpperDaysByPoint[pointVal] ?? Math.ceil(pointVal / 2);
    try {
      calculatedBaselineDate = addBusinessDays(plannedStartDate, upperDays, context.calendar);
      dueDate = calculatedBaselineDate;
      hasValidDueDate = true;
    } catch {
      // Ignore calculation error, fallback
    }
  }

  // Check business deadline override
  if (context.businessDeadline && isValidDateString(context.businessDeadline)) {
    const deadline = context.businessDeadline;
    if (calculatedBaselineDate && deadline < calculatedBaselineDate) {
      const reason = context.businessDeadlineReason?.trim();
      if (!reason) {
        const msg = `Deadline nghiệp vụ (${deadline}) sớm hơn baseline (${calculatedBaselineDate}) nhưng thiếu lý do bắt buộc (businessDeadlineReason).`;
        if (policy.mode === "enforce") {
          errors.push({ field: "dueDate", code: "MISSING_DEADLINE_REASON", message: msg });
        } else {
          warnings.push({ field: "dueDate", code: "MISSING_DEADLINE_REASON", message: msg });
        }
        dueDate = calculatedBaselineDate;
      } else {
        dueDate = deadline;
        hasValidDueDate = true;
      }
    } else {
      dueDate = deadline;
      hasValidDueDate = true;
    }
  }

  // Check manual/raw dueDate if provided
  if (!dueDate && rawItem.dueDate && isValidDateString(rawItem.dueDate)) {
    dueDate = rawItem.dueDate;
    hasValidDueDate = true;
  }

  if (!dueDate && policy.requiredAtCreation.includes("dueDate") && policy.mode !== "off") {
    const msg = "Chưa có Due Date hợp lệ (cần ngày bắt đầu kế hoạch hoặc deadline có lý do).";
    if (policy.mode === "enforce") {
      errors.push({ field: "dueDate", code: "MISSING_REQUIRED_DUE_DATE", message: msg });
    } else {
      warnings.push({ field: "dueDate", code: "MISSING_DUE_DATE", message: msg });
    }
  }

  // 10. Issue Type & Priority mapping
  let issueTypeId: string | undefined = rawItem.issueTypeId;
  if (!issueTypeId && rawItem.issueTypeName && metadata?.issueTypes) {
    const matched = metadata.issueTypes.find(
      (t) => t.name.toLowerCase() === rawItem.issueTypeName!.toLowerCase()
    );
    if (matched) issueTypeId = matched.id;
  }

  let priorityId: string | undefined = rawItem.priorityId;
  if (!priorityId && rawItem.priorityName && metadata?.priorityOptions) {
    const matched = metadata.priorityOptions.find(
      (p) => p.name.toLowerCase() === rawItem.priorityName!.toLowerCase()
    );
    if (matched) priorityId = matched.id;
  }

  // 11. Component mapping
  let componentIds: string[] = [];
  if (Array.isArray(rawItem.componentIds) && rawItem.componentIds.length > 0) {
    componentIds = rawItem.componentIds;
  } else if (Array.isArray(rawItem.componentNames) && metadata?.components) {
    const matchedIds: string[] = [];
    rawItem.componentNames.forEach((name) => {
      const matched = metadata.components!.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (matched) matchedIds.push(matched.id);
    });
    componentIds = matchedIds;
  }

  // 12. Rule-based Quality Score (Section 18.9)
  const qualityScore = calculateRuleQualityScore({
    summary,
    description,
    acceptanceCriteria: acList,
    workCategory,
    originalEstimate,
    points,
    fixVersionId: fixVersionIds[0] || null,
    hasValidFixVersion,
    dueDate,
    hasValidDueDate,
    policy,
  });

  // 13. Determine Classification: ready | review | blocked
  let classification: "ready" | "review" | "blocked" = "ready";

  if (policy.mode === "off") {
    // In off mode, only core Jira errors block the task
    classification = errors.some((e) => e.field === "summary") ? "blocked" : "ready";
  } else if (policy.mode === "warn") {
    // In warn mode, policy violations warn but don't hard-block unless critical core errors exist
    if (errors.some((e) => e.field === "summary")) {
      classification = "blocked";
    } else if (warnings.length > 0 || qualityScore.score < 90) {
      classification = "review";
    } else {
      classification = "ready";
    }
  } else {
    // In enforce mode: any error or score < 70 causes blocked
    if (errors.length > 0 || qualityScore.score < 70) {
      classification = "blocked";
    } else if (warnings.length > 0 || qualityScore.score < 90) {
      classification = "review";
    } else {
      classification = "ready";
    }
  }

  const rowInput: BulkCreateRowInput = {
    clientRef,
    summary,
    description,
    issueTypeId,
    priorityId,
    labels: finalLabels,
    points,
    originalEstimate,
    dueDate,
    fixVersionIds,
    componentIds,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
  };

  return {
    clientRef,
    rowInput,
    classification,
    qualityScore,
    workCategory,
    categoryReasoning: rawItem.categoryReasoning,
    warnings,
    errors,
    confidence: typeof rawItem.confidence === "number" ? Math.min(1, Math.max(0, rawItem.confidence)) : 0.8,
  };
}

/**
 * Normalizes a batch of raw AI draft tasks against project policy & metadata.
 */
export function normalizeAiDraftBatch(
  input: NormalizeAiDraftBatchInput
): NormalizeAiDraftBatchResult {
  const policy = input.policy ?? getDefaultWorkCriteriaPolicy();
  const context = input.context ?? {};
  const metadata = input.metadata;

  const normalizedItems = (input.items || []).map((item, idx) =>
    normalizeAiDraftItem(item, idx, policy, context, metadata)
  );

  let readyCount = 0;
  let reviewCount = 0;
  let blockedCount = 0;
  let totalScore = 0;

  normalizedItems.forEach((item) => {
    if (item.classification === "ready") readyCount++;
    else if (item.classification === "review") reviewCount++;
    else blockedCount++;

    totalScore += item.qualityScore.score;
  });

  const total = normalizedItems.length;
  const averageQualityScore = total > 0 ? Math.round((totalScore / total) * 10) / 10 : 0;

  return {
    items: normalizedItems,
    summary: {
      total,
      readyCount,
      reviewCount,
      blockedCount,
      averageQualityScore,
    },
    policyVersion: policy.version,
    policyMode: policy.mode,
  };
}
