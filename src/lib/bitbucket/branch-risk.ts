/**
 * Pure attention / risk engine for evaluating anomalies and actionable states
 * across Jira tasks, branches, and PRs.
 */

export type RiskSeverity = "high" | "medium" | "low" | "info";

export type AttentionSignal = {
  rule: string;
  severity: RiskSeverity;
  message: string;
  nextAction?: string;
};

export type BranchAttentionInput = {
  jiraKey?: string | null;
  suggestedJiraKey?: string | null;
  taskStatus?: string | null;
  taskStatusCategory?: string | null; // "done" | "indeterminate" | "new" | "unknown"
  prState?: string | null; // "OPEN" | "MERGED" | "DECLINED" | "CLOSED"
  merged?: boolean;
  checkedAt?: Date | string | null;
  syncStale?: boolean;
  syncError?: string | null;
  includeSystemSignals?: boolean;
};

/**
 * Returns attention signals for a branch row sorted by severity: high -> medium -> low -> info.
 */
export function evaluateBranchAttention(input: BranchAttentionInput): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const statusCat = (input.taskStatusCategory ?? "").toLowerCase();
  const prState = (input.prState ?? "").toUpperCase();

  // 1. Task Done but PR is OPEN (High)
  if (input.jiraKey && statusCat === "done" && prState === "OPEN") {
    signals.push({
      rule: "task_done_pr_open",
      severity: "high",
      message: "Task is Done but PR is still open",
      nextAction: "Mở PR hoặc kiểm tra lại trạng thái task",
    });
  }

  // 2. PR is MERGED but task is not Done (Medium)
  if (input.jiraKey && (prState === "MERGED" || input.merged) && statusCat !== "done" && statusCat !== "") {
    signals.push({
      rule: "pr_merged_task_not_done",
      severity: "medium",
      message: "PR merged into base branch but task is not Done",
      nextAction: "Mở task để cập nhật workflow",
    });
  }

  // 3. Task is in-progress (indeterminate) but branch has no PR (Medium)
  if (input.jiraKey && statusCat === "indeterminate" && !prState) {
    signals.push({
      rule: "task_active_no_pr",
      severity: "medium",
      message: "Task in progress but branch has no PR yet",
      nextAction: "Tạo PR hoặc kiểm tra branch",
    });
  }

  // 4. Branch has suggested Jira key pending confirmation (Low)
  if (!input.jiraKey && input.suggestedJiraKey) {
    signals.push({
      rule: "link_suggested",
      severity: "low",
      message: `Suggested link to ${input.suggestedJiraKey} awaits review`,
      nextAction: "Xác nhận hoặc từ chối gợi ý",
    });
  }

  // 5. Branch has no linked task (Info)
  if (!input.jiraKey && !input.suggestedJiraKey) {
    signals.push({
      rule: "unlinked",
      severity: "info",
      message: "Branch has no associated Jira task",
      nextAction: "Gắn Jira task",
    });
  }

  // 6. Optional System-level freshness signals (BR-009: by default system signals are separated into banners)
  if (input.includeSystemSignals || input.syncError || input.syncStale) {
    if (input.syncError) {
      signals.push({
        rule: "sync_error",
        severity: "high",
        message: `Sync error: ${input.syncError}`,
        nextAction: "Kiểm tra kết nối Bitbucket",
      });
    } else if (input.syncStale) {
      signals.push({
        rule: "sync_stale",
        severity: "high",
        message: "Sync data is stale",
        nextAction: "Chạy đồng bộ Bitbucket",
      });
    }
  }

  // Sort: high -> medium -> low -> info
  const rank: Record<RiskSeverity, number> = { high: 4, medium: 3, low: 2, info: 1 };
  return signals.sort((a, b) => rank[b.severity] - rank[a.severity]);
}

/**
 * Returns true if the branch has any business attention signal with severity high or medium,
 * or any attention signal matching the filter rule.
 */
export function hasAttentionSignal(input: BranchAttentionInput): boolean {
  const signals = evaluateBranchAttention(input);
  return signals.some((s) => s.severity === "high" || s.severity === "medium" || s.severity === "low");
}
