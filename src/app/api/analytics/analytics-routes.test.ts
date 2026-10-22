import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  getBurndownData: vi.fn(),
  getCFDData: vi.fn(),
  getReleaseComparisons: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/reports/agile-analytics", () => ({
  getBurndownData: mocks.getBurndownData,
  getCFDData: mocks.getCFDData,
  getReleaseComparisons: mocks.getReleaseComparisons,
}));

import { GET as getBurndown } from "./burndown/route";
import { GET as getCFD } from "./cfd/route";
import { GET as getReleases } from "./releases/route";

describe("agile analytics API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("burndown returns 401 if unauthenticated", async () => {
    mocks.session.mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost/api/analytics/burndown?projectKey=DEMO");
    const res = await getBurndown(req);
    expect(res.status).toBe(401);
  });

  it("burndown calls service with query params", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.getBurndownData.mockResolvedValueOnce({ release: null, points: [] });

    const req = new NextRequest("http://localhost/api/analytics/burndown?projectKey=DEMO&releaseId=rel-1");
    const res = await getBurndown(req);
    expect(res.status).toBe(200);
    expect(mocks.getBurndownData).toHaveBeenCalledWith("DEMO", "rel-1");
  });

  it("cfd parses days parameter", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.getCFDData.mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/analytics/cfd?projectKey=DEMO&days=14");
    const res = await getCFD(req);
    expect(res.status).toBe(200);
    expect(mocks.getCFDData).toHaveBeenCalledWith("DEMO", 14);
  });

  it("releases returns comparisons", async () => {
    mocks.session.mockResolvedValueOnce({ user: { id: "u1" } });
    mocks.getReleaseComparisons.mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/analytics/releases?projectKey=DEMO");
    const res = await getReleases(req);
    expect(res.status).toBe(200);
    expect(mocks.getReleaseComparisons).toHaveBeenCalledWith("DEMO");
  });
});
