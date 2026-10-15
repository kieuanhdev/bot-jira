import { describe, it, expect, vi, beforeEach } from "vitest";
import { listWatchedItems } from "./list";

const mocks = vi.hoisted(() => ({
  watchFindMany: vi.fn(),
  issueCacheFindMany: vi.fn(),
  getUserScopedProjects: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    watch: {
      findMany: (...args: unknown[]) => mocks.watchFindMany(...args),
    },
    issueCache: {
      findMany: (...args: unknown[]) => mocks.issueCacheFindMany(...args),
    },
  },
}));

vi.mock("@/lib/project-scope", () => ({
  getUserScopedProjects: (...args: unknown[]) => mocks.getUserScopedProjects(...args),
}));

describe("listWatchedItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedProjects.mockResolvedValue(["PROJ"]);
  });

  it("returns empty array when user watches no tasks", async () => {
    mocks.watchFindMany.mockResolvedValue([]);
    const result = await listWatchedItems("u-1", "member");
    expect(result).toEqual([]);
    expect(mocks.issueCacheFindMany).not.toHaveBeenCalled();
  });

  it("joins watches with scoped issues and formats ISO dates", async () => {
    const watchedDate = new Date("2026-10-15T10:00:00.000Z");
    const updatedDate = new Date("2026-10-14T08:00:00.000Z");

    mocks.watchFindMany.mockResolvedValue([
      { jiraKey: "PROJ-101", watchedAt: watchedDate },
      { jiraKey: "PROJ-999", watchedAt: watchedDate },
    ]);

    mocks.issueCacheFindMany.mockResolvedValue([
      {
        jiraKey: "PROJ-101",
        summary: "Important task",
        status: "In Progress",
        assigneeJira: "alice",
        points: 5,
        labels: ["backend"],
        updatedAt: updatedDate,
      },
    ]);

    const result = await listWatchedItems("u-1", "member");

    expect(result).toEqual([
      {
        jiraKey: "PROJ-101",
        summary: "Important task",
        status: "In Progress",
        assigneeJira: "alice",
        points: 5,
        labels: ["backend"],
        updatedAt: "2026-10-14T08:00:00.000Z",
        watchedAt: "2026-10-15T10:00:00.000Z",
      },
    ]);
    expect(mocks.getUserScopedProjects).toHaveBeenCalledWith("u-1", "member");
    expect(mocks.issueCacheFindMany).toHaveBeenCalledWith({
      where: { jiraKey: { in: ["PROJ-101", "PROJ-999"] }, projectKey: { in: ["PROJ"] } },
      select: {
        jiraKey: true,
        summary: true,
        status: true,
        assigneeJira: true,
        points: true,
        labels: true,
        updatedAt: true,
      },
    });
  });
});
