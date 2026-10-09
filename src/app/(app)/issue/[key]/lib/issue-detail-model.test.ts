import { describe, it, expect } from "vitest";
import {
  computeVersionsList,
  buildFieldUpdateMessage,
  buildAiDecisionMessage,
  applyWorklogToIssue,
} from "./issue-detail-model";
import type { IssueDetail } from "./issue-detail-types";

describe("issue-detail-model", () => {
  it("computes versions list using fixVersions or fallback releases", () => {
    expect(computeVersionsList(["v1.0", "v2.0"])).toEqual(["v1.0", "v2.0"]);
    expect(
      computeVersionsList(undefined, [
        { release: { version: "v1.1" } },
        { release: undefined },
        { release: { version: "v1.2" } },
      ])
    ).toEqual(["v1.1", "v1.2"]);
    expect(computeVersionsList(undefined, undefined)).toEqual([]);
  });

  it("builds user-friendly field update messages", () => {
    expect(buildFieldUpdateMessage({ assignee: "alex" })).toBe("Đã gán cho alex");
    expect(buildFieldUpdateMessage({ assignee: null })).toBe("Đã hủy gán");
    expect(buildFieldUpdateMessage({ points: 5 })).toBe("Đã đặt điểm thành 5");
    expect(buildFieldUpdateMessage({ points: null })).toBe("Đã xóa điểm");
    expect(buildFieldUpdateMessage({ priority: "High" })).toBe("Đã đổi độ ưu tiên thành High");
    expect(buildFieldUpdateMessage({ addFixVersion: "v1.0" })).toBe("Đã thêm phiên bản v1.0");
    expect(buildFieldUpdateMessage({ removeFixVersion: "v1.0" })).toBe("Đã gỡ phiên bản v1.0");
    expect(buildFieldUpdateMessage({ addLabel: "bug" })).toBe("Đã thêm nhãn bug");
    expect(buildFieldUpdateMessage({ removeLabel: "bug" })).toBe("Đã gỡ nhãn bug");
    expect(buildFieldUpdateMessage({})).toBe("Đã cập nhật task thành công");
  });

  it("builds AI decision messages", () => {
    expect(buildAiDecisionMessage("accepted", 8)).toBe("Đã chấp nhận điểm AI (8) → Jira");
    expect(buildAiDecisionMessage("edited", 8, 5)).toBe("Đã đặt điểm thành 5 → Jira");
    expect(buildAiDecisionMessage("rejected", 8)).toBe("Đã từ chối ước tính AI (Jira không thay đổi)");
  });

  it("applies worklog addedSeconds to issue timeSpentSeconds", () => {
    const issue = {
      jiraKey: "TEST-1",
      timeSpentSeconds: 3600,
    } as unknown as IssueDetail;
    const updated = applyWorklogToIssue(issue, 1800);
    expect(updated.timeSpentSeconds).toBe(5400);

    const issueNoTime = {
      jiraKey: "TEST-2",
    } as unknown as IssueDetail;
    const updatedNoTime = applyWorklogToIssue(issueNoTime, 1800);
    expect(updatedNoTime.timeSpentSeconds).toBe(1800);
  });
});
