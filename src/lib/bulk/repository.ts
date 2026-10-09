import type { Prisma, PrismaClient, BulkOperation, BulkOperationItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const BULK_OPERATION_STATES = [
  "preview",
  "queued",
  "running",
  "completed",
  "partially_failed",
  "failed",
  "cancelled",
] as const;

export type BulkOperationState = (typeof BULK_OPERATION_STATES)[number];

export const TERMINAL_OPERATION_STATES = [
  "completed",
  "partially_failed",
  "failed",
  "cancelled",
] as const;

export type TerminalOperationState = (typeof TERMINAL_OPERATION_STATES)[number];

export function isTerminalOperationState(state: string): boolean {
  return (TERMINAL_OPERATION_STATES as readonly string[]).includes(state);
}

const VALID_STATE_TRANSITIONS: Record<BulkOperationState, readonly BulkOperationState[]> = {
  preview: ["queued", "cancelled"],
  queued: ["running"],
  running: ["completed", "partially_failed", "failed"],
  completed: ["queued"],
  partially_failed: ["queued"],
  failed: ["queued"],
  cancelled: [],
};

export function isValidOperationTransition(
  from: BulkOperationState | string,
  to: BulkOperationState | string
): boolean {
  const allowed = VALID_STATE_TRANSITIONS[from as BulkOperationState];
  if (!allowed) return false;
  return allowed.includes(to as BulkOperationState);
}

export class InvalidOperationTransitionError extends Error {
  constructor(public readonly from: string, public readonly to: string) {
    super(`Invalid bulk operation transition from "${from}" to "${to}"`);
    this.name = "InvalidOperationTransitionError";
  }
}

export function assertValidOperationTransition(
  from: BulkOperationState | string,
  to: BulkOperationState | string
): void {
  if (!isValidOperationTransition(from, to)) {
    throw new InvalidOperationTransitionError(String(from), String(to));
  }
}

export type BulkRepositoryClient = {
  bulkOperation: Pick<
    PrismaClient["bulkOperation"],
    "findUnique" | "create" | "update" | "updateMany"
  >;
  bulkOperationItem: Pick<
    PrismaClient["bulkOperationItem"],
    "findUnique" | "findMany" | "createMany" | "update" | "updateMany" | "groupBy"
  >;
};

export type CreatePreviewOperationItemInput = {
  jiraKey: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  requested: Record<string, unknown> | null;
  status: "pending" | "skipped";
  error: string | null;
};

export type CreatePreviewOperationInput = {
  type: string;
  requestedBy: string;
  payload: Prisma.InputJsonValue;
  total: number;
  items: CreatePreviewOperationItemInput[];
};

export async function createPreviewBulkOperation(
  input: CreatePreviewOperationInput,
  client: BulkRepositoryClient = prisma
): Promise<BulkOperation> {
  const op = await client.bulkOperation.create({
    data: {
      type: input.type,
      requestedBy: input.requestedBy,
      payload: input.payload,
      state: "preview",
      total: input.total,
    },
  });

  await client.bulkOperationItem.createMany({
    data: input.items.map((item) => ({
      operationId: op.id,
      jiraKey: item.jiraKey,
      before: (item.before ?? undefined) as Prisma.InputJsonValue,
      after: (item.after ?? undefined) as Prisma.InputJsonValue,
      requested: (item.requested ?? {}) as Prisma.InputJsonValue,
      status: item.status,
      error: item.error,
    })),
  });

  return op as BulkOperation;
}

export async function findBulkOperationById(
  operationId: string,
  client: BulkRepositoryClient = prisma
): Promise<BulkOperation | null> {
  return (await client.bulkOperation.findUnique({
    where: { id: operationId },
  })) as BulkOperation | null;
}

export async function confirmBulkOperation(
  operationId: string,
  requestedBy: string,
  now: Date = new Date(),
  client: BulkRepositoryClient = prisma
): Promise<{ operationId: string; total: number; actionable: number; skipped: number }> {
  const op = await client.bulkOperation.findUnique({
    where: { id: operationId },
  });
  if (!op || op.requestedBy !== requestedBy) {
    throw new Error("not_found");
  }
  if (op.state !== "preview") {
    throw new Error("already_confirmed");
  }

  const items = await client.bulkOperationItem.findMany({
    where: { operationId },
    select: { status: true },
  });

  const skipped = items.filter((i) => i.status === "skipped").length;
  const actionable = op.total - skipped;

  assertValidOperationTransition(op.state, "queued");

  await client.bulkOperation.update({
    where: { id: op.id },
    data: { state: "queued", startedAt: now },
  });

  return { operationId: op.id, total: op.total, actionable, skipped };
}

export async function cancelBulkOperation(
  operationId: string,
  requestedBy: string,
  client: BulkRepositoryClient = prisma
): Promise<{ cancelled: boolean; count: number }> {
  const res = await client.bulkOperation.updateMany({
    where: { id: operationId, requestedBy, state: "preview" },
    data: { state: "cancelled" },
  });
  return { cancelled: res.count > 0, count: res.count };
}

export type ClaimOperationResult =
  | { claimed: true; operation: BulkOperation }
  | {
      claimed: false;
      operation: BulkOperation | null;
      reason: "not_found" | "terminal" | "not_queued" | "conflict";
    };

export async function claimBulkOperation(
  operationId: string,
  now: Date = new Date(),
  client: BulkRepositoryClient = prisma
): Promise<ClaimOperationResult> {
  const op = await client.bulkOperation.findUnique({ where: { id: operationId } });
  if (!op) {
    return { claimed: false, operation: null, reason: "not_found" };
  }
  if (isTerminalOperationState(op.state)) {
    return { claimed: false, operation: op as BulkOperation, reason: "terminal" };
  }
  if (op.state !== "queued") {
    return { claimed: false, operation: op as BulkOperation, reason: "not_queued" };
  }

  assertValidOperationTransition(op.state, "running");

  const claim = await client.bulkOperation.updateMany({
    where: { id: op.id, state: "queued" },
    data: { state: "running", startedAt: op.startedAt ?? now },
  });

  if (claim.count === 0) {
    return { claimed: false, operation: op as BulkOperation, reason: "conflict" };
  }

  return {
    claimed: true,
    operation: {
      ...op,
      state: "running",
      startedAt: op.startedAt ?? now,
    } as BulkOperation,
  };
}

export async function findPendingBulkOperationItems(
  operationId: string,
  client: BulkRepositoryClient = prisma
): Promise<BulkOperationItem[]> {
  const items = await client.bulkOperationItem.findMany({
    where: { operationId, status: "pending" },
    orderBy: { jiraKey: "asc" },
  });
  return items as BulkOperationItem[];
}

export async function findBulkOperationItemById(
  itemId: string,
  client: BulkRepositoryClient = prisma
): Promise<BulkOperationItem | null> {
  return (await client.bulkOperationItem.findUnique({
    where: { id: itemId },
  })) as BulkOperationItem | null;
}

export async function markBulkOperationItemRunning(
  itemId: string,
  client: BulkRepositoryClient = prisma
): Promise<void> {
  await client.bulkOperationItem.update({
    where: { id: itemId },
    data: { status: "running" },
  });
}

export type RecordItemResultInput = {
  status: "succeeded" | "failed" | "skipped";
  error?: string | null;
  retryable?: boolean;
  attempts?: number;
  after?: Record<string, unknown> | null;
};

export async function recordBulkOperationItemResult(
  itemId: string,
  result: RecordItemResultInput,
  client: BulkRepositoryClient = prisma
): Promise<void> {
  await client.bulkOperationItem.update({
    where: { id: itemId },
    data: {
      status: result.status,
      error: result.error ?? null,
      retryable: result.retryable ?? false,
      ...(result.attempts !== undefined ? { attemptCount: { increment: result.attempts } } : {}),
      after: (result.after ?? undefined) as Prisma.InputJsonValue,
    },
  });
}

export type FinalizeOperationSummary = {
  operationId: string;
  state: BulkOperationState;
  succeeded: number;
  failed: number;
  skipped: number;
  stillPending: number;
  terminal: boolean;
};

export async function finalizeBulkOperation(
  operationId: string,
  now: Date = new Date(),
  client: BulkRepositoryClient = prisma
): Promise<FinalizeOperationSummary | null> {
  const op = await client.bulkOperation.findUnique({ where: { id: operationId } });
  if (!op) return null;

  const counts = await client.bulkOperationItem.groupBy({
    by: ["status"],
    where: { operationId },
    _count: { _all: true },
  });

  const byStatus: Record<string, number> = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all])
  );
  const succeeded = byStatus.succeeded ?? 0;
  const failed = byStatus.failed ?? 0;
  const skipped = byStatus.skipped ?? 0;
  const stillPending = (byStatus.pending ?? 0) + (byStatus.running ?? 0);
  const terminal = stillPending === 0;

  const nextState: BulkOperationState = !terminal
    ? (op.state as BulkOperationState)
    : failed === 0
      ? "completed"
      : "partially_failed";

  if (terminal) {
    assertValidOperationTransition(op.state, nextState);
  }

  await client.bulkOperation.update({
    where: { id: op.id },
    data: {
      state: nextState,
      succeeded,
      failed,
      completedAt: terminal ? now : undefined,
    },
  });

  return {
    operationId: op.id,
    state: nextState,
    succeeded,
    failed,
    skipped,
    stillPending,
    terminal,
  };
}

export async function resetFailedItemsForRetry(
  operationId: string,
  itemIds?: string[],
  client: BulkRepositoryClient = prisma
): Promise<number> {
  const whereClause: {
    operationId: string;
    status: string;
    retryable: boolean;
    id?: { in: string[] };
  } = {
    operationId,
    status: "failed",
    retryable: true,
  };
  if (Array.isArray(itemIds) && itemIds.length > 0) {
    whereClause.id = { in: itemIds };
  }
  const retried = await client.bulkOperationItem.updateMany({
    where: whereClause,
    data: { status: "pending", error: null, retryable: true },
  });
  return retried.count;
}

export async function requeueBulkOperationForRetry(
  operationId: string,
  now: Date = new Date(),
  client: BulkRepositoryClient = prisma
): Promise<void> {
  const op = await client.bulkOperation.findUnique({ where: { id: operationId } });
  if (op) {
    assertValidOperationTransition(op.state, "queued");
  }
  await client.bulkOperation.update({
    where: { id: operationId },
    data: { state: "queued", completedAt: null, startedAt: now },
  });
}
