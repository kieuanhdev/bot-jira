import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getVersions: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "tok" }),
}));
vi.mock("@/lib/jira/client", () => ({
  getSystemJiraAuth: vi.fn(),
  jiraWith: () => ({
    getVersions: mocks.getVersions,
  }),
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

import { GET } from "./route";

describe("GET /api/issues/[key]/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/issues/EPM-1/versions"), {
      params: Promise.resolve({ key: "EPM-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns versions on success", async () => {
    mocks.getVersions.mockResolvedValueOnce([{ id: "1", name: "v1.0" }]);
    const res = await GET(new Request("http://localhost/api/issues/EPM-1/versions"), {
      params: Promise.resolve({ key: "EPM-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items).toEqual([{ id: "1", name: "v1.0" }]);
  });

  it("does not leak raw upstream error message and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_JIRA_INTERNAL_TOKEN_LEAK_SECRET";
    mocks.getVersions.mockRejectedValueOnce(new Error(sentinel));

    const res = await GET(new Request("http://localhost/api/issues/EPM-1/versions"), {
      params: Promise.resolve({ key: "EPM-1" }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain(sentinel);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(sentinel),
      })
    );
  });
});
