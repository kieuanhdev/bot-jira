import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  can: vi.fn(),
  captureProjectReportSnapshots: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/permissions", () => ({ can: mocks.can }));
vi.mock("@/lib/reports/snapshot-service", () => ({
  captureProjectReportSnapshots: mocks.captureProjectReportSnapshots,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

import { POST } from "./route";

describe("POST /api/reports/projects/snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "admin" } });
    mocks.can.mockReturnValue(true);
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const req = new NextRequest("http://localhost/api/reports/projects/snapshot", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks report.configure permission", async () => {
    mocks.can.mockReturnValue(false);
    const req = new NextRequest("http://localhost/api/reports/projects/snapshot", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("captures snapshots successfully and returns result", async () => {
    mocks.captureProjectReportSnapshots.mockResolvedValueOnce({
      captured: 3,
      skipped: 0,
    });
    const req = new NextRequest("http://localhost/api/reports/projects/snapshot", {
      method: "POST",
      body: JSON.stringify({ projectKey: "EPM" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.captured).toBe(3);
  });

  it("does not leak raw error or details on failure and logs it with logger (REF-010)", async () => {
    const sentinel = "UPSTREAM_POSTGRES_SNAPSHOT_PARTITION_CORRUPT_SECRET";
    mocks.captureProjectReportSnapshots.mockRejectedValueOnce(new Error(sentinel));

    const req = new NextRequest("http://localhost/api/reports/projects/snapshot", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Snapshot capture failed");
    expect(body.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain(sentinel);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(sentinel),
      })
    );
  });
});
