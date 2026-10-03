import type { DataQualityWarning, ReportFreshness } from "./types";

export interface DataQualityCheckInput {
  freshness: ReportFreshness;
  lowConfidenceCompletionsCount: number;
  totalCompletedCount: number;
  hasTransitionEvents: boolean;
  missingEstimateCount: number;
  totalCount: number;
}

export function evaluateDataQuality(input: DataQualityCheckInput): DataQualityWarning[] {
  const warnings: DataQualityWarning[] = [];

  // Freshness check
  if (!input.freshness.isFresh || input.freshness.status === "degraded" || input.freshness.status === "down") {
    warnings.push({
      code: "STALE_SOURCE_DATA",
      message: "Dữ liệu Jira chưa được đồng bộ mới nhất hoặc worker đang chậm. Các chỉ số có thể chưa phản ánh cập nhật tức thì.",
      severity: "warning",
    });
  }

  // Fallback completion date warning
  if (input.totalCompletedCount > 0 && input.lowConfidenceCompletionsCount > 0) {
    const percentage = Math.round((input.lowConfidenceCompletionsCount / input.totalCompletedCount) * 100);
    if (percentage > 20) {
      warnings.push({
        code: "FALLBACK_COMPLETION_DATE",
        message: `${percentage}% task hoàn thành sử dụng thời điểm đổi trạng thái (statusChangedAt) thay cho Jira resolution date chính thức do thiếu trường dữ liệu.`,
        severity: "info",
      });
    }
  }

  // Missing transition events
  if (!input.hasTransitionEvents && input.totalCompletedCount > 0) {
    warnings.push({
      code: "MISSING_TRANSITION_HISTORY",
      message: "Chưa kích hoạt đầy đủ lịch sử luồng trạng thái (transition events). Chỉ số reopen và chu kỳ xử lý chi tiết (cycle time) đang ở chế độ ước lượng cơ bản.",
      severity: "info",
    });
  }

  return warnings;
}
