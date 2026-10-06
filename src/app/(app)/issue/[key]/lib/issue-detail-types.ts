export type IssueDetail = {
  jiraKey: string;
  summary: string;
  description: string;
  status: string;
  assigneeJira: string | null;
  labels: string[];
  fixVersions?: string[];
  priority: string;
  points: number | null;
  type: string;
  timeSpentSeconds?: number | null;
  originalEstimateSeconds?: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSyncedAt: string;
  aiScore: {
    points: number;
    confidence: number | null;
    reasoning: string;
    risks: string[];
    missingInformation: string[];
    similarTasks: string[];
    model: string;
    promptVersion: string | null;
    scoredAt: string;
  } | null;
  aiDecision: { decision: string; finalPoints: number | null; decidedAt: string } | null;
  comments: { id: string; author: string; body: string; createdAt: string | null }[];
  releaseTasks: { release: { version: string; status: string } }[];
  staleSnapshots: {
    ageDays: number;
    detectedAt: string;
    staleReason: string;
    severity: string;
    stateAgeDays: number;
    blockedDays: number;
  }[];
};

export type Transition = { id: string; name: string; to?: { name?: string } | string };

export type BranchRow = {
  id?: string;
  repo: string;
  branch: string;
  merged: boolean;
  lastCommitAt: string | null;
  prId?: number | null;
  prTitle?: string | null;
  prUrl?: string | null;
  prState?: string | null;
  prDestinationBranch?: string | null;
  linkSource?: string | null;
  linkConfidence?: number | null;
  linkState?: string;
  checkedAt?: string;
};

export type MsgState = { tone: "success" | "destructive" | "info"; text: string } | null;
