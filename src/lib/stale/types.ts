import type { StaleReason } from "./classify";
import type { PointAlertLevel } from "./baseline";
import type {
  RequirementCode,
  StandardizationStatus,
  PolicyId,
} from "@/lib/issues/standardization";

export interface StaleQueryParams {
  project: string;
  projectList: string[];
  assignee: string;
  status: string;
  reason: StaleReason | "";
  severity: string;
}

export interface StaleIssueRecord {
  jiraKey: string;
  projectKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  statusChangedAt: Date | null;
  assigneeJira: string | null;
  type: string;
  priority: string;
  points: number | null;
  originalEstimateSeconds: number | null;
  timeSpent: number | null;
  dueDate: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  labels: string[];
  lastSyncedAt: Date | null;
  fixVersionIds: string[];
  fixVersionNames: string[];
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
  policyId: PolicyId;
  policyVersion: string;
  statusResult: StandardizationStatus;
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
  updatedAt: Date | null;
  lastSyncedAt: Date | null;
}

export interface StandardizationSummary {
  complete: number;
  incomplete: number;
  unknown: number;
  missingCounts: Record<RequirementCode, number>;
  tasks: StandardizationTask[];
}

export interface StaleTask {
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
  createdAt: Date | null;
  updatedAt: Date | null;
  statusChangedAt: Date | null;
  totalAgeDays: number;
  stateAgeDays: number;
  inactiveDays: number;
  blockedDays: number;
  staleReason: StaleReason;
  staleReasonLabel: string;
  severity: string;
  slaDays: number;
  overByDays: number;
  baselineLevel: PointAlertLevel;
  expectedCycleMax: number | null;
  alertThreshold: number | null;
  overdueDays: number;
  labels: string[];
}

export interface BottleneckEntry {
  status: string;
  group: string;
  count: number;
  avgStateAge: number;
  totalOverBy: number;
}

export interface SupportEntry {
  assignee: string;
  taskCount: number;
  reasons: { reason: StaleReason; label: string; count: number }[];
  avgStateAge: number;
}

export interface BlockedTask {
  jiraKey: string;
  summary: string;
  status: string;
  assigneeJira: string | null;
  blockedDays: number;
  reason: StaleReason;
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

export interface MyWorkTask {
  jiraKey: string;
  summary: string;
  status: string;
  points: number | null;
  updatedAt: Date | null;
}

export interface MyWorkInfo {
  username: string | null;
  totalActive: number;
  totalStale: number;
  wipCount: number;
  lastSyncedAt: Date | null;
  standardization: StandardizationSummary;
  tasks: MyWorkTask[];
}

export interface StaleFilters {
  projects: string[];
  assignees: string[];
  statuses: string[];
  reasons: StaleReason[];
  reasonLabels: Record<StaleReason, string>;
}

export interface StaleApiResponse {
  tasks: StaleTask[];
  bottleneck: BottleneckEntry[];
  support: SupportEntry[];
  blocked: BlockedTask[];
  trend: TrendPoint[];
  wip: WipEntry[];
  filters: StaleFilters;
  myWork: MyWorkInfo;
  summary: Summary;
}
