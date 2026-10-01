/**
 * Metrics and slow-operation alerts for Bulk Create Smart Task flow.
 * Implements structured JSON logging and threshold alerts for preview,
 * execution, dependency wait, and user/parent search operations.
 */

export const SLOW_PREVIEW_THRESHOLD_MS = 3000;
export const SLOW_EXECUTION_THRESHOLD_MS = 10000;
export const SLOW_ITEM_THRESHOLD_MS = 3000;
export const SLOW_SEARCH_THRESHOLD_MS = 2000;

export interface PreviewMetricsData {
  operationId: string;
  projectKey: string;
  durationMs: number;
  total: number;
  actionable: number;
  blocked: number;
  warningCount: number;
  blockedByErrorCode: Record<string, number>;
  invalidAssigneeCount: number;
  batchParentCount: number;
  jiraParentCount: number;
}

export interface ExecutionMetricsData {
  operationId: string;
  projectKey: string;
  durationMs: number;
  rounds: number;
  total: number;
  succeeded: number;
  failed: number;
  blockedByParent: number;
  itemLatenciesMs?: number[];
  slowItemCount?: number;
}

export interface SearchMetricsData {
  type: "assignees" | "parents" | "labels";
  projectKey: string;
  query?: string;
  durationMs: number;
  resultCount: number;
  error?: string | null;
}

/**
 * Record preview metrics with structured JSON logging and slow operation detection.
 */
export function recordPreviewMetrics(data: PreviewMetricsData): { isSlow: boolean } {
  const isSlow = data.durationMs > SLOW_PREVIEW_THRESHOLD_MS;

  console.info(
    JSON.stringify({
      level: "info",
      event: "bulk_create_preview_metrics",
      operationId: data.operationId,
      projectKey: data.projectKey,
      durationMs: data.durationMs,
      total: data.total,
      actionable: data.actionable,
      blocked: data.blocked,
      warningCount: data.warningCount,
      invalidAssigneeCount: data.invalidAssigneeCount,
      batchParentCount: data.batchParentCount,
      jiraParentCount: data.jiraParentCount,
      blockedByErrorCode: data.blockedByErrorCode,
    })
  );

  if (isSlow) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "bulk_create_slow_preview_alert",
        operationId: data.operationId,
        projectKey: data.projectKey,
        durationMs: data.durationMs,
        thresholdMs: SLOW_PREVIEW_THRESHOLD_MS,
        message: `Bulk Create preview latency (${data.durationMs}ms) exceeded threshold of ${SLOW_PREVIEW_THRESHOLD_MS}ms`,
      })
    );
  }

  return { isSlow };
}

/**
 * Record worker execution metrics with structured JSON logging and slow operation detection.
 */
export function recordExecutionMetrics(data: ExecutionMetricsData): { isSlow: boolean } {
  const isSlow = data.durationMs > SLOW_EXECUTION_THRESHOLD_MS || (data.slowItemCount ?? 0) > 0;

  console.info(
    JSON.stringify({
      level: "info",
      event: "bulk_create_execution_metrics",
      operationId: data.operationId,
      projectKey: data.projectKey,
      durationMs: data.durationMs,
      rounds: data.rounds,
      total: data.total,
      succeeded: data.succeeded,
      failed: data.failed,
      blockedByParent: data.blockedByParent,
      slowItemCount: data.slowItemCount ?? 0,
    })
  );

  if (isSlow) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "bulk_create_slow_execution_alert",
        operationId: data.operationId,
        projectKey: data.projectKey,
        durationMs: data.durationMs,
        thresholdMs: SLOW_EXECUTION_THRESHOLD_MS,
        slowItemCount: data.slowItemCount ?? 0,
        message: `Bulk Create execution latency (${data.durationMs}ms) or slow items (${data.slowItemCount ?? 0}) exceeded threshold`,
      })
    );
  }

  return { isSlow };
}

/**
 * Record latency for async searches (assignee, parent, label) and alert if slow.
 */
export function recordSearchMetrics(data: SearchMetricsData): { isSlow: boolean } {
  const isSlow = data.durationMs > SLOW_SEARCH_THRESHOLD_MS;

  console.info(
    JSON.stringify({
      level: "info",
      event: "bulk_create_search_metrics",
      type: data.type,
      projectKey: data.projectKey,
      query: data.query || "",
      durationMs: data.durationMs,
      resultCount: data.resultCount,
      error: data.error ?? null,
    })
  );

  if (isSlow) {
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "bulk_create_slow_search_alert",
        type: data.type,
        projectKey: data.projectKey,
        durationMs: data.durationMs,
        thresholdMs: SLOW_SEARCH_THRESHOLD_MS,
        message: `Bulk Create ${data.type} search latency (${data.durationMs}ms) exceeded threshold of ${SLOW_SEARCH_THRESHOLD_MS}ms`,
      })
    );
  }

  return { isSlow };
}
