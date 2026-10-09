export interface LeaderboardTaskItem {
  jiraKey: string;
  summary: string;
  status: string;
  statusCategory: string;
  points: number;
  completedAt: string | null;
  projectKey: string;
  priority?: string | null;
  updatedAt?: string | null;
}
