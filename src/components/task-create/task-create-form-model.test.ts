import { describe, expect, it } from "vitest";
import type {
  BulkCreateFieldMetadata,
  BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { MAX_SUMMARY_LENGTH } from "@/lib/bulk/create-types";
import {
  SINGLE_CLIENT_REF,
  applyPrefill,
  canSubmit,
  duplicateKeyFromWarning,
  emptyRow,
  aiOverwriteNeedsConfirm,
  mergeAiPrefill,
  resolveIssueTypeIdByName,
  splitPreviewErrors,
  withLockedLabels,
} from "./task-create-form-model";

function field(overrides: Partial<BulkCreateFieldMetadata>): BulkCreateFieldMetadata {
  return { id: "customfield_1", name: "Custom", required: false, ...overrides };
}

function meta(overrides: Partial<BulkCreateProjectMetadata> = {}): BulkCreateProjectMetadata {
  return {
    project: { key: "ABC", name: "ABC" },
    canCreate: true,
    issueTypes: [
      { id: "10001", name: "Task", subtask: false },
      { id: "10002", name: "Sub-task", subtask: true },
    ],
    fieldsByIssueType: {
      "10001": [
        field({ id: "summary", name: "Summary", required: true }),
        field({ id: "issuetype", name: "Issue Type", required: true }),
        field({ id: "project", name: "Project", required: true }),
        field({ id: "reporter", name: "Reporter", required: true }),
        field({ id: "customfield_200", name: "Team", required: true }),
        field({ id: "customfield_300", name: "Optional", required: false }),
      ],
      "10003": [field({ id: "summary", name: "Summary", required: true })],
    },
    priorityOptions: [],
    versionOptions: [],
    components: [],
    pointsFieldId: null,
    supportsTimeTracking: false,
    supportsDueDate: false,
    hasSubtaskTypes: true,
    defaultIssueTypeId: "10001",
    defaultSubtaskTypeId: "10002",
    allowsUnassigned: true,
    fieldCapabilities: {
      priority: { available: true },
      fixVersions: { available: true },
      points: { available: true },
    },
    fetchedAt: "2026-10-17T00:00:00.000Z",
    fingerprint: "fp",
    ...overrides,
  };
}

describe("emptyRow", () => {
  it("defaults the issue type from metadata and uses the single client ref", () => {
    const row = emptyRow(meta());
    expect(row.clientRef).toBe(SINGLE_CLIENT_REF);
    expect(row.clientRef).toBe("single-1");
    expect(row.issueTypeId).toBe("10001");
    expect(row.summary).toBe("");
  });

  it("leaves issue type undefined when Jira has no default", () => {
    expect(emptyRow(meta({ defaultIssueTypeId: null })).issueTypeId).toBeUndefined();
  });
});

describe("applyPrefill", () => {
  it("merges prefill labels with locked labels without duplicates", () => {
    const row = applyPrefill(emptyRow(meta()), { summary: "x", labels: ["a"] }, ["sentry", "sentry-123"]);
    expect(row.summary).toBe("x");
    expect(row.labels).toEqual(["a", "sentry", "sentry-123"]);
  });

  it("dedups labels that appear in both prefill and locked labels", () => {
    const row = applyPrefill(emptyRow(meta()), { labels: ["sentry", "a", "a"] }, ["sentry"]);
    expect(row.labels).toEqual(["sentry", "a"]);
  });

  it("ignores undefined prefill values so defaults survive", () => {
    const row = applyPrefill(emptyRow(meta()), { issueTypeId: undefined, summary: "y" });
    expect(row.issueTypeId).toBe("10001");
    expect(row.clientRef).toBe("single-1");
  });

  it("works without prefill", () => {
    const row = applyPrefill(emptyRow(meta()), undefined, ["sentry"]);
    expect(row.labels).toEqual(["sentry"]);
  });
});

describe("withLockedLabels", () => {
  it("re-adds locked labels after onChange removed them", () => {
    const row = applyPrefill(emptyRow(meta()), { labels: ["a"] }, ["sentry", "sentry-123"]);
    const edited = { ...row, labels: ["a"] };
    expect(withLockedLabels(edited, ["sentry", "sentry-123"]).labels).toEqual([
      "a",
      "sentry",
      "sentry-123",
    ]);
  });

  it("returns the row unchanged when nothing is locked", () => {
    const row = { ...emptyRow(meta()), labels: ["a"] };
    expect(withLockedLabels(row, undefined)).toBe(row);
    expect(withLockedLabels(row, [])).toBe(row);
  });
});

describe("canSubmit", () => {
  const valid = () => ({
    ...emptyRow(meta()),
    summary: "Fix login",
    customFields: { customfield_200: "team-a" },
  });

  it("accepts a valid row", () => {
    expect(canSubmit(valid(), meta())).toEqual({ ok: true });
  });

  it("rejects an empty or whitespace summary", () => {
    expect(canSubmit({ ...valid(), summary: "" }, meta()).ok).toBe(false);
    expect(canSubmit({ ...valid(), summary: "   " }, meta()).ok).toBe(false);
  });

  it("rejects a multi-line summary", () => {
    const res = canSubmit({ ...valid(), summary: "line 1\nline 2" }, meta());
    expect(res.ok).toBe(false);
  });

  it("rejects a summary longer than the Jira limit", () => {
    const res = canSubmit({ ...valid(), summary: "x".repeat(MAX_SUMMARY_LENGTH + 1) }, meta());
    expect(res.ok).toBe(false);
  });

  it("rejects when the user cannot create in the project, using permissionReason", () => {
    const res = canSubmit(valid(), meta({ canCreate: false, permissionReason: "Không có quyền" }));
    expect(res).toEqual({ ok: false, reason: "Không có quyền" });
  });

  it("rejects when a required custom field of the selected issue type is missing", () => {
    const res = canSubmit({ ...valid(), customFields: {} }, meta());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("Team");
    expect(canSubmit({ ...valid(), customFields: { customfield_200: "" } }, meta()).ok).toBe(false);
  });

  it("ignores required system fields (summary, issuetype, project, reporter)", () => {
    const res = canSubmit({ ...valid(), issueTypeId: "10003", customFields: {} }, meta());
    expect(res).toEqual({ ok: true });
  });

  it("ignores required points/epic-link fields handled outside custom fields", () => {
    const m = meta({ pointsFieldId: "customfield_200" });
    expect(canSubmit({ ...valid(), customFields: {} }, m)).toEqual({ ok: true });
  });

  it("rejects when no issue type can be resolved", () => {
    const m = meta({ defaultIssueTypeId: null });
    expect(canSubmit({ ...valid(), issueTypeId: undefined }, m).ok).toBe(false);
  });

  it("rejects a sub-task without a parent", () => {
    const res = canSubmit({ ...valid(), issueTypeId: "10002", customFields: {} }, meta());
    expect(res.ok).toBe(false);
    expect(
      canSubmit(
        { ...valid(), issueTypeId: "10002", parent: { type: "jira", jiraKey: "ABC-1" } },
        meta()
      )
    ).toEqual({ ok: true });
  });
});

describe("splitPreviewErrors", () => {
  it("maps known row fields inline and keeps the rest as general errors", () => {
    const { fieldErrors, general } = splitPreviewErrors(
      [
        { field: "summary", code: "SUMMARY_REQUIRED", message: "Tiêu đề trống" },
        { field: "points", code: "X", message: "Points sai" },
        { field: "customfield_200", code: "REQUIRED_CUSTOM_FIELD_MISSING", message: "Thiếu Team" },
        { code: "BLOCKED", message: "Lỗi chung" },
      ],
      meta()
    );
    expect(fieldErrors).toEqual({ summary: "Tiêu đề trống" });
    // points field is hidden when the project has no points field → general list
    expect(general.map((e) => e.message)).toEqual(["Points sai", "Thiếu Team", "Lỗi chung"]);
  });

  it("keeps the first message per field", () => {
    const { fieldErrors } = splitPreviewErrors(
      [
        { field: "labels", code: "A", message: "first" },
        { field: "labels", code: "B", message: "second" },
      ],
      meta()
    );
    expect(fieldErrors).toEqual({ labels: "first" });
  });
});

describe("duplicateKeyFromWarning", () => {
  it("prefers an explicit existingDuplicateKey", () => {
    expect(
      duplicateKeyFromWarning({ message: "x", existingDuplicateKey: "ABC-9" } as never)
    ).toBe("ABC-9");
  });

  it("extracts the Jira key from the warning message", () => {
    expect(
      duplicateKeyFromWarning({
        code: "DUPLICATE_SUMMARY_JIRA",
        message: "Trùng tiêu đề với task đang mở trên Jira: ABC-123",
      })
    ).toBe("ABC-123");
  });

  it("returns null when there is no key", () => {
    expect(duplicateKeyFromWarning({ code: "DUPLICATE_SUMMARY_BATCH", message: "Trùng trong batch" })).toBeNull();
  });
});

describe("resolveIssueTypeIdByName", () => {
  const withBug = meta({
    issueTypes: [
      { id: "10001", name: "Task", subtask: false },
      { id: "10004", name: "Bug", subtask: false },
    ],
  });

  it("matches case-insensitively and ignores surrounding spaces", () => {
    expect(resolveIssueTypeIdByName(withBug, "bug")).toBe("10004");
    expect(resolveIssueTypeIdByName(withBug, " BUG ")).toBe("10004");
  });

  it("returns undefined when the type is absent or no name is given", () => {
    expect(resolveIssueTypeIdByName(meta(), "Bug")).toBeUndefined();
    expect(resolveIssueTypeIdByName(withBug, undefined)).toBeUndefined();
    expect(resolveIssueTypeIdByName(withBug, "  ")).toBeUndefined();
  });

  it("skips subtask types with the same name", () => {
    const subBug = meta({ issueTypes: [{ id: "10005", name: "Bug", subtask: true }] });
    expect(resolveIssueTypeIdByName(subBug, "Bug")).toBeUndefined();
  });
});

describe("mergeAiPrefill", () => {
  const ai = {
    summary: "Thêm nút xuất Excel",
    description: "Bối cảnh\n- A",
    issueTypeId: "10003",
    priorityId: "p1",
    componentIds: ["c1"],
    labels: ["ui"],
  };

  it("fills a fresh row, replacing the default issue type", () => {
    const row = mergeAiPrefill(emptyRow(meta()), ai, { defaultIssueTypeId: "10001" });
    expect(row).toMatchObject(ai);
    expect(row.clientRef).toBe(SINGLE_CLIENT_REF);
  });

  it("keeps fields the user already filled but overwrites summary and description", () => {
    const current = {
      ...emptyRow(meta()),
      summary: "Cũ",
      description: "Mô tả cũ",
      issueTypeId: "10009",
      priorityId: "p2",
      componentIds: ["c9"],
      labels: ["mine"],
    };
    const row = mergeAiPrefill(current, ai, { defaultIssueTypeId: "10001" });
    expect(row.summary).toBe(ai.summary);
    expect(row.description).toBe(ai.description);
    expect(row.issueTypeId).toBe("10009");
    expect(row.priorityId).toBe("p2");
    expect(row.componentIds).toEqual(["c9"]);
    expect(row.labels).toEqual(["mine"]);
  });

  it("keeps the current summary/description when the prefill omits them", () => {
    const current = { ...emptyRow(meta()), summary: "Cũ", description: "Mô tả cũ" };
    const row = mergeAiPrefill(current, { priorityId: "p1" });
    expect(row.summary).toBe("Cũ");
    expect(row.description).toBe("Mô tả cũ");
    expect(row.priorityId).toBe("p1");
  });

  it("treats locked-only labels as empty and keeps locked labels", () => {
    const current = withLockedLabels(emptyRow(meta()), ["sentry"]);
    const row = mergeAiPrefill(current, { labels: ["ui"] }, { lockedLabels: ["sentry"] });
    expect(row.labels).toEqual(["ui", "sentry"]);
  });

  it("does not touch unrelated fields", () => {
    const current = { ...emptyRow(meta()), points: 3, dueDate: "2026-10-20" };
    const row = mergeAiPrefill(current, ai);
    expect(row.points).toBe(3);
    expect(row.dueDate).toBe("2026-10-20");
  });
});

describe("aiOverwriteNeedsConfirm", () => {
  it("is false for an empty form", () => {
    expect(aiOverwriteNeedsConfirm(emptyRow(meta()), { summary: "x", description: "y" })).toBe(false);
  });

  it("is true when summary or description would be replaced", () => {
    const row = { ...emptyRow(meta()), summary: "Cũ" };
    expect(aiOverwriteNeedsConfirm(row, { summary: "x" })).toBe(true);
    expect(aiOverwriteNeedsConfirm({ ...emptyRow(meta()), description: "d" }, { description: "y" })).toBe(true);
  });

  it("is false when the prefill does not carry the filled field", () => {
    const row = { ...emptyRow(meta()), summary: "Cũ" };
    expect(aiOverwriteNeedsConfirm(row, { description: "y" })).toBe(false);
  });
});
