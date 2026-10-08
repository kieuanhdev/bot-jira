import type { JiraComponent, JiraProject, JiraProjectStatus, JiraUser } from "../types";
import type { JiraRequest } from "./types";

export function createProjectResource(request: JiraRequest) {
  return {
    getProjects: () => request<JiraProject[]>("/rest/api/2/project"),

    getProject: (projectKey: string) =>
      request<JiraProject>(`/rest/api/2/project/${encodeURIComponent(projectKey)}`),

    getProjectStatuses: (projectKey: string) =>
      request<JiraProjectStatus[]>(
        `/rest/api/2/project/${encodeURIComponent(projectKey)}/statuses`
      ),

    getProjectComponents: (projectKey: string) =>
      request<JiraComponent[]>(
        `/rest/api/2/project/${encodeURIComponent(projectKey)}/components`
      ),

    searchAssignableUsers: async (
      projectKey: string,
      query: string,
      limit: number
    ): Promise<JiraUser[]> => {
      const encodedQuery = encodeURIComponent(query);
      const maxResults = Math.min(Math.max(1, limit), 50);
      try {
        const response = await request<
          | JiraUser[]
          | {
              startAt?: number;
              maxResults?: number;
              total?: number;
              values?: JiraUser[];
            }
        >(
          `/rest/api/2/user/assignable/search?projectKey=${encodeURIComponent(projectKey)}&maxResults=${maxResults}${query ? `&username=${encodedQuery}` : ""}`
        );
        const users = (Array.isArray(response) ? response : response.values ?? []).filter(
          (user) => user.active !== false
        );
        if (users.length > 0) return users;
      } catch {
        // Fall through to the global user search used by the existing client.
      }

      const searchUrl = query
        ? `/rest/api/2/user/search?username=${encodedQuery}&maxResults=${maxResults}`
        : `/rest/api/2/user/search?maxResults=${maxResults}`;
      const response = await request<JiraUser[]>(searchUrl);
      return (response ?? []).filter((user) => user.active !== false);
    },
  };
}
