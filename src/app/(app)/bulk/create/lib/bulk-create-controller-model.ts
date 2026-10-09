import type { BulkCreateRowInput, BulkCreateFieldDefaults } from "@/lib/bulk/create-types";

export function createInitialRows(count = 3): BulkCreateRowInput[] {
  return Array.from({ length: count }, (_, idx) => ({
    clientRef: `row-${idx + 1}`,
    summary: "",
  }));
}

export function filterFilledItems(items: BulkCreateRowInput[]): BulkCreateRowInput[] {
  return items.filter((i) => i.summary.trim().length > 0);
}

export function countFilledItems(items: BulkCreateRowInput[]): number {
  return filterFilledItems(items).length;
}

export function hasDraftContent(
  items: BulkCreateRowInput[],
  defaults: BulkCreateFieldDefaults = {}
): boolean {
  const hasItemContent = items.some((i) => Boolean(i.summary && i.summary.trim().length > 0));
  const hasDefaults = Object.keys(defaults).length > 0;
  return hasItemContent || hasDefaults;
}

export function filterDiscardBlockedRows(
  items: BulkCreateRowInput[],
  previewItems: Array<{ rowIndex: number; classification: string }>
): BulkCreateRowInput[] {
  const blockedIndices = new Set(
    previewItems.filter((i) => i.classification === "blocked").map((i) => i.rowIndex)
  );
  if (blockedIndices.size === 0) return items;

  const remaining = items.filter((_, idx) => !blockedIndices.has(idx));
  return remaining.length > 0 ? remaining : createInitialRows(3);
}

export function sanitizeItemsForProjectChange(
  items: BulkCreateRowInput[]
): BulkCreateRowInput[] {
  return items.map((item) => ({
    clientRef: item.clientRef,
    summary: item.summary,
    description: item.description,
    assignee: item.assignee,
    originalEstimate: item.originalEstimate,
    dueDate: item.dueDate,
    points: item.points,
    labels: item.labels,
    issueTypeId: undefined,
    priorityId: undefined,
    fixVersionIds: undefined,
  }));
}
