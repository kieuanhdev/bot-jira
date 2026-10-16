import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_FILTER_CATEGORIES,
  NOTIFICATION_SETTINGS_CATEGORIES,
  TYPE_DETAILS,
  TYPE_LABELS,
  getCategoryConfig,
  getTypeDetail,
  getTypeLabel,
} from "./notification-types";

describe("notification-types", () => {
  it("provides TYPE_LABELS for all core notification types", () => {
    expect(TYPE_LABELS.comment).toBe("Bình luận");
    expect(TYPE_LABELS.issue).toBe("Cập nhật task");
    expect(TYPE_LABELS.transition).toBe("Chuyển trạng thái");
    expect(TYPE_LABELS.stale).toBe("SLA / Tồn đọng");
    expect(TYPE_LABELS.release).toBe("Phát hành");
    expect(TYPE_LABELS.sentry).toBe("Lỗi Sentry");
    expect(TYPE_LABELS.ci).toBe("Build / CI");
    expect(TYPE_LABELS.ai).toBe("AI gợi ý");
    expect(TYPE_LABELS.system).toBe("Hệ thống");
    expect(TYPE_LABELS.pr).toBe("Pull Request");
  });

  it("getTypeLabel returns Vietnamese label or original fallback", () => {
    expect(getTypeLabel("comment")).toBe("Bình luận");
    expect(getTypeLabel("unknown_custom_type")).toBe("unknown_custom_type");
  });

  it("provides NOTIFICATION_FILTER_CATEGORIES with all required fields", () => {
    expect(NOTIFICATION_FILTER_CATEGORIES.length).toBeGreaterThanOrEqual(11);
    const commentCat = getCategoryConfig("comment");
    expect(commentCat.label).toBe("Bình luận (comment)");
    expect(commentCat.shortLabel).toBe("Bình luận");
    expect(commentCat.color.badge).toBe("info");

    const fallbackCat = getCategoryConfig("custom_event");
    expect(fallbackCat.id).toBe("custom_event");
    expect(fallbackCat.color.badge).toBe("outline");
  });

  it("provides TYPE_DETAILS with descriptions and settings categories", () => {
    expect(TYPE_DETAILS.comment.category).toBe("tasks");
    expect(TYPE_DETAILS.release.category).toBe("release");
    const issueDetail = getTypeDetail("issue");
    expect(issueDetail.category).toBe("tasks");
    expect(issueDetail.categoryLabel).toBe("Công việc & Task Jira");
    expect(issueDetail.label).toBe("Cập nhật thông tin task theo dõi");

    const fallbackDetail = getTypeDetail("unknown");
    expect(fallbackDetail.category).toBe("tasks");
    expect(fallbackDetail.categoryLabel).toBe("Khác");
    expect(fallbackDetail.label).toBe("unknown");
  });

  it("provides NOTIFICATION_SETTINGS_CATEGORIES groups", () => {
    const ids = NOTIFICATION_SETTINGS_CATEGORIES.map((c) => c.id);
    expect(ids).toEqual(["tasks", "release", "system"]);
  });
});
