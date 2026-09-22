import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  prismaMock: {
    release: { findFirst: vi.fn(), findUnique: vi.fn() },
    issueCache: { findMany: vi.fn() },
    watch: { upsert: vi.fn(), deleteMany: vi.fn() },
    chatMessage: { create: vi.fn().mockResolvedValue({ id: "msg-1" }) },
    chatMessageConfirmation: {
      create: vi.fn().mockResolvedValue({ id: "conf-1" }),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    chatIdentity: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  getIssueMock: vi.fn(),
  updateIssueMock: vi.fn(),
  findTransitionMock: vi.fn(),
  transitionMock: vi.fn(),
  refreshMock: vi.fn(async () => null),
  runGatesMock: vi.fn(async (): Promise<Array<{ gate: string; state: string }>> =>
    [{ gate: "task_status", state: "passed" }]
  ),
  buildReleaseContextMock: vi.fn(async () => null as unknown as object),
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
    gates.some((g) => g.state === "failed") ? "blocked" : gates.some((g) => g.state === "unknown") ? "unknown" : "ready",
  collectBlockers: () => [],
}));
vi.mock("@/lib/ai", () => ({
  aiProvider: { releaseCheck: async () => ({ ready: true, blockers: [] }) },
}));
vi.mock("./identity", () => ({
  unlinkChatIdentity: async () => true,
}));

import { executeChatCommand, type ExecContext } from "./execute";
import { parseChatCommand } from "./commands";

const baseCtx: ExecContext = {
  userId: "user-1",
  jiraAuth: { user: "alice", token: "tok", authMode: "Bearer" },
  jiraUsername: "alice",
  role: "member",
  provider: "discord",
  externalAuthorId: "discord-user-1",
  externalMessageId: "msg-1",
  channelId: "chan-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("RBAC — release check", () => {
  it("blocks a member from running /release", async () => {
    const result = await executeChatCommand(parseChatCommand("/release 1.4.2 check"), "/release 1.4.2 check", baseCtx);
    expect(result.status).toBe("blocked");
    expect(h.runGatesMock).not.toHaveBeenCalled();
  });

  it("allows an admin to run /release (gates invoked)", async () => {
    h.buildReleaseContextMock.mockResolvedValue({ releaseId: "r1", version: "1.4.2", tasks: [] });
    h.runGatesMock.mockResolvedValue([{ gate: "task_status", state: "passed" }]);
    h.prismaMock.release.findFirst.mockResolvedValue({ id: "r1", version: "1.4.2" });
    const result = await executeChatCommand(
      parseChatCommand("/release 1.4.2 check"),
      "/release 1.4.2 check",
      { ...baseCtx, role: "admin" }
    );
    expect(h.runGatesMock).toHaveBeenCalled();
    expect(["ok", "blocked"]).toContain(result.status);
  });
});

describe("Jira permission — move", () => {
  it("surfaces a 403 as blocked, not ok", async () => {
    const { JiraRequestError } = await import("@/lib/jira/client");
    h.findTransitionMock.mockRejectedValue(new JiraRequestError("forbidden", 403, false));
    const result = await executeChatCommand(parseChatCommand('/move PROJ-1 "Done"'), '/move PROJ-1 "Done"', baseCtx);
    expect(result.status).toBe("blocked");
  });

  it("transitions a single key on success", async () => {
    h.findTransitionMock.mockResolvedValue({ id: "t1", to: { name: "Done" } });
    h.transitionMock.mockResolvedValue(undefined);
    const result = await executeChatCommand(parseChatCommand('/move PROJ-1 "Done"'), '/move PROJ-1 "Done"', baseCtx);
    expect(h.transitionMock).toHaveBeenCalledWith("PROJ-1", "t1");
    expect(result.status).toBe("ok");
  });

  it("requires confirmation for multi-key move (no Jira call yet)", async () => {
    const result = await executeChatCommand(parseChatCommand('/move PROJ-1, PROJ-2 "Done"'), '/move PROJ-1, PROJ-2 "Done"', baseCtx);
    expect(result.status).toBe("preview");
    expect(h.transitionMock).not.toHaveBeenCalled();
    expect(result.confirmationId).toBe("conf-1");
    expect(h.prismaMock.chatMessageConfirmation.create).toHaveBeenCalled();
  });
});

describe("watch", () => {
  it("upserts a watch row", async () => {
    h.prismaMock.watch.upsert.mockResolvedValue({ id: "w1" });
    const result = await executeChatCommand(parseChatCommand("/watch PROJ-1"), "/watch PROJ-1", baseCtx);
    expect(result.status).toBe("ok");
    expect(h.prismaMock.watch.upsert).toHaveBeenCalled();
  });
});

describe("audit trail", () => {
  it("persists a ChatMessage with a correlation id", async () => {
    h.prismaMock.watch.upsert.mockResolvedValue({ id: "w1" });
    await executeChatCommand(parseChatCommand("/watch PROJ-1"), "/watch PROJ-1", baseCtx);
    expect(h.prismaMock.chatMessage.create).toHaveBeenCalled();
    const arg = h.prismaMock.chatMessage.create.mock.calls[0][0];
    expect(arg.data.command).toBe("watch");
    expect(arg.data.correlationId).toMatch(/^cc_/);
    expect(arg.data.authorUserId).toBe("user-1");
  });
});

describe("confirm", () => {
  it("applies a pending move confirmation", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({
      id: "conf-1",
      kind: "move",
      payload: { keys: ["PROJ-1", "PROJ-2"], status: "Done" },
    });
    h.findTransitionMock.mockResolvedValue({ id: "t1", to: { name: "Done" } });
    h.transitionMock.mockResolvedValue(undefined);
    const result = await executeChatCommand(parseChatCommand("/confirm"), "/confirm", baseCtx);
    expect(result.status).toBe("confirmed");
    expect(h.transitionMock).toHaveBeenCalledTimes(2);
    expect(h.prismaMock.chatMessageConfirmation.update).toHaveBeenCalled();
  });

  it("no-ops when nothing is pending", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue(null);
    const result = await executeChatCommand(parseChatCommand("/confirm"), "/confirm", baseCtx);
    expect(result.status).toBe("info");
    expect(h.transitionMock).not.toHaveBeenCalled();
  });
});
