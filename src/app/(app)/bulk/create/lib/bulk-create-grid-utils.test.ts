import { describe, it, expect } from "vitest";
import { getEffectiveIssueTypeName } from "./bulk-create-grid-utils";
import type { BulkCreateProjectMetadata, BulkCreateFieldDefaults } from "@/lib/bulk/create-types";

const mockMetadata: BulkCreateProjectMetadata = {
  project: { key: "TEST", name: "Test Project" },
  canCreate: true,
  fetchedAt: new Date().toISOString(),
  fingerprint: "fp-test",
  hasSubtaskTypes: true,
  defaultIssueTypeId: "10001",
  defaultSubtaskTypeId: "10003",
  allowsUnassigned: true,
  fieldCapabilities: {
    priority: { available: true },
    fixVersions: { available: true },
    points: { available: true },
  },
  pointsFieldId: null,
  supportsTimeTracking: false,
  supportsDueDate: false,
  issueTypes: [
    { id: "10001", name: "Task", subtask: false },
    { id: "10002", name: "Bug", subtask: false },
    { id: "10003", name: "Sub-task", subtask: true },
  ],
  priorityOptions: [],
  versionOptions: [],
  components: [],
  fieldsByIssueType: {},
};

const emptyDefaults: BulkCreateFieldDefaults = {};

describe("getEffectiveIssueTypeName", () => {
  it("returns explicit standard issue type when specified on row", () => {
    const res = getEffectiveIssueTypeName(
      { clientRef: "r1", summary: "foo", issueTypeId: "10002" },
      emptyDefaults,
      mockMetadata
    );
    expect(res).toEqual({ name: "Bug", isInherited: false });
  });

  it("adds thunder icon for explicit sub-task issue type", () => {
    const res = getEffectiveIssueTypeName(
      { clientRef: "r1", summary: "foo", issueTypeId: "10003" },
      emptyDefaults,
      mockMetadata
    );
    expect(res).toEqual({ name: "⚡ Sub-task", isInherited: false });
  });

  it("falls back to batch defaults when row has no issueTypeId", () => {
    const res = getEffectiveIssueTypeName(
      { clientRef: "r1", summary: "foo" },
      { issueTypeId: "10002" },
      mockMetadata
    );
    expect(res).toEqual({ name: "Bug (mặc định)", isInherited: true });
  });

  it("falls back to project defaultIssueTypeId when neither row nor defaults specify one", () => {
    const res = getEffectiveIssueTypeName(
      { clientRef: "r1", summary: "foo" },
      emptyDefaults,
      mockMetadata
    );
    expect(res).toEqual({ name: "Task (Jira mặc định)", isInherited: true });
  });

  it("returns null if issueTypeId is unknown and no defaults exist", () => {
    const noDefaultMetadata: BulkCreateProjectMetadata = {
      ...mockMetadata,
      defaultIssueTypeId: null,
    };
    const res = getEffectiveIssueTypeName(
      { clientRef: "r1", summary: "foo", issueTypeId: "99999" },
      emptyDefaults,
      noDefaultMetadata
    );
    expect(res).toBeNull();
  });
});
