import { describe, it, expect } from "vitest";
import {
  getDefaultWorkCriteriaPolicy,
  checkDescriptionTemplate,
  calculateRuleQualityScore,
  DEFAULT_POINT_SCALE,
  DEFAULT_TECH_DEBT_LABEL,
} from "./work-criteria-policy";

describe("Jira Work Criteria Policy & Quality Scoring", () => {
  describe("getDefaultWorkCriteriaPolicy", () => {
    it("returns standard draft policy with 5 required fields and default point scale", () => {
      const policy = getDefaultWorkCriteriaPolicy("warn");
      expect(policy.version).toBe("jira-work-criteria-v1");
      expect(policy.mode).toBe("warn");
      expect(policy.pointScale).toEqual(DEFAULT_POINT_SCALE);
      expect(policy.requiredAtCreation).toEqual([
        "workCategory",
        "points",
        "originalEstimate",
        "fixVersion",
        "dueDate",
      ]);
      expect(policy.workCategoryMapping.strategy).toBe("label");
      expect(policy.workCategoryMapping.values.debt).toBe(DEFAULT_TECH_DEBT_LABEL);
      expect(policy.cycleTimeUpperDaysByPoint[13]).toBe(9);
    });
  });

  describe("checkDescriptionTemplate", () => {
    it("identifies valid description following structured template", () => {
      const desc = `
Mục tiêu
Triển khai chức năng xuất báo cáo dự án sang file Excel.

Phạm vi
- Tạo nút xuất file trên giao diện.
- Xuất dữ liệu thống kê theo tuần/tháng.

Ngoài phạm vi
- Xuất định dạng PDF hoặc Word.

Tiêu chí nghiệm thu
- [ ] Người dùng tải được file .xlsx hợp lệ.
- [ ] File chứa đủ sheet tổng quan và chi tiết.

Rủi ro/Phụ thuộc
- Phụ thuộc thư viện exceljs.

Giả định cần xác nhận
- Định dạng ngày tháng theo locale vi-VN.
      `;

      const result = checkDescriptionTemplate(desc);
      expect(result.isValid).toBe(true);
      expect(result.matchedSectionsCount).toBe(6);
      expect(result.missingSections).toHaveLength(0);
    });

    it("detects missing sections when description is incomplete", () => {
      const desc = `
Mục tiêu: Làm cái này cái kia.
Phạm vi: Trong sprint này.
      `;

      const result = checkDescriptionTemplate(desc);
      expect(result.isValid).toBe(false);
      expect(result.matchedSectionsCount).toBe(2);
      expect(result.missingSections.length).toBeGreaterThan(0);
    });
  });

  describe("calculateRuleQualityScore", () => {
    const fullValidDescription = `
Mục tiêu
Hoàn thiện giao diện tạo task AI.

Phạm vi
- Dialog và form cấu hình.

Ngoài phạm vi
- Thay đổi schema Jira.

Tiêu chí nghiệm thu
- [ ] Dialog hiển thị đúng khi nhấn nút.
- [ ] Form validate đủ trường bắt buộc.

Rủi ro/Phụ thuộc
- Không có.

Giả định cần xác nhận
- Đã đăng nhập Jira.
    `;

    it("awards 100 points and status 'ready' for a fully compliant item", () => {
      const scoreResult = calculateRuleQualityScore({
        summary: "Triển khai dialog tạo task AI hàng loạt",
        description: fullValidDescription,
        acceptanceCriteria: [
          "Dialog hiển thị đúng khi nhấn nút",
          "Form validate đủ trường bắt buộc",
        ],
        workCategory: "feature",
        originalEstimate: "2d 4h",
        points: 5,
        fixVersionId: "ver-1001",
        hasValidFixVersion: true,
        dueDate: "2026-10-15",
        hasValidDueDate: true,
      });

      expect(scoreResult.score).toBe(100);
      expect(scoreResult.status).toBe("ready");
      expect(scoreResult.breakdown.summary).toBe(15);
      expect(scoreResult.breakdown.description).toBe(15);
      expect(scoreResult.breakdown.acceptanceCriteria).toBe(20);
      expect(scoreResult.breakdown.workCategory).toBe(10);
      expect(scoreResult.breakdown.originalEstimate).toBe(10);
      expect(scoreResult.breakdown.storyPoints).toBe(10);
      expect(scoreResult.breakdown.fixVersion).toBe(10);
      expect(scoreResult.breakdown.dueDate).toBe(10);
    });

    it("is 100% deterministic (same input produces exact same output)", () => {
      const input = {
        summary: "Sửa lỗi crash khi không chọn Assignee",
        description: fullValidDescription,
        acceptanceCriteria: ["Không còn exception null pointer"],
        workCategory: "defect",
        originalEstimate: "4h",
        points: 2,
        hasValidFixVersion: true,
        dueDate: "2026-10-10",
      };

      const run1 = calculateRuleQualityScore(input);
      const run2 = calculateRuleQualityScore(input);
      expect(run1).toEqual(run2);
    });

    it("penalizes placeholder summary and missing sections with status 'review' or 'blocked'", () => {
      const scoreResult = calculateRuleQualityScore({
        summary: "Task 1", // placeholder
        description: "Làm việc này", // unstructured
        workCategory: "feature",
        points: 3,
      });

      expect(scoreResult.score).toBeLessThan(70);
      expect(scoreResult.status).toBe("blocked");
      expect(scoreResult.reasons.some((r) => r.includes("Summary"))).toBe(true);
      expect(scoreResult.reasons.some((r) => r.includes("Original Estimate"))).toBe(true);
    });

    it("rejects points > 13 with 0 points score and reasons", () => {
      const scoreResult = calculateRuleQualityScore({
        summary: "Triển khai toàn bộ hệ thống microservices mới",
        points: 21, // > 13 points!
      });

      expect(scoreResult.breakdown.storyPoints).toBe(0);
      expect(scoreResult.reasons.some((r) => r.includes("vượt quá ngưỡng 13 điểm"))).toBe(true);
    });
  });
});
