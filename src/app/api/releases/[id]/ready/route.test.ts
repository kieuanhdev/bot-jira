import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

const { prismaMock, releaseCheckMock, notifyAllMock, sentryListMock, sessionMock } =
  vi.hoisted(() => {
  const releaseCheckMock = vi.fn();
  const notifyAllMock = vi.fn(() => Promise.resolve());
  const sentryListMock = vi.fn();
  const sessionMock = vi.fn();
    const prismaMock = {
      release: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      issueCache: {
        findMany: vi.fn(),
      },
      branchInfo: {
        findMany: vi.fn(),
      },
      releaseApproval: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      releaseGateOverride: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      releaseCheck: {
        create: vi.fn(),
      },
      issueLinkCache: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    return {
      prismaMock,
      releaseCheckMock,
      notifyAllMock,
      sentryListMock,
      sessionMock,
    };
  });

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/session", () => ({ getSession: sessionMock }));
// The ready route enforces release.check (REL-01); a release_manager session
// passes, a member would be 403.
vi.mock("@/lib/permissions", () => ({
  can: (session: { user?: { role?: string } }) =>
    ["release_manager", "admin"].includes(session?.user?.role ?? ""),
}));
vi.mock("@/lib/notify", () => ({ notifyAll: notifyAllMock }));
vi.mock("@/lib/sentry/client", () => ({
  sentry: { listUnresolvedIssues: sentryListMock },
}));
vi.mock("@/lib/ai", () => ({ aiProvider: { releaseCheck: releaseCheckMock } }));
// hasSentryConfig() must be false so the route skips the live Sentry fetch.
// releaseRequiredApprovals is empty so the manual_approval gate is vacuous and
// the existing gate-state assertions still hold.
vi.mock("@/lib/env", () => ({
  env: { releaseDataFreshnessMinutes: 5, jiraFreshnessMinutes: 5 },
  releaseDoneCategories: ["done"],
  releaseBlockingPriorities: ["Blocker", "Critical"],
  releaseRequiredApprovals: [],
  hasSentryConfig: () => false,
}));

const fresh = () => new Date();

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    jiraKey: "EPM-1",
    summary: "s",
    description: "d",
    priority: "Medium",
    status: "Done",
    statusCategory: "done",
    type: "Story",
    lastSyncedAt: fresh(),
    fixVersionIds: ["v1"],
    deletedAt: null,
    ...overrides,
  };
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function callResponse() {
  const res = await POST(new Request("http://x/api/releases/r/ready", { method: "POST" }), ctx("r"));
  return res.json();
}

// The route calls release.findUnique twice: once in POST (select id/version)
// and once in buildContext (full include with tasks + jiraVersionId). Return a
// single full row for both calls so both branches read the same identity.
function mockRelease(row: Record<string, unknown>) {
  prismaMock.release.findUnique.mockResolvedValue(row);
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.mockResolvedValue({ user: { email: "a@b.c", id: "u1", role: "release_manager" } });
  // Default: no branches, AI returns no blockers.
  prismaMock.branchInfo.findMany.mockResolvedValue([]);
  releaseCheckMock.mockResolvedValue({ ready: true, blockers: [] });
  prismaMock.release.update.mockResolvedValue({});
  prismaMock.releaseCheck.create.mockResolvedValue({ id: "chk1", gates: [] });
});

