import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bulkCreateItemFindUnique: vi.fn(),
  bulkCreateItemUpdateMany: vi.fn(),
  bulkCreateItemUpdate: vi.fn(),
  findIssueByBulkMarker: vi.fn(),
  createIssue: vi.fn(),
  removeIssueLabel: vi.fn(),
  refreshJiraIssueCache: vi.fn(),
  audit: vi.fn(),
  resolveItemParentKey: vi.fn(),
  fetchBulkCreateMetadata: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bulkCreateItem: {
      findUnique: mocks.bulkCreateItemFindUnique,
      updateMany: mocks.bulkCreateItemUpdateMany,
      update: mocks.bulkCreateItemUpdate,
    },
  },
}));

vi.mock("@/lib/issues/cache", () => ({
  refreshJiraIssueCache: mocks.refreshJiraIssueCache,
}));

vi.mock("@/lib/audit", () => ({
  audit: mocks.audit,
}));

vi.mock("./create-parent-resolver", () => ({
  resolveItemParentKey: mocks.resolveItemParentKey,
}));

vi.mock("./create-metadata", () => ({
  fetchBulkCreateMetadata: mocks.fetchBulkCreateMetadata,
}));

import { JiraRequestError, jiraWith, type JiraAuth } from "@/lib/jira/client";
import { type BulkCreateProjectMetadata } from "./create-types";
import {
  buildJiraCreateFields,
  executeCreateWithReconciliation,
  processCreateItem,
} from "./create-item-executor";

type MockJiraClient = ReturnType<typeof jiraWith>;

