import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateBulkCreateExcelTemplate } from "@/lib/bulk/excel-template";
import { type BulkCreateProjectMetadata } from "@/lib/bulk/create-types";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  userJiraAuth: vi.fn(),
  fetchBulkCreateMetadata: vi.fn(),
  loggerError: vi.fn(),
  parseBulkCreateExcel: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.user },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
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
vi.mock("@/lib/bulk/excel-parser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bulk/excel-parser")>();
  return {
    ...actual,
    parseBulkCreateExcel: (...args: unknown[]) => mocks.parseBulkCreateExcel(...args),
  };
});

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

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.user.mockResolvedValue({ jiraTokenEnc: "enc" });
    mocks.userJiraAuth.mockReturnValue({ user: "alice", token: "tok" });
    mocks.fetchBulkCreateMetadata.mockResolvedValue(mockMetadata);
    const actualParser = await vi.importActual<typeof import("@/lib/bulk/excel-parser")>("@/lib/bulk/excel-parser");
    mocks.parseBulkCreateExcel.mockImplementation(actualParser.parseBulkCreateExcel);
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

  it("does not leak raw parser crash message and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_EXCELJS_ZIP_CORRUPTION_STACK_LEAK";
    mocks.parseBulkCreateExcel.mockRejectedValueOnce(new Error(sentinel));

    const file = new File([new Uint8Array([1, 2, 3])], "test.xlsx", {
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
    expect(res.status).toBe(422);
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
