import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    integrationCursor: {
      upsert: mocks.upsert,
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    jiraSyncExpireSeconds: 300,
    jiraHeartbeatSeconds: 60,
  },
}));

import {
  computeLeaseTtlSeconds,
  claimJiraSyncLease,
  assertJiraSyncLease,
  renewJiraSyncLease,
  releaseJiraSyncLease,
  SyncAlreadyRunningError,
  SyncLeaseLostError,
  JiraSyncAbortedError,
} from "./jira-sync-lease";

describe("jira-sync-lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeLeaseTtlSeconds", () => {
    it("returns jiraSyncExpireSeconds for incremental sync", () => {
      expect(computeLeaseTtlSeconds(false)).toBe(300);
    });

    it("returns max(jiraSyncExpireSeconds, 900) for full sync", () => {
      expect(computeLeaseTtlSeconds(true)).toBe(900);
    });
  });

  describe("claimJiraSyncLease", () => {
    it("successfully claims lease and returns the integration cursor", async () => {
      const now = new Date("2026-10-15T10:00:00.000Z");
      const expiresAt = new Date("2026-10-15T10:05:00.000Z");
      const cursorRecord = {
        id: "cur-1",
        integration: "jira",
        scope: "PROJ",
        activeRunToken: "token-1",
        activeRunExpiresAt: expiresAt,
      };

      mocks.upsert.mockResolvedValue({});
      mocks.updateMany.mockResolvedValue({ count: 1 });
      mocks.findUnique.mockResolvedValue(cursorRecord);

      const result = await claimJiraSyncLease("PROJ", "token-1", expiresAt, now);

      expect(result).toEqual(cursorRecord);
      expect(mocks.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { integration_scope: { integration: "jira", scope: "PROJ" } },
        })
      );
      expect(mocks.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            integration: "jira",
            scope: "PROJ",
            OR: [
              { activeRunToken: null },
              { activeRunExpiresAt: null },
              { activeRunExpiresAt: { lte: now } },
              { activeRunToken: "token-1" },
            ],
          }),
          data: expect.objectContaining({
            activeRunToken: "token-1",
            activeRunExpiresAt: expiresAt,
          }),
        })
      );
    });

    it("throws SyncAlreadyRunningError when 0 rows updated (active unexpired lease held by another)", async () => {
      mocks.upsert.mockResolvedValue({});
      mocks.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        claimJiraSyncLease("PROJ", "token-2", new Date(), new Date())
      ).rejects.toThrow(SyncAlreadyRunningError);
    });

    it("throws SyncAlreadyRunningError when cursor after update has different activeRunToken", async () => {
      mocks.upsert.mockResolvedValue({});
      mocks.updateMany.mockResolvedValue({ count: 1 });
      mocks.findUnique.mockResolvedValue({
        id: "cur-1",
        integration: "jira",
        scope: "PROJ",
        activeRunToken: "different-token",
      });

      await expect(
        claimJiraSyncLease("PROJ", "token-1", new Date(), new Date())
      ).rejects.toThrow(SyncAlreadyRunningError);
    });
  });

  describe("assertJiraSyncLease", () => {
    it("throws JiraSyncAbortedError if signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        assertJiraSyncLease("PROJ", "token-1", controller.signal)
      ).rejects.toThrow(JiraSyncAbortedError);
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it("throws SyncLeaseLostError if cursor is not found", async () => {
      mocks.findUnique.mockResolvedValue(null);

      await expect(assertJiraSyncLease("PROJ", "token-1")).rejects.toThrow(
        SyncLeaseLostError
      );
    });

    it("throws SyncLeaseLostError if activeRunToken does not match", async () => {
      mocks.findUnique.mockResolvedValue({ activeRunToken: "other-token" });

      await expect(assertJiraSyncLease("PROJ", "token-1")).rejects.toThrow(
        SyncLeaseLostError
      );
    });

    it("resolves cleanly when token matches and signal not aborted", async () => {
      mocks.findUnique.mockResolvedValue({ activeRunToken: "token-1" });

      await expect(
        assertJiraSyncLease("PROJ", "token-1", new AbortController().signal)
      ).resolves.toBeUndefined();
    });
  });

  describe("renewJiraSyncLease", () => {
    it("extends the lease when activeRunToken matches", async () => {
      mocks.updateMany.mockResolvedValue({ count: 1 });
      const newExpiresAt = new Date("2026-10-15T10:15:00.000Z");

      await expect(
        renewJiraSyncLease("PROJ", "token-1", newExpiresAt)
      ).resolves.toBeUndefined();

      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: {
          integration: "jira",
          scope: "PROJ",
          activeRunToken: "token-1",
        },
        data: {
          activeRunExpiresAt: newExpiresAt,
        },
      });
    });

    it("throws SyncLeaseLostError when 0 rows are updated", async () => {
      mocks.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        renewJiraSyncLease("PROJ", "token-lost", new Date())
      ).rejects.toThrow(SyncLeaseLostError);
    });
  });

  describe("releaseJiraSyncLease", () => {
    it("returns true when lease was owned and released", async () => {
      mocks.updateMany.mockResolvedValue({ count: 1 });

      const released = await releaseJiraSyncLease("PROJ", "token-1");
      expect(released).toBe(true);

      expect(mocks.updateMany).toHaveBeenCalledWith({
        where: {
          integration: "jira",
          scope: "PROJ",
          activeRunToken: "token-1",
        },
        data: {
          activeRunToken: null,
          activeRunStartedAt: null,
          activeRunExpiresAt: null,
        },
      });
    });

    it("returns false when lease was not owned by token", async () => {
      mocks.updateMany.mockResolvedValue({ count: 0 });

      const released = await releaseJiraSyncLease("PROJ", "token-other");
      expect(released).toBe(false);
    });
  });
});
