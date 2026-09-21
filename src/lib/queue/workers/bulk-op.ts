import { executeBulkOperation } from "@/lib/bulk/ops";

/**
 * M4-03 — Worker entrypoint for a single bulk operation. Reads the operation
 * from the database (not from job data) so a retry always reflects the latest
 * state, and processes only items that are still pending.
 */
export async function runBulkOperation(operationId: string): Promise<void> {
  if (!operationId) return;
  await executeBulkOperation(operationId);
}
