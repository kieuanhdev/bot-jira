import { describe, it, expect } from "vitest";
import {
  validateBulkRequest,
  normalizeKey,
  isValidIsoDate,
  KNOWN_ACTION_KINDS,
  MAX_LABELS_PER_ACTION,
  MAX_LABEL_LENGTH,
  MAX_COMMENT_LENGTH,
  MAX_STRING_FIELD,
} from "./validation";
import {
  actionParams,
  MAX_KEYS,
  MAX_FILTER_KEYS,
  DEFAULT_BRANCH_TEMPLATE,
  type BulkFieldValues,
  type DependencyScope,
} from "./contracts";

describe("Bulk contracts & actionParams", () => {
  it("exports valid limits and defaults", () => {
    expect(MAX_KEYS).toBe(500);
    expect(MAX_FILTER_KEYS).toBe(5000);
    expect(typeof DEFAULT_BRANCH_TEMPLATE).toBe("string");
    expect(DEFAULT_BRANCH_TEMPLATE.length).toBeGreaterThan(0);
    expect(KNOWN_ACTION_KINDS).toHaveLength(15);
  });

  it("maps each BulkAction variant to corresponding ActionParams", () => {
    const fields: BulkFieldValues = { priority: "High", points: 3 };
    expect(actionParams({ kind: "update-fields", value: fields })).toEqual({ fields });
    expect(actionParams({ kind: "assign", value: "alice" })).toEqual({ assignee: "alice" });
    expect(actionParams({ kind: "add-labels", value: ["frontend"] })).toEqual({ labels: ["frontend"] });
    expect(actionParams({ kind: "remove-labels", value: ["backend"] })).toEqual({ labels: ["backend"] });
    expect(actionParams({ kind: "set-points", value: 5 })).toEqual({ points: 5 });
    expect(actionParams({ kind: "set-estimate", value: "2h" })).toEqual({ estimate: "2h" });
    expect(actionParams({ kind: "log-work", value: { timeSpent: "1h", comment: "note" } })).toEqual({
      worklog: { timeSpent: "1h", comment: "note" },
    });
    expect(actionParams({ kind: "set-due-date", value: "2026-12-01" })).toEqual({ dueDate: "2026-12-01" });
    expect(actionParams({ kind: "set-priority", value: "Critical" })).toEqual({ priority: "Critical" });
    expect(actionParams({ kind: "set-epic", value: "PROJ-10" })).toEqual({ epic: "PROJ-10" });
    expect(actionParams({ kind: "transition", value: "Done" })).toEqual({ status: "Done" });
    expect(actionParams({ kind: "add-fix-version", value: "v1.0" })).toEqual({ fixVersion: "v1.0" });
    expect(actionParams({ kind: "remove-fix-version", value: "v0.9" })).toEqual({ fixVersion: "v0.9" });
    expect(actionParams({ kind: "add-comment", value: "Done!" })).toEqual({ comment: "Done!" });
    expect(actionParams({ kind: "create-branches", value: { repo: "app", base: "main" } })).toEqual({
      branches: { repo: "app", base: "main" },
    });
  });
});

