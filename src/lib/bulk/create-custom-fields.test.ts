import { describe, it, expect } from "vitest";
import {
  customFieldScalar,
  matchAllowedValue,
  isAllowedCustomFieldValue,
  normalizeJiraCustomFieldValue,
  validateAndNormalizeCustomFields,
} from "./create-custom-fields";
import type { BulkCreateFieldMetadata, BulkCreateProjectMetadata } from "./create-types";

describe("Bulk Create - Custom Fields Normalization and Validation", () => {
  describe("customFieldScalar", () => {
    it("extracts scalar from primitives", () => {
      expect(customFieldScalar("  hello  ")).toBe("hello");
      expect(customFieldScalar("")).toBeNull();
      expect(customFieldScalar(42)).toBe("42");
      expect(customFieldScalar(true)).toBe("true");
      expect(customFieldScalar(null)).toBeNull();
      expect(customFieldScalar(undefined)).toBeNull();
    });

    it("extracts scalar from object candidates", () => {
      expect(customFieldScalar({ id: "opt-1" })).toBe("opt-1");
      expect(customFieldScalar({ name: "Option A" })).toBe("Option A");
      expect(customFieldScalar({ value: "Value B" })).toBe("Value B");
      expect(customFieldScalar({ key: "KEY-1" })).toBe("KEY-1");
      expect(customFieldScalar({ accountId: "acc-123" })).toBe("acc-123");
      expect(customFieldScalar({})).toBeNull();
    });
  });

  describe("matchAllowedValue and isAllowedCustomFieldValue", () => {
    const fieldWithAllowed: BulkCreateFieldMetadata = {
      id: "customfield_1001",
      name: "Severity",
      required: false,
      allowedValues: [
        { id: "1", name: "Critical", value: "Critical" },
        { id: "2", name: "Major", value: "Major" },
      ],
    };

    it("matches allowed value by id, name, or value", () => {
      expect(matchAllowedValue(fieldWithAllowed, "1")?.name).toBe("Critical");
      expect(matchAllowedValue(fieldWithAllowed, "Major")?.id).toBe("2");
      expect(matchAllowedValue(fieldWithAllowed, "Unknown")).toBeUndefined();
      expect(matchAllowedValue(fieldWithAllowed, null)).toBeUndefined();
    });

    it("validates allowed values", () => {
      // Empty allowed values list always allows
      const openField: BulkCreateFieldMetadata = {
        id: "customfield_9999",
        name: "Text",
        required: false,
      };
      expect(isAllowedCustomFieldValue(openField, "anything")).toBe(true);

      // Single allowed value
      expect(isAllowedCustomFieldValue(fieldWithAllowed, "1")).toBe(true);
      expect(isAllowedCustomFieldValue(fieldWithAllowed, "Critical")).toBe(true);
      expect(isAllowedCustomFieldValue(fieldWithAllowed, "Minor")).toBe(false);

      // Array allowed values
      expect(isAllowedCustomFieldValue(fieldWithAllowed, ["1", "Major"])).toBe(true);
      expect(isAllowedCustomFieldValue(fieldWithAllowed, ["1", "Invalid"])).toBe(false);

      // Null or empty elements are skipped
      expect(isAllowedCustomFieldValue(fieldWithAllowed, [null, "1", ""])).toBe(true);
    });
  });

  describe("normalizeJiraCustomFieldValue - Field Shapes", () => {
    it("handles undefined, null, and empty values gracefully", () => {
      const fieldDef: BulkCreateFieldMetadata = { id: "cf_1", name: "Test", required: false };
      expect(normalizeJiraCustomFieldValue(undefined, "test")).toBe("test");
      expect(normalizeJiraCustomFieldValue(fieldDef, undefined)).toBeUndefined();
      expect(normalizeJiraCustomFieldValue(fieldDef, null)).toBeNull();
      expect(normalizeJiraCustomFieldValue(fieldDef, "")).toBe("");
    });

    it("normalizes single user picker", () => {
      const userField: BulkCreateFieldMetadata = {
        id: "customfield_1010",
        name: "Reviewer",
        required: false,
        schemaType: "user",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:userpicker",
      };

      expect(normalizeJiraCustomFieldValue(userField, "john.doe")).toEqual({ name: "john.doe" });
      expect(normalizeJiraCustomFieldValue(userField, { name: "john.doe" })).toEqual({ name: "john.doe" });
    });

    it("normalizes multi-user picker", () => {
      const multiUserField: BulkCreateFieldMetadata = {
        id: "customfield_1011",
        name: "Reviewers",
        required: false,
        schemaType: "array",
        schemaItems: "user",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:multiuserpicker",
      };

      expect(normalizeJiraCustomFieldValue(multiUserField, "john.doe")).toEqual([{ name: "john.doe" }]);
      expect(normalizeJiraCustomFieldValue(multiUserField, ["alice", "bob"])).toEqual([
        { name: "alice" },
        { name: "bob" },
      ]);
      expect(normalizeJiraCustomFieldValue(multiUserField, [{ name: "alice" }])).toEqual([
        { name: "alice" },
      ]);
    });

    it("normalizes single group picker", () => {
      const groupField: BulkCreateFieldMetadata = {
        id: "customfield_1020",
        name: "Target Group",
        required: false,
        schemaType: "group",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:grouppicker",
      };

      expect(normalizeJiraCustomFieldValue(groupField, "jira-administrators")).toEqual({
        name: "jira-administrators",
      });
      expect(normalizeJiraCustomFieldValue(groupField, { name: "jira-administrators" })).toEqual({
        name: "jira-administrators",
      });
    });

    it("normalizes multi-group picker", () => {
      const multiGroupField: BulkCreateFieldMetadata = {
        id: "customfield_1021",
        name: "Target Groups",
        required: false,
        schemaType: "array",
        schemaItems: "group",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:multigrouppicker",
      };

      expect(normalizeJiraCustomFieldValue(multiGroupField, "group-a")).toEqual([{ name: "group-a" }]);
      expect(normalizeJiraCustomFieldValue(multiGroupField, ["group-a", "group-b"])).toEqual([
        { name: "group-a" },
        { name: "group-b" },
      ]);
    });

    it("normalizes single version picker", () => {
      const versionField: BulkCreateFieldMetadata = {
        id: "customfield_1030",
        name: "Target Version",
        required: false,
        schemaType: "version",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:version",
        allowedValues: [{ id: "1000", name: "v1.0" }],
      };

      expect(normalizeJiraCustomFieldValue(versionField, "1000")).toEqual({ id: "1000" });
      expect(normalizeJiraCustomFieldValue(versionField, "v1.0")).toEqual({ id: "1000" });
    });

    it("normalizes multi-version picker", () => {
      const multiVersionField: BulkCreateFieldMetadata = {
        id: "customfield_1031",
        name: "Affects Versions",
        required: false,
        schemaType: "array",
        schemaItems: "version",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:multiversion",
        allowedValues: [
          { id: "1000", name: "v1.0" },
          { id: "1001", name: "v1.1" },
        ],
      };

      expect(normalizeJiraCustomFieldValue(multiVersionField, "1000")).toEqual([{ id: "1000" }]);
      expect(normalizeJiraCustomFieldValue(multiVersionField, ["v1.0", "v1.1"])).toEqual([
        { id: "1000" },
        { id: "1001" },
      ]);
    });

    it("normalizes single select and radio buttons", () => {
      const selectField: BulkCreateFieldMetadata = {
        id: "customfield_1040",
        name: "Department",
        required: false,
        schemaType: "option",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:select",
        allowedValues: [
          { id: "opt-1", name: "Engineering" },
          { id: "opt-2", name: "Marketing" },
        ],
      };

      expect(normalizeJiraCustomFieldValue(selectField, "opt-1")).toEqual({ id: "opt-1" });
      expect(normalizeJiraCustomFieldValue(selectField, "Engineering")).toEqual({ id: "opt-1" });
    });

    it("normalizes multi-select and multi-checkboxes", () => {
      const multiSelectField: BulkCreateFieldMetadata = {
        id: "customfield_1041",
        name: "Tags",
        required: false,
        schemaType: "array",
        schemaItems: "option",
        schemaCustom: "com.atlassian.jira.plugin.system.customfieldtypes:multiselect",
        allowedValues: [
          { id: "t1", name: "Backend" },
          { id: "t2", name: "Frontend" },
        ],
      };

      expect(normalizeJiraCustomFieldValue(multiSelectField, "Backend")).toEqual([{ id: "t1" }]);
      expect(normalizeJiraCustomFieldValue(multiSelectField, ["Backend", "t2"])).toEqual([
        { id: "t1" },
        { id: "t2" },
      ]);
    });

    it("normalizes array of strings", () => {
      const stringArrayField: BulkCreateFieldMetadata = {
        id: "customfield_1050",
        name: "Keywords",
        required: false,
        schemaType: "array",
        schemaItems: "string",
      };

      expect(normalizeJiraCustomFieldValue(stringArrayField, "foo")).toEqual(["foo"]);
      expect(normalizeJiraCustomFieldValue(stringArrayField, ["foo", "bar"])).toEqual(["foo", "bar"]);
    });
  });

  describe("validateAndNormalizeCustomFields", () => {
    const mockMeta: BulkCreateProjectMetadata = {
      project: { key: "TEST", name: "Test Project" },
      canCreate: true,
      issueTypes: [{ id: "1001", name: "Task", subtask: false }],
      fieldsByIssueType: {
        "1001": [
          { id: "summary", name: "Summary", required: true },
          { id: "reporter", name: "Reporter", required: true },
          {
            id: "customfield_10010",
            name: "Environment",
            required: true,
            schemaType: "option",
            allowedValues: [
              { id: "prod", name: "Production" },
              { id: "staging", name: "Staging" },
            ],
          },
          {
            id: "customfield_10020",
            name: "Approver",
            required: false,
            schemaType: "user",
          },
          {
            id: "customfield_10030",
            name: "Points",
            required: true,
          },
        ],
      },
      priorityOptions: [],
      versionOptions: [],
      components: [],
      pointsFieldId: "customfield_10030",
      supportsTimeTracking: true,
      supportsDueDate: true,
      hasSubtaskTypes: false,
      defaultIssueTypeId: "1001",
      defaultSubtaskTypeId: null,
      allowsUnassigned: true,
      fieldCapabilities: {
        priority: { available: false },
        fixVersions: { available: false },
        points: { available: true },
      },
      fetchedAt: new Date().toISOString(),
      fingerprint: "sha256:123",
    };

    it("detects missing required custom fields while ignoring system and points fields", () => {
      const res = validateAndNormalizeCustomFields("1001", {}, mockMeta);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].code).toBe("REQUIRED_CUSTOM_FIELD_MISSING");
      expect(res.errors[0].field).toBe("customfield_10010");
    });

    it("detects unallowed custom field values", () => {
      const res = validateAndNormalizeCustomFields(
        "1001",
        { customfield_10010: "development" },
        mockMeta
      );
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].code).toBe("FIELD_VALUE_NOT_ALLOWED");
      expect(res.errors[0].field).toBe("customfield_10010");
    });

    it("normalizes valid required and optional custom fields", () => {
      const res = validateAndNormalizeCustomFields(
        "1001",
        {
          customfield_10010: "Production",
          customfield_10020: "alice",
        },
        mockMeta
      );
      expect(res.errors).toHaveLength(0);
      expect(res.customFields).toEqual({
        customfield_10010: { id: "prod" },
        customfield_10020: { name: "alice" },
      });
    });

    it("handles missing issueTypeId gracefully", () => {
      const res = validateAndNormalizeCustomFields(undefined, { cf_foo: "bar" }, mockMeta);
      expect(res.errors).toHaveLength(0);
      expect(res.customFields).toEqual({ cf_foo: "bar" });
    });
  });
});
