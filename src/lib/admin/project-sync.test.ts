import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFindMany: vi.fn(),
  projectFindUnique: vi.fn(),
  projectUpdate: vi.fn(),
  projectUpdateMany: vi.fn(),
  cursorFindMany: vi.fn(),
  issueGroupBy: vi.fn(),
  audit: vi.fn(),
  enqueueJiraProjectSync: vi.fn(),
  enqueueJiraDispatch: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    jiraProject: {
      findMany: mocks.projectFindMany,
      findUnique: mocks.projectFindUnique,
      update: mocks.projectUpdate,
      updateMany: mocks.projectUpdateMany,
    },
    integrationCursor: { findMany: mocks.cursorFindMany },
    issueCache: { groupBy: mocks.issueGroupBy },
  },
}));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/queue/boss", () => ({
  enqueueJiraProjectSync: mocks.enqueueJiraProjectSync,
  enqueueJiraDispatch: mocks.enqueueJiraDispatch,
}));

import {
  deriveSyncState,
  listAdminProjectSync,
  sanitizeSyncError,
  toggleAllProjectSync,
  toggleProjectSync,
} from "./project-sync";

const actor = { id: "admin-1", email: "admin@example.com" };

describe("admin project sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueJiraProjectSync.mockResolvedValue("job-1");
    mocks.enqueueJiraDispatch.mockResolvedValue("job-d");
  });

  describe("deriveSyncState", () => {
    const base = { lastStartedAt: null, lastSuccessAt: null, lastErrorAt: null, activeRunToken: null, activeRunExpiresAt: null };

    it("reports disabled before anything else", () => {
      expect(deriveSyncState(false, { ...base, activeRunToken: "t", activeRunExpiresAt: new Date(Date.now() + 60_000) })).toBe("disabled");
    });
    it("reports running while the lease is live", () => {
      expect(deriveSyncState(true, { ...base, activeRunToken: "t", activeRunExpiresAt: new Date(2_000) }, 1_000)).toBe("running");
    });
    it("reports failed when the last error is newer than the last success", () => {
      expect(deriveSyncState(true, { ...base, lastSuccessAt: new Date(1_000), lastErrorAt: new Date(2_000) })).toBe("failed");
    });
    it("reports ok and never", () => {
      expect(deriveSyncState(true, { ...base, lastSuccessAt: new Date(1_000) })).toBe("ok");
      expect(deriveSyncState(true, null)).toBe("never");
    });
  });

  it("masks credentials in sync errors", () => {
    expect(sanitizeSyncError("401 token=abc123 rejected")).toBe("401 token=[REDACTED] rejected");
    expect(sanitizeSyncError(null)).toBeNull();
  });

  it("joins catalog, cursor and issue counts", async () => {
    mocks.projectFindMany.mockResolvedValue([
      { key: "EPM", name: "Enterprise", source: "bootstrap", syncEnabled: true, bootstrapState: "ready" },
      { key: "MR", name: "", source: "user_added", syncEnabled: false, bootstrapState: "ready" },
    ]);
    mocks.cursorFindMany.mockResolvedValue([
      {
        scope: "EPM",
        lastStartedAt: new Date("2026-10-13T01:00:00Z"),
        lastSuccessAt: new Date("2026-10-13T01:01:00Z"),
        lastErrorAt: null,
        lastError: null,
        activeRunToken: null,
        activeRunExpiresAt: null,
      },
    ]);
    mocks.issueGroupBy.mockResolvedValue([{ projectKey: "EPM", _count: { _all: 12 } }]);

    const rows = await listAdminProjectSync();

    expect(rows).toEqual([
      expect.objectContaining({ key: "EPM", state: "ok", issueCount: 12, lastSuccessAt: "2026-10-13T01:01:00.000Z" }),
      expect.objectContaining({ key: "MR", name: "MR", state: "disabled", issueCount: 0, lastSuccessAt: null }),
    ]);
  });

  it("disables a project, audits it and queues nothing", async () => {
    mocks.projectFindUnique.mockResolvedValue({ key: "EPM", syncEnabled: true });
    mocks.projectUpdate.mockResolvedValue({ key: "EPM", syncEnabled: false });

    const res = await toggleProjectSync("epm", false, actor);

    expect(res).toEqual({ key: "EPM", syncEnabled: false, syncJobId: null });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: "project.sync_disable",
      target: "EPM",
      actorId: "admin-1",
      before: { syncEnabled: true },
      after: { syncEnabled: false },
    }));
    expect(mocks.enqueueJiraProjectSync).not.toHaveBeenCalled();
  });

  it("re-enabling queues an incremental catch-up sync", async () => {
    mocks.projectFindUnique.mockResolvedValue({ key: "EPM", syncEnabled: false });
    mocks.projectUpdate.mockResolvedValue({ key: "EPM", syncEnabled: true });

    const res = await toggleProjectSync("EPM", true, actor);

    expect(res?.syncJobId).toBe("job-1");
    expect(mocks.enqueueJiraProjectSync).toHaveBeenCalledWith({ projectKey: "EPM", source: "admin", requestedBy: "admin-1" });
  });

  it("does not audit or queue when the value is unchanged", async () => {
    mocks.projectFindUnique.mockResolvedValue({ key: "EPM", syncEnabled: true });
    mocks.projectUpdate.mockResolvedValue({ key: "EPM", syncEnabled: true });

    await toggleProjectSync("EPM", true, actor);

    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.enqueueJiraProjectSync).not.toHaveBeenCalled();
  });

  it("returns null for an unknown project", async () => {
    mocks.projectFindUnique.mockResolvedValue(null);
    await expect(toggleProjectSync("NOPE", false, actor)).resolves.toBeNull();
  });

  it("disables every enabled project in one audited change", async () => {
    mocks.projectFindMany.mockResolvedValue([{ key: "EPM" }, { key: "MR" }]);

    const res = await toggleAllProjectSync(false, actor);

    expect(res.changed).toEqual(["EPM", "MR"]);
    expect(mocks.projectUpdateMany).toHaveBeenCalledWith({ where: { key: { in: ["EPM", "MR"] } }, data: { syncEnabled: false } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "project.sync_disable_all" }));
    expect(mocks.enqueueJiraDispatch).not.toHaveBeenCalled();
  });

  it("enabling all dispatches one sync round", async () => {
    mocks.projectFindMany.mockResolvedValue([{ key: "EPM" }]);
    await toggleAllProjectSync(true, actor);
    expect(mocks.enqueueJiraDispatch).toHaveBeenCalledWith({ source: "admin", requestedBy: "admin-1" });
  });

  it("is a no-op when nothing needs to change", async () => {
    mocks.projectFindMany.mockResolvedValue([]);
    await expect(toggleAllProjectSync(true, actor)).resolves.toEqual({ changed: [] });
    expect(mocks.projectUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
