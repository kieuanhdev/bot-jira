import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkOperationFindUnique: vi.fn(),
  bulkOperationUpdateMany: vi.fn(),
  bulkOperationUpdate: vi.fn(),
  bulkCreateItemFindUnique: vi.fn(),
  bulkCreateItemFindMany: vi.fn(),
  bulkCreateItemUpdateMany: vi.fn(),
  bulkCreateItemUpdate: vi.fn(),
  bulkCreateItemGroupBy: vi.fn(),
  userFindUnique: vi.fn(),
  findIssueByBulkMarker: vi.fn(),
  createIssue: vi.fn(),
  refreshJiraIssueCache: vi.fn(),
  notifyUser: vi.fn(),
  audit: vi.fn(),
  getCreateMetadata: vi.fn(),
  getMyPermissions: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkOperation: {
      findUnique: mocks.bulkOperationFindUnique,
      updateMany: mocks.bulkOperationUpdateMany,
      update: mocks.bulkOperationUpdate,
    },
    bulkCreateItem: {
      findUnique: mocks.bulkCreateItemFindUnique,
      findMany: mocks.bulkCreateItemFindMany,
      updateMany: mocks.bulkCreateItemUpdateMany,
      update: mocks.bulkCreateItemUpdate,
      groupBy: mocks.bulkCreateItemGroupBy,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/user-creds", () => ({
  userJiraAuth: () => ({ user: "alice", token: "tok", authMode: "Bearer" }),
}));

vi.mock("@/lib/jira/client", () => ({
  jiraWith: () => ({
    findIssueByBulkMarker: mocks.findIssueByBulkMarker,
    createIssue: mocks.createIssue,
    getCreateMetadata: mocks.getCreateMetadata,
    getMyPermissions: mocks.getMyPermissions,
  }),
  JiraRequestError: class extends Error {
    constructor(msg: string, public status = 400, public retryable = false) {
      super(msg);
    }
  },
}));

vi.mock("@/lib/issues/cache", () => ({
  refreshJiraIssueCache: mocks.refreshJiraIssueCache,
}));

vi.mock("@/lib/notify", () => ({
  notifyUser: mocks.notifyUser,
}));

vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));

import { executeBulkCreateOperation } from "./create-ops";

