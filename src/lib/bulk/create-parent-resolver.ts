import { prisma } from "@/lib/prisma";

/**
 * Bulk Create Parent & Dependency Resolver.
 *
 * Handles:
 *   - Resolving parent Jira issue key for subtasks/epics (existing Jira issue or batch parent)
 *   - Unlocking children whose batch parent succeeded (waiting_for_parent → pending)
 *   - Blocking children whose batch parent failed (waiting_for_parent → blocked_by_parent)
 *   - Blocking orphan waiting items when rounds finish
 */

export interface ParentResolutionResult {
  resolvedParentKey: string | null;
  blocked: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Resolve the parent Jira key for an item before Jira creation.
 * If the parent was another item in the same batch, looks up its created jiraKey.
 * If the batch parent was not yet created, blocks this item immediately.
 */
export async function resolveItemParentKey(
  operationId: string,
  itemId: string,
  parentInfo: {
    parentJiraKey?: string | null;
    parentClientRef?: string | null;
  }
): Promise<ParentResolutionResult> {
  if (parentInfo.parentJiraKey) {
    return {
      resolvedParentKey: parentInfo.parentJiraKey,
      blocked: false,
    };
  }

  if (parentInfo.parentClientRef) {
    const parentItem = await prisma.bulkCreateItem.findFirst({
      where: { operationId, clientRef: parentInfo.parentClientRef },
      select: { jiraKey: true, status: true },
    });

    if (parentItem?.jiraKey) {
      return {
        resolvedParentKey: parentItem.jiraKey,
        blocked: false,
      };
    }

    // Parent not yet created — should not be in "pending" state, handle gracefully
    const errorMessage = `Parent "${parentInfo.parentClientRef}" chưa được tạo`;
    await prisma.bulkCreateItem.update({
      where: { id: itemId },
      data: {
        status: "blocked_by_parent",
        error: errorMessage,
        errorCode: "PARENT_BLOCKED",
      },
    });

    return {
      resolvedParentKey: null,
      blocked: true,
      error: errorMessage,
      errorCode: "PARENT_BLOCKED",
    };
  }

  return {
    resolvedParentKey: null,
    blocked: false,
  };
}

/**
 * Unlock children of a succeeded parent: change "waiting_for_parent" → "pending".
 */
export async function unlockChildren(
  operationId: string,
  parentClientRef: string,
  parentJiraKey: string
): Promise<number> {
  const result = await prisma.bulkCreateItem.updateMany({
    where: {
      operationId,
      parentClientRef,
      status: "waiting_for_parent",
    },
    data: {
      status: "pending",
      resolvedParentJiraKey: parentJiraKey,
      error: null,
      errorCode: null,
    },
  });
  return result.count;
}

/**
 * Block children of a failed parent: change "waiting_for_parent" → "blocked_by_parent".
 */
export async function blockChildren(
  operationId: string,
  parentClientRef: string
): Promise<number> {
  const result = await prisma.bulkCreateItem.updateMany({
    where: {
      operationId,
      parentClientRef,
      status: "waiting_for_parent",
    },
    data: {
      status: "blocked_by_parent",
      error: `Parent "${parentClientRef}" thất bại khi tạo trên Jira`,
      errorCode: "PARENT_BLOCKED",
    },
  });
  return result.count;
}

/**
 * Block any remaining waiting_for_parent items (orphans whose parent was blocked/failed in a prior round).
 */
export async function blockOrphanWaitingItems(operationId: string): Promise<number> {
  const result = await prisma.bulkCreateItem.updateMany({
    where: { operationId, status: "waiting_for_parent" },
    data: {
      status: "blocked_by_parent",
      error: "Parent trong batch không được tạo thành công",
      errorCode: "PARENT_BLOCKED",
    },
  });
  return result.count;
}
