export type JiraUser = {
  key?: string;
  name?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
  avatarUrls?: Record<string, string>;
};

export type JiraFields = {
  summary?: string;
  description?: string;
  project?: { key?: string; name?: string; id?: string };
  status?: {
    name?: string;
    key?: string;
    id?: string;
    statusCategory?: { id?: number; key?: string; name?: string };
  };
  statuscategorychangedate?: string;
  assignee?: JiraUser | null;
  labels?: string[];
  fixVersions?: { id?: string; name?: string; released?: boolean }[];
  priority?: { name?: string; id?: string } | null;
  issuetype?: { name?: string; id?: string };
  created?: string;
  updated?: string;
  key?: string;
  [key: string]: unknown;
};

export type JiraIssue = {
  id: string;
  key: string;
  self: string;
  fields: JiraFields;
};

export type JiraTransition = {
  id: string;
  name?: string;
  to?: { name?: string; id?: string; key?: string };
  hasScreen?: boolean;
  idProperty?: string;
};

export type JiraComment = {
  id: string;
  self?: string;
  body: string;
  author?: JiraUser;
  created?: string;
  updated?: string;
};

export type JiraCommentPage = {
  startAt?: number;
  maxResults?: number;
  total?: number;
  comments?: JiraComment[];
  /** Compatibility with older/custom Jira responses used by this project. */
  issues?: JiraComment[];
};

export type JiraSearchResult = {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
};

export type JiraProject = {
  key: string;
  name: string;
  id?: string;
};

/** A Jira Fix Version (release version) for a project. */
export type JiraVersion = {
  id: string;
  name: string;
  description?: string;
  released?: boolean;
  /** ISO date string, e.g. "2024-01-01". */
  releaseDate?: string;
  archived?: boolean;
  projectId?: string;
  project?: string;
  self?: string;
};

export type JiraStatus = {
  id: string;
  name: string;
  /** 1 = to do, 4 = in progress, 3/5 = done (Jira statusCategory numeric codes). */
  statusCategory: { id: number; key: string; name: string };
};

/** One issue type with its workflow statuses, in workflow order. */
export type JiraProjectStatus = {
  id: string;
  name: string;
  subtask: boolean;
  /** Workflow states in the order an issue moves through them. */
  statuses: JiraStatus[];
};
