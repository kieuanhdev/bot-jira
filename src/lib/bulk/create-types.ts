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
  | "cancelled"
  | "waiting_for_parent"
  | "blocked_by_parent";

export type BulkParentRef =
  | { type: "batch"; clientRef: string }
  | { type: "jira"; jiraKey: string };

export type BulkCreateFieldDefaults = {
  issueTypeId?: string;
  assignee?: string | null;
  priorityId?: string;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string;
  dueDate?: string | null;
  fixVersionIds?: string[];
  componentIds?: string[];
  description?: string;
  customFields?: Record<string, unknown>;
};

export type BulkCreateRowInput = {
  clientRef: string;
  summary: string;
  issueTypeId?: string;
  parent?: BulkParentRef | null;
  description?: string;
  assignee?: string | null;
  priorityId?: string;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string;
  dueDate?: string | null;
  fixVersionIds?: string[];
  componentIds?: string[];
  customFields?: Record<string, unknown>;
};

export type BulkCreateRequest = {
  projectKey: string;
  defaults?: BulkCreateFieldDefaults;
  items: BulkCreateRowInput[];
  metadataFingerprint?: string;
  source?: {
    type: "grid" | "paste" | "csv" | "excel";
    fileName?: string | null;
  };
};

export type CanonicalCreateItem = {
  clientRef: string;
  summary: string;
  issueTypeId: string;
  isSubtask: boolean;
  parent?: {
    type: "batch" | "jira";
    clientRef?: string;
    jiraKey?: string;
  } | null;
  description?: string;
  assignee?: string | null;
  priorityId?: string;
  labels: string[];
  points?: number | null;
  originalEstimate?: string;
  originalEstimateSeconds?: number;
  dueDate?: string | null;
  fixVersionIds: string[];
  componentIds: string[];
  customFields?: Record<string, unknown>;
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
  metrics?: {
    durationMs: number;
    isSlow?: boolean;
    blockedByErrorCode?: Record<string, number>;
  };
};

export type BulkCreateConfirmRequest = {
  confirm: true;
  operationId: string;
};

export type BulkCreateFieldCapability = {
  /** Whether the field value is available from metadata. */
  available: boolean;
  /** Human-readable reason when unavailable. */
  reason?: string;
};

export type BulkCreateFieldMetadata = {
  id: string;
  name: string;
  required: boolean;
  schemaType?: string;
  schemaItems?: string;
  schemaCustom?: string;
  schemaSystem?: string;
  allowedValues?: Array<{ id: string; name?: string; value?: string }>;
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
  fieldsByIssueType: Record<string, BulkCreateFieldMetadata[]>;
  priorityOptions: Array<{ id: string; name: string }>;
  versionOptions: Array<{ id: string; name: string; archived?: boolean; released?: boolean }>;
  components?: Array<{ id: string; name: string; description?: string }>;
  pointsFieldId: string | null;
  epicLinkFieldId?: string | null;
  supportsTimeTracking: boolean;
  supportsDueDate: boolean;
  /** Whether the project has any sub-task issue types. */
  hasSubtaskTypes: boolean;
  /** Default issue type ID from Jira metadata (if provided). */
  defaultIssueTypeId: string | null;
  /** Default sub-task type ID (if determinable). */
  defaultSubtaskTypeId: string | null;
  /** Whether the project allows unassigned issues. */
  allowsUnassigned: boolean;
  /** Field capability flags for UI rendering. */
  fieldCapabilities: {
    priority: BulkCreateFieldCapability;
    fixVersions: BulkCreateFieldCapability;
    points: BulkCreateFieldCapability;
    components?: BulkCreateFieldCapability;
  };
  fetchedAt: string;
  fingerprint: string;
};
