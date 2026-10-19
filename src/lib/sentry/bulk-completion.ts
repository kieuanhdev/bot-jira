import { prisma } from "@/lib/prisma";
import type { BulkCreateSource } from "@/lib/bulk/create-types";
import { sentryImportIdsOfPayload } from "./create-from-form";

// Rows in these states have not been filed by the sentry-import worker yet, so a
// bulk op created from the Sentry form or bulk create may claim them.
const OPEN_SENTRY_STATES = ["review", "pending", "rejected"] as const;
const FAILED_ITEM_STATUSES = new Set(["failed", "blocked", "blocked_by_parent"]);

function sentryIdForItem(clientRef: string | undefined | null, source: BulkCreateSource): string | null {
  if (clientRef && clientRef.startsWith("sentry-")) {
    return clientRef.slice("sentry-".length);
  }
  if (source.type === "sentry" && source.sentryImportId) {
    return source.sentryImportId;
  }
  return null;
}

/**
 * Reflect the outcome of a Sentry-sourced bulk create operation onto its
 * SentryIssueImported row(s). No-op for any other source.
 */
export async function markSentryRowFromBulkOp(operationId: string): Promise<void> {
  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    select: {
      payload: true,
      createItems: {
        select: { clientRef: true, status: true, jiraKey: true, error: true, errorCode: true },
        orderBy: { rowIndex: "asc" },
      },
    },
  });
  if (!op) return;

  const source = (op.payload as { source?: BulkCreateSource } | null)?.source;
  if (source?.type !== "sentry") return;

  const validIds = new Set(sentryImportIdsOfPayload(op.payload));
  if (validIds.size === 0) return;

  for (const item of op.createItems) {
    const rowId = sentryIdForItem(item.clientRef, source);
    if (!rowId || !validIds.has(rowId)) continue;

    const where = { id: rowId, state: { in: [...OPEN_SENTRY_STATES] } };

    if (item.status === "succeeded" && item.jiraKey) {
      await prisma.sentryIssueImported.updateMany({
        where,
        data: {
          state: "created",
          jiraKey: item.jiraKey,
          importedAt: new Date(),
          lastError: null,
        },
      });
    } else if (FAILED_ITEM_STATUSES.has(item.status)) {
      if (item.errorCode === "SENTRY_ALREADY_FILED") {
        continue;
      }
      await prisma.sentryIssueImported.updateMany({
        where,
        data: { lastError: item.error || item.errorCode || "Tạo task Jira thất bại" },
      });
    }
  }
}
