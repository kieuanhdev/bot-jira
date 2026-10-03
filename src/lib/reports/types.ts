import type { ReportPeriod, ReportPeriodPreset } from "./period";
export type { ReportPeriod, ReportPeriodPreset };


export type ReportUnit = "auto" | "tasks" | "points" | "estimate";
export type EffectiveUnit = "tasks" | "points" | "estimate";

export type HealthStatus = "healthy" | "attention" | "at_risk" | "completed" | "unknown";
export type HealthMode = "operational" | "delivery";

export type ReportStatusGroup =
  | "Backlog"
  | "To Do"
  | "In Progress"
  | "In Review"
  | "QA/Test"
  | "Blocked"
  | "Done"
  | "Unknown";

export interface HealthReason {
  code: string;
  message: string;
  severity: "info" | "warning" | "danger";
}

export interface ProjectHealth {
  status: HealthStatus;
  mode?: HealthMode;
  headline: string;
  reasons: HealthReason[];
}

export interface ProgressMetric {
  percentage: number | null;
  done: number;
  total: number;
  unit: EffectiveUnit;
}

export interface CoverageMetric {
  pointsCoverage: number;
  estimateCoverage: number;
  recommendedUnit: EffectiveUnit;
}

export interface ReportFreshness {
  status: "healthy" | "degraded" | "down" | "unknown";
  isFresh: boolean;
  workerAgeMs: number | null;
  jiraSyncAgeMs: number | null;
  lastSyncedAt: string | null;
  warning?: string;
}

export interface DataQualityWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "high";
}

export interface StatusDistributionItem {
  group: ReportStatusGroup;
  count: number;
  points: number;
  estimateSeconds: number;
  percentage: number;
}

export interface WorkloadItem {
  assignee: string; // username or "unassigned"
  displayName: string;
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  overSlaTasks: number;
  points: number;
  estimateSeconds: number;
}

export interface BottleneckItem {
  status: string;
  statusGroup: ReportStatusGroup;
  taskCount: number;
  overSlaCount: number;
  avgStateAgeDays: number;
}

export type RiskReason = "blocked" | "overdue" | "over_sla" | "unassigned";

export interface RiskTaskItem {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusGroup: ReportStatusGroup;
  assigneeJira: string | null;
  assigneeDisplayName: string | null;
  priority: string;
  points: number | null;
  originalEstimateSeconds: number | null;
  dueDate: string | null;
  risks: RiskReason[];
  stateAgeDays: number;
  blockedDays: number;
  overdueDays: number;
  slaDays: number;
  severity: "info" | "warning" | "high";
}

export type TaskActivityType =
  | "created"
  | "completed"
  | "reopened"
  | "current_open"
  | "unchanged";

export interface TaskExplorerItem {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusGroup: ReportStatusGroup;
  assigneeJira: string | null;
  assigneeDisplayName: string | null;
  priority: string;
  points: number | null;
  originalEstimateSeconds: number | null;
  dueDate: string | null;
  createdAt: string | null;
  completedAt: string | null;
  activity: TaskActivityType;
  risks: RiskReason[];
  stateAgeDays: number;
  fixVersionNames: string[];
}

export type SupportSignal = "balanced" | "high_load" | "needs_unblock" | "insufficient_data";

export interface MemberReportItem {
  assignee: string;
  displayName: string;
  completedTasks: number;
  completedPoints: number;
  completedEstimateSeconds: number;
  currentWip: number;
  currentBlocked: number;
  currentOverdue: number;
  currentOverSla: number;
  assignedOpenTasks: number;
  deltaCompletedTasks?: number | null;
  supportSignal: SupportSignal;
  supportReasons: string[];
}

export interface ProjectSnapshotMetrics {
  openAtEnd: number;
  doneAtEnd: number;
  totalAtEnd: number;
  wipAtEnd: number;
  blockedAtEnd: number;
  overdueAtEnd: number;
  overSlaAtEnd: number;
  unassignedAtEnd: number;
  completionRatio: number;
  doneUnits: number;
  totalUnits: number;
  unit: EffectiveUnit;
  coverage: CoverageMetric;
}

export interface ProjectFlowMetrics {
  createdInPeriod: number;
  completedInPeriod: number;
  reopenedInPeriod: number;
  statusTransitionsInPeriod: number;
  throughput: number;
  throughputPoints: number;
  throughputEstimateHours: number;
  netBacklogChange: number;
}

