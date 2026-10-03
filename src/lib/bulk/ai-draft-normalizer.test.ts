import { describe, it, expect } from "vitest";
import {
  normalizeAiDraftItem,
  normalizeAiDraftBatch,
  type RawAiDraftTaskItem,
} from "./ai-draft-normalizer";
import {
  getDefaultWorkCriteriaPolicy,
  type JiraWorkCriteriaPolicy,
} from "./work-criteria-policy";
import type { BulkCreateProjectMetadata } from "./create-types";

describe("AI Draft Normalizer & Work Criteria Integration", () => {
  const mockMetadata: Partial<BulkCreateProjectMetadata> = {
    project: { key: "BOT", name: "Bot Jira Project" },
    issueTypes: [
      { id: "10001", name: "Story", subtask: false },
      { id: "10002", name: "Task", subtask: false },
      { id: "10003", name: "Bug", subtask: false },
      { id: "10004", name: "Sub-task", subtask: true },
    ],
    priorityOptions: [
      { id: "1", name: "Highest" },
      { id: "2", name: "High" },
      { id: "3", name: "Medium" },
      { id: "4", name: "Low" },
    ],
    versionOptions: [
      { id: "v1", name: "v1.0.0", released: true, archived: false },
      { id: "v2", name: "v2.0.0-archive", released: false, archived: true },
      { id: "v3", name: "v3.0.0-active", released: false, archived: false },
    ],
    components: [
      { id: "c1", name: "Frontend" },
      { id: "c2", name: "Backend" },
    ],
  };

  const sampleStandardDescription = `
Mục tiêu
Tích hợp Jira Work Criteria vào AI bulk task generation.

Phạm vi
- Normalizer, policy validator và Due Date calculation.

Ngoài phạm vi
- Tự động ghi Jira không qua preview.

Tiêu chí nghiệm thu
- [ ] Category Feature/Defect/Debt/Risk map đúng.
- [ ] Debt luôn có label tech-debt.

Rủi ro/Phụ thuộc
- Phụ thuộc calendar của project.

Giả định cần xác nhận
- Policy DRAFT ở chế độ warn.
  `;

  describe("18.11 Requirement 1: Category Feature/Defect/Debt/Risk map đúng theo project config", () => {
    it("maps categories using label strategy", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      policy.workCategoryMapping = {
        strategy: "label",
        values: {
          feature: "custom-feat",
          defect: "custom-def",
          debt: "tech-debt",
          risk: "custom-risk",
        },
      };

      const featItem = normalizeAiDraftItem(
        { summary: "Tính năng mới", workCategory: "feature" },
        0,
        policy
      );
      expect(featItem.rowInput.labels).toContain("custom-feat");

      const riskItem = normalizeAiDraftItem(
        { summary: "Rủi ro bảo mật", workCategory: "risk" },
        1,
        policy
      );
      expect(riskItem.rowInput.labels).toContain("custom-risk");
    });

    it("maps categories using customField strategy", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      policy.workCategoryMapping = {
        strategy: "customField",
        fieldId: "customfield_10500",
        values: {
          feature: "FEATURE_VAL",
          defect: "DEFECT_VAL",
          debt: "DEBT_VAL",
          risk: "RISK_VAL",
        },
      };

      const defectItem = normalizeAiDraftItem(
        { summary: "Sửa lỗi crash", workCategory: "defect" },
        0,
        policy
      );
      expect(defectItem.rowInput.customFields?.["customfield_10500"]).toBe("DEFECT_VAL");
    });
  });

  describe("18.11 Requirement 2: Debt luôn có label 'tech-debt'", () => {
    it("ensures 'tech-debt' label is present even when customField strategy is used", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      policy.workCategoryMapping = {
        strategy: "customField",
        fieldId: "customfield_9999",
        values: {
          feature: "F",
          defect: "D",
          debt: "TECH_DEBT_FIELD",
          risk: "R",
        },
      };

      const debtItem = normalizeAiDraftItem(
        { summary: "Refactor caching layer", workCategory: "debt" },
        0,
        policy
      );

      expect(debtItem.rowInput.labels).toContain("tech-debt");
      expect(debtItem.rowInput.customFields?.["customfield_9999"]).toBe("TECH_DEBT_FIELD");
    });

    it("preserves existing labels while adding 'tech-debt'", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const debtItem = normalizeAiDraftItem(
        { summary: "Refactor parser", workCategory: "debt", labels: ["backend", "performance"] },
        0,
        policy
      );

      expect(debtItem.rowInput.labels).toContain("backend");
      expect(debtItem.rowInput.labels).toContain("performance");
      expect(debtItem.rowInput.labels).toContain("tech-debt");
    });
  });

  describe("18.11 Requirement 3: Due Date bỏ qua cuối tuần/ngày nghỉ và xử lý đúng point baseline", () => {
    it("calculates due date from planned start date, points, and project calendar", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      // 2026-10-02 is Friday. Points = 3 (cycle time upper days = 2.5 -> ceil to 3 business days)
      // Friday 2026-10-02 -> skips Sat 03, Sun 04 -> Mon 05 (day 2), Tue 06 (day 3)
      const item = normalizeAiDraftItem(
        { summary: "Tính toán Due Date", points: 3 },
        0,
        policy,
        {
          plannedStartDate: "2026-10-02",
        }
      );

      expect(item.rowInput.dueDate).toBe("2026-10-06");
    });

    it("skips project holidays when calculating baseline due date", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      // Monday 2026-10-05 is holiday -> completes Wednesday 2026-10-07
      const item = normalizeAiDraftItem(
        { summary: "Task with holiday", points: 3 },
        0,
        policy,
        {
          plannedStartDate: "2026-10-02",
          calendar: { holidays: ["2026-10-05"] },
        }
      );

      expect(item.rowInput.dueDate).toBe("2026-10-07");
    });
  });

  describe("18.11 Requirement 4: Deadline nghiệp vụ override nhưng thiếu lý do phải warning/blocked", () => {
    it("allows business deadline earlier than baseline if reason is provided", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const item = normalizeAiDraftItem(
        { summary: "Gấp cho demo", points: 5 }, // baseline: 4 business days -> 2026-10-08
        0,
        policy,
        {
          plannedStartDate: "2026-10-02",
          businessDeadline: "2026-10-05",
          businessDeadlineReason: "Cam kết với đối tác demo vào thứ Hai",
        }
      );

      expect(item.rowInput.dueDate).toBe("2026-10-05");
      expect(item.errors).toHaveLength(0);
    });

    it("warns in 'warn' mode and blocks in 'enforce' mode when business deadline reason is missing", () => {
      const warnPolicy = getDefaultWorkCriteriaPolicy("warn");
      const warnItem = normalizeAiDraftItem(
        { summary: "Thiếu lý do deadline", points: 5 },
        0,
        warnPolicy,
        {
          plannedStartDate: "2026-10-02",
          businessDeadline: "2026-10-05",
          businessDeadlineReason: "", // missing!
        }
      );

      expect(warnItem.warnings.some((w) => w.code === "MISSING_DEADLINE_REASON")).toBe(true);

      const enforcePolicy = getDefaultWorkCriteriaPolicy("enforce");
      const enforceItem = normalizeAiDraftItem(
        { summary: "Thiếu lý do deadline enforce", points: 5 },
        0,
        enforcePolicy,
        {
          plannedStartDate: "2026-10-02",
          businessDeadline: "2026-10-05",
          businessDeadlineReason: "",
        }
      );

      expect(enforceItem.errors.some((e) => e.code === "MISSING_DEADLINE_REASON")).toBe(true);
      expect(enforceItem.classification).toBe("blocked");
    });
  });

  describe("18.11 Requirement 5: Policy off/warn/enforce cho kết quả phân loại đúng", () => {
    const rawDraftItem: RawAiDraftTaskItem = {
      summary: "Task thiếu điểm và estimate",
      workCategory: "feature",
      // missing points, estimate, fixVersion, dueDate
    };

    it("classifies as 'ready' in 'off' mode when core Jira fields are present", () => {
      const policy = getDefaultWorkCriteriaPolicy("off");
      const item = normalizeAiDraftItem(rawDraftItem, 0, policy);
      expect(item.classification).toBe("ready");
    });

    it("classifies as 'review' in 'warn' mode when criteria fields are missing", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const item = normalizeAiDraftItem(rawDraftItem, 0, policy);
      expect(item.classification).toBe("review");
      expect(item.warnings.length).toBeGreaterThan(0);
    });

    it("classifies as 'blocked' in 'enforce' mode when required criteria fields are missing", () => {
      const policy = getDefaultWorkCriteriaPolicy("enforce");
      const item = normalizeAiDraftItem(rawDraftItem, 0, policy);
      expect(item.classification).toBe("blocked");
      expect(item.errors.length).toBeGreaterThan(0);
    });
  });

  describe("18.11 Requirement 6: Fix Version released/archived bị từ chối theo policy", () => {
    it("warns in 'warn' mode and errors in 'enforce' mode when Fix Version is released or archived", () => {
      const enforcePolicy = getDefaultWorkCriteriaPolicy("enforce");

      // v1 is released
      const releasedItem = normalizeAiDraftItem(
        { summary: "Task with released version", fixVersionId: "v1" },
        0,
        enforcePolicy,
        {},
        mockMetadata
      );
      expect(releasedItem.errors.some((e) => e.code === "VERSION_RELEASED")).toBe(true);
      expect(releasedItem.classification).toBe("blocked");

      // v2 is archived
      const archivedItem = normalizeAiDraftItem(
        { summary: "Task with archived version", fixVersionId: "v2" },
        0,
        enforcePolicy,
        {},
        mockMetadata
      );
      expect(archivedItem.errors.some((e) => e.code === "VERSION_ARCHIVED")).toBe(true);
      expect(archivedItem.classification).toBe("blocked");

      // v3 is active
      const activeItem = normalizeAiDraftItem(
        {
          summary: "Task with active version",
          description: sampleStandardDescription,
          acceptanceCriteria: ["AC 1", "AC 2"],
          points: 3,
          originalEstimate: "1d",
          dueDate: "2026-10-15",
          fixVersionId: "v3",
        },
        0,
        enforcePolicy,
        {},
        mockMetadata
      );
      expect(activeItem.errors.filter((e) => e.field === "fixVersion")).toHaveLength(0);
      expect(activeItem.rowInput.fixVersionIds).toEqual(["v3"]);
    });
  });

  describe("18.11 Requirement 7: Point 13 tạo cảnh báo tách nhỏ; point lớn hơn 13 bị chặn", () => {
    it("generates warning for point 13 recommending decomposition", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const item = normalizeAiDraftItem(
        { summary: "Large 13 points task", points: 13 },
        0,
        policy
      );

      expect(item.warnings.some((w) => w.code === "POINTS_HIGH_WARNING")).toBe(true);
      expect(item.rowInput.points).toBe(13);
    });

    it("generates error and blocks in enforce mode for point > 13", () => {
      const policy = getDefaultWorkCriteriaPolicy("enforce");
      const item = normalizeAiDraftItem(
        { summary: "Giant 21 points task", points: 21 },
        0,
        policy
      );

      expect(item.errors.some((e) => e.code === "POINTS_EXCEED_LIMIT")).toBe(true);
      expect(item.classification).toBe("blocked");
    });
  });

  describe("18.11 Requirement 8: Worklog không bao giờ được AI giả lập ở thời điểm tạo", () => {
    it("strips any lifecycle worklog or timeSpent fields and raises warning", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const rawWithWorklog: RawAiDraftTaskItem = {
        summary: "Task with simulated worklog",
        worklogs: [{ timeSpent: "2h", comment: "Did some work" }],
        timeSpent: "2h",
        spentSeconds: 7200,
      };

      const item = normalizeAiDraftItem(rawWithWorklog, 0, policy);

      expect(item.warnings.some((w) => w.code === "WORKLOG_FORBIDDEN_AT_CREATION")).toBe(true);
      // Ensure rowInput does not contain worklog fields
      expect((item.rowInput as Record<string, unknown>).worklogs).toBeUndefined();
      expect((item.rowInput as Record<string, unknown>).timeSpent).toBeUndefined();
      expect((item.rowInput as Record<string, unknown>).spentSeconds).toBeUndefined();
    });
  });

  describe("18.11 Requirement 9: Quality score luôn tái lập được từ cùng một input, không phụ thuộc LLM", () => {
    it("produces identical quality scores and breakdowns across repeated runs", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const rawItem: RawAiDraftTaskItem = {
        summary: "Xây dựng AI Draft Normalizer",
        description: sampleStandardDescription,
        acceptanceCriteria: [
          "Category Feature/Defect/Debt/Risk map đúng",
          "Debt luôn có label tech-debt",
        ],
        workCategory: "feature",
        originalEstimate: "2d",
        points: 5,
        fixVersionId: "v3",
      };

      const resultA = normalizeAiDraftItem(rawItem, 0, policy, { plannedStartDate: "2026-10-05" }, mockMetadata);
      const resultB = normalizeAiDraftItem(rawItem, 0, policy, { plannedStartDate: "2026-10-05" }, mockMetadata);

      expect(resultA.qualityScore).toEqual(resultB.qualityScore);
      expect(resultA.qualityScore.score).toBeGreaterThanOrEqual(90);
      expect(resultA.classification).toBe("ready");
    });
  });

  describe("Batch normalization", () => {
    it("aggregates summary counts and calculates average quality score", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      const batchResult = normalizeAiDraftBatch({
        items: [
          {
            summary: "Task 1 complete",
            description: sampleStandardDescription,
            acceptanceCriteria: ["AC 1", "AC 2"],
            workCategory: "feature",
            originalEstimate: "1d",
            points: 2,
            fixVersionId: "v3",
          },
          {
            summary: "Task 2 missing info",
            workCategory: "debt",
          },
        ],
        policy,
        context: { plannedStartDate: "2026-10-05" },
        metadata: mockMetadata,
      });

      expect(batchResult.summary.total).toBe(2);
      expect(batchResult.summary.readyCount).toBe(1);
      expect(batchResult.summary.reviewCount).toBe(1);
      expect(batchResult.summary.averageQualityScore).toBeGreaterThan(0);
      expect(batchResult.items[1].rowInput.labels).toContain("tech-debt");
    });
  });
});
