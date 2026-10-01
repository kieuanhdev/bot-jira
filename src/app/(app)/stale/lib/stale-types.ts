import type { RequirementCode } from "@/lib/issues/standardization";

export type Severity = "info" | "warning" | "high";
export type PointAlertLevel = "within" | "warning" | "high";
export type SortMode = "priority" | "overBy" | "stateAge" | "overdue";
export type FocusMode = "all" | "high" | "blocked" | "overdue" | "unassigned";

export interface Task {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusGroup: string;
  assigneeJira: string | null;
  type: string;
  priority: string;
  points: number | null;
  fixVersionNames: string[];
  dueDate: string | null;
  timeSpent: number | null;
  totalAgeDays: number;
  stateAgeDays: number;
  inactiveDays: number;
  blockedDays: number;
  staleReason: string;
  staleReasonLabel: string;
  severity: Severity;
  slaDays: number;
  overByDays: number;
  baselineLevel: PointAlertLevel;
  expectedCycleMax: number | null;
  alertThreshold: number | null;
  overdueDays: number;
  labels: string[];
}

export interface Bottleneck {
  status: string;
  group: string;
  count: number;
  avgStateAge: number;
  totalOverBy: number;
}

export interface SupportEntry {
  assignee: string;
  taskCount: number;
  reasons: { reason: string; label: string; count: number }[];
  avgStateAge: number;
}

export interface BlockedTask {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
  blockedDays: number;
  reason: string;
  reasonLabel: string;
}

export interface TrendPoint {
  week: string;
  count: number;
}

export interface WipEntry {
  assignee: string;
  taskCount: number;
  statuses: string[];
}

export interface StandardizationTask {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  statusGroup: string;
  assigneeJira: string | null;
  type: string;
  priority: string;
  points: number | null;
  originalEstimateSeconds: number | null;
  timeSpent: number | null;
  fixVersionNames: string[];
  dueDate: string | null;
  labels: string[];
  policyId: string;
  policyVersion: string;
  statusResult: "complete" | "incomplete" | "unknown";
  required: RequirementCode[];
  missing: RequirementCode[];
  satisfied: RequirementCode[];
  unknown: RequirementCode[];
  warnings: string[];
  isStale: boolean;
  stateAgeDays: number;
  slaDays: number;
  overdueDays: number;
  isBlocked: boolean;
  blockedDays: number;
  updatedAt: string | null;
  lastSyncedAt: string | null;
}

export interface StandardizationSummary {
  complete: number;
  incomplete: number;
  unknown: number;
  missingCounts: Record<RequirementCode, number>;
  tasks: StandardizationTask[];
}

export interface MyWorkTask {
  jiraKey: string;
  summary: string;
  status: string;
  points: number | null;
  updatedAt: string | null;
}

export interface MyWorkInfo {
  username: string | null;
  totalActive: number;
  totalStale: number;
  wipCount: number;
  lastSyncedAt: string | null;
  standardization?: StandardizationSummary;
  tasks: MyWorkTask[];
}

export interface Summary {
  totalActive: number;
  totalStale: number;
  totalHigh: number;
  totalBlocked: number;
  totalNoAssignee: number;
  worstOverBy: number;
  totalOverdue: number;
  totalBaselineAlert: number;
  wipCount: number;
}

export interface StaleResponse {
  tasks: Task[];
  bottleneck: Bottleneck[];
  support: SupportEntry[];
  blocked: BlockedTask[];
  trend: TrendPoint[];
  wip: WipEntry[];
  filters: {
    projects: string[];
    assignees: string[];
    statuses: string[];
    reasons: string[];
    reasonLabels: Record<string, string>;
  };
  myWork?: MyWorkInfo;
  summary: Summary;
}

export const ALL = "all";

export const SEVERITY_VARIANT: Record<Severity, "info" | "warning" | "danger"> = {
  info: "info",
  warning: "warning",
  high: "danger",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  info: "Theo dõi",
  warning: "Cần chú ý",
  high: "Khẩn cấp",
};

export const GROUP_DOT: Record<string, string> = {
  Backlog: "bg-muted-foreground/50",
  "To Do": "bg-sky-500",
  "In Progress": "bg-primary",
  "In Review": "bg-amber-500",
  Done: "bg-emerald-500",
};

export const ACTION_BY_REASON: Record<string, string> = {
  no_assignee: "Chỉ định người xử lý",
  waiting_to_start: "Ưu tiên lại hoặc bắt đầu",
  in_progress_no_update: "Chốt tiến độ và bước tiếp theo",
  waiting_review: "Tìm hoặc nhắc reviewer",
  waiting_qa: "Bắt đầu hoặc làm rõ QA",
  waiting_other_team: "Theo dõi phụ thuộc bên ngoài",
  blocked: "Tháo gỡ điểm nghẽn",
  unknown: "Kiểm tra ánh xạ quy trình",
};
