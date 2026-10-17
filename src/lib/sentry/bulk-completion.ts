import { prisma } from "@/lib/prisma";
import type { BulkCreateSource } from "@/lib/bulk/create-types";

// Rows in these states have not been filed by the sentry-import worker yet, so a
// bulk op created from the single-issue Sentry form may claim them.
const OPEN_SENTRY_STATES = ["review", "pending", "rejected"] as const;
const FAILED_ITEM_STATUSES = new Set(["failed", "blocked", "blocked_by_parent"]);

/**
 * Reflect the outcome of a Sentry-sourced bulk create operation onto its
 * SentryIssueImported row. No-op for any other source.
 */
export async function markSentryRowFromBulkOp(operationId: string): Promise<void> {
  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    select: {
      payload: true,
      createItems: {
        select: { status: true, jiraKey: true, error: true, errorCode: true },
        orderBy: { rowIndex: "asc" },
      },
    },
  });
  if (!op) return;

  const source = (op.payload as { source?: BulkCreateSource } | null)?.source;
  if (source?.type !== "sentry" || !source.sentryImportId) return;
  const where = { id: source.sentryImportId, state: { in: [...OPEN_SENTRY_STATES] } };

  const created = op.createItems.find((item) => item.status === "succeeded" && item.jiraKey);
  if (created?.jiraKey) {
    await prisma.sentryIssueImported.updateMany({
      where,
      data: {
        state: "created",
        jiraKey: created.jiraKey,
        importedAt: new Date(),
        lastError: null,
      },
    });
    return;
  }

  const failed = op.createItems.find((item) => FAILED_ITEM_STATUSES.has(item.status));
  if (failed) {
    await prisma.sentryIssueImported.updateMany({
      where,
      data: { lastError: failed.error || failed.errorCode || "Tạo task Jira thất bại" },
    });
  }
}
