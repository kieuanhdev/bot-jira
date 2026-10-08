import type { JiraWorklog } from "../types";
import type { JiraResourceTransport } from "./types";

export function createWorklogResource({ request, requestOnce }: JiraResourceTransport) {
  return {
    addWorklog: (
      key: string,
      data: { timeSpent: string; started?: string; comment?: string },
      adjustEstimate: "auto" | "leave" = "leave"
    ): Promise<JiraWorklog> =>
      requestOnce<JiraWorklog>(
        `/rest/api/2/issue/${encodeURIComponent(key)}/worklog?adjustEstimate=${adjustEstimate}`,
        {
          method: "POST",
          body: JSON.stringify({
            timeSpent: data.timeSpent,
            ...(data.started ? { started: data.started } : {}),
            ...(data.comment ? { comment: data.comment } : {}),
          }),
        }
      ),

    getWorklogs: (
      key: string
    ): Promise<{ startAt?: number; maxResults?: number; total?: number; worklogs?: JiraWorklog[] }> =>
      request(`/rest/api/2/issue/${encodeURIComponent(key)}/worklog`, { method: "GET" }),
  };
}
