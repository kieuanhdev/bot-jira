import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  prismaMock: {
    release: { findFirst: vi.fn() },
    issueCache: { findMany: vi.fn() },
    watch: { upsert: vi.fn(), deleteMany: vi.fn() },
    chatIdentity: { findFirst: vi.fn() },
    chatMessageConfirmation: { create: vi.fn().mockResolvedValue({ id: "conf-new" }) },
  },
  getIssueMock: vi.fn(),
  updateIssueMock: vi.fn(),
  findTransitionMock: vi.fn(),
  transitionMock: vi.fn(),
  refreshMock: vi.fn(async () => null),
  runGatesMock: vi.fn(async () => [{ gate: "task_status", state: "passed" }]),
  buildReleaseContextMock: vi.fn(async () => null as unknown as object),
  unlinkMock: vi.fn(async () => true),
}));

vi.mock("@/lib/prisma", () => ({ prisma: h.prismaMock }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    getIssue: h.getIssueMock,
    updateIssue: h.updateIssueMock,
    findTransition: h.findTransitionMock,
    transition: h.transitionMock,
  }),
  JiraRequestError: class JiraRequestError extends Error {
    status: number | null;
    constructor(message: string, status: number | null) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: h.refreshMock }));
vi.mock("@/lib/env", () => ({
  env: { staleDays: 7, publicBaseUrl: "http://localhost:3000", jiraBaseUrl: "http://jira" },
}));
vi.mock("@/lib/releases/release-context", () => ({ buildReleaseContext: h.buildReleaseContextMock }));
vi.mock("@/lib/releases/gates", () => ({
  runGates: h.runGatesMock,
  aggregateGates: (gates: { state: string }[]) =>
    gates.some((g) => g.state === "failed") ? "blocked" : "ready",
  collectBlockers: () => [{ jiraKey: "PROJ-99", reason: "Blocked by dependency" }],
}));
vi.mock("@/lib/ai", () => ({
  aiProvider: { releaseCheck: async () => ({ ready: true, blockers: [] }) },
}));
vi.mock("./identity", () => ({
  unlinkChatIdentity: h.unlinkMock,
}));

import {
  handleTaskCommand,
  handleMoveCommand,
  handleAssignCommand,
  handleWatchCommand,
  handleUnwatchCommand,
  handleStaleCommand,
  handleReleaseCommand,
  handleLinkCommand,
  handleUnlinkCommand,
  handleHelpCommand,
  dispatchChatCommand,
} from "./handlers";
import type { ExecContext } from "./types";
import { JiraRequestError } from "@/lib/jira/client";

