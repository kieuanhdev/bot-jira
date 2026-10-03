import type { ProjectDetailResponse, RiskTaskItem } from "./types";

/**
 * Escapes a cell value according to RFC 4180.
 * If value contains quotes, commas, or newlines, enclose in quotes and double internal quotes.
 */
function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Builds a UTF-8 BOM CSV export for a project report (Section 9.5 & Section 2.6 of v2 plan)
 */
export function generateProjectReportCsv(
  report: ProjectDetailResponse,
  risks: RiskTaskItem[]
): string {
  const BOM = "\uFEFF";
  const rows: string[] = [];

  const projName = report.project?.name || report.projectName || "Project";
  const projKey = report.project?.key || report.projectKey || "";

  // Metadata & Header Section
  rows.push(toCsvRow(["BÁO CÁO DỰ ÁN THEO KỲ"]));
  rows.push(toCsvRow(["Dự án", `${projName} (${projKey})`]));
  rows.push(toCsvRow(["Kỳ báo cáo", report.periodLabel || `${report.period?.from} - ${report.period?.to}`]));
  rows.push(
    toCsvRow([
      "Phạm vi Version",
      report.scope?.versionName ? `Fix Version: ${report.scope.versionName}` : "Toàn bộ dự án",
    ])
  );
  if (report.scope?.releaseDate) {
    rows.push(toCsvRow(["Hạn chót Fix Version", report.scope.releaseDate]));
  }
  rows.push(toCsvRow(["Đơn vị tính", report.scope?.unit || "tasks"]));
  rows.push(toCsvRow(["Thời điểm xuất", report.generatedAt]));
  rows.push(toCsvRow(["Múi giờ", report.timezone]));
  rows.push(toCsvRow(["Đồng bộ Jira lần cuối", report.freshness?.lastSyncedAt || "N/A"]));
  rows.push("");

  // Summary KPIs Section
  rows.push(toCsvRow(["CHỈ SỐ TỔNG HỢP (CUỐI KỲ & TRONG KỲ)"]));
  rows.push(toCsvRow(["Chỉ số", "Giá trị"]));

  const progressPercentage =
    report.snapshotAtEnd?.completionRatio ??
    report.kpis?.progress?.percentage ??
    null;
  rows.push(
    toCsvRow([
      "Tiến độ (%)",
      progressPercentage !== null ? `${progressPercentage}%` : "Chưa đủ dữ liệu",
    ])
  );

  const doneCount = report.snapshotAtEnd?.doneAtEnd ?? report.kpis?.progress?.done ?? 0;
  const totalCount = report.snapshotAtEnd?.totalAtEnd ?? report.kpis?.progress?.total ?? 0;
  rows.push(toCsvRow(["Công việc hoàn thành / Tổng số", `${doneCount} / ${totalCount}`]));

  if (report.flow) {
    rows.push(toCsvRow(["Hoàn thành trong kỳ (Throughput)", report.flow.completedInPeriod]));
    rows.push(toCsvRow(["Tạo mới trong kỳ", report.flow.createdInPeriod]));
    rows.push(toCsvRow(["Thay đổi Backlog (Net change)", report.flow.netBacklogChange]));
  }

  const wip = report.snapshotAtEnd?.wipAtEnd ?? report.kpis?.wipCount ?? 0;
  const blocked = report.snapshotAtEnd?.blockedAtEnd ?? report.kpis?.blockedCount ?? 0;
  const overdue = report.snapshotAtEnd?.overdueAtEnd ?? report.kpis?.overdueCount ?? 0;
  const overSla = report.snapshotAtEnd?.overSlaAtEnd ?? report.kpis?.overSlaCount ?? 0;
  const unassigned = report.snapshotAtEnd?.unassignedAtEnd ?? report.kpis?.unassignedCount ?? 0;

  rows.push(toCsvRow(["Đang làm (WIP)", wip]));
  rows.push(toCsvRow(["Bị nghẽn (Blocked)", blocked]));
  rows.push(toCsvRow(["Quá hạn (Overdue)", overdue]));
  rows.push(toCsvRow(["Vượt ngưỡng SLA", overSla]));
  rows.push(toCsvRow(["Chưa phân công", unassigned]));

  rows.push(toCsvRow(["Trạng thái sức khỏe", report.health?.status || "unknown"]));
  rows.push(toCsvRow(["Đánh giá sức khỏe", report.health?.headline || ""]));
  if (report.health?.reasons && report.health.reasons.length > 0) {
    for (const r of report.health.reasons) {
      rows.push(toCsvRow(["- Lý do", `[${r.code}] ${r.message}`]));
    }
  }
  rows.push("");

  // Status Distribution Section
  if (report.statusDistribution && report.statusDistribution.length > 0) {
    rows.push(toCsvRow(["PHÂN BỐ TRẠNG THÁI"]));
    rows.push(toCsvRow(["Nhóm trạng thái", "Số task", "Story points", "Estimate (h)", "Tỷ lệ (%)"]));
    for (const dist of report.statusDistribution) {
      rows.push(
        toCsvRow([
          dist.group,
          dist.count,
          dist.points,
          Math.round(dist.estimateSeconds / 3600),
          `${dist.percentage}%`,
        ])
      );
    }
    rows.push("");
  }

  // Workload / Member contribution Section
  if (report.workload && report.workload.length > 0) {
    rows.push(toCsvRow(["ĐÓNG GÓP & TẢI CÔNG VIỆC THÀNH VIÊN"]));
    rows.push(toCsvRow(["Thành viên", "Tổng task", "Hoàn thành", "Đang làm", "Bị nghẽn", "Vượt SLA"]));
    for (const m of report.workload) {
      rows.push(
        toCsvRow([
          m.displayName,
          m.totalTasks,
          m.doneTasks,
          m.inProgressTasks,
          m.blockedTasks,
          m.overSlaTasks,
        ])
      );
    }
    rows.push("");
  }

  // Risk Tasks Section
  rows.push(toCsvRow(["DANH SÁCH TASK RỦI RO"]));
  rows.push(
    toCsvRow([
      "Mã Jira",
      "Tiêu đề",
      "Trạng thái",
      "Nhóm",
      "Người thực hiện",
      "Ưu tiên",
      "Story Point",
      "Estimate (h)",
      "Hạn chót",
      "Rủi ro",
      "Mức độ",
      "Tuổi trạng thái (ngày làm việc)",
      "Số ngày quá hạn",
    ])
  );

  for (const task of risks) {
    rows.push(
      toCsvRow([
        task.jiraKey,
        task.summary,
        task.status,
        task.statusGroup,
        task.assigneeDisplayName,
        task.priority,
        task.points !== null ? task.points : "",
        task.originalEstimateSeconds !== null ? Math.round(task.originalEstimateSeconds / 3600) : "",
        task.dueDate || "",
        task.risks.join(", "),
        task.severity,
        task.stateAgeDays,
        task.overdueDays,
      ])
    );
  }

  return BOM + rows.join("\r\n");
}
