import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  prismaMock: {
    chatMessageConfirmation: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
  findTransitionMock: vi.fn(),
  transitionMock: vi.fn(),
  updateIssueMock: vi.fn(),
  refreshMock: vi.fn(async () => null),
}));

vi.mock("@/lib/prisma", () => ({ prisma: h.prismaMock }));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    findTransition: h.findTransitionMock,
    transition: h.transitionMock,
    updateIssue: h.updateIssueMock,
  }),
}));
vi.mock("@/lib/issues/cache", () => ({ refreshJiraIssueCache: h.refreshMock }));

import {
  isConfirmationExpired,
  buildAssignPreview,
  buildMovePreview,
  createConfirmation,
  findPendingConfirmation,
  handleConfirm,
} from "./confirmation";
import type { ExecContext } from "./types";

const baseCtx: ExecContext = {
  userId: "user-1",
  jiraAuth: { user: "alice", token: "tok", authMode: "Bearer" },
  jiraUsername: "alice",
  role: "member",
  provider: "discord",
  externalAuthorId: "ext-1",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmation — isConfirmationExpired", () => {
  it("detects expired timestamps", () => {
    const past = new Date(Date.now() - 5000);
    const future = new Date(Date.now() + 5000);
    expect(isConfirmationExpired(past)).toBe(true);
    expect(isConfirmationExpired(future)).toBe(false);
  });

  it("considers exact equal timestamp expired", () => {
    const now = new Date();
    expect(isConfirmationExpired(now, now)).toBe(true);
  });
});

describe("confirmation — preview builders", () => {
  it("builds assign preview with confirmationId", () => {
    const preview = buildAssignPreview(["KEY-1", "KEY-2"], "alice", "conf-123");
    expect(preview.status).toBe("preview");
    expect(preview.confirmationId).toBe("conf-123");
    expect(preview.text).toContain("Confirm? Assign 2 tasks");
    expect(preview.blocks[0]).toEqual({ kind: "text", text: "Assign 2 tasks to alice?" });
  });

  it("builds move preview with confirmationId", () => {
    const preview = buildMovePreview(["KEY-1", "KEY-2"], "Done", "conf-456");
    expect(preview.status).toBe("preview");
    expect(preview.confirmationId).toBe("conf-456");
    expect(preview.text).toContain("Confirm? Move 2 tasks to Done");
    expect(preview.blocks[0]).toEqual({ kind: "text", text: 'Move 2 tasks to "Done"?' });
  });
});

describe("confirmation — createConfirmation & findPendingConfirmation", () => {
  it("creates a confirmation row with 10-minute default TTL", async () => {
    h.prismaMock.chatMessageConfirmation.create.mockResolvedValue({ id: "conf-new" });
    const id = await createConfirmation(baseCtx, "move", { keys: ["KEY-1"], status: "Done" });
    expect(id).toBe("conf-new");
    expect(h.prismaMock.chatMessageConfirmation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "discord",
        externalAuthorId: "ext-1",
        userId: "user-1",
        kind: "move",
        payload: { keys: ["KEY-1"], status: "Done" },
      }),
    });
  });

  it("finds latest non-expired pending confirmation", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({ id: "conf-pending" });
    const pending = await findPendingConfirmation(baseCtx);
    expect(pending).toEqual({ id: "conf-pending" });
    expect(h.prismaMock.chatMessageConfirmation.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        provider: "discord",
        externalAuthorId: "ext-1",
        userId: "user-1",
        status: "pending",
        expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
      }),
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("confirmation — handleConfirm", () => {
  it("returns info when no pending confirmation exists", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue(null);
    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("info");
    expect(result.text).toBe("No pending action to confirm.");
    expect(h.prismaMock.chatMessageConfirmation.update).not.toHaveBeenCalled();
  });

  it("does not apply expired confirmation when findFirst returns null due to expiry", async () => {
    // Database query with `expiresAt: { gt: now }` naturally filters out expired rows
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue(null);
    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("info");
    expect(h.transitionMock).not.toHaveBeenCalled();
    expect(h.updateIssueMock).not.toHaveBeenCalled();
    expect(h.prismaMock.chatMessageConfirmation.update).not.toHaveBeenCalled();
  });

  it("applies pending move confirmation across all keys", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({
      id: "conf-1",
      kind: "move",
      payload: { keys: ["KEY-1", "KEY-2"], status: "In Progress" },
    });
    h.findTransitionMock.mockResolvedValue({ id: "t-1", to: { name: "In Progress" } });
    h.transitionMock.mockResolvedValue(undefined);

    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("confirmed");
    expect(result.text).toBe("Applied 2 actions.");
    expect(h.findTransitionMock).toHaveBeenCalledTimes(2);
    expect(h.transitionMock).toHaveBeenCalledTimes(2);
    expect(h.refreshMock).toHaveBeenCalledTimes(2);
    expect(h.prismaMock.chatMessageConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-1" },
      data: { status: "confirmed" },
    });
  });

  it("handles missing transition gracefully in pending move confirmation", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({
      id: "conf-2",
      kind: "move",
      payload: { keys: ["KEY-1"], status: "Closed" },
    });
    h.findTransitionMock.mockResolvedValue(null);

    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("confirmed");
    expect(h.transitionMock).not.toHaveBeenCalled();
    expect(result.blocks[1]).toEqual({ kind: "text", text: '• KEY-1: no transition to "Closed"' });
  });

  it("applies pending assign confirmation across all keys", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({
      id: "conf-3",
      kind: "assign",
      payload: { keys: ["KEY-10", "KEY-20"], who: "bob" },
    });
    h.updateIssueMock.mockResolvedValue({});

    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("confirmed");
    expect(result.text).toBe("Applied 2 actions.");
    expect(h.updateIssueMock).toHaveBeenCalledWith("KEY-10", { assignee: "bob" });
    expect(h.updateIssueMock).toHaveBeenCalledWith("KEY-20", { assignee: "bob" });
    expect(h.refreshMock).toHaveBeenCalledTimes(2);
    expect(h.prismaMock.chatMessageConfirmation.update).toHaveBeenCalledWith({
      where: { id: "conf-3" },
      data: { status: "confirmed" },
    });
  });

  it("handles error during assign mutation in confirmation", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({
      id: "conf-4",
      kind: "assign",
      payload: { keys: ["KEY-99"], who: "bob" },
    });
    h.updateIssueMock.mockRejectedValue(new Error("Jira assignee not found"));

    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("confirmed");
    expect(result.blocks[1]).toEqual({ kind: "text", text: "• KEY-99: Jira assignee not found" });
    expect(h.prismaMock.chatMessageConfirmation.update).toHaveBeenCalled();
  });

  it("returns error for unknown confirmation action kind", async () => {
    h.prismaMock.chatMessageConfirmation.findFirst.mockResolvedValue({
      id: "conf-5",
      kind: "unknown_action",
      payload: {},
    });

    const result = await handleConfirm(baseCtx);
    expect(result.status).toBe("error");
    expect(result.text).toBe("Unknown action.");
    expect(h.prismaMock.chatMessageConfirmation.update).not.toHaveBeenCalled();
  });
});
