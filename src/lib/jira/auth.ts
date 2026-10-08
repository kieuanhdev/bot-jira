/** Auth material for a single Jira caller. */
export type JiraAuth = {
  user: string;
  token: string;
  /** "Bearer" or "basic". */
  authMode: "Bearer" | "basic";
};
