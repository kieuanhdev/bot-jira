import { describe, it, expect, vi, beforeEach } from "vitest";

const { prismaMock, loadConfirmedBranchRowsMock } = vi.hoisted(() => {
  const prismaMock = {
    release: {
      findUnique: vi.fn(),
    },
  };
  const loadConfirmedBranchRowsMock = vi.fn();
  return { prismaMock, loadConfirmedBranchRowsMock };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/bitbucket/branch-links", () => ({
  loadConfirmedBranchRows: loadConfirmedBranchRowsMock,
}));

import {
  loadReleaseDeliveryData,
  getReleaseReadiness,
} from "./release-readiness";

describe("release-delivery data loading & readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loadReleaseDeliveryData returns null when release not found", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);

    const result = await loadReleaseDeliveryData("non-existent");
    expect(result).toBeNull();
  });

  it("loadReleaseDeliveryData filters deleted tasks and groups branches by jiraKey", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r1",
      status: "in_progress",
      tasks: [
        {
          jiraKey: "EPM-1",
          issue: {
            jiraKey: "EPM-1",
            summary: "Task 1",
            status: "Done",
            statusCategory: "done",
            labels: [],
            assigneeJira: "user-1",
            priority: "High",
            points: 3,
            deletedAt: null,
          },
        },
        {
          jiraKey: "EPM-2",
          issue: {
            jiraKey: "EPM-2",
            summary: "Deleted Task",
            status: "Done",
            deletedAt: new Date(),
          },
        },
      ],
    });

    loadConfirmedBranchRowsMock.mockResolvedValue([
      {
        jiraKey: "EPM-1",
        repo: "repo-web",
        branch: "feature/EPM-1",
        linkState: "confirmed",
        prId: 10,
        prTitle: "PR 10",
        prUrl: "https://pr/10",
        prState: "MERGED",
        prDestinationBranch: "main",
        merged: true,
        checkedAt: new Date(),
        deletedAt: null,
      },
    ]);

    const result = await loadReleaseDeliveryData("r1");
    expect(result).not.toBeNull();
    expect(result!.activeTasks).toHaveLength(1);
    expect(result!.activeTasks[0].jiraKey).toBe("EPM-1");

    const branches = result!.branchesByKey.get("EPM-1");
    expect(branches).toBeDefined();
    expect(branches).toHaveLength(1);
    expect(branches![0].branch).toBe("feature/EPM-1");
  });

  it("getReleaseReadiness returns null when release not found", async () => {
    prismaMock.release.findUnique.mockResolvedValue(null);

    const readiness = await getReleaseReadiness("r-missing");
    expect(readiness).toBeNull();
  });

  it("getReleaseReadiness evaluates active tasks and marks ready when all are done and merged", async () => {
    prismaMock.release.findUnique.mockResolvedValue({
      id: "r2",
      status: "draft",
      tasks: [
        {
          jiraKey: "EPM-10",
          issue: {
            jiraKey: "EPM-10",
            summary: "Feature task",
            status: "Done",
            statusCategory: "done",
            labels: [],
            assigneeJira: "dev",
            priority: "Medium",
            points: 5,
            deletedAt: null,
          },
        },
      ],
    });

    loadConfirmedBranchRowsMock.mockResolvedValue([
      {
        jiraKey: "EPM-10",
        repo: "repo-api",
        branch: "feature/EPM-10",
        linkState: "confirmed",
        prId: 1,
        prTitle: "EPM-10: Feature",
        prUrl: "https://pr/1",
        prState: "MERGED",
        prDestinationBranch: "main",
        merged: true,
        checkedAt: new Date(),
        deletedAt: null,
      },
    ]);

    const readiness = await getReleaseReadiness("r2");
    expect(readiness).not.toBeNull();
    expect(readiness!.state).toBe("ready");
    expect(readiness!.taskCount).toBe(1);
    expect(readiness!.doneCount).toBe(1);
    expect(readiness!.gitCompleteCount).toBe(1);
    expect(readiness!.deliveryReadyCount).toBe(1);
    expect(readiness!.blockers).toHaveLength(0);
  });
});
