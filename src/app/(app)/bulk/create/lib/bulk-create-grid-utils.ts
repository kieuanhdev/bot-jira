import type {
  BulkCreateFieldDefaults,
  BulkCreateProjectMetadata,
  BulkCreateRowInput,
} from "@/lib/bulk/create-types";

/**
 * Returns human-friendly display name and inheritance status for a row's effective issue type.
 */
export function getEffectiveIssueTypeName(
  row: BulkCreateRowInput,
  defaults: BulkCreateFieldDefaults,
  metadata: BulkCreateProjectMetadata
): { name: string; isInherited: boolean } | null {
  if (row.issueTypeId) {
    const found = metadata.issueTypes.find((t) => t.id === row.issueTypeId);
    return found
      ? { name: found.subtask ? `⚡ ${found.name}` : found.name, isInherited: false }
      : null;
  }
  if (defaults.issueTypeId) {
    const found = metadata.issueTypes.find((t) => t.id === defaults.issueTypeId);
    return found
      ? {
          name: found.subtask ? `⚡ ${found.name} (mặc định)` : `${found.name} (mặc định)`,
          isInherited: true,
        }
      : null;
  }
  if (metadata.defaultIssueTypeId) {
    const found = metadata.issueTypes.find((t) => t.id === metadata.defaultIssueTypeId);
    return found
      ? {
          name: found.subtask
            ? `⚡ ${found.name} (Jira mặc định)`
            : `${found.name} (Jira mặc định)`,
          isInherited: true,
        }
      : null;
  }
  return null;
}
