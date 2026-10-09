export type BulkNotificationSeverity = "info" | "warning" | "danger" | "success";

export type BulkOperationInfo = {
  id: string;
  type: string;
  requestedBy: string;
};

export type BulkCompletionCounts = {
  succeeded: number;
  failed: number;
  skipped: number;
};

export type BulkNotificationPayload = {
  type: "system";
  title: string;
  body: string;
  link: string;
  severity: "info" | "warning" | "danger";
  eventKey: string;
};

/**
 * Maps bulk operation final state to user-facing status label.
 */
export function getBulkOperationStatusText(state: string): string {
  switch (state) {
    case "completed":
      return "hoàn tất";
    case "partially_failed":
      return "thất bại một phần";
    default:
      return "thất bại";
  }
}

/**
 * Maps bulk operation state to notification severity.
 */
export function getBulkOperationSeverity(state: string): "info" | "warning" | "danger" {
  switch (state) {
    case "completed":
      return "info";
    case "partially_failed":
      return "warning";
    default:
      return "danger";
  }
}

/**
 * Formats standard summary string: "[succeeded] thành công, [failed] thất bại, [skipped] bỏ qua."
 */
export function formatBulkCompletionSummary(
  succeeded: number,
  failed: number,
  skipped: number
): string {
  return `${succeeded} thành công, ${failed} thất bại, ${skipped} bỏ qua.`;
}

/**
 * Builds user-facing notification payload for a finished bulk operation.
 */
export function buildBulkNotificationPayload(
  op: BulkOperationInfo,
  state: string,
  counts: BulkCompletionCounts
): BulkNotificationPayload {
  const statusText = getBulkOperationStatusText(state);
  const severity = getBulkOperationSeverity(state);
  return {
    type: "system",
    title: `Thao tác hàng loạt ${op.type} ${statusText}`,
    body: formatBulkCompletionSummary(counts.succeeded, counts.failed, counts.skipped),
    link: `/bulk?operation=${op.id}`,
    severity,
    eventKey: `bulk:${op.id}:${state}`,
  };
}

/**
 * Status and severity mappings for bulk-create operations.
 */
export function getBulkCreateStatusText(state: string): string {
  switch (state) {
    case "completed":
      return "hoàn tất thành công";
    case "partially_failed":
      return "thất bại một phần";
    default:
      return "thất bại";
  }
}

export function getBulkCreateSeverity(state: string): "success" | "warning" | "danger" {
  switch (state) {
    case "completed":
      return "success";
    case "partially_failed":
      return "warning";
    default:
      return "danger";
  }
}

export function buildBulkCreateNotificationPayload(
  op: { id: string; requestedBy: string },
  state: string,
  succeeded: number,
  failed: number
): {
  type: "system";
  title: string;
  body: string;
  link: string;
  severity: "success" | "warning" | "danger";
  eventKey: string;
} {
  const statusText = getBulkCreateStatusText(state);
  const severity = getBulkCreateSeverity(state);
  return {
    type: "system",
    title: `Tạo task hàng loạt ${statusText}`,
    body: `${succeeded} task đã tạo thành công, ${failed} task lỗi.`,
    link: `/bulk?operation=${op.id}`,
    severity,
    eventKey: `bulk-create:${op.id}:${state}`,
  };
}

export type NotifyUserFn = (
  userId: string,
  payload: BulkNotificationPayload
) => Promise<unknown>;

/**
 * Sends notification to the user who requested the bulk operation.
 * Silently ignores any delivery errors so background job termination is not blocked.
 */
export async function notifyBulkOperationResult(
  op: BulkOperationInfo,
  state: string,
  succeeded: number,
  failed: number,
  skipped: number,
  notifier?: NotifyUserFn
): Promise<void> {
  try {
    const payload = buildBulkNotificationPayload(op, state, {
      succeeded,
      failed,
      skipped,
    });
    if (notifier) {
      await notifier(op.requestedBy, payload);
    } else {
      const { notifyUser } = await import("@/lib/notify");
      await notifyUser(op.requestedBy, payload);
    }
  } catch {
    /* ignore notification errors */
  }
}

/** Backward-compatible alias matching ops.ts signature */
export const notifyResult = notifyBulkOperationResult;
