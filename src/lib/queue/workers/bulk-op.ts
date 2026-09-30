import { executeBulkOperation } from "@/lib/bulk/ops";
import { executeBulkCreateOperation } from "@/lib/bulk/create-ops";
import { prisma } from "@/lib/prisma";

/**
 * M4-03 — Worker entrypoint for a single bulk operation. Reads the operation
 * from the database (not from job data) so a retry always reflects the latest
 * state, and processes only items that are still pending.
 */
export async function runBulkOperation(operationId: string): Promise<void> {
  if (!operationId) return;
  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    select: { type: true },
  });
  if (!op) return;

  if (op.type === "create-issues") {
    await executeBulkCreateOperation(operationId);
  } else {
    await executeBulkOperation(operationId);
  }
}
