export type ActiveJiraSync = {
  projectKey: string;
  startedAt: string | null;
};

export type ActiveJiraSyncResponse = {
  syncingProjects: string[];
  activeSyncs: ActiveJiraSync[];
  timestamp: string;
};
