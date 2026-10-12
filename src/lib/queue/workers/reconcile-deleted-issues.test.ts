import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  searchKeys: vi.fn(),
  markDeleted: vi.fn(),
  projects: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { issueCache: { findMany: mocks.findMany } } }));
vi.mock("@/lib/jira/client", () => ({
  hasJiraCredentials: vi.fn().mockResolvedValue(true),
  jira: { searchKeys: mocks.searchKeys },
}));
vi.mock("@/lib/jira/project-catalog", () => ({ listSyncEnabledProjectKeys: mocks.projects }));
vi.mock("@/lib/issues/deleted", () => ({ markIssuesDeleted: mocks.markDeleted }));

import { runReconcileDeletedIssues } from "./reconcile-deleted-issues";

const rows = (...keys: string[]) => keys.map((jiraKey) => ({ jiraKey }));
const page = (...keys: string[]) => ({
  startAt: 0,
  maxResults: 100,
  total: keys.length,
  issues: keys.map((key) => ({ key })),
});

describe("runReconcileDeletedIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projects.mockResolvedValue(["APP"]);
    mocks.markDeleted.mockImplementation(async (keys: string[]) => keys.length);
  });

  it("soft-deletes cached keys that Jira no longer returns", async () => {
    mocks.findMany.mockResolvedValue(rows("APP-1", "APP-2", "APP-3"));
    mocks.searchKeys.mockResolvedValue(page("APP-1", "APP-3"));
    const result = await runReconcileDeletedIssues();
    expect(mocks.markDeleted).toHaveBeenCalledWith(["APP-2"]);
    expect(result).toMatchObject({ ok: true, stats: { deleted: 1 } });
  });

  it("does nothing when Jira returns every cached key", async () => {
    mocks.findMany.mockResolvedValue(rows("APP-1"));
    mocks.searchKeys.mockResolvedValue(page("APP-1", "APP-9"));
    await runReconcileDeletedIssues();
    expect(mocks.markDeleted).not.toHaveBeenCalled();
  });

  it("refuses to delete when Jira returns nothing", async () => {
    mocks.findMany.mockResolvedValue(rows("APP-1", "APP-2"));
    mocks.searchKeys.mockResolvedValue(page());
    const result = await runReconcileDeletedIssues();
    expect(mocks.markDeleted).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it("skips the project when the Jira search fails", async () => {
    mocks.findMany.mockResolvedValue(rows("APP-1"));
    mocks.searchKeys.mockRejectedValue(new Error("boom"));
    const result = await runReconcileDeletedIssues();
    expect(mocks.markDeleted).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });
});
