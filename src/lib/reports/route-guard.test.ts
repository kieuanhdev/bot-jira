import { describe, it, expect, vi, beforeEach } from "vitest";
import { guardProjectReport } from "./route-guard";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  can: vi.fn(),
  scope: vi.fn(),
  access: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: () => mocks.session() }));
vi.mock("@/lib/permissions", () => ({ can: (...args: unknown[]) => mocks.can(...args) }));
vi.mock("@/lib/reports/scope", () => ({
  resolveUserProjectScope: (...args: unknown[]) => mocks.scope(...args),
  assertProjectAccess: (...args: unknown[]) => mocks.access(...args),
}));

const params = (projectKey: string) => Promise.resolve({ projectKey });

describe("guardProjectReport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u-1", role: "member" } });
    mocks.can.mockReturnValue(true);
    mocks.scope.mockResolvedValue({});
    mocks.access.mockResolvedValue(true);
  });

  it("returns 401 without a session", async () => {
    mocks.session.mockResolvedValue(null);
    const res = (await guardProjectReport(params("EPM"))).response!;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 403 when the permission is missing and checks the requested permission", async () => {
    mocks.can.mockReturnValue(false);
    const res = (await guardProjectReport(params("EPM"), { permission: "report.export" })).response!;
    expect(res.status).toBe(403);
    expect(mocks.can).toHaveBeenCalledWith(expect.anything(), "report.export");
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("returns 400 when the project key is empty", async () => {
    const res = (await guardProjectReport(params(""))).response!;
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "project_key_required" });
  });

  it("returns 403 with the default message when the project is out of scope", async () => {
    mocks.access.mockResolvedValue(false);
    const res = (await guardProjectReport(params("EPM"))).response!;
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "forbidden",
      message: "Bạn không có quyền truy cập dự án 'EPM'.",
    });
  });

  it("uses a custom forbidden message when provided", async () => {
    mocks.access.mockResolvedValue(false);
    const res = (await guardProjectReport(params("EPM"), { forbiddenMessage: (k) => `no ${k}` })).response!;
    expect((await res.json()).message).toBe("no EPM");
  });

  it("returns the project key when everything passes", async () => {
    const result = await guardProjectReport(params("EPM"));
    expect(result).toEqual({ projectKey: "EPM" });
    expect(mocks.scope).toHaveBeenCalledWith("u-1", "member");
  });
});
