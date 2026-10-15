import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  getTransitions: vi.fn(),
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
    getTransitions: mocks.getTransitions,
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

describe("GET /api/issues/[key]/transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "u-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/issues/EPM-1/transitions"), {
      params: Promise.resolve({ key: "EPM-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns transitions on success", async () => {
    mocks.getTransitions.mockResolvedValueOnce([{ id: "11", name: "In Progress" }]);
    const res = await GET(new Request("http://localhost/api/issues/EPM-1/transitions"), {
      params: Promise.resolve({ key: "EPM-1" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transitions).toEqual([{ id: "11", name: "In Progress" }]);
  });

  it("does not leak raw upstream error message and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_JIRA_INTERNAL_TRANSITION_CRASH_LEAK";
    mocks.getTransitions.mockRejectedValueOnce(new Error(sentinel));

    const res = await GET(new Request("http://localhost/api/issues/EPM-1/transitions"), {
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
