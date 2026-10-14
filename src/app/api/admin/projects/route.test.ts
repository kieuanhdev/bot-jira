import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  toggleAll: vi.fn(),
  toggleOne: vi.fn(),
  updateFeatures: vi.fn(),
  bulkUpdateFeatures: vi.fn(),
}));

vi.mock("@/lib/session", () => ({
  getSession: mocks.session,
  isAdmin: (s: { user?: { role?: string } } | null) => s?.user?.role === "admin",
}));
vi.mock("@/lib/admin/project-sync", () => ({
  listAdminProjectSync: mocks.list,
  toggleAllProjectSync: mocks.toggleAll,
  toggleProjectSync: mocks.toggleOne,
  updateProjectSyncFeatures: mocks.updateFeatures,
  bulkUpdateProjectSyncFeatures: mocks.bulkUpdateFeatures,
}));

import { GET, PATCH } from "./route";
import { PATCH as PATCH_ONE } from "./[key]/route";

const patch = (body: unknown) =>
  new Request("http://localhost/api/admin/projects", { method: "PATCH", body: JSON.stringify(body) });
const ctx = (key: string) => ({ params: Promise.resolve({ key }) });

describe("/api/admin/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", email: "a@x", role: "admin" } });
    mocks.list.mockResolvedValue([]);
  });

  it("rejects anonymous users", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PATCH(patch({ syncEnabled: false }))).status).toBe(401);
    expect((await PATCH_ONE(patch({ syncEnabled: false }), ctx("EPM"))).status).toBe(401);
  });

  it.each(["member", "lead", "release_manager"])("forbids non-admin role %s", async (role) => {
    mocks.session.mockResolvedValue({ user: { id: "u-1", role } });
    expect((await GET()).status).toBe(403);
    expect((await PATCH(patch({ syncEnabled: false }))).status).toBe(403);
    expect((await PATCH_ONE(patch({ syncEnabled: false }), ctx("EPM"))).status).toBe(403);
    expect(mocks.toggleAll).not.toHaveBeenCalled();
    expect(mocks.toggleOne).not.toHaveBeenCalled();
  });

  it("lists projects for an admin", async () => {
    mocks.list.mockResolvedValue([{ key: "EPM" }]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([{ key: "EPM" }]);
  });

  it("validates the body", async () => {
    expect((await PATCH(patch({ syncEnabled: "no" }))).status).toBe(400);
    expect((await PATCH_ONE(patch({}), ctx("EPM"))).status).toBe(400);
    expect((await PATCH_ONE(patch({ syncEnabled: true }), ctx("bad key!"))).status).toBe(400);
  });

  it("toggles all projects", async () => {
    mocks.toggleAll.mockResolvedValue({ changed: ["EPM"] });
    const res = await PATCH(patch({ syncEnabled: false }));
    expect(res.status).toBe(200);
    expect(mocks.toggleAll).toHaveBeenCalledWith(false, { id: "admin-1", email: "a@x" });
  });

  it("toggles one project and 404s an unknown key", async () => {
    mocks.toggleOne.mockResolvedValueOnce({ key: "EPM", syncEnabled: false, syncJobId: null });
    const ok = await PATCH_ONE(patch({ syncEnabled: false }), ctx("epm"));
    expect(ok.status).toBe(200);
    expect(mocks.toggleOne).toHaveBeenCalledWith("EPM", false, { id: "admin-1", email: "a@x" });

    mocks.toggleOne.mockResolvedValueOnce(null);
    expect((await PATCH_ONE(patch({ syncEnabled: false }), ctx("NOPE"))).status).toBe(404);
  });

  it("updates granular features on one project", async () => {
    mocks.updateFeatures.mockResolvedValueOnce({
      key: "EPM",
      syncEnabled: true,
      features: { comments: false },
      preset: "custom",
      backfillJobId: null,
    });
    const res = await PATCH_ONE(patch({ features: { comments: false } }), ctx("EPM"));
    expect(res.status).toBe(200);
    expect(mocks.updateFeatures).toHaveBeenCalledWith(
      "EPM",
      { comments: false },
      { id: "admin-1", email: "a@x" }
    );
  });

  it("updates preset on one project", async () => {
    mocks.updateFeatures.mockResolvedValueOnce({
      key: "EPM",
      syncEnabled: true,
      features: { comments: false, workflow: true },
      preset: "issues_only",
      backfillJobId: null,
    });
    const res = await PATCH_ONE(patch({ preset: "issues_only" }), ctx("EPM"));
    expect(res.status).toBe(200);
    expect(mocks.updateFeatures).toHaveBeenCalled();
  });

  it("rejects invalid features or preset", async () => {
    const badFeature = await PATCH_ONE(patch({ features: { invalidFeature: true } }), ctx("EPM"));
    expect(badFeature.status).toBe(400);

    const badPreset = await PATCH_ONE(patch({ preset: "invalid_preset" }), ctx("EPM"));
    expect(badPreset.status).toBe(400);
  });

  it("bulk updates features for multiple projects", async () => {
    mocks.bulkUpdateFeatures.mockResolvedValueOnce({ changed: ["EPM", "ABC"], backfillJobCount: 0 });
    const res = await PATCH(patch({ keys: ["EPM", "ABC"], preset: "issues_only" }));
    expect(res.status).toBe(200);
    expect(mocks.bulkUpdateFeatures).toHaveBeenCalled();
  });
});