export interface MetricComparisonItem {
  current: number;
  previous: number;
  delta: number;
  percentChange: number | null;
}

export interface MetricComparison {
  created: MetricComparisonItem;
  completed: MetricComparisonItem;
  throughput: MetricComparisonItem;
  netBacklog: { current: number; previous: number; delta: number };
  wip: { current: number; previous: number; delta: number };
  blocked: { current: number; previous: number; delta: number };
  overdue: { current: number; previous: number; delta: number };
}

export interface ProjectReportSummary {
  projectKey: string;
  projectName: string;
  period: ReportPeriod;
  periodLabel: string;
  health: HealthStatus;
  healthHeadline: string;
  healthReasons: HealthReason[];
  progress: ProgressMetric;
  unit: EffectiveUnit;
  recommendedUnit: EffectiveUnit;
  coverage: CoverageMetric;
  // Snapshot at end
  openAtEnd: number;
  doneAtEnd: number;
  wipAtEnd: number;
  blockedAtEnd: number;
  overdueAtEnd: number;
  overSlaAtEnd: number;
  completionRatio: number;
  // Legacy aliases
  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  overSlaTasks: number;
  // Flow in period
  createdInPeriod: number;
  completedInPeriod: number;
  netBacklogChange: number;
  throughput: number;
  lastSyncedAt: string | null;
  // Optional reference release
  referenceRelease?: {
    id: string;
    name: string;
    releaseDate: string | null;
  } | null;
}

export interface ProjectPortfolioResponse {
  generatedAt: string;
  timezone: string;
  period: ReportPeriod;
  periodLabel: string;
  freshness: ReportFreshness;
  summary: {
    total: number;
    totalProjects: number;
    healthy: number;
    attention: number;
    atRisk: number;
    completed: number;
    unknown: number;
    completedInPeriod: number;
    blockedAtEnd: number;
  };
  projects: ProjectReportSummary[];
}

export interface ProjectDetailResponse {
  projectKey: string;
  projectName: string;
  project: {
    key: string;
    name: string;
  };

  generatedAt: string;
  timezone: string;
  period: ReportPeriod;
  periodLabel: string;
  comparisonPeriod: ReportPeriod | null;
  scope: {
    versionId: string | null;
    versionName: string | null;
    releaseDate?: string | null;
    startDate?: string | null;
    unit: EffectiveUnit;
    requestedUnit: ReportUnit;
    includeSubtasks: boolean;
    totalScopeIssues: number;
    totalIssues?: number;
  };
  availableVersions: Array<{
    id: string;
    name: string;
    released: boolean;
    releaseDate?: string | null;
    startDate?: string | null;
  }>;
  snapshotAtEnd: ProjectSnapshotMetrics;
  flow: ProjectFlowMetrics;
  comparison: MetricComparison | null;
  health: ProjectHealth;
  statusDistribution: StatusDistributionItem[];
  workload: WorkloadItem[];
  bottlenecks: BottleneckItem[];
  topRisks: RiskTaskItem[];
  dataQuality: DataQualityWarning[];
  freshness: ReportFreshness;
  // Legacy compatibility helpers
  kpis?: {
    progress: ProgressMetric;
    taskProgress: ProgressMetric;
    pointProgress: ProgressMetric;
    estimateProgress: ProgressMetric;
    coverage: CoverageMetric;
    wipCount: number;
    blockedCount: number;
    overdueCount: number;
    overSlaCount: number;
    unassignedCount: number;
    scheduleGapPercentage: number | null;
    timeElapsedPercentage: number | null;
  };
}

export interface ProjectTasksResponse {
  tasks: TaskExplorerItem[];
  total: number;
  limit: number;
  offset: number;
  period: ReportPeriod;
}

export interface ProjectMembersResponse {
  members: MemberReportItem[];
  period: ReportPeriod;
  comparisonPeriod: ReportPeriod | null;
  unit: EffectiveUnit;
}

export interface HistoryDataPoint {
  date: string;
  createdCount: number;
  completedCount: number;
  netBacklog: number;
  openCount: number;
  doneCount: number;
  throughput: number;
}

export interface ProjectHistoryResponse {
  projectKey: string;
  period: ReportPeriod;
  dataPoints: HistoryDataPoint[];
  dataSufficiencyWarning?: string | null;
}

export interface RiskTasksResponse {
  tasks: RiskTaskItem[];
  total: number;
  limit: number;
  offset: number;
}
