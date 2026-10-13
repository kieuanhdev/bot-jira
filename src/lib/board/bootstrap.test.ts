import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  listActiveProjects: vi.fn(),
  issueGroupBy: vi.fn(),
  getProjectPeopleFields: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
    issueCache: { groupBy: mocks.issueGroupBy },
  },
}));

vi.mock("@/lib/jira/project-catalog", () => ({
  listActiveProjects: mocks.listActiveProjects,
  normalizeProjectKey: (key: string) => key.trim().toUpperCase(),
}));

vi.mock("@/lib/user-creds", () => ({
  userJiraUsername: (user: { jiraUsername?: string | null }) => user?.jiraUsername ?? null,
  jiraUsernameAliases: (username: string) => [username, `${username}_mb`],
  userJiraAuth: (user: { jiraAuth?: unknown }) => (user ? { user: "test", token: "tok" } : null),
}));

vi.mock("@/lib/jira/people-fields", () => ({
  getProjectPeopleFields: mocks.getProjectPeopleFields,
}));

vi.mock("@/lib/env", () => ({
  env: {
    jiraBaseUrl: "https://jira.example.com",
    bitbucketBaseUrl: null,
  },
}));

import { getBoardBootstrap } from "./bootstrap";

describe("getBoardBootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({
      id: "u-1",
      jiraUsername: "alice",
      onboarded: true,
      role: "lead",
      boardProjects: ["EPM"],
      jiraVerifiedAt: new Date("2026-10-01T00:00:00Z"),
    });
    mocks.listActiveProjects.mockResolvedValue([
      { key: "EPM", name: "EPM Project", active: true },
      { key: "MHRM", name: "MHRM Project", active: true },
    ]);
    mocks.issueGroupBy.mockResolvedValue([
      { projectKey: "EPM", _count: { _all: 42 } },
    ]);
    mocks.getProjectPeopleFields.mockResolvedValue({
      reporter: "reporter",
      approver: "customfield_10300",
      tester: "customfield_10501",
    });
  });

  it("returns null if user is not found", async () => {
    mocks.user.mockResolvedValueOnce(null);
    const result = await getBoardBootstrap("unknown");
    expect(result).toBeNull();
  });

  it("loads preferences, catalog projects, counts and status scoped to user", async () => {
    const result = await getBoardBootstrap("u-1");
    expect(result).not.toBeNull();
    expect(result?.preferences).toEqual({
      projects: ["EPM"],
      available: ["EPM", "MHRM"],
    });
    expect(result?.projects.items).toEqual([
      { key: "EPM", name: "EPM Project", selected: true, openCount: 42 },
      { key: "MHRM", name: "MHRM Project", selected: false, openCount: 0 },
    ]);
    expect(result?.meStatus).toMatchObject({
      jiraLinked: true,
      onboarded: true,
      jiraName: "alice",
      role: "lead",
      canBoardTeam: true,
    });
    expect(result?.initialProject).toBe("EPM");
    expect(result?.peopleFieldData?.fields.approver).toBe("customfield_10300");
  });

  it("prioritizes valid project from URL over stored preference", async () => {
    const result = await getBoardBootstrap("u-1", "MHRM");
    expect(result?.initialProject).toBe("MHRM");
    expect(mocks.getProjectPeopleFields).toHaveBeenCalledWith("MHRM");
  });

  it("falls back to first preferred project if URL project is invalid", async () => {
    const result = await getBoardBootstrap("u-1", "INVALID");
    expect(result?.initialProject).toBe("EPM");
  });
});