describe("create-item-executor", () => {
  const dummyAuth: JiraAuth = { user: "tester", token: "tok-123", authMode: "Bearer" };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildJiraCreateFields", () => {
    it("builds standard fields: dueDate, fixVersions, components, points", () => {
      const fields = buildJiraCreateFields({
        reqData: {
          dueDate: "2026-12-31",
          fixVersionIds: ["v-1", "v-2"],
          componentIds: ["c-1"],
          points: 5,
        },
        pointsFieldId: "customfield_10004",
      });

      expect(fields.duedate).toBe("2026-12-31");
      expect(fields.fixVersions).toEqual([{ id: "v-1" }, [{ id: "v-2" }][0]]);
      expect(fields.components).toEqual([{ id: "c-1" }]);
      expect(fields["customfield_10004"]).toBe(5);
    });

    it("includes timetracking only when screen fields allow or are undefined", () => {
      // 1. Undefined metadata -> allowed
      const fieldsAllowed = buildJiraCreateFields({
        reqData: { originalEstimate: "2d" },
      });
      expect(fieldsAllowed.timetracking).toEqual({ originalEstimate: "2d" });

      // 2. Metadata includes timetracking -> allowed
      const metaWithTime: BulkCreateProjectMetadata = {
        project: { key: "PROJ", name: "Project" },
        canCreate: true,
        issueTypes: [],
        fieldsByIssueType: {
          "10001": [{ id: "timetracking", name: "Time Tracking", required: false, schemaType: "string" }],
        },
        priorityOptions: [],
        versionOptions: [],
        pointsFieldId: null,
        supportsTimeTracking: true,
        supportsDueDate: true,
        hasSubtaskTypes: false,
        defaultIssueTypeId: null,
        defaultSubtaskTypeId: null,
        allowsUnassigned: true,
        fieldCapabilities: {
          priority: { available: true },
          fixVersions: { available: true },
          points: { available: false },
        },
        fetchedAt: new Date().toISOString(),
        fingerprint: "fp1",
      };
      const fieldsScreen = buildJiraCreateFields({
        reqData: { issueTypeId: "10001", originalEstimate: "3d" },
        meta: metaWithTime,
      });
      expect(fieldsScreen.timetracking).toEqual({ originalEstimate: "3d" });

      // 3. Metadata excludes timetracking -> omitted
      const metaWithoutTime: BulkCreateProjectMetadata = {
        project: { key: "PROJ", name: "Project" },
        canCreate: true,
        issueTypes: [],
        fieldsByIssueType: {
          "10001": [{ id: "summary", name: "Summary", required: true, schemaType: "string" }],
        },
        priorityOptions: [],
        versionOptions: [],
        pointsFieldId: null,
        supportsTimeTracking: false,
        supportsDueDate: true,
        hasSubtaskTypes: false,
        defaultIssueTypeId: null,
        defaultSubtaskTypeId: null,
        allowsUnassigned: true,
        fieldCapabilities: {
          priority: { available: true },
          fixVersions: { available: true },
          points: { available: false },
        },
        fetchedAt: new Date().toISOString(),
        fingerprint: "fp2",
      };
      const fieldsOmitted = buildJiraCreateFields({
        reqData: { issueTypeId: "10001", originalEstimate: "3d" },
        meta: metaWithoutTime,
      });
      expect(fieldsOmitted.timetracking).toBeUndefined();
    });

    it("attaches parent correctly for subtasks vs epic link vs default parent", () => {
      // Subtask
      const subtaskFields = buildJiraCreateFields({
        reqData: { isSubtask: true },
        resolvedParentKey: "PARENT-10",
      });
      expect(subtaskFields.parent).toEqual({ key: "PARENT-10" });

      // Standard task with epic link field id
      const epicLinkFields = buildJiraCreateFields({
        reqData: { isSubtask: false },
        epicLinkFieldId: "customfield_10008",
        resolvedParentKey: "EPIC-20",
      });
      expect(epicLinkFields["customfield_10008"]).toBe("EPIC-20");
      expect(epicLinkFields.parent).toBeUndefined();

      // Standard task without epic link field id
      const parentFallbackFields = buildJiraCreateFields({
        reqData: { isSubtask: false },
        resolvedParentKey: "PARENT-30",
      });
      expect(parentFallbackFields.parent).toEqual({ key: "PARENT-30" });
    });
  });

  describe("executeCreateWithReconciliation", () => {
    it("reconciles existing marker: skips createIssue and returns existing key", async () => {
      mocks.findIssueByBulkMarker.mockResolvedValue({
        id: "issue-999",
        key: "PROJ-999",
      });

      const fakeJira = {
        findIssueByBulkMarker: mocks.findIssueByBulkMarker,
        createIssue: mocks.createIssue,
      } as unknown as MockJiraClient;

      const result = await executeCreateWithReconciliation({
        operationId: "op-1",
        rowIndex: 0,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
        reqData: { summary: "Existing Task" },
        resolvedParentKey: null,
        initialAttempts: 0,
      });

      expect(result.success).toBe(true);
      expect(result.finalJiraKey).toBe("PROJ-999");
      expect(result.finalJiraIssueId).toBe("issue-999");
      expect(mocks.createIssue).not.toHaveBeenCalled();
    });

    it("calls createIssue when marker is not found on Jira", async () => {
      mocks.findIssueByBulkMarker.mockResolvedValue(null);
      mocks.createIssue.mockResolvedValue({
        id: "issue-100",
        key: "PROJ-100",
      });

      const fakeJira = {
        findIssueByBulkMarker: mocks.findIssueByBulkMarker,
        createIssue: mocks.createIssue,
      } as unknown as MockJiraClient;

      const result = await executeCreateWithReconciliation({
        operationId: "op-1",
        rowIndex: 1,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
        reqData: { summary: "New Task", labels: ["backend"] },
        resolvedParentKey: null,
        initialAttempts: 0,
      });

      expect(result.success).toBe(true);
      expect(result.finalJiraKey).toBe("PROJ-100");
      expect(mocks.createIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          projectKey: "PROJ",
          summary: "New Task",
          labels: ["backend"],
        })
      );
    });

    it("falls back by retrying without timetracking when Jira rejects timetracking field", async () => {
      mocks.findIssueByBulkMarker.mockResolvedValue(null);
      // First call throws error mentioning timetracking
      mocks.createIssue
        .mockRejectedValueOnce(new Error("Field 'timetracking' cannot be set on the current screen."))
        .mockResolvedValueOnce({
          id: "issue-101",
          key: "PROJ-101",
        });

      const fakeJira = {
        findIssueByBulkMarker: mocks.findIssueByBulkMarker,
        createIssue: mocks.createIssue,
      } as unknown as MockJiraClient;

      const result = await executeCreateWithReconciliation({
        operationId: "op-1",
        rowIndex: 0,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
        reqData: { summary: "Task with timetracking", originalEstimate: "1d" },
        resolvedParentKey: null,
        initialAttempts: 0,
      });

      expect(result.success).toBe(true);
      expect(result.finalJiraKey).toBe("PROJ-101");
      expect(mocks.createIssue).toHaveBeenCalledTimes(2);
      expect(mocks.createIssue).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fields: expect.not.objectContaining({ timetracking: expect.anything() }),
        })
      );
    });

    it("stops retry immediately on non-retryable JiraRequestError (400, 401, 403, 404, 409)", async () => {
      mocks.findIssueByBulkMarker.mockResolvedValue(null);
      mocks.createIssue.mockRejectedValue(
        new JiraRequestError("Invalid project key", 400, false)
      );

      const fakeJira = {
        findIssueByBulkMarker: mocks.findIssueByBulkMarker,
        createIssue: mocks.createIssue,
      } as unknown as MockJiraClient;

      const result = await executeCreateWithReconciliation({
        operationId: "op-1",
        rowIndex: 0,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
        reqData: { summary: "Bad Task" },
        resolvedParentKey: null,
        initialAttempts: 0,
      });

      expect(result.success).toBe(false);
      expect(result.retryable).toBe(false);
      expect(result.errorCode).toBe("JIRA_400");
      expect(result.errorMessage).toContain("Invalid project key");
      expect(mocks.createIssue).toHaveBeenCalledTimes(1); // No retries for 400
    });
  });

  describe("processCreateItem", () => {
    it("returns true immediately without mutation if item is already succeeded (idempotency guard)", async () => {
      mocks.bulkCreateItemFindUnique.mockResolvedValue({
        id: "item-already-done",
        status: "succeeded",
        jiraKey: "PROJ-55",
      });

      const fakeJira = {} as unknown as MockJiraClient;

      const success = await processCreateItem({
        operationId: "op-1",
        itemId: "item-already-done",
        rowIndex: 0,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
      });

      expect(success).toBe(true);
      expect(mocks.bulkCreateItemUpdateMany).not.toHaveBeenCalled();
      expect(mocks.bulkCreateItemUpdate).not.toHaveBeenCalled();
    });

    it("returns false immediately if claiming item fails and status is not running", async () => {
      mocks.bulkCreateItemFindUnique.mockResolvedValue({
        id: "item-taken",
        status: "failed",
      });
      mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 0 });

      const fakeJira = {} as unknown as MockJiraClient;

      const success = await processCreateItem({
        operationId: "op-1",
        itemId: "item-taken",
        rowIndex: 0,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
      });

      expect(success).toBe(false);
      expect(mocks.bulkCreateItemUpdate).not.toHaveBeenCalled();
    });

    it("returns false if parent resolution indicates item is blocked", async () => {
      mocks.bulkCreateItemFindUnique.mockResolvedValue({
        id: "item-subtask",
        status: "pending",
        attemptCount: 0,
      });
      mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 1 });
      mocks.resolveItemParentKey.mockResolvedValue({
        resolvedParentKey: null,
        blocked: true,
        error: "Parent blocked",
      });

      const fakeJira = {} as unknown as MockJiraClient;

      const success = await processCreateItem({
        operationId: "op-1",
        itemId: "item-subtask",
        rowIndex: 2,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
      });

      expect(success).toBe(false);
      expect(mocks.createIssue).not.toHaveBeenCalled();
    });

    it("completes full success lifecycle: cleans up marker label, updates DB, syncs cache, and audits", async () => {
      mocks.bulkCreateItemFindUnique.mockResolvedValue({
        id: "item-live",
        status: "pending",
        clientRef: "ref-live",
        attemptCount: 0,
        requested: { summary: "Live Task", issueTypeId: "10001" },
      });
      mocks.bulkCreateItemUpdateMany.mockResolvedValue({ count: 1 });
      mocks.resolveItemParentKey.mockResolvedValue({
        resolvedParentKey: null,
        blocked: false,
      });

      mocks.findIssueByBulkMarker.mockResolvedValue(null);
      mocks.createIssue.mockResolvedValue({
        id: "live-id-123",
        key: "PROJ-123",
      });
      mocks.removeIssueLabel.mockResolvedValue(undefined);

      const fakeJira = {
        findIssueByBulkMarker: mocks.findIssueByBulkMarker,
        createIssue: mocks.createIssue,
        removeIssueLabel: mocks.removeIssueLabel,
      } as unknown as MockJiraClient;

      const success = await processCreateItem({
        operationId: "op-1",
        itemId: "item-live",
        rowIndex: 0,
        projectKey: "PROJ",
        auth: dummyAuth,
        jira: fakeJira,
      });

      expect(success).toBe(true);
      expect(mocks.removeIssueLabel).toHaveBeenCalledWith("PROJ-123", "ttw-bulk-op-1-0");
      expect(mocks.bulkCreateItemUpdate).toHaveBeenCalledWith({
        where: { id: "item-live" },
        data: {
          status: "succeeded",
          jiraKey: "PROJ-123",
          jiraIssueId: "live-id-123",
          resolvedParentJiraKey: null,
          attemptCount: 1,
          error: null,
          errorCode: null,
        },
      });
      expect(mocks.refreshJiraIssueCache).toHaveBeenCalledWith(fakeJira, "PROJ-123");
      expect(mocks.audit).toHaveBeenCalledWith({
        actorId: "tester",
        action: "issue.create",
        target: "PROJ-123",
        after: { operationId: "op-1", clientRef: "ref-live", parentKey: null },
      });
    });
  });
});
