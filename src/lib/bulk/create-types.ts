/**
 * Domain types for Bulk Create Jira Tasks.
 * Aligned with docs/BULK_CREATE_IMPLEMENTATION_PLAN.md.
 */

export const MAX_BULK_CREATE_ITEMS = 100;
export const MAX_DESCRIPTION_LENGTH = 32768;
export const MAX_SUMMARY_LENGTH = 255;
export const MAX_LABEL_LENGTH = 50;
export const MAX_LABELS_COUNT = 20;

export type BulkCreateItemStatus =
  | "ready"
  | "blocked"
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type BulkCreateFieldDefaults = {
  issueTypeId?: string;
  assignee?: string | null;
  priorityId?: string;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string;
  dueDate?: string | null;
  fixVersionIds?: string[];
  description?: string;
};

export type BulkCreateRowInput = {
  clientRef: string;
  summary: string;
  issueTypeId?: string;
  description?: string;
  assignee?: string | null;
  priorityId?: string;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string;
  dueDate?: string | null;
  fixVersionIds?: string[];
};

export type BulkCreateRequest = {
  projectKey: string;
  defaults?: BulkCreateFieldDefaults;
  items: BulkCreateRowInput[];
  metadataFingerprint?: string;
  source?: {
    type: "grid" | "paste" | "csv";
    fileName?: string | null;
  };
};

export type CanonicalCreateItem = {
  clientRef: string;
  summary: string;
  issueTypeId: string;
  description?: string;
  assignee?: string | null;
  priorityId?: string;
  labels: string[];
  points?: number | null;
  originalEstimate?: string;
  originalEstimateSeconds?: number;
  dueDate?: string | null;
  fixVersionIds: string[];
};

export type BulkCreateValidationWarning = {
  field?: string;
  message: string;
  code?: string;
};

export type BulkCreateValidationError = {
  field?: string;
  message: string;
  code: string;
};

export type BulkCreatePreviewItem = {
  rowIndex: number;
  clientRef: string;
  summary: string;
  classification: "ready" | "blocked";
  warnings: BulkCreateValidationWarning[];
  errors: BulkCreateValidationError[];
  normalizedFields: Partial<CanonicalCreateItem>;
  existingDuplicateKey?: string;
};

export type BulkCreatePreviewResult = {
  operationId: string;
  type: "create-issues";
  total: number;
  actionable: number;
  blocked: number;
  metadataFingerprint: string;
  items: BulkCreatePreviewItem[];
};

export type BulkCreateConfirmRequest = {
  confirm: true;
  operationId: string;
};

export type BulkCreateProjectMetadata = {
  project: {
    key: string;
    name: string;
    id?: string;
  };
  canCreate: boolean;
  permissionReason?: string;
  issueTypes: Array<{
    id: string;
    name: string;
    subtask: boolean;
    description?: string;
    iconUrl?: string;
  }>;
  fieldsByIssueType: Record<
    string,
    Array<{
      id: string;
      name: string;
      required: boolean;
      schemaType?: string;
      allowedValues?: Array<{ id: string; name?: string; value?: string }>;
    }>
  >;
  priorityOptions: Array<{ id: string; name: string }>;
  versionOptions: Array<{ id: string; name: string; archived?: boolean; released?: boolean }>;
  pointsFieldId: string | null;
  supportsTimeTracking: boolean;
  supportsDueDate: boolean;
  fetchedAt: string;
  fingerprint: string;
};