describe("executeBulkCreateOperation worker execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("claims operation and processes pending items with marker reconciliation", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue({
      id: "op-1",
      requestedBy: "user-1",
      state: "queued",
      payload: { projectKey: "EPM" },
      total: 1,
      createItems: [],
    });
    mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });

    mocks.bulkCreateItemFindMany.mockResolvedValue([
      {
        id: "item-1",
        rowIndex: 0,
        clientRef: "row-1",
        status: "pending",
        requested: { summary: "Test task", issueTypeId: "10001" },
        attemptCount: 0,
      },
    ]);
    mocks.bulkCreateItemFindUnique.mockResolvedValue({
      id: "item-1",
      status: "running",
      clientRef: "row-1",
      requested: { summary: "Test task", issueTypeId: "10001" },
      attemptCount: 0,
    });
    mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 1 });

    // Simulate marker found on Jira (e.g. previous attempt had network timeout)
    mocks.findIssueByBulkMarker.mockResolvedValue({
      id: "999",
      key: "EPM-42",
      fields: {},
    });

    mocks.bulkCreateItemGroupBy.mockResolvedValue([
      { status: "succeeded", _count: { _all: 1 } },
    ]);

    await executeBulkCreateOperation("op-1");

    // Succeeded via reconciliation without calling createIssue!
    expect(mocks.createIssue).not.toHaveBeenCalled();
    expect(mocks.bulkCreateItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({
          status: "succeeded",
          jiraKey: "EPM-42",
        }),
      })
    );
    expect(mocks.bulkOperationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "op-1" },
        data: expect.objectContaining({
          state: "completed",
          succeeded: 1,
          failed: 0,
        }),
      })
    );
    expect(mocks.notifyUser).toHaveBeenCalledTimes(1);
  });

  it("creates issue when marker is not found on Jira", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue({
      id: "op-2",
      requestedBy: "user-1",
      state: "queued",
      payload: { projectKey: "EPM" },
      total: 1,
      createItems: [],
    });
    mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });

    mocks.bulkCreateItemFindMany
      .mockResolvedValueOnce([
        {
          id: "item-2",
          rowIndex: 0,
          clientRef: "row-2",
          status: "pending",
          requested: { summary: "Fresh task", issueTypeId: "10001" },
          attemptCount: 0,
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.bulkCreateItemFindUnique.mockResolvedValue({
      id: "item-2",
      status: "running",
      clientRef: "row-2",
      requested: { summary: "Fresh task", issueTypeId: "10001" },
      attemptCount: 0,
    });
    mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 1 });

    mocks.findIssueByBulkMarker.mockResolvedValue(null);
    mocks.createIssue.mockResolvedValue({ id: "1001", key: "EPM-100", self: "url" });
    mocks.bulkCreateItemGroupBy.mockResolvedValue([
      { status: "succeeded", _count: { _all: 1 } },
    ]);

    await executeBulkCreateOperation("op-2");

    expect(mocks.createIssue).toHaveBeenCalledTimes(1);
    expect(mocks.bulkCreateItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-2" },
        data: expect.objectContaining({
          status: "succeeded",
          jiraKey: "EPM-100",
        }),
      })
    );
  });

  it("passes components to Jira createIssue when present", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue({
      id: "op-3",
      requestedBy: "user-1",
      state: "queued",
      payload: { projectKey: "EPM" },
      total: 1,
      createItems: [],
    });
    mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });

    mocks.bulkCreateItemFindMany
      .mockResolvedValueOnce([
        {
          id: "item-3",
          rowIndex: 0,
          clientRef: "row-3",
          status: "pending",
          requested: { summary: "Task with comp", issueTypeId: "10001", componentIds: ["comp-1"] },
          attemptCount: 0,
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.bulkCreateItemFindUnique.mockResolvedValue({
      id: "item-3",
      status: "running",
      clientRef: "row-3",
      requested: { summary: "Task with comp", issueTypeId: "10001", componentIds: ["comp-1"] },
      attemptCount: 0,
    });
    mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 1 });

    mocks.findIssueByBulkMarker.mockResolvedValue(null);
    mocks.createIssue.mockResolvedValue({ id: "1002", key: "EPM-101", self: "url" });
    mocks.bulkCreateItemGroupBy.mockResolvedValue([
      { status: "succeeded", _count: { _all: 1 } },
    ]);

    await executeBulkCreateOperation("op-3");

    expect(mocks.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "EPM",
        fields: expect.objectContaining({
          components: [{ id: "comp-1" }],
        }),
      })
    );
  });

  it("normalizes raw string custom fields to Jira REST objects before POST Jira (e.g. MHRM operation retry)", async () => {
    mocks.bulkOperationFindUnique.mockResolvedValue({
      id: "op-mhrm",
      requestedBy: "user-1",
      state: "queued",
      payload: { projectKey: "MHRM" },
      total: 1,
      createItems: [],
    });
    mocks.bulkOperationUpdateMany.mockResolvedValue({ count: 1 });
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" });

    // Mock Jira metadata returning schemas for versions, Approver, Assignee Tester
    mocks.getCreateMetadata.mockResolvedValue({
      projects: [
        {
          id: "20000",
          key: "MHRM",
          name: "MHRM Project",
          issuetypes: [
            {
              id: "10001",
              name: "Task",
              subtask: false,
              fields: {
                versions: {
                  name: "Affects Version/s",
                  required: false,
                  schema: { type: "array", items: "version", system: "versions" },
                  allowedValues: [{ id: "11200", name: "1.0.0" }],
                },
                customfield_10300: {
                  name: "Approver",
                  required: false,
                  schema: {
                    type: "user",
                    custom: "com.atlassian.jira.plugin.system.customfieldtypes:userpicker",
                  },
                },
                customfield_10501: {
                  name: "Assignee Tester",
                  required: false,
                  schema: {
                    type: "user",
                    custom: "com.atlassian.jira.plugin.system.customfieldtypes:userpicker",
                  },
                },
              },
            },
          ],
        },
      ],
    });
    mocks.getMyPermissions.mockResolvedValue({
      permissions: { CREATE_ISSUES: { havePermission: true } },
    });

    // Item in DB has raw strings (like operation cmus3kdfg003w1ppemodc6o1n)
    mocks.bulkCreateItemFindMany
      .mockResolvedValueOnce([
        {
          id: "item-mhrm-1",
          rowIndex: 0,
          clientRef: "row-1",
          status: "pending",
          requested: {
            summary: "MHRM Task",
            issueTypeId: "10001",
            customFields: {
              versions: "11200",
              customfield_10300: "vunt",
              customfield_10501: "hunglm",
            },
          },
          attemptCount: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    mocks.bulkCreateItemFindUnique.mockResolvedValue({
      id: "item-mhrm-1",
      status: "running",
      clientRef: "row-1",
      requested: {
        summary: "MHRM Task",
        issueTypeId: "10001",
        customFields: {
          versions: "11200",
          customfield_10300: "vunt",
          customfield_10501: "hunglm",
        },
      },
      attemptCount: 1,
    });
    mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 1 });

    mocks.findIssueByBulkMarker.mockResolvedValue(null);
    mocks.createIssue.mockResolvedValue({ id: "2001", key: "MHRM-50", self: "url" });
    mocks.bulkCreateItemGroupBy.mockResolvedValue([
      { status: "succeeded", _count: { _all: 1 } },
    ]);

    await executeBulkCreateOperation("op-mhrm");

    expect(mocks.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        projectKey: "MHRM",
        fields: expect.objectContaining({
          versions: [{ id: "11200" }],
          customfield_10300: { name: "vunt" },
          customfield_10501: { name: "hunglm" },
        }),
      })
    );
  });
});
