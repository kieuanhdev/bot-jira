import type {
  BulkCreateFieldMetadata,
  BulkCreateProjectMetadata,
  BulkCreateValidationError,
} from "./create-types";

export const SYSTEM_FIELD_IDS = new Set<string>([
  "summary",
  "issuetype",
  "project",
  "reporter",
  "parent",
  "components",
  "labels",
  "description",
  "duedate",
  "priority",
  "assignee",
  "fixVersions",
  "timetracking",
]);

export function customFieldScalar(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const objectValue = value as Record<string, unknown>;
    for (const key of ["id", "name", "value", "key", "accountId"]) {
      const candidate = objectValue[key];
      if (typeof candidate === "string" || typeof candidate === "number") {
        const trimmed = String(candidate).trim();
        if (trimmed) return trimmed;
      }
    }
  }
  return null;
}

export function matchAllowedValue(field: BulkCreateFieldMetadata, value: unknown) {
  const scalar = customFieldScalar(value);
  if (scalar === null) return undefined;
  return field.allowedValues?.find(
    (allowed) => allowed.id === scalar || allowed.name === scalar || allowed.value === scalar
  );
}

export function isAllowedCustomFieldValue(field: BulkCreateFieldMetadata, val: unknown): boolean {
  if (!field.allowedValues || field.allowedValues.length === 0) return true;
  const entries = Array.isArray(val) ? val : [val];
  for (const entry of entries) {
    if (entry === null || entry === undefined || entry === "") continue;
    const scalar = customFieldScalar(entry);
    if (!scalar) return false;
    const matched = field.allowedValues.find(
      (v) => v.id === scalar || v.name === scalar || v.value === scalar
    );
    if (!matched) return false;
  }
  return true;
}

/**
 * Convert editor-friendly scalar values into the shapes expected by Jira REST v2.
 */
export function normalizeJiraCustomFieldValue(
  field: BulkCreateFieldMetadata | undefined,
  value: unknown
): unknown {
  if (!field || value === undefined || value === null || value === "") return value;

  const normalizeReference = (entry: unknown, referenceType?: string): unknown => {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) return entry;
    const scalar = customFieldScalar(entry);
    if (scalar === null) return entry;
    const allowed = matchAllowedValue(field, entry);
    if (referenceType === "user" || referenceType === "group") {
      return { name: allowed?.name ?? allowed?.value ?? scalar };
    }
    return { id: allowed?.id ?? scalar };
  };

  const isMultiUser =
    (field.schemaType === "array" && (field.schemaItems === "user" || field.schemaCustom?.includes("user"))) ||
    Boolean(field.schemaCustom?.includes(":multiuserpicker"));

  const isMultiGroup =
    (field.schemaType === "array" && (field.schemaItems === "group" || field.schemaCustom?.includes("group"))) ||
    Boolean(field.schemaCustom?.includes(":multigrouppicker"));

  const isMultiVersion =
    (field.schemaType === "array" && (field.schemaItems === "version" || field.schemaCustom?.includes("version") || field.schemaSystem === "versions")) ||
    Boolean(field.schemaCustom?.includes(":multiversion"));

  const isArray = field.schemaType === "array" || isMultiUser || isMultiGroup || isMultiVersion;

  if (isArray) {
    let rawEntries: unknown[];
    if (Array.isArray(value)) {
      rawEntries = value;
    } else if (typeof value === "string") {
      rawEntries = value.trim() ? [value.trim()] : [];
    } else {
      rawEntries = [value];
    }
    const filtered = rawEntries.filter((e) => e !== null && e !== undefined && e !== "");
    if (filtered.length === 0) return [];

    if (field.schemaItems === "string" && !isMultiUser && !isMultiGroup) {
      return filtered.map((entry) => String(entry));
    }
    if (isMultiUser || field.schemaItems === "user") {
      return filtered.map((entry) => normalizeReference(entry, "user"));
    }
    if (isMultiGroup || field.schemaItems === "group") {
      return filtered.map((entry) => normalizeReference(entry, "group"));
    }
    if (
      isMultiVersion ||
      field.schemaItems === "version" ||
      field.schemaItems === "component" ||
      field.schemaItems === "option" ||
      field.schemaCustom?.includes("multiselect") ||
      field.schemaCustom?.includes("multicheckboxes") ||
      field.schemaItems ||
      (field.allowedValues && field.allowedValues.length > 0)
    ) {
      return filtered.map((entry) => normalizeReference(entry));
    }
    return filtered;
  }

  // Single references:
  if (field.schemaType === "user" || field.schemaCustom?.includes(":userpicker")) {
    return normalizeReference(value, "user");
  }
  if (field.schemaType === "group" || field.schemaCustom?.includes(":grouppicker")) {
    return normalizeReference(value, "group");
  }
  if (
    ["option", "version", "component", "project", "issuetype"].includes(field.schemaType ?? "") ||
    field.schemaCustom?.includes(":select") ||
    field.schemaCustom?.includes(":version") ||
    field.schemaCustom?.includes(":radiobuttons") ||
    (field.allowedValues && field.allowedValues.length > 0 && field.schemaType !== "string")
  ) {
    return normalizeReference(value);
  }

  return value;
}

