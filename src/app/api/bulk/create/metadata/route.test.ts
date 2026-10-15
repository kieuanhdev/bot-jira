import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userJiraAuth: vi.fn(),
  fetchBulkCreateMetadata: vi.fn(),
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
  jiraWith: () => ({}),
  JiraRequestError: class extends Error {
    constructor(msg: string, public status = 500) {
      super(msg);
    }
  },
}));
vi.mock("@/lib/bulk/create-ops", () => ({
  fetchBulkCreateMetadata: mocks.fetchBulkCreateMetadata,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

import { GET } from "./route";

describe("GET /api/bulk/create/metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ token: "tok-12345678" });
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/bulk/create/metadata?project=EPM"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when project query param is missing", async () => {
    const res = await GET(new Request("http://localhost/api/bulk/create/metadata"));
    expect(res.status).toBe(400);
  });

  it("returns metadata on success", async () => {
    mocks.fetchBulkCreateMetadata.mockResolvedValueOnce({
      project: { key: "EPM", name: "Engineering" },
      canCreate: true,
      issueTypes: [],
    });
    const res = await GET(new Request("http://localhost/api/bulk/create/metadata?project=EPM"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.project.key).toBe("EPM");
  });

  it("does not leak raw Jira upstream error on 500 and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_JIRA_INTERNAL_METADATA_CRASH_LEAK";
    const { JiraRequestError } = await import("@/lib/jira/client");
    mocks.fetchBulkCreateMetadata.mockRejectedValueOnce(new JiraRequestError(sentinel, 500, false));

    const res = await GET(new Request("http://localhost/api/bulk/create/metadata?project=EPM"));
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
