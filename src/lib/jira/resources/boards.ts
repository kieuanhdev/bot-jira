import { JiraRequestError } from "../errors";
import type {
  JiraBoard,
  JiraBoardConfiguration,
  JiraBoardPage,
  JiraProject,
  JiraSearchResult,
} from "../types";
import type { JiraRequest } from "./types";

function assertBoardId(boardId: number): void {
  if (!Number.isInteger(boardId) || boardId <= 0) {
    throw new JiraRequestError(`Invalid boardId: ${boardId}`, 400, false);
  }
}

export function createBoardResource(request: JiraRequest) {
  return {
    getBoardsForProject: async (projectKey: string): Promise<JiraBoard[]> => {
      const cleanKey = projectKey.trim().toUpperCase();
      if (!cleanKey) return [];
      const boards: JiraBoard[] = [];
      let startAt = 0;
      const maxResults = 50;
      while (true) {
        const url = `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(cleanKey)}&startAt=${startAt}&maxResults=${maxResults}`;
        const response = await request<JiraBoardPage>(url);
        const values = response?.values ?? [];
        boards.push(...values);
        if (
          response?.isLast ||
          values.length === 0 ||
          (response?.total !== undefined && boards.length >= response.total)
        ) {
          break;
        }
        startAt += values.length;
        if (boards.length > 500) break;
      }
      return boards;
    },

    getBoardConfiguration: async (boardId: number): Promise<JiraBoardConfiguration> => {
      assertBoardId(boardId);
      return request<JiraBoardConfiguration>(
        `/rest/agile/1.0/board/${boardId}/configuration`
      );
    },

    getBoard: async (boardId: number): Promise<JiraBoard> => {
      assertBoardId(boardId);
      return request<JiraBoard>(`/rest/agile/1.0/board/${boardId}`);
    },

    getBoardProjects: async (boardId: number): Promise<JiraProject[]> => {
      assertBoardId(boardId);
      const response = await request<JiraProject[] | { values?: JiraProject[] }>(
        `/rest/agile/1.0/board/${boardId}/project`
      );
      return Array.isArray(response) ? response : response?.values ?? [];
    },

    getBoardIssues: async (
      boardId: number,
      options?: { startAt?: number; maxResults?: number; jql?: string; fields?: string }
    ): Promise<JiraSearchResult> => {
      assertBoardId(boardId);
      const query = new URLSearchParams({
        startAt: String(options?.startAt ?? 0),
        maxResults: String(options?.maxResults ?? 50),
        fields: options?.fields ?? "id,key",
      });
      if (options?.jql) query.set("jql", options.jql);
      return request<JiraSearchResult>(
        `/rest/agile/1.0/board/${boardId}/issue?${query.toString()}`
      );
    },

    getBoardBacklog: async (
      boardId: number,
      options?: { startAt?: number; maxResults?: number; jql?: string; fields?: string }
    ): Promise<JiraSearchResult> => {
      assertBoardId(boardId);
      const query = new URLSearchParams({
        startAt: String(options?.startAt ?? 0),
        maxResults: String(options?.maxResults ?? 50),
        fields: options?.fields ?? "id,key",
      });
      if (options?.jql) query.set("jql", options.jql);
      return request<JiraSearchResult>(
        `/rest/agile/1.0/board/${boardId}/backlog?${query.toString()}`
      );
    },
  };
}