describe("validateBulkRequest - Request Body and Selectors", () => {
  it("rejects non-object body", () => {
    expect(validateBulkRequest(null).ok).toBe(false);
    expect(validateBulkRequest("string").ok).toBe(false);
    expect(validateBulkRequest([]).ok).toBe(false);
    const res = validateBulkRequest(null);
    if (!res.ok) {
      expect(res.errors).toContain("request body must be an object");
    }
  });

  it("normalizes and dedupes keys, rejecting empty key lists", () => {
    const res = validateBulkRequest({
      keys: [" proj-1 ", "PROJ-2", "PROJ-1", ""],
      action: { kind: "assign", value: "bob" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.keys).toEqual(["PROJ-1", "PROJ-2"]);
    }

    const empty = validateBulkRequest({
      keys: ["   ", ""],
      action: { kind: "assign", value: "bob" },
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.errors).toContain("keys must contain at least one non-empty key");
    }
  });

  it("rejects non-array keys", () => {
    const res = validateBulkRequest({
      keys: "PROJ-1",
      action: { kind: "assign", value: "bob" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors).toContain("keys must be an array");
    }
  });

  it("rejects keys exceeding MAX_KEYS (500)", () => {
    const keys = Array.from({ length: 501 }, (_, i) => `PROJ-${i + 1}`);
    const res = validateBulkRequest({
      keys,
      action: { kind: "assign", value: "bob" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors).toContain("too many keys: 501 (max 500)");
    }
  });

  it("validates keys mode in selector", () => {
    const res = validateBulkRequest({
      selector: { mode: "keys", keys: ["proj-1", "proj-2"] },
      action: { kind: "assign", value: "bob" },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.keys).toEqual(["PROJ-1", "PROJ-2"]);
      expect(res.selector).toEqual({ mode: "keys", keys: ["proj-1", "proj-2"] });
    }

    const invalid = validateBulkRequest({
      selector: { mode: "keys", keys: "not-array" },
      action: { kind: "assign", value: "bob" },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) {
      expect(invalid.errors).toContain("selector.keys must be an array");
    }
  });

  it("validates filter mode in selector with resolvedKeys", () => {
    const res = validateBulkRequest(
      {
        selector: {
          mode: "filter",
          project: "epm",
          filters: { statuses: ["Open"] },
        },
        action: { kind: "assign", value: "bob" },
      },
      ["EPM-1", "EPM-2"]
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.keys).toEqual(["EPM-1", "EPM-2"]);
      expect(res.selector).toEqual({
        mode: "filter",
        project: "EPM",
        filters: { statuses: ["Open"] },
      });
    }

    const missingProject = validateBulkRequest({
      selector: { mode: "filter", project: "  " },
      action: { kind: "assign", value: "bob" },
    });
    expect(missingProject.ok).toBe(false);
    if (!missingProject.ok) {
      expect(missingProject.errors).toContain("selector.project must be a non-empty string");
    }

    const noResolved = validateBulkRequest(
      {
        selector: { mode: "filter", project: "EPM" },
        action: { kind: "assign", value: "bob" },
      },
      []
    );
    expect(noResolved.ok).toBe(false);
    if (!noResolved.ok) {
      expect(noResolved.errors).toContain("no matching keys found for selector filter");
    }

    const tooMany = validateBulkRequest(
      {
        selector: { mode: "filter", project: "EPM" },
        action: { kind: "assign", value: "bob" },
      },
      Array.from({ length: 5001 }, (_, i) => `EPM-${i + 1}`)
    );
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) {
      expect(tooMany.errors).toContain("too many keys: 5001 (max 5000)");
    }
  });

  it("rejects unknown selector mode and non-object selector", () => {
    const nonObj = validateBulkRequest({
      selector: "filter",
      action: { kind: "assign", value: "bob" },
    });
    expect(nonObj.ok).toBe(false);
    if (!nonObj.ok) expect(nonObj.errors).toContain("selector must be an object");

    const unknownMode = validateBulkRequest({
      selector: { mode: "custom" },
      action: { kind: "assign", value: "bob" },
    });
    expect(unknownMode.ok).toBe(false);
    if (!unknownMode.ok) expect(unknownMode.errors).toContain("unknown selector mode: custom");
  });
});

describe("validateBulkRequest - Action Kind Validation", () => {
  it("rejects non-object action and unknown action kind", () => {
    const nonObj = validateBulkRequest({ keys: ["PROJ-1"], action: "assign" });
    expect(nonObj.ok).toBe(false);
    if (!nonObj.ok) expect(nonObj.errors).toContain("action must be an object");

    const unknownKind = validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "destroy" } });
    expect(unknownKind.ok).toBe(false);
    if (!unknownKind.ok) expect(unknownKind.errors).toContain("unknown action kind: destroy");
  });

  describe("update-fields", () => {
    it("accepts valid comprehensive update-fields payload", () => {
      const res = validateBulkRequest({
        keys: ["PROJ-1", "PROJ-2"],
        action: {
          kind: "update-fields",
          value: {
            assignee: "dev_user",
            labels: ["frontend", "v1"],
            priority: "High",
            issueType: "Bug",
            points: 8,
            estimate: "1d 2h",
            dueDate: "2026-11-20",
            fixVersions: ["1.0.0"],
            epic: "PROJ-100",
          },
        },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.action.kind).toBe("update-fields");
      }
    });

    it("rejects mixed project keys for update-fields", () => {
      const res = validateBulkRequest({
        keys: ["PROJ-1", "OTHER-2"],
        action: { kind: "update-fields", value: { priority: "High" } },
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errors).toContain("all keys must belong to the same project");
      }
    });

    it("rejects non-object value and empty fields", () => {
      const nonObj = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "update-fields", value: "priority" },
      });
      expect(nonObj.ok).toBe(false);
      if (!nonObj.ok) expect(nonObj.errors).toContain("update-fields.value must be an object");

      const empty = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "update-fields", value: {} },
      });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.errors).toContain("update-fields.value must contain at least one field");
    });

    it("validates each field type and bounds in update-fields", () => {
      // Invalid assignee
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { assignee: "a".repeat(MAX_STRING_FIELD + 1) } },
        }).ok
      ).toBe(false);

      // Invalid labels
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { labels: "not-array" } },
        }).ok
      ).toBe(false);
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { labels: Array.from({ length: MAX_LABELS_PER_ACTION + 1 }, (_, i) => `l${i}`) } },
        }).ok
      ).toBe(false);
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { labels: ["a".repeat(MAX_LABEL_LENGTH + 1)] } },
        }).ok
      ).toBe(false);

      // Invalid priority & issueType
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { priority: "   " } },
        }).ok
      ).toBe(false);
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { issueType: "" } },
        }).ok
      ).toBe(false);

      // Invalid points
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { points: -1 } },
        }).ok
      ).toBe(false);
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { points: 1.5 } },
        }).ok
      ).toBe(false);

      // Invalid estimate
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { estimate: "invalid" } },
        }).ok
      ).toBe(false);

      // Invalid dueDate
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { dueDate: "2026/10/10" } },
        }).ok
      ).toBe(false);
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { dueDate: "2026-02-31" } },
        }).ok
      ).toBe(false);

      // Invalid fixVersions
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { fixVersions: ["  "] } },
        }).ok
      ).toBe(false);

      // Invalid epic
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "update-fields", value: { epic: "invalid_key" } },
        }).ok
      ).toBe(false);
    });
  });

  describe("assign", () => {
    it("validates string, null, and length constraints", () => {
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "assign", value: "alice" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "assign", value: null } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "assign", value: 123 } }).ok).toBe(false);
      expect(
        validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "assign", value: "a".repeat(MAX_STRING_FIELD + 1) } }).ok
      ).toBe(false);
    });
  });

  describe("add-labels and remove-labels", () => {
    it("validates labels array, trimming, deduping, and bounds", () => {
      const add = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "add-labels", value: [" tag1 ", "tag2", "tag1"] },
      });
      expect(add.ok).toBe(true);
      if (add.ok) expect(add.action).toEqual({ kind: "add-labels", value: ["tag1", "tag2"] });

      const remove = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "remove-labels", value: ["tag1"] },
      });
      expect(remove.ok).toBe(true);

      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "add-labels", value: [] } }).ok).toBe(false);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "add-labels", value: "not-arr" } }).ok).toBe(false);
      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "add-labels", value: ["a".repeat(MAX_LABEL_LENGTH + 1)] },
        }).ok
      ).toBe(false);
    });
  });

  describe("set-points and set-estimate", () => {
    it("validates integer/null points and duration estimate", () => {
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-points", value: 0 } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-points", value: null } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-points", value: -5 } }).ok).toBe(false);

      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-estimate", value: "3d 4h" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-estimate", value: "now" } }).ok).toBe(false);
    });
  });

  describe("log-work", () => {
    it("validates timeSpent, optional started and comment", () => {
      const valid = validateBulkRequest({
        keys: ["PROJ-1"],
        action: {
          kind: "log-work",
          value: { timeSpent: "2h", started: "2026-10-09T08:00:00Z", comment: "Investigation" },
        },
      });
      expect(valid.ok).toBe(true);

      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "log-work", value: { timeSpent: "invalid" } },
        }).ok
      ).toBe(false);

      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "log-work", value: { timeSpent: "1h", started: "bad-date" } },
        }).ok
      ).toBe(false);

      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "log-work", value: { timeSpent: "1h", comment: "c".repeat(MAX_COMMENT_LENGTH + 1) } },
        }).ok
      ).toBe(false);
    });
  });

  describe("set-due-date", () => {
    it("validates ISO date format and null", () => {
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-due-date", value: "2026-10-31" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-due-date", value: null } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-due-date", value: "31-10-2026" } }).ok).toBe(false);
    });
  });

  describe("set-priority, transition, add-comment", () => {
    it("validates string length and non-empty requirements", () => {
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-priority", value: "Low" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-priority", value: "  " } }).ok).toBe(false);

      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "transition", value: "In Progress" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "transition", value: "" } }).ok).toBe(false);

      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "add-comment", value: "hello" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "add-comment", value: "" } }).ok).toBe(false);
      expect(
        validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "add-comment", value: "x".repeat(MAX_COMMENT_LENGTH + 1) } }).ok
      ).toBe(false);
    });
  });

  describe("set-epic", () => {
    it("validates Jira issue key shape or null", () => {
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-epic", value: "EPIC-10" } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-epic", value: null } }).ok).toBe(true);
      expect(validateBulkRequest({ keys: ["PROJ-1"], action: { kind: "set-epic", value: "invalid" } }).ok).toBe(false);
    });
  });

  describe("add-fix-version and remove-fix-version", () => {
    it("validates dependencyScope and forceRemove", () => {
      const add = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "add-fix-version", value: "v2.0", dependencyScope: "direct" },
      });
      expect(add.ok).toBe(true);
      if (add.ok) {
        expect(add.action).toEqual({ kind: "add-fix-version", value: "v2.0", dependencyScope: "direct" });
      }

      const addInvalidScope = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "add-fix-version", value: "v2.0", dependencyScope: "all" as unknown as DependencyScope },
      });
      expect(addInvalidScope.ok).toBe(false);

      const rm = validateBulkRequest({
        keys: ["PROJ-1"],
        action: { kind: "remove-fix-version", value: "v2.0", forceRemove: true },
      });
      expect(rm.ok).toBe(true);
      if (rm.ok) {
        expect(rm.action).toEqual({
          kind: "remove-fix-version",
          value: "v2.0",
          dependencyScope: "recursive",
          forceRemove: true,
        });
      }
    });
  });

  describe("create-branches", () => {
    it("validates BranchParams shape and fields", () => {
      const valid = validateBulkRequest({
        keys: ["PROJ-1"],
        action: {
          kind: "create-branches",
          value: {
            repo: "org/repo",
            base: "develop",
            nameTemplate: "feat/{issue}",
            comment: true,
          },
        },
      });
      expect(valid.ok).toBe(true);

      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "create-branches", value: "not-object" },
        }).ok
      ).toBe(false);

      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "create-branches", value: { repo: "  " } },
        }).ok
      ).toBe(false);

      expect(
        validateBulkRequest({
          keys: ["PROJ-1"],
          action: { kind: "create-branches", value: { comment: "yes" as unknown as boolean } },
        }).ok
      ).toBe(false);
    });
  });
});

describe("Pure helpers", () => {
  it("normalizeKey trims and uppercases", () => {
    expect(normalizeKey("  proj-123 ")).toBe("PROJ-123");
  });

  it("isValidIsoDate validates exact calendar dates", () => {
    expect(isValidIsoDate("2026-10-09")).toBe(true);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false); // 2026 is not leap year
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("invalid")).toBe(false);
  });
});