describe("ready route — Fix Version task source (M3-01 + M3-03 engine)", () => {
  it("queries IssueCache by fixVersionIds when jiraVersionId is set", async () => {
    mockRelease({
      id: "r",
      version: "1.0",
      projectKey: "EPM",
      jiraVersionId: "v1",
      tasks: [],
    });
    prismaMock.issueCache.findMany.mockResolvedValue([
      issueRow({ jiraKey: "EPM-1", fixVersionIds: ["v1"] }),
      issueRow({ jiraKey: "EPM-2", fixVersionIds: ["v1", "v2"] }),
      issueRow({ jiraKey: "EPM-3", fixVersionIds: ["v2"] }), // not in this version
      issueRow({ jiraKey: "EPM-4", fixVersionIds: ["v1"], deletedAt: fresh() }), // deleted
    ]);

    const body = await callResponse();

    // The gate engine runs against tasks derived from the IssueCache query.
    expect(prismaMock.issueCache.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          fixVersionIds: { has: "v1" },
          deletedAt: null,
        }),
      })
    );
    // The two done live issues carrying v1 pass the task gate (EPM-3 is a
    // different version and EPM-4 is soft-deleted, so neither is evaluated).
    const taskGate = body.gates.find((g: { gate: string }) => g.gate === "task_status");
    expect(taskGate?.state).toBe("passed");
    // With no Bitbucket PR data the PR gate is `unknown`, so the release is
    // `unknown` (fail-safe), not `ready` — never blocked by task state.
    expect(body.status).toBe("unknown");
    expect(body.ready).toBe(false);
  });

  it("falls back to the ReleaseTask snapshot when there is no jiraVersionId", async () => {
    const snapshotIssue = {
      summary: "s",
      description: "d",
      priority: "Medium",
      status: "Done",
      statusCategory: "done",
      type: "Story",
      lastSyncedAt: fresh(),
    };
    mockRelease({
      id: "r",
      version: "1.0",
      projectKey: "",
      jiraVersionId: null,
      tasks: [
        { jiraKey: "EPM-9", issue: snapshotIssue },
        { jiraKey: "EPM-10", issue: snapshotIssue },
      ],
    });

    const body = await callResponse();

    // No IssueCache query should be issued for a legacy label release — tasks
    // come from the ReleaseTask snapshot instead.
    expect(prismaMock.issueCache.findMany).not.toHaveBeenCalled();
    // Both snapshot tasks are done, so the task gates pass. With no Bitbucket
    // PR data the PR gate is `unknown`, so the release is `unknown` (fail-safe),
    // never `ready` — and never `blocked` by task state.
    expect(body.status).toBe("unknown");
    expect(body.ready).toBe(false);
    const taskGate = body.gates.find((g: { gate: string }) => g.gate === "task_status");
    expect(taskGate?.state).toBe("passed");
  });

  it("an open Blocker bug in the Fix Version blocks the release", async () => {
    mockRelease({
      id: "r",
      version: "1.0",
      projectKey: "EPM",
      jiraVersionId: "v1",
      tasks: [],
    });
    prismaMock.issueCache.findMany.mockResolvedValue([
      issueRow({
        jiraKey: "EPM-1",
        fixVersionIds: ["v1"],
        statusCategory: "indeterminate",
        status: "In Progress",
        priority: "Blocker",
        type: "Bug",
      }),
    ]);

    const body = await callResponse();

    expect(body.status).toBe("blocked");
    expect(body.ready).toBe(false);
    const criticalGate = body.gates.find((g: { gate: string }) => g.gate === "critical_bugs");
    expect(criticalGate?.state).toBe("failed");
  });

  it("persists a ReleaseCheck with per-gate results and notifies on blocked", async () => {
    mockRelease({
      id: "r",
      version: "1.0",
      projectKey: "EPM",
      jiraVersionId: "v1",
      tasks: [],
    });
    prismaMock.issueCache.findMany.mockResolvedValue([
      issueRow({
        jiraKey: "EPM-1",
        fixVersionIds: ["v1"],
        statusCategory: "indeterminate",
        status: "In Progress",
        priority: "Blocker",
        type: "Bug",
      }),
    ]);

    await callResponse();

    expect(prismaMock.releaseCheck.create).toHaveBeenCalledTimes(1);
    const arg = prismaMock.releaseCheck.create.mock.calls[0][0];
    expect(arg.data.releaseId).toBe("r");
    expect(arg.data.gates.create.length).toBeGreaterThan(0);
    expect(notifyAllMock).toHaveBeenCalledTimes(1);
  });

  it("scopes branches to the release by issue key and blocks when a branch has no PR", async () => {
    mockRelease({
      id: "r",
      version: "1.0",
      projectKey: "EPM",
      jiraVersionId: "v1",
      tasks: [],
    });
    prismaMock.issueCache.findMany.mockResolvedValue([
      issueRow({ jiraKey: "EPM-1", fixVersionIds: ["v1"] }),
    ]);
    // One branch maps to EPM-1 (no PR yet → blocks); another belongs to a
    // different release and must be ignored by the scoping.
    prismaMock.branchInfo.findMany.mockResolvedValue([
      {
        repo: "team/app",
        branch: "feature/EPM-1",
        prState: null,
        prDestinationBranch: null,
        merged: false,
        checkedAt: fresh(),
      },
      {
        repo: "team/app",
        branch: "feature/OTHER-999",
        prState: "CLOSED",
        prDestinationBranch: "main",
        merged: false,
        checkedAt: fresh(),
      },
    ]);

    const body = await callResponse();

    const branchesGate = body.gates.find((g: { gate: string }) => g.gate === "branches");
    // The unrelated OTHER-999 branch must not be counted.
    expect(branchesGate?.summary).not.toContain("OTHER-999");
    expect(branchesGate?.state).toBe("failed");
    expect(body.status).toBe("blocked");
    expect(body.ready).toBe(false);
  });

  it("pull_requests is unknown (not ready) when a mapped PR is still open", async () => {
    mockRelease({
      id: "r",
      version: "1.0",
      projectKey: "EPM",
      jiraVersionId: "v1",
      tasks: [],
    });
    prismaMock.issueCache.findMany.mockResolvedValue([
      issueRow({ jiraKey: "EPM-1", fixVersionIds: ["v1"] }),
    ]);
    prismaMock.branchInfo.findMany.mockResolvedValue([
      {
        repo: "team/app",
        branch: "feature/EPM-1",
        prState: "OPEN",
        prDestinationBranch: "main",
        merged: false,
        checkedAt: fresh(),
      },
    ]);

    const body = await callResponse();

    const prGate = body.gates.find((g: { gate: string }) => g.gate === "pull_requests");
    expect(prGate?.state).toBe("unknown");
    expect(body.ready).toBe(false);
  });
});
