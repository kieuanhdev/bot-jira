export type HeartbeatRow = {
  lastStartedAt?: Date | string | null;
  lastSuccessAt?: Date | string | null;
} | null | undefined;

export type HeartbeatEvaluationOptions = {
  maxAgeMs?: number;
  maxFutureDriftMs?: number;
};

export type HeartbeatEvaluation = {
  healthy: boolean;
  reason?: string;
  ageMs?: number;
};

export const DEFAULT_MAX_HEARTBEAT_AGE_MS = 120_000; // 2 minutes
export const DEFAULT_MAX_FUTURE_DRIFT_MS = 15_000; // 15 seconds clock skew tolerance

/**
 * Pure function to evaluate worker liveness heartbeat against SLA and clock bounds.
 */
export function evaluateWorkerHeartbeat(
  row: HeartbeatRow,
  nowMs: number = Date.now(),
  options?: HeartbeatEvaluationOptions
): HeartbeatEvaluation {
  if (!row) {
    return { healthy: false, reason: "No worker liveness heartbeat row found" };
  }

  const ts = row.lastSuccessAt || row.lastStartedAt;
  if (!ts) {
    return { healthy: false, reason: "Heartbeat row has null timestamps" };
  }

  const heartbeatTime = ts instanceof Date ? ts.getTime() : new Date(ts).getTime();
  if (Number.isNaN(heartbeatTime)) {
    return { healthy: false, reason: "Invalid heartbeat timestamp" };
  }

  const maxFutureDriftMs = options?.maxFutureDriftMs ?? DEFAULT_MAX_FUTURE_DRIFT_MS;
  if (heartbeatTime - nowMs > maxFutureDriftMs) {
    return {
      healthy: false,
      reason: `Heartbeat timestamp is abnormally in the future (+${Math.round((heartbeatTime - nowMs) / 1000)}s > ${Math.round(maxFutureDriftMs / 1000)}s)`,
      ageMs: nowMs - heartbeatTime,
    };
  }

  const maxAgeMs = options?.maxAgeMs ?? DEFAULT_MAX_HEARTBEAT_AGE_MS;
  const ageMs = nowMs - heartbeatTime;

  if (ageMs > maxAgeMs) {
    return {
      healthy: false,
      reason: `Worker heartbeat is stale (${Math.round(ageMs / 1000)}s > ${Math.round(maxAgeMs / 1000)}s)`,
      ageMs,
    };
  }

  return {
    healthy: true,
    ageMs: Math.max(0, ageMs),
  };
}
