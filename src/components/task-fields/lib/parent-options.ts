import type { BulkCreateRowInput } from "@/lib/bulk/create-types";

export type ParentCandidate = {
  clientRef: string;
  summary?: string;
};

export const MIN_PARENT_QUERY_LENGTH = 2;
export const MAX_BATCH_PARENT_OPTIONS = 10;

export function filterBatchParentCandidates(args: {
  candidates: ParentCandidate[];
  batchItems?: BulkCreateRowInput[];
  query: string;
  currentClientRef?: string;
  subtaskIssueTypeIds?: Set<string>;
}): ParentCandidate[] {
  const { candidates, batchItems = [], currentClientRef = "", subtaskIssueTypeIds } = args;
  const q = args.query.trim().toLowerCase();
  if (q.length < MIN_PARENT_QUERY_LENGTH) return [];

  const subtaskRefs = new Set<string>();
  if (subtaskIssueTypeIds && subtaskIssueTypeIds.size > 0) {
    for (const item of batchItems) {
      if (item.issueTypeId && subtaskIssueTypeIds.has(item.issueTypeId)) subtaskRefs.add(item.clientRef);
    }
  }

  return candidates
    .filter((item) => {
      if (item.clientRef === currentClientRef) return false;
      const ref = (item.clientRef || "").trim();
      if (!ref || subtaskRefs.has(item.clientRef)) return false;
      return ref.toLowerCase().includes(q) || (item.summary || "").toLowerCase().includes(q);
    })
    .slice(0, MAX_BATCH_PARENT_OPTIONS);
}