const baseCtx: ExecContext = {
  userId: "user-1",
  jiraAuth: { user: "alice", token: "tok", authMode: "Bearer" },
  jiraUsername: "alice",
  role: "member",
  provider: "discord",
  externalAuthorId: "ext-1",
  channelId: "chan-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlers — task", () => {
  it("fetches and renders task details", async () => {
    h.getIssueMock.mockResolvedValue({
      fields: {
        summary: "Fix login button",
        status: { name: "In Progress" },
        assignee: { displayName: "Alice Wonderland" },
        priority: { name: "High" },
        issuetype: { name: "Bug" },
      },
    });

    const res = await handleTaskCommand({ kind: "task", keys: ["PROJ-1"] }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toContain("PROJ-1");
    expect(res.text).toContain("Status: In Progress");
    expect(res.text).toContain("Assignee: Alice Wonderland");
  });

  it("handles Jira error gracefully for a single key", async () => {
    h.getIssueMock.mockRejectedValue(new Error("Issue not found"));

    const res = await handleTaskCommand({ kind: "task", keys: ["PROJ-404"] }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toContain("PROJ-404: Issue not found");
  });
});

describe("handlers — move", () => {
  it("transitions a single task successfully", async () => {
    h.findTransitionMock.mockResolvedValue({ id: "t-done", to: { name: "Done" } });
    h.transitionMock.mockResolvedValue(undefined);

    const res = await handleMoveCommand({ kind: "move", keys: ["PROJ-1"], status: "Done" }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toContain("PROJ-1 → Done");
    expect(h.refreshMock).toHaveBeenCalledWith(expect.anything(), "PROJ-1");
  });

  it("reports no transition when transition is unavailable", async () => {
    h.findTransitionMock.mockResolvedValue(null);

    const res = await handleMoveCommand({ kind: "move", keys: ["PROJ-1"], status: "Done" }, baseCtx);
    expect(res.status).toBe("error");
    expect(res.text).toContain('No transition to "Done" from current state');
  });

  it("surfaces 403 as blocked status for move", async () => {
    h.findTransitionMock.mockRejectedValue(new JiraRequestError("Forbidden", 403, false));

    const res = await handleMoveCommand({ kind: "move", keys: ["PROJ-1"], status: "Done" }, baseCtx);
    expect(res.status).toBe("blocked");
    expect(res.text).toContain("No Jira permission to transition");
  });

  it("creates preview confirmation for multi-key move", async () => {
    const res = await handleMoveCommand(
      { kind: "move", keys: ["PROJ-1", "PROJ-2"], status: "Done" },
      baseCtx
    );
    expect(res.status).toBe("preview");
    expect(res.confirmationId).toBe("conf-new");
    expect(h.transitionMock).not.toHaveBeenCalled();
  });
});

describe("handlers — assign", () => {
  it("assigns a single task to current user successfully", async () => {
    h.updateIssueMock.mockResolvedValue({});

    const res = await handleAssignCommand({ kind: "assign", keys: ["PROJ-1"], who: "me" }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toContain("PROJ-1 assigned to alice");
    expect(h.updateIssueMock).toHaveBeenCalledWith("PROJ-1", { assignee: "alice" });
    expect(h.refreshMock).toHaveBeenCalledWith(expect.anything(), "PROJ-1");
  });

  it("surfaces 403 as blocked status for assign", async () => {
    h.updateIssueMock.mockRejectedValue(new JiraRequestError("Forbidden", 403, false));

    const res = await handleAssignCommand({ kind: "assign", keys: ["PROJ-1"], who: "me" }, baseCtx);
    expect(res.status).toBe("blocked");
    expect(res.text).toContain("No Jira permission to assign");
  });

  it("surfaces generic error for assign failure", async () => {
    h.updateIssueMock.mockRejectedValue(new Error("Database connection dropped"));

    const res = await handleAssignCommand({ kind: "assign", keys: ["PROJ-1"], who: "me" }, baseCtx);
    expect(res.status).toBe("error");
    expect(res.text).toContain("Database connection dropped");
  });

  it("creates preview confirmation for multi-key assign", async () => {
    const res = await handleAssignCommand(
      { kind: "assign", keys: ["PROJ-1", "PROJ-2"], who: "me" },
      baseCtx
    );
    expect(res.status).toBe("preview");
    expect(res.confirmationId).toBe("conf-new");
    expect(h.updateIssueMock).not.toHaveBeenCalled();
  });
});

describe("handlers — watch and unwatch", () => {
  it("watch upserts watch records", async () => {
    h.prismaMock.watch.upsert.mockResolvedValue({ id: "w1" });
    const res = await handleWatchCommand({ kind: "watch", keys: ["PROJ-1", "PROJ-2"] }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toBe("Now watching: PROJ-1, PROJ-2");
    expect(h.prismaMock.watch.upsert).toHaveBeenCalledTimes(2);
  });

  it("unwatch deletes watch records", async () => {
    h.prismaMock.watch.deleteMany.mockResolvedValue({ count: 1 });
    const res = await handleUnwatchCommand({ kind: "unwatch", keys: ["PROJ-1"] }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toBe("Stopped watching: PROJ-1");
    expect(h.prismaMock.watch.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", jiraKey: "PROJ-1" },
    });
  });
});

describe("handlers — stale", () => {
  it("returns info when no stale tasks found", async () => {
    h.prismaMock.issueCache.findMany.mockResolvedValue([]);
    const res = await handleStaleCommand({ kind: "stale", scope: null }, baseCtx);
    expect(res.status).toBe("info");
    expect(res.text).toBe("No stale tasks found.");
  });

  it("renders list of stale tasks with duration", async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
    h.prismaMock.issueCache.findMany.mockResolvedValue([
      {
        jiraKey: "STALE-1",
        summary: "Old bug",
        status: "In Progress",
        assigneeJira: "alice",
        updatedAt: eightDaysAgo,
      },
    ]);

    const res = await handleStaleCommand({ kind: "stale", scope: null }, baseCtx);
    expect(res.status).toBe("ok");
    expect(res.text).toContain("STALE-1: Old bug — In Progress (8d)");
  });
});

describe("handlers — release", () => {
  it("blocks non-admin/release_manager user", async () => {
    const res = await handleReleaseCommand(
      { kind: "release", version: "2.0.0", action: "check" },
      { ...baseCtx, role: "developer" }
    );
    expect(res.status).toBe("blocked");
    expect(res.text).toContain("Only release_manager or admin");
    expect(h.prismaMock.release.findFirst).not.toHaveBeenCalled();
  });

  it("returns error when release is not found", async () => {
    h.prismaMock.release.findFirst.mockResolvedValue(null);
    const res = await handleReleaseCommand(
      { kind: "release", version: "2.0.0", action: "check" },
      { ...baseCtx, role: "admin" }
    );
    expect(res.status).toBe("error");
    expect(res.text).toBe('No release found for version "2.0.0".');
  });

  it("returns error when release context cannot be built", async () => {
    h.prismaMock.release.findFirst.mockResolvedValue({ id: "rel-1", version: "2.0.0" });
    h.buildReleaseContextMock.mockResolvedValue(null as unknown as object);
    const res = await handleReleaseCommand(
      { kind: "release", version: "2.0.0", action: "check" },
      { ...baseCtx, role: "admin" }
    );
    expect(res.status).toBe("error");
    expect(res.text).toBe("Could not build release context.");
  });

  it("executes release gate check for admin and formats blockers", async () => {
    h.prismaMock.release.findFirst.mockResolvedValue({ id: "rel-1", version: "2.0.0" });
    h.buildReleaseContextMock.mockResolvedValue({ releaseId: "rel-1", version: "2.0.0" });
    h.runGatesMock.mockResolvedValue([{ gate: "task_status", state: "passed" }]);

    const res = await handleReleaseCommand(
      { kind: "release", version: "2.0.0", action: "check" },
      { ...baseCtx, role: "admin" }
    );
    expect(res.status).toBe("ok");
    expect(res.text).toContain("Release 2.0.0: ready");
    expect(res.text).toContain("Blockers: PROJ-99: Blocked by dependency");
  });
});

describe("handlers — link and unlink", () => {
  it("link returns info if already linked", async () => {
    h.prismaMock.chatIdentity.findFirst.mockResolvedValue({ id: "ci-1" });
    const res = await handleLinkCommand({ kind: "link" }, baseCtx);
    expect(res.status).toBe("info");
    expect(res.text).toContain("already linked");
  });

  it("link provides settings instructions if not linked", async () => {
    h.prismaMock.chatIdentity.findFirst.mockResolvedValue(null);
    const res = await handleLinkCommand({ kind: "link" }, baseCtx);
    expect(res.status).toBe("info");
    expect(res.text).toContain("Link your chat account from the web app");
  });

  it("unlink invokes unlinkChatIdentity and returns unlinked status", async () => {
    const res = await handleUnlinkCommand({ kind: "unlink" }, baseCtx);
    expect(res.status).toBe("unlinked");
    expect(h.unlinkMock).toHaveBeenCalledWith("user-1", "discord");
  });
});

describe("handlers — help", () => {
  it("renders help text with available commands", () => {
    const res = handleHelpCommand();
    expect(res.status).toBe("help");
    expect(res.text).toContain("/task, /move, /assign, /watch, /unwatch, /release ... check, /stale, /confirm");
  });
});

describe("handlers — dispatchChatCommand", () => {
  it("dispatches help command", async () => {
    const res = await dispatchChatCommand({ kind: "help" }, baseCtx);
    expect(res.status).toBe("help");
  });

  it("returns unrecognized for unsupported command shape", async () => {
    const res = await dispatchChatCommand({ kind: "unsupported" as unknown as "help" }, baseCtx);
    expect(res.status).toBe("unrecognized");
    expect(res.text).toContain('Unsupported command "unsupported".');
  });

  it("throws error if confirm or unknown is passed to dispatch", async () => {
    await expect(dispatchChatCommand({ kind: "confirm" }, baseCtx)).rejects.toThrow();
    await expect(dispatchChatCommand({ kind: "unknown", raw: "" }, baseCtx)).rejects.toThrow();
  });
});
