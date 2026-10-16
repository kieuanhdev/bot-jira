import { beforeEach, describe, expect, it, vi } from "vitest";
import { listBranchesForUser, listDeliveryTasksForUser } from "./list-route-service";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  getUserScopedProjects: vi.fn(),
  queryBranches: vi.fn(),
  queryDeliveryTasks: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/project-scope", () => ({
  getUserScopedProjects: mocks.getUserScopedProjects,
}));

vi.mock("@/lib/bitbucket/branch-query", () => ({
  queryBranches: mocks.queryBranches,
}));

vi.mock("@/lib/bitbucket/task-delivery-query", () => ({
  queryDeliveryTasks: mocks.queryDeliveryTasks,
}));

vi.mock("@/lib/user-creds", () => ({
  userJiraUsername: (user: { jiraUsername?: string | null }) => user?.jiraUsername ?? null,
  jiraUsernameAliases: (u: string) => [u, u.toLowerCase()],
}));

vi.mock("@/lib/env", () => ({
  env: {
    bitbucketBaseUrl: "https://bitbucket.example.com",
    jiraBaseUrl: "https://jira.example.com",
  },
}));

describe("src/lib/branches/list-route-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listBranchesForUser", () => {
    it("normalizes ALL filters, queries scoped branches, and serializes Dates", async () => {
      mocks.getUserScopedProjects.mockResolvedValue(["PROJ-A", "PROJ-B"]);
      const now = new Date("2026-10-16T12:00:00.000Z");
      mocks.queryBranches.mockResolvedValue({
        items: [
          {
            id: "b-1",
            repo: "web",
            branch: "feat/login",
            lastCommitAt: now,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });

      const result = await listBranchesForUser(
        { id: "user-1", role: "member" },
        {
          project: "ALL",
          repo: "ALL",
          link: "ALL",
          pr: "ALL",
          taskStatus: "ALL",
          assignee: "ALL",
          attention: "0",
          page: 1,
          pageSize: 25,
        }
      );

      expect(mocks.getUserScopedProjects).toHaveBeenCalledWith("user-1", "member");
      expect(mocks.queryBranches).toHaveBeenCalledWith({
        projectScope: ["PROJ-A", "PROJ-B"],
        q: undefined,
        project: undefined,
        repo: undefined,
        link: undefined,
        pr: undefined,
        taskStatus: undefined,
        assignee: undefined,
        attention: undefined,
        sort: undefined,
        order: undefined,
        page: 1,
        pageSize: 25,
      });

      expect(result.bitbucketBaseUrl).toBe("https://bitbucket.example.com");
      expect(result.jiraBaseUrl).toBe("https://jira.example.com");
      expect(result.items[0].lastCommitAt).toBe(now.toISOString());
    });
  });

  describe("listDeliveryTasksForUser", () => {
    it("looks up user aliases and queries delivery tasks", async () => {
      mocks.userFindUnique.mockResolvedValue({
        jiraUsername: "alice",
        jiraUserEnc: null,
      });
      mocks.queryDeliveryTasks.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      const result = await listDeliveryTasksForUser(
        { id: "user-2" },
        {
          view: "my-work",
          project: "PROJ",
          repo: "ALL",
          page: 2,
          pageSize: 20,
        }
      );

      expect(mocks.userFindUnique).toHaveBeenCalledWith({
        where: { id: "user-2" },
        select: { jiraUsername: true, jiraUserEnc: true },
      });

      expect(mocks.queryDeliveryTasks).toHaveBeenCalledWith({
        view: "my-work",
        q: undefined,
        project: "PROJ",
        repo: undefined,
        pr: undefined,
        taskStatus: undefined,
        assignee: undefined,
        userAliases: ["alice", "alice"],
        page: 2,
        pageSize: 20,
      });

      expect(result.bitbucketBaseUrl).toBe("https://bitbucket.example.com");
    });
  });
});
