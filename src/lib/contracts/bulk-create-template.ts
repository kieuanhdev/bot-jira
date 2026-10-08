export type BulkCreateTemplateRow = {
  summary: string;
  description?: string;
  issueTypeId?: string;
  issueTypeName?: string;
  assignee?: string | null;
  assigneeDisplayName?: string;
  priorityId?: string;
  priorityName?: string;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string;
  dueDate?: string | null;
  fixVersionIds?: string[];
  fixVersionNames?: string[];
  customFields?: Record<string, unknown>;
  /** Fields that were skipped because they are not valid for create. */
  skippedFields?: Array<{ field: string; reason: string }>;
  /** Whether the source issue is a sub-task. */
  sourceIsSubtask?: boolean;
  /** Parent Jira key if the source issue is a sub-task. */
  parentKey?: string;
  /** Parent issue summary. */
  parentSummary?: string;
  /** Parent issue type ID. */
  parentIssueTypeId?: string;
  /** Parent issue type name. */
  parentIssueTypeName?: string;
  /** Full parent template row if user wants to import both parent and subtask into the batch. */
  parentTemplate?: BulkCreateTemplateRow;
};

export type BulkCreateTemplateIssueItem = {
  key: string;
  summary: string;
  issueTypeId: string;
  issueTypeName: string;
  isSubtask: boolean;
  parentKey?: string;
  parentSummary?: string;
  status: string;
  assignee?: string;
  updated?: string;
};

export type BulkCreateTemplateDetailResponse = {
  template: BulkCreateTemplateRow;
};

export type BulkCreateTemplateSearchResponse = {
  issues: BulkCreateTemplateIssueItem[];
};
