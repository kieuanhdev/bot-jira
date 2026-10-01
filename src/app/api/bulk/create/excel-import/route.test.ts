import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateBulkCreateExcelTemplate } from "@/lib/bulk/excel-template";
import { type BulkCreateProjectMetadata } from "@/lib/bulk/create-types";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userJiraAuth: vi.fn(),
  fetchBulkCreateMetadata: vi.fn(),
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
}));
vi.mock("@/lib/bulk/create-ops", () => ({
  fetchBulkCreateMetadata: mocks.fetchBulkCreateMetadata,
}));

import { POST } from "./route";

describe("POST /api/bulk/create/excel-import", () => {
  const mockMetadata: BulkCreateProjectMetadata = {
    project: { key: "EPM", name: "Engineering Project" },
    canCreate: true,
    issueTypes: [
      { id: "10001", name: "Task", subtask: false },
      { id: "10002", name: "Sub-task", subtask: true },
    ],
    fieldsByIssueType: {},
    priorityOptions: [{ id: "3", name: "Major" }],
    versionOptions: [],
    pointsFieldId: null,
    supportsTimeTracking: true,
    supportsDueDate: true,
    hasSubtaskTypes: true,
    defaultIssueTypeId: "10001",
    defaultSubtaskTypeId: "10002",
    allowsUnassigned: true,
    fieldCapabilities: {
      priority: { available: true },
      fixVersions: { available: false },
      points: { available: false },
    },
    fetchedAt: new Date().toISOString(),
    fingerprint: "sha256:current-fp",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok" });
    mocks.fetchBulkCreateMetadata.mockResolvedValue(mockMetadata);
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/bulk/create/excel-import", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when not multipart/form-data or missing file", async () => {
    const res = await POST(
      new Request("http://localhost/api/bulk/create/excel-import", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it("parses valid uploaded Excel file successfully", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata,
      assignees: [{ username: "alice", displayName: "Alice Doe" }],
    });

    const file = new File([new Uint8Array(templateBuffer)], "bulk-create-EPM.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", "EPM");

    const req = new Request("http://localhost/api/bulk/create/excel-import", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stats).toBeDefined();
    expect(body.manifest?.projectKey).toBe("EPM");
    expect(body.errors).toEqual([]);
  });

  it("rejects file if project key does not match", async () => {
    const templateBuffer = await generateBulkCreateExcelTemplate({
      metadata: mockMetadata, // EPM
    });

    const file = new File([new Uint8Array(templateBuffer)], "bulk-create-EPM.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("project", "OTHER"); // Mismatched project

    const req = new Request("http://localhost/api/bulk/create/excel-import", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("OTHER");
  });
});
