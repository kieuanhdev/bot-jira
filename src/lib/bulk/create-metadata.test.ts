import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchBulkCreateMetadata,
  clearBulkCreateMetadataCache,
  invalidateBulkCreateMetadataCache,
  getBulkCreateMetadataCacheSize,
  buildMetadataCacheKey,
  sha256,
} from "./create-metadata";
import { JiraRequestError, type JiraAuth, type jiraWith } from "@/lib/jira/client";
import type { JiraCreateMetaResponse } from "@/lib/jira/types";

describe("Bulk Create Metadata and Cache", () => {
  beforeEach(() => {
    clearBulkCreateMetadataCache();
    vi.restoreAllMocks();
  });

  const mockAuth: JiraAuth = {
    token: "secret-token-123",
    user: "test-user",
    authMode: "Bearer",
  };

  const sampleCreateMeta: JiraCreateMetaResponse = {
    projects: [
      {
        id: "10000",
        key: "PRJ",
        name: "Project PRJ",
        issuetypes: [
          {
            id: "1",
            name: "Task",
            subtask: false,
            fields: {
              summary: {
                name: "Summary",
                required: true,
                schema: { type: "string", system: "summary" },
              },
              priority: {
                name: "Priority",
                required: false,
                schema: { type: "priority", system: "priority" },
                allowedValues: [
                  { id: "1", name: "High", value: "High" },
                  { id: "2", name: "Low", value: "Low" },
                ],
              },
              fixVersions: {
                name: "Fix Version/s",
                required: false,
                schema: { type: "array", items: "version", system: "fixVersions" },
                allowedValues: [
                  { id: "100", name: "v1.0", archived: false, released: false },
                ],
              },
              customfield_10001: {
                name: "Story Points",
                required: false,
                schema: { type: "number", custom: "com.atlassian.jira.plugin.system.customfieldtypes:float" },
              },
              customfield_10002: {
                name: "Epic Link",
                required: false,
                schema: { type: "any", custom: "com.pyxis.greenhopper.jira:gh-epic-link" },
              },
              timetracking: {
                name: "Time Tracking",
                required: false,
                schema: { type: "timetracking", system: "timetracking" },
              },
              duedate: {
                name: "Due Date",
                required: false,
                schema: { type: "date", system: "duedate" },
              },
            },
          },
          {
            id: "2",
            name: "Sub-task",
            subtask: true,
            fields: {
              summary: {
                name: "Summary",
                required: true,
                schema: { type: "string" },
              },
            },
          },
        ],
      },
    ],
  };

  function createMockJira(overrides: Record<string, unknown> = {}) {
    return {
      getCreateMetadata: vi.fn().mockResolvedValue(sampleCreateMeta),
      getMyPermissions: vi.fn().mockResolvedValue({
        permissions: {
          CREATE_ISSUES: { havePermission: true },
        },
      }),
      getVersions: vi.fn().mockResolvedValue([
        { id: "100", name: "v1.0", archived: false, released: false },
        { id: "101", name: "v2.0", archived: true, released: false },
      ]),
      getConfiguration: vi.fn().mockResolvedValue({ timeTrackingEnabled: true }),
      getProjectComponents: vi.fn().mockResolvedValue([
        { id: "comp-1", name: "Backend", description: "Backend APIs" },
      ]),
      ...overrides,
    } as unknown as ReturnType<typeof jiraWith>;
  }

  describe("Cache Key and Invalidation", () => {
    it("builds consistent cache keys for token and anon", () => {
      const keyWithToken = buildMetadataCacheKey("prj", mockAuth);
      expect(keyWithToken).toBe(`${sha256("secret-token-123").slice(0, 8)}:PRJ`);

      const keyAnon = buildMetadataCacheKey("PRJ", {});
      expect(keyAnon).toBe("anon:PRJ");
    });

    it("clears all cache entries with clearBulkCreateMetadataCache", async () => {
      const jira = createMockJira();
      await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(getBulkCreateMetadataCacheSize()).toBe(1);

      clearBulkCreateMetadataCache();
      expect(getBulkCreateMetadataCacheSize()).toBe(0);
    });

    it("invalidates cache by projectKey", async () => {
      const jira = createMockJira();
      await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(getBulkCreateMetadataCacheSize()).toBe(1);

      invalidateBulkCreateMetadataCache("OTHER");
      expect(getBulkCreateMetadataCacheSize()).toBe(1);

      invalidateBulkCreateMetadataCache("prj");
      expect(getBulkCreateMetadataCacheSize()).toBe(0);
    });

    it("invalidates cache by userToken", async () => {
      const jira = createMockJira();
      await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(getBulkCreateMetadataCacheSize()).toBe(1);

      invalidateBulkCreateMetadataCache(undefined, "other-token");
      expect(getBulkCreateMetadataCacheSize()).toBe(1);

      invalidateBulkCreateMetadataCache(undefined, "secret-token-123");
      expect(getBulkCreateMetadataCacheSize()).toBe(0);
    });

    it("invalidates all entries when no filters are passed", async () => {
      const jira = createMockJira();
      await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(getBulkCreateMetadataCacheSize()).toBe(1);

      invalidateBulkCreateMetadataCache();
      expect(getBulkCreateMetadataCacheSize()).toBe(0);
    });
  });

  describe("fetchBulkCreateMetadata", () => {
    it("fetches, transforms and caches project metadata", async () => {
      const jira = createMockJira();
      const meta = await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);

      expect(jira.getCreateMetadata).toHaveBeenCalledTimes(1);
      expect(jira.getMyPermissions).toHaveBeenCalledTimes(1);
      expect(jira.getVersions).toHaveBeenCalledTimes(1);
      expect(jira.getProjectComponents).toHaveBeenCalledTimes(1);

      expect(meta.project.key).toBe("PRJ");
      expect(meta.canCreate).toBe(true);
      expect(meta.issueTypes).toHaveLength(2);
      expect(meta.issueTypes[0]).toEqual({
        id: "1",
        name: "Task",
        subtask: false,
        description: undefined,
        iconUrl: undefined,
      });
      expect(meta.pointsFieldId).toBe("customfield_10001");
      expect(meta.epicLinkFieldId).toBe("customfield_10002");
      expect(meta.supportsTimeTracking).toBe(true);
      expect(meta.supportsDueDate).toBe(true);
      expect(meta.hasSubtaskTypes).toBe(true);
      expect(meta.components).toEqual([
        { id: "comp-1", name: "Backend", description: "Backend APIs" },
      ]);
      expect(meta.priorityOptions).toEqual([
        { id: "1", name: "High" },
        { id: "2", name: "Low" },
      ]);
      // Version options include supplemented versions from getVersions
      expect(meta.versionOptions).toEqual([
        { id: "100", name: "v1.0", archived: false, released: false },
        { id: "101", name: "v2.0", archived: true, released: false },
      ]);
      expect(meta.fingerprint.startsWith("sha256:")).toBe(true);

      // Subsequent call hits cache
      const cached = await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(cached).toBe(meta);
      expect(jira.getCreateMetadata).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache when forceRefresh is true", async () => {
      const jira = createMockJira();
      await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(jira.getCreateMetadata).toHaveBeenCalledTimes(1);

      await fetchBulkCreateMetadata(jira, "PRJ", mockAuth, { forceRefresh: true });
      expect(jira.getCreateMetadata).toHaveBeenCalledTimes(2);
    });

    it("expires cached entry after TTL expires", async () => {
      vi.useFakeTimers();
      try {
        const jira = createMockJira();
        await fetchBulkCreateMetadata(jira, "PRJ", mockAuth, { ttlMs: 1000 });
        expect(jira.getCreateMetadata).toHaveBeenCalledTimes(1);

        // Advance 500ms - still fresh
        vi.advanceTimersByTime(500);
        await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
        expect(jira.getCreateMetadata).toHaveBeenCalledTimes(1);

        // Advance another 600ms - expired
        vi.advanceTimersByTime(600);
        await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
        expect(jira.getCreateMetadata).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws 404 JiraRequestError when project is not in createmeta", async () => {
      const jira = createMockJira({
        getCreateMetadata: vi.fn().mockResolvedValue({ projects: [] }),
      });

      await expect(
        fetchBulkCreateMetadata(jira, "UNKNOWN", mockAuth)
      ).rejects.toThrowError(JiraRequestError);
    });

    it("rethrows JiraRequestError from Jira client", async () => {
      const jira = createMockJira({
        getCreateMetadata: vi.fn().mockRejectedValue(new JiraRequestError("Forbidden", 403, false)),
      });

      await expect(
        fetchBulkCreateMetadata(jira, "PRJ", mockAuth)
      ).rejects.toThrow(/Không thể lấy metadata tạo task/);
    });

    it("handles missing CREATE_ISSUES permission", async () => {
      const jira = createMockJira({
        getMyPermissions: vi.fn().mockResolvedValue({
          permissions: {
            CREATE_ISSUES: { havePermission: false },
          },
        }),
      });

      const meta = await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(meta.canCreate).toBe(false);
      expect(meta.permissionReason).toContain("không có quyền tạo task");
    });

    it("falls back to canCreate=true if permissions check fails but issuetypes exist", async () => {
      const jira = createMockJira({
        getMyPermissions: vi.fn().mockRejectedValue(new Error("Network failed")),
      });

      const meta = await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(meta.canCreate).toBe(true);
    });

    it("falls back to instance config for timetracking when absent on create screen", async () => {
      const metaNoTimeTracking: JiraCreateMetaResponse = {
        projects: [
          {
            id: "10000",
            key: "PRJ",
            name: "Project PRJ",
            issuetypes: [
              {
                id: "1",
                name: "Task",
                subtask: false,
                fields: {
                  summary: { name: "Summary", required: true },
                },
              },
            ],
          },
        ],
      };

      const jira = createMockJira({
        getCreateMetadata: vi.fn().mockResolvedValue(metaNoTimeTracking),
        getConfiguration: vi.fn().mockResolvedValue({ timeTrackingEnabled: true }),
      });

      const meta = await fetchBulkCreateMetadata(jira, "PRJ", mockAuth);
      expect(meta.supportsTimeTracking).toBe(true);
    });
  });
});
