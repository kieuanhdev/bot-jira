import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userJiraAuth: vi.fn(),
  fetchBulkCreateMetadata: vi.fn(),
  searchAssignableUsers: vi.fn(),
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
    searchAssignableUsers: mocks.searchAssignableUsers,
  }),
  JiraRequestError: class extends Error {
    constructor(msg: string, public status = 400, public retryable = false) {
      super(msg);
    }
  },
}));
vi.mock("@/lib/bulk/create-ops", () => ({
  fetchBulkCreateMetadata: mocks.fetchBulkCreateMetadata,
}));

import { GET } from "./route";

describe("GET /api/bulk/create/excel-template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok", authMode: "Bearer" });
    mocks.fetchBulkCreateMetadata.mockResolvedValue({
      project: { key: "EPM", name: "Engineering Project" },
      canCreate: true,
      issueTypes: [{ id: "10001", name: "Task", subtask: false }],
      fieldsByIssueType: {},
      priorityOptions: [{ id: "3", name: "Major" }],
      versionOptions: [],
      pointsFieldId: null,
      supportsTimeTracking: true,
      supportsDueDate: true,
      hasSubtaskTypes: false,
      defaultIssueTypeId: "10001",
      defaultSubtaskTypeId: null,
      allowsUnassigned: true,
      fieldCapabilities: {
        priority: { available: true },
        fixVersions: { available: false },
        points: { available: false },
      },
      fetchedAt: new Date().toISOString(),
      fingerprint: "sha256:epm-fingerprint",
    });
    mocks.searchAssignableUsers.mockResolvedValue([
      { name: "alice", displayName: "Alice Doe", active: true },
    ]);
  });

  it("returns 401 when unauthenticated", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/bulk/create/excel-template?project=EPM"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when project query param is missing", async () => {
    const res = await GET(new Request("http://localhost/api/bulk/create/excel-template"));
    expect(res.status).toBe(400);
  });

  it("returns 428 when user has not configured Jira token", async () => {
    mocks.userJiraAuth.mockReturnValue(null);
    const res = await GET(new Request("http://localhost/api/bulk/create/excel-template?project=EPM"));
    expect(res.status).toBe(428);
  });

  it("returns 403 when user does not have permission to create issues", async () => {
    mocks.fetchBulkCreateMetadata.mockResolvedValue({
      project: { key: "EPM", name: "Engineering Project" },
      canCreate: false,
      permissionReason: "Không có quyền tạo task trong dự án EPM.",
      issueTypes: [],
      fieldsByIssueType: {},
      priorityOptions: [],
      versionOptions: [],
      pointsFieldId: null,
      supportsTimeTracking: false,
      supportsDueDate: false,
      hasSubtaskTypes: false,
      defaultIssueTypeId: null,
      defaultSubtaskTypeId: null,
      allowsUnassigned: false,
      fieldCapabilities: {
        priority: { available: false },
        fixVersions: { available: false },
        points: { available: false },
      },
      fetchedAt: new Date().toISOString(),
      fingerprint: "sha256:none",
    });

    const res = await GET(new Request("http://localhost/api/bulk/create/excel-template?project=EPM"));
    expect(res.status).toBe(403);
  });

  it("returns 200 with Excel content-type and attachment header on success", async () => {
    const res = await GET(new Request("http://localhost/api/bulk/create/excel-template?project=EPM"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("Content-Disposition")).toContain("bulk-create-EPM-");
    expect(res.headers.get("Content-Disposition")).toContain(".xlsx");

    const arrayBuf = await res.arrayBuffer();
    expect(arrayBuf.byteLength).toBeGreaterThan(0);
  });
});
