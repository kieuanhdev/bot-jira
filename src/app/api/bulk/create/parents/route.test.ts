import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userJiraAuth: vi.fn(),
  searchParentIssues: vi.fn(),
  recordSearchMetrics: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: mocks.userJiraAuth,
}));
vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    searchParentIssues: mocks.searchParentIssues,
  }),
  JiraRequestError: class extends Error {
    constructor(msg: string, public status = 500) {
      super(msg);
    }
  },
}));
vi.mock("@/lib/bulk/create-metrics", () => ({
  recordSearchMetrics: mocks.recordSearchMetrics,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

import { GET } from "./route";

describe("GET /api/bulk/create/parents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ token: "tok-12345678" });
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/bulk/create/parents?project=EPM"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when project query param is missing", async () => {
    const res = await GET(new Request("http://localhost/api/bulk/create/parents"));
    expect(res.status).toBe(400);
  });

  it("returns parents on success", async () => {
    mocks.searchParentIssues.mockResolvedValueOnce([
      { key: "EPM-10", summary: "Epic 1", issueTypeName: "Epic", status: "Open" },
    ]);
    const res = await GET(new Request("http://localhost/api/bulk/create/parents?project=EPM&q=Epic"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.issues).toHaveLength(1);
    expect(data.issues[0].key).toBe("EPM-10");
  });

  it("does not leak raw Jira upstream error on 500 and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_JIRA_INTERNAL_PARENT_SEARCH_CRASH_LEAK";
    const { JiraRequestError } = await import("@/lib/jira/client");
    mocks.searchParentIssues.mockRejectedValueOnce(new JiraRequestError(sentinel, 500, false));

    const res = await GET(new Request("http://localhost/api/bulk/create/parents?project=EPM&q=fail"));
    expect(res.status).toBe(500);
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
