import type { ImportState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BulkCreateRequest, BulkCreateRowInput, BulkCreateSource } from "@/lib/bulk/create-types";
import type { confirmBulkCreate } from "@/lib/bulk/create-ops";
import { sentryLabel } from "./idempotency";

// Single-issue Sentry form: a reviewed Sentry row is filed as a one-row bulk
// create op (preview -> confirm -> bulk worker) using the admin's Jira token.
// The row keeps its open state while the op runs; `markSentryRowFromBulkOp`
// moves it to `created` once the item succeeds.

/** Rows the sentry-import worker has not filed yet (it only files `approved`/`failed`). */
export const OPEN_SENTRY_STATES: ImportState[] = ["review", "pending", "rejected"];

/**
 * Op states that count as "a task is being created" for a Sentry row. Only
 * confirmed ops count: a `preview` op that was never confirmed must not block
 * the row forever, and terminal ops either created the issue (the row is then
 * `created`) or failed (a retry is allowed).
 */
export const INFLIGHT_OP_STATES = ["queued", "running"] as const;

export const SENTRY_SINGLE_CLIENT_REF = "single-1";

export const MSG_NOT_OPEN = "Lỗi này không còn ở trạng thái chờ duyệt";
export const MSG_INFLIGHT = "Task cho lỗi này đang được tạo";
export const MSG_NO_PROJECT = "Chưa map project Jira cho Sentry project này";
export const MSG_OP_MISMATCH = "Thao tác không thuộc về lỗi Sentry này";
export const MSG_NOT_FOUND = "Không tìm thấy lỗi Sentry";

export type SentryFormRow = { id: string; sentryIssueId: string; targetProject: string | null };

/**
 * Build the one-row bulk request for a Sentry row. Project, clientRef, source
 * and the two Sentry labels are forced; the labels let the sentry-import worker
 * relink (not duplicate) the issue if the row is later approved in bulk.
 */
export function buildSentryBulkRequest(
  row: BulkCreateRowInput,
  sentry: SentryFormRow
): BulkCreateRequest | { error: string } {
  if (!sentry.targetProject) return { error: MSG_NO_PROJECT };
  const labels = [
    ...new Set([...(row.labels ?? []), "sentry", sentryLabel({ id: sentry.sentryIssueId })]),
  ];
  return {
    projectKey: sentry.targetProject,
    items: [{ ...row, clientRef: SENTRY_SINGLE_CLIENT_REF, labels }],
    source: { type: "sentry", sentryImportId: sentry.id },
  };
}

/**
 * True when a confirmed (queued/running) bulk op already targets this Sentry
 * row. `excludeOperationId` skips the op being confirmed right now.
 */
// A queued/running op confirmed longer ago than this is treated as stuck (e.g.
// enqueue failed) so it cannot block the Sentry row forever.
export const INFLIGHT_OP_MAX_AGE_MS = 15 * 60_000;

export async function hasInflightSentryOp(
  sentryImportId: string,
  excludeOperationId?: string,
  client: Pick<typeof prisma, "bulkOperation"> = prisma
): Promise<boolean> {
  const since = new Date(Date.now() - INFLIGHT_OP_MAX_AGE_MS);
  const op = await client.bulkOperation.findFirst({
    where: {
      type: "create-issues",
      state: { in: [...INFLIGHT_OP_STATES] },
      AND: [
        {
          OR: [{ startedAt: { gte: since } }, { startedAt: null, createdAt: { gte: since } }],
        },
        {
          OR: [
            { payload: { path: ["source", "sentryImportId"], equals: sentryImportId } },
            { payload: { path: ["source", "sentryImportIds"], array_contains: sentryImportId } },
          ],
        },
      ],
      ...(excludeOperationId ? { id: { not: excludeOperationId } } : {}),
    },
    select: { id: true },
  });
  return op !== null;
}

/** The Sentry row ids a bulk op was created for, or empty array when it is not a Sentry op. */
export function sentryImportIdsOfPayload(payload: unknown): string[] {
  const source = (payload as { source?: BulkCreateSource } | null)?.source;
  if (source?.type !== "sentry") return [];
  if (Array.isArray(source.sentryImportIds)) {
    return source.sentryImportIds.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  if (typeof source.sentryImportId === "string" && source.sentryImportId.length > 0) {
    return [source.sentryImportId];
  }
  return [];
}

/** The Sentry row id a bulk op was created for, or null when it is not a Sentry op. */
export function sentryImportIdOfPayload(payload: unknown): string | null {
  const ids = sentryImportIdsOfPayload(payload);
  return ids[0] ?? null;
}

type ConfirmResult = Awaited<ReturnType<typeof confirmBulkCreate>>;

export type SentryConfirmGuardResult =
  | { ok: true; result: ConfirmResult }
  | { ok: false; status: number; error: string };

/**
 * Confirm a Sentry-sourced preview op exactly once per row(s).
 *
 * All rows are locked (`SELECT ... FOR UPDATE` sorted by id ASC) for the whole
 * check-and-confirm, preventing deadlocks between concurrent reviewers.
 * Any row that is already filed/queued causes 409.
 */
export async function confirmSentryCreate(opts: {
  sentryImportId?: string;
  sentryImportIds?: string[];
  operationId: string;
  reviewer: string;
  confirm: (operationId: string) => Promise<ConfirmResult>;
}): Promise<SentryConfirmGuardResult> {
  const { operationId, reviewer, confirm } = opts;
  const rawIds =
    opts.sentryImportIds && opts.sentryImportIds.length > 0
      ? opts.sentryImportIds
      : opts.sentryImportId
        ? [opts.sentryImportId]
        : [];
  const ids = [...new Set(rawIds.map((id) => id.trim()))].filter(Boolean);
  if (ids.length === 0) {
    return { ok: false, status: 400, error: "Thiếu sentryImportId" };
  }

  const op = await prisma.bulkOperation.findUnique({
    where: { id: operationId },
    select: { payload: true },
  });
  if (op) {
    const opIds = sentryImportIdsOfPayload(op.payload);
    const sortedExpected = [...ids].sort();
    const sortedActual = [...opIds].sort();
    const matches =
      sortedExpected.length === sortedActual.length &&
      sortedExpected.every((id, idx) => id === sortedActual[idx]);
    if (!matches) {
      return { ok: false, status: 400, error: MSG_OP_MISMATCH };
    }
  }

  const sortedIds = [...ids].sort();

  return prisma.$transaction(
    async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; state: ImportState }[]>`
        SELECT "id", "state" FROM "SentryIssueImported"
        WHERE "id" = ANY(${sortedIds}::text[])
        ORDER BY "id" ASC
        FOR UPDATE`;

      if (locked.length !== sortedIds.length) {
        return { ok: false as const, status: 404, error: MSG_NOT_FOUND };
      }

      for (const row of locked) {
        if (!OPEN_SENTRY_STATES.includes(row.state)) {
          return { ok: false as const, status: 409, error: MSG_NOT_OPEN };
        }
      }

      for (const id of sortedIds) {
        if (await hasInflightSentryOp(id, operationId, tx)) {
          return { ok: false as const, status: 409, error: MSG_INFLIGHT };
        }
      }

      const result = await confirm(operationId);
      // State is left alone: the bulk executor moves the row to `created`.
      await tx.sentryIssueImported.updateMany({
        where: { id: { in: sortedIds }, state: { in: OPEN_SENTRY_STATES } },
        data: { reviewedBy: reviewer, reviewedAt: new Date() },
      });
      return { ok: true as const, result };
    },
    { timeout: 20_000 }
  );
}
