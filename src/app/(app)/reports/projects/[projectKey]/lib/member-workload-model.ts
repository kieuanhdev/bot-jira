import type { MemberReportItem } from "@/lib/reports/types";

export interface MemberWorkloadItem extends MemberReportItem {
  totalTasks: number;
  percentage: number;
  color: string;
}

export interface MemberWorkloadSummary {
  memberCount: number;
  totalTasks: number;
  completedTasks: number;
  currentWip: number;
  blockedTasks: number;
  needsSupportCount: number;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function buildMemberWorkloadReport(members: MemberReportItem[]): {
  items: MemberWorkloadItem[];
  summary: MemberWorkloadSummary;
} {
  const totalTasks = members.reduce(
    (sum, member) => sum + member.completedTasks + member.assignedOpenTasks,
    0
  );

  const items = members
    .map((member, index) => {
      const memberTotal = member.completedTasks + member.assignedOpenTasks;
      return {
        ...member,
        totalTasks: memberTotal,
        percentage: totalTasks > 0 ? Math.round((memberTotal / totalTasks) * 1000) / 10 : 0,
        color: CHART_COLORS[index % CHART_COLORS.length],
      };
    })
    .sort((a, b) => b.totalTasks - a.totalTasks || a.displayName.localeCompare(b.displayName));

  return {
    items,
    summary: {
      memberCount: members.filter((member) => member.assignee !== "unassigned").length,
      totalTasks,
      completedTasks: members.reduce((sum, member) => sum + member.completedTasks, 0),
      currentWip: members.reduce((sum, member) => sum + member.currentWip, 0),
      blockedTasks: members.reduce((sum, member) => sum + member.currentBlocked, 0),
      needsSupportCount: members.filter((member) => member.supportSignal === "needs_unblock").length,
    },
  };
}

export interface IndividualWorkloadCompositionItem {
  key: "done" | "wip" | "blocked" | "todo";
  label: string;
  count: number;
  percentage: number;
  color: string;
  description: string;
}

export interface IndividualOperationalMetric {
  metric: string;
  score: number;
  fullMark: number;
  status: "good" | "warning" | "danger";
  description: string;
  valueDisplay: string;
}

export interface IndividualEffortSummary {
  completedTasks: number;
  completedPoints: number;
  completedHours: number;
  avgHoursPerTask: number;
  avgPointsPerTask: number;
  deltaCompletedTasks: number | null;
}

export interface IndividualMemberAnalysis {
  totalTasks: number;
  completionRate: number;
  openTasksCount: number;
  composition: IndividualWorkloadCompositionItem[];
  operationalMetrics: IndividualOperationalMetric[];
  effortSummary: IndividualEffortSummary;
  healthScore: number;
  healthAssessment: {
    title: string;
    description: string;
    status: "optimal" | "attention" | "action_needed";
  };
}

export function buildIndividualMemberAnalysis(
  member: MemberReportItem
): IndividualMemberAnalysis {
  const totalTasks = member.completedTasks + member.assignedOpenTasks;
  const completionRate = totalTasks > 0 ? Math.round((member.completedTasks / totalTasks) * 100) : 0;

  const todoTasks = Math.max(0, member.assignedOpenTasks - member.currentWip - member.currentBlocked);

  const getPercentage = (count: number) =>
    totalTasks > 0 ? Math.round((count / totalTasks) * 1000) / 10 : 0;

  const composition: IndividualWorkloadCompositionItem[] = [
    {
      key: "done",
      label: "Đã hoàn thành",
      count: member.completedTasks,
      percentage: getPercentage(member.completedTasks),
      color: "var(--chart-2)",
      description: "Công việc đã chuyển sang trạng thái Hoàn thành (Done)",
    },
    {
      key: "wip",
      label: "Đang làm (WIP)",
      count: member.currentWip,
      percentage: getPercentage(member.currentWip),
      color: "var(--chart-1)",
      description: "Công việc đang trong tiến trình xử lý thực tế",
    },
    {
      key: "blocked",
      label: "Bị tắc nghẽn",
      count: member.currentBlocked,
      percentage: getPercentage(member.currentBlocked),
      color: "var(--destructive)",
      description: "Công việc bị cản trở bởi phụ thuộc hoặc vấn đề kỹ thuật",
    },
    {
      key: "todo",
      label: "Chờ thực hiện",
      count: todoTasks,
      percentage: getPercentage(todoTasks),
      color: "var(--muted-foreground)",
      description: "Công việc đang mở nằm trong hàng chờ (Backlog / To Do)",
    },
  ];

  // Operational radar & metrics calculation
  const wipScore =
    member.currentWip <= 2 ? 100 : member.currentWip === 3 ? 85 : member.currentWip === 4 ? 65 : member.currentWip === 5 ? 45 : 25;
  const blockedScore =
    member.currentBlocked === 0 ? 100 : member.currentBlocked === 1 ? 60 : Math.max(10, 100 - member.currentBlocked * 30);
  const overdueScore =
    member.currentOverdue === 0 ? 100 : member.currentOverdue === 1 ? 55 : Math.max(10, 100 - member.currentOverdue * 35);
  const slaScore =
    member.currentOverSla === 0 ? 100 : member.currentOverSla === 1 ? 65 : Math.max(15, 100 - member.currentOverSla * 25);

  const operationalMetrics: IndividualOperationalMetric[] = [
    {
      metric: "Tiến độ",
      score: completionRate,
      fullMark: 100,
      status: completionRate >= 70 ? "good" : completionRate >= 40 ? "warning" : "danger",
      description: "Tỷ lệ hoàn thành công việc được giao",
      valueDisplay: `${member.completedTasks}/${totalTasks} task`,
    },
    {
      metric: "Kiểm soát WIP",
      score: wipScore,
      fullMark: 100,
      status: member.currentWip <= 3 ? "good" : member.currentWip <= 4 ? "warning" : "danger",
      description: "Khối lượng công việc đang xử lý đồng thời",
      valueDisplay: `${member.currentWip} việc WIP`,
    },
    {
      metric: "Độ thông suốt",
      score: blockedScore,
      fullMark: 100,
      status: member.currentBlocked === 0 ? "good" : member.currentBlocked === 1 ? "warning" : "danger",
      description: "Mức độ thông suốt, không bị cản trở tắc nghẽn",
      valueDisplay: member.currentBlocked > 0 ? `${member.currentBlocked} việc bị tắc` : "Không bị tắc",
    },
    {
      metric: "Đúng hạn",
      score: overdueScore,
      fullMark: 100,
      status: member.currentOverdue === 0 ? "good" : member.currentOverdue === 1 ? "warning" : "danger",
      description: "Mức độ tuân thủ ngày hẹn hoàn thành (Due date)",
      valueDisplay: member.currentOverdue > 0 ? `${member.currentOverdue} việc quá hạn` : "100% đúng hạn",
    },
    {
      metric: "Tuân thủ SLA",
      score: slaScore,
      fullMark: 100,
      status: member.currentOverSla === 0 ? "good" : member.currentOverSla === 1 ? "warning" : "danger",
      description: "Thời gian dừng ở từng trạng thái trong chuẩn định",
      valueDisplay: member.currentOverSla > 0 ? `${member.currentOverSla} việc quá SLA` : "100% chuẩn SLA",
    },
  ];

  const healthScore = Math.round(
    operationalMetrics.reduce((sum, m) => sum + m.score, 0) / operationalMetrics.length
  );

  let healthAssessment: IndividualMemberAnalysis["healthAssessment"];
  if (member.supportSignal === "needs_unblock") {
    healthAssessment = {
      status: "action_needed",
      title: "Cần hỗ trợ tháo gỡ tắc nghẽn",
      description: member.supportReasons.join(". ") || "Có công việc bị tắc hoặc quá hạn cần phối hợp giải tỏa.",
    };
  } else if (member.supportSignal === "high_load") {
    healthAssessment = {
      status: "attention",
      title: "Tải công việc đang cao",
      description: member.supportReasons.join(". ") || "Khối lượng công việc đang xử lý đồng thời vượt ngưỡng tối ưu.",
    };
  } else if (member.supportSignal === "insufficient_data") {
    healthAssessment = {
      status: "attention",
      title: "Chưa đủ dữ liệu ghi nhận",
      description: "Chưa có đủ dữ liệu giao việc hoặc hoàn thành trong phạm vi kỳ này.",
    };
  } else {
    healthAssessment = {
      status: "optimal",
      title: "Trạng thái vận hành ổn định",
      description: "Khối lượng công việc cân bằng, tiến độ thông suốt và không có cảnh báo rủi ro.",
    };
  }

  const completedHours = Math.round((member.completedEstimateSeconds / 3600) * 10) / 10;
  const avgHoursPerTask =
    member.completedTasks > 0
      ? Math.round((member.completedEstimateSeconds / 3600 / member.completedTasks) * 10) / 10
      : 0;
  const avgPointsPerTask =
    member.completedTasks > 0
      ? Math.round((member.completedPoints / member.completedTasks) * 10) / 10
      : 0;

  return {
    totalTasks,
    completionRate,
    openTasksCount: member.assignedOpenTasks,
    composition,
    operationalMetrics,
    effortSummary: {
      completedTasks: member.completedTasks,
      completedPoints: member.completedPoints,
      completedHours,
      avgHoursPerTask,
      avgPointsPerTask,
      deltaCompletedTasks: member.deltaCompletedTasks ?? null,
    },
    healthScore,
    healthAssessment,
  };
}
