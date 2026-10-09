import { describe, it, expect, vi } from "vitest";
import { buildReleaseContext } from "./context-loader";

describe("context-loader", () => {
  const NOW = new Date("2026-10-09T10:00:00Z");

  it("returns null if release is not found in database", async () => {
    const prismaMock = {
      release: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      issueCache: { findMany: vi.fn() },
      branchInfo: { findMany: vi.fn() },
      releaseApproval: { findMany: vi.fn() },
      ciBuildStatus: { findMany: vi.fn() },
    };

    const ctx = await buildReleaseContext("non-existent", "1.0.0", {
      prisma: prismaMock,
      now: () => NOW,
    });

    expect(ctx).toBeNull();
  });

  it("builds context for Fix Version release with dependency expansion", async () => {
    const releaseRow = {
      id: "rel-1",
      version: "2.0.0",
      projectKey: "EPM",
      jiraVersionId: "ver-100",
      tasks: [],
    };

    const issues = [
      {
        jiraKey: "EPM-10",
        projectKey: "EPM",
        summary: "Direct task",
        description: "desc",
        priority: "High",
        status: "Done",
        statusCategory: "done",
        type: "Story",
        lastSyncedAt: NOW,
        fixVersionIds: ["ver-100"],
        deletedAt: null,
      },
    ];

    const branchRows = [
      {
        repo: "repo-web",
        branch: "feature/EPM-10",
        prState: "MERGED",
        prDestinationBranch: "main",
        merged: true,
        checkedAt: NOW,
      },
      {
        repo: "repo-web",
        branch: "feature/OTHER-99",
        prState: "OPEN",
        prDestinationBranch: "main",
        merged: false,
        checkedAt: NOW,
      },
    ];

    const expandDependenciesMock = vi.fn().mockResolvedValue({
      issues: [
        {
          key: "EPM-20",
          relation: "dependency",
          rootKey: "EPM-10",
          depth: 1,
          issue: {
            projectKey: "EPM",
            summary: "Dep task",
            description: "",
            priority: "Medium",
            status: "Done",
            statusCategory: "done",
            type: "Task",
            lastSyncedAt: NOW,
            fixVersionIds: ["ver-100"],
          },
        },
      ],
      cycles: [],
      truncated: false,
      missingKeys: [],
    });

    const prismaMock = {
      release: {
        findUnique: vi.fn().mockResolvedValue(releaseRow),
      },
      issueCache: {
        findMany: vi.fn().mockResolvedValue(issues),
      },
      branchInfo: {
        findMany: vi.fn().mockResolvedValue(branchRows),
      },
      releaseApproval: {
        findMany: vi.fn().mockResolvedValue([{ type: "qa" }]),
      },
      ciBuildStatus: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const sentryClientMock = {
      listUnresolvedIssues: vi.fn().mockResolvedValue([
        {
          id: 123,
          shortId: "SENTRY-1",
          title: "Null pointer error",
          level: "error",
          status: "unresolved",
          permalinkUrl: "https://sentry.io/issue/1",
        },
      ]),
    };

    const ctx = await buildReleaseContext("rel-1", "2.0.0", {
      prisma: prismaMock,
      sentryClient: sentryClientMock,
      expandDependenciesFn: expandDependenciesMock,
      now: () => NOW,
      envConfig: {
        ciGateEnabled: false,
        hasSentryConfig: () => true,
        releaseRequiredApprovals: ["qa"],
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.releaseId).toBe("rel-1");
    expect(ctx!.version).toBe("2.0.0");
    expect(ctx!.projectKey).toBe("EPM");

    // Tasks include both direct and expanded dependency
    expect(ctx!.tasks).toHaveLength(2);
    expect(ctx!.tasks[0].jiraKey).toBe("EPM-10");
    expect(ctx!.tasks[0].inclusion).toBe("direct");
    expect(ctx!.tasks[1].jiraKey).toBe("EPM-20");
    expect(ctx!.tasks[1].inclusion).toBe("dependency");

    // Scoped branches only select EPM-10, ignoring OTHER-99
    expect(ctx!.branchInfos).toHaveLength(1);
    expect(ctx!.branchInfos[0].branch).toBe("feature/EPM-10");

    // Approvals
    expect(ctx!.requiredApprovals).toEqual(["qa"]);
    expect(ctx!.approvalsPresent).toEqual([{ type: "qa", present: true }]);

    // Sentry
    expect(ctx!.sentryIssues).toHaveLength(1);
    expect(ctx!.sentryIssues![0].shortId).toBe("SENTRY-1");
    expect(ctx!.sentryCheckedAt).toEqual(NOW);

    // Dependency graph metadata
    expect(ctx!.dependencyGraph).toEqual({
      cycles: [],
      truncated: false,
      missingKeys: [],
    });
  });

  it("handles Sentry fetch error gracefully without failing context build (fail-safe null)", async () => {
    const releaseRow = {
      id: "rel-2",
      version: "1.0.0",
      projectKey: "PROJ",
      jiraVersionId: null,
      tasks: [
        {
          jiraKey: "PROJ-1",
          issue: {
            projectKey: "PROJ",
            summary: "Snapshot issue",
            description: "",
            priority: "Low",
            status: "Done",
            statusCategory: "done",
            type: "Story",
            lastSyncedAt: NOW,
          },
        },
      ],
    };

    const prismaMock = {
      release: { findUnique: vi.fn().mockResolvedValue(releaseRow) },
      issueCache: { findMany: vi.fn() },
      branchInfo: { findMany: vi.fn().mockResolvedValue([]) },
      releaseApproval: { findMany: vi.fn().mockResolvedValue([]) },
      ciBuildStatus: { findMany: vi.fn().mockResolvedValue([]) },
    };

    const sentryClientMock = {
      listUnresolvedIssues: vi.fn().mockRejectedValue(new Error("Network timeout")),
    };

    const ctx = await buildReleaseContext("rel-2", "1.0.0", {
      prisma: prismaMock,
      sentryClient: sentryClientMock,
      now: () => NOW,
      envConfig: {
        hasSentryConfig: () => true,
        releaseRequiredApprovals: [],
      },
    });

    expect(ctx).not.toBeNull();
    // Fail-safe: sentryIssues is null, not throwing error
    expect(ctx!.sentryIssues).toBeNull();
    expect(ctx!.sentryCheckedAt).toBeNull();
    // Tasks derived from snapshot without calling issueCache
    expect(prismaMock.issueCache.findMany).not.toHaveBeenCalled();
    expect(ctx!.tasks).toHaveLength(1);
    expect(ctx!.tasks[0].jiraKey).toBe("PROJ-1");
  });

  it("loads CI builds when ciGateEnabled is true", async () => {
    const releaseRow = {
      id: "rel-3",
      version: "1.0.0",
      projectKey: "PROJ",
      jiraVersionId: null,
      tasks: [],
    };

    const branchRows = [
      {
        repo: "repo-backend",
        branch: "main",
        prState: "MERGED",
        prDestinationBranch: null,
        merged: true,
        checkedAt: NOW,
      },
    ];

    const ciRows = [
      {
        provider: "github-actions",
        commitSha: "abc123456",
        status: "success",
        testStatus: "passed",
        url: "https://ci/build/1",
        completedAt: NOW,
      },
    ];

    const prismaMock = {
      release: { findUnique: vi.fn().mockResolvedValue(releaseRow) },
      issueCache: { findMany: vi.fn() },
      branchInfo: { findMany: vi.fn().mockResolvedValue(branchRows) },
      releaseApproval: { findMany: vi.fn().mockResolvedValue([]) },
      ciBuildStatus: { findMany: vi.fn().mockResolvedValue(ciRows) },
    };

    const ctx = await buildReleaseContext("rel-3", "1.0.0", {
      prisma: prismaMock,
      now: () => NOW,
      envConfig: {
        ciGateEnabled: true,
        hasSentryConfig: () => false,
        releaseRequiredApprovals: [],
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx!.ciGateEnabled).toBe(true);
    expect(ctx!.ciBuilds).toHaveLength(1);
    expect(ctx!.ciBuilds![0].commitSha).toBe("abc123456");
    expect(ctx!.ciBuilds![0].status).toBe("success");
  });
});
