/**
 * Helpers for generating and guaranteeing unique clientRef identifiers in bulk create batches.
 */

import { type BulkCreateRowInput } from "./create-types";

/**
 * Generate a unique clientRef not already present in existingRefs.
 * Format: `${prefix}-${number}`
 */
export function generateUniqueClientRef(
  existingRefs: Set<string>,
  prefix = "row"
): string {
  let counter = 1;
  let candidate = `${prefix}-${counter}`;
  while (existingRefs.has(candidate)) {
    counter++;
    candidate = `${prefix}-${counter}`;
  }
  existingRefs.add(candidate);
  return candidate;
}

/**
 * Ensure all items have unique clientRef values.
 * - Missing clientRef values are generated as row-1, row-2, etc.
 * - Duplicate clientRef values are deduplicated by appending -2, -3, etc.
 */
export function ensureUniqueClientRefs(
  items: BulkCreateRowInput[],
  existingRefs?: Set<string>
): BulkCreateRowInput[] {
  const seen = new Set<string>(existingRefs ?? []);
  const result: BulkCreateRowInput[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    let ref = item.clientRef?.trim();

    if (!ref) {
      ref = generateUniqueClientRef(seen, "row");
    } else if (seen.has(ref)) {
      // Deduplicate existing ref
      let dupIndex = 2;
      let newRef = `${ref}-${dupIndex}`;
      while (seen.has(newRef)) {
        dupIndex++;
        newRef = `${ref}-${dupIndex}`;
      }
      ref = newRef;
      seen.add(ref);
    } else {
      seen.add(ref);
    }

    result.push({
      ...item,
      clientRef: ref,
    });
  }

  return result;
}

/**
 * Remove completely blank placeholder items (items with empty summary and no other content).
 */
export function filterBlankPlaceholderItems(
  items: BulkCreateRowInput[]
): BulkCreateRowInput[] {
  return items.filter((item) => {
    const hasSummary = Boolean(item.summary?.trim());
    const hasDescription = Boolean(item.description?.trim());
    const hasAssignee = Boolean(item.assignee?.trim());
    const hasIssueType = Boolean(item.issueTypeId?.trim());
    const hasLabels = Boolean(item.labels && item.labels.length > 0);
    const hasPoints = item.points !== undefined && item.points !== null;
    const hasEstimate = Boolean(item.originalEstimate?.trim());
    const hasDueDate = Boolean(item.dueDate?.trim());
    const hasFixVersions = Boolean(item.fixVersionIds && item.fixVersionIds.length > 0);

    return (
      hasSummary ||
      hasDescription ||
      hasAssignee ||
      hasIssueType ||
      hasLabels ||
      hasPoints ||
      hasEstimate ||
      hasDueDate ||
      hasFixVersions
    );
  });
}
