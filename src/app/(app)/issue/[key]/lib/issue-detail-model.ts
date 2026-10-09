import type { IssueDetail } from "./issue-detail-types";

export function computeVersionsList(
  fixVersions?: string[],
  releaseTasks?: Array<{ release?: { version?: string } }>
): string[] {
  if (fixVersions && fixVersions.length > 0) {
    return fixVersions;
  }
  return (releaseTasks ?? [])
    .map((rt) => rt.release?.version)
    .filter((v): v is string => Boolean(v));
}

export function buildFieldUpdateMessage(patch: Record<string, unknown>): string {
  if ("assignee" in patch) {
    return patch.assignee ? `Đã gán cho ${patch.assignee}` : "Đã hủy gán";
  }
  if ("points" in patch) {
    return patch.points != null ? `Đã đặt điểm thành ${patch.points}` : "Đã xóa điểm";
  }
  if ("priority" in patch) {
    return `Đã đổi độ ưu tiên thành ${patch.priority}`;
  }
  if ("addFixVersion" in patch) {
    return `Đã thêm phiên bản ${patch.addFixVersion}`;
  }
  if ("removeFixVersion" in patch) {
    return `Đã gỡ phiên bản ${patch.removeFixVersion}`;
  }
  if ("addLabel" in patch) {
    return `Đã thêm nhãn ${patch.addLabel}`;
  }
  if ("removeLabel" in patch) {
    return `Đã gỡ nhãn ${patch.removeLabel}`;
  }
  return "Đã cập nhật task thành công";
}

export function buildAiDecisionMessage(
  decision: "accepted" | "edited" | "rejected",
  aiScorePoints?: number,
  editedPoints?: number
): string {
  if (decision === "accepted") {
    return `Đã chấp nhận điểm AI (${aiScorePoints ?? 0}) → Jira`;
  }
  if (decision === "edited") {
    return `Đã đặt điểm thành ${editedPoints} → Jira`;
  }
  return "Đã từ chối ước tính AI (Jira không thay đổi)";
}

export function applyWorklogToIssue(
  issue: IssueDetail,
  addedSeconds: number
): IssueDetail {
  return {
    ...issue,
    timeSpentSeconds: (issue.timeSpentSeconds ?? 0) + addedSeconds,
  };
}