export interface CustomFieldValidationResult {
  customFields: Record<string, unknown>;
  errors: BulkCreateValidationError[];
}

/**
 * Validates and normalizes custom fields for an issue type against project metadata.
 * Reports missing required custom fields and invalid custom field values.
 */
export function validateAndNormalizeCustomFields(
  issueTypeId: string | undefined,
  rawCustomFields: Record<string, unknown> | undefined,
  meta: BulkCreateProjectMetadata
): CustomFieldValidationResult {
  const customFields: Record<string, unknown> = {};
  const errors: BulkCreateValidationError[] = [];

  if (!issueTypeId || !meta.fieldsByIssueType[issueTypeId]) {
    // If no metadata for this issue type, retain whatever custom fields were supplied if any
    if (rawCustomFields) {
      for (const [k, v] of Object.entries(rawCustomFields)) {
        if (v !== undefined && v !== null && v !== "") {
          customFields[k] = v;
        }
      }
    }
    return { customFields, errors };
  }

  const issueTypeFields = meta.fieldsByIssueType[issueTypeId];
  const requiredFields = issueTypeFields.filter((f) => f.required);

  for (const reqField of requiredFields) {
    if (SYSTEM_FIELD_IDS.has(reqField.id)) continue;
    if (meta.pointsFieldId && reqField.id === meta.pointsFieldId) continue;

    const customValue = rawCustomFields?.[reqField.id];
    if (customValue !== undefined && customValue !== null && customValue !== "") {
      customFields[reqField.id] = normalizeJiraCustomFieldValue(reqField, customValue);
      if (!isAllowedCustomFieldValue(reqField, customValue)) {
        errors.push({
          field: reqField.id,
          code: "FIELD_VALUE_NOT_ALLOWED",
          message: `Giá trị cho "${reqField.name}" không nằm trong danh sách được phép`,
        });
      }
    } else {
      errors.push({
        field: reqField.id,
        code: "REQUIRED_CUSTOM_FIELD_MISSING",
        message: `Trường bắt buộc "${reqField.name}" (${reqField.id}) chưa có dữ liệu`,
      });
    }
  }

  // Also validate and normalize non-required custom fields that have values
  if (rawCustomFields) {
    for (const [fieldId, val] of Object.entries(rawCustomFields)) {
      if (val === undefined || val === null || val === "") continue;
      if (fieldId in customFields) continue; // already validated above

      const fieldDef = issueTypeFields.find((f) => f.id === fieldId);
      customFields[fieldId] = normalizeJiraCustomFieldValue(fieldDef, val);
      if (fieldDef && !isAllowedCustomFieldValue(fieldDef, val)) {
        errors.push({
          field: fieldId,
          code: "FIELD_VALUE_NOT_ALLOWED",
          message: `Giá trị cho "${fieldDef.name}" không nằm trong danh sách được phép`,
        });
      }
    }
  }

  return { customFields, errors };
}
