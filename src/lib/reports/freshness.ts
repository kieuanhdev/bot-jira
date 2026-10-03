import { getWorkerHealth, isJiraFresh } from "@/lib/health/worker-health";
import type { ReportFreshness } from "./types";

/**
 * Resolves report freshness from the system worker health status and project sync cursors (Section 2.4, RPT-101)
 */
export async function getReportFreshness(projectKey?: string): Promise<ReportFreshness> {
  try {
    const health = await getWorkerHealth();
    const fresh = isJiraFresh(health);

    let warning: string | undefined;
    if (health.status === "down") {
      warning = "Tiến trình nền (Worker) bị gián đoạn, dữ liệu báo cáo có thể đã cũ.";
    } else if (!fresh) {
      warning = "Đồng bộ Jira chưa hoàn tất hoặc dữ liệu đã vượt thời gian tươi mới quy định.";
    }

    if (projectKey && health.staleProjects?.includes(projectKey)) {
      warning = `Dự án ${projectKey} đang bị chậm đồng bộ dữ liệu từ Jira.`;
    }

    return {
      status: health.status,
      isFresh: fresh,
      workerAgeMs: health.workerAgeMs,
      jiraSyncAgeMs: health.jiraSyncAgeMs,
      lastSyncedAt: health.checkedAt,
      warning,
    };
  } catch {
    return {
      status: "unknown",
      isFresh: false,
      workerAgeMs: null,
      jiraSyncAgeMs: null,
      lastSyncedAt: null,
      warning: "Không thể kiểm tra độ mới của dữ liệu hệ thống.",
    };
  }
}
