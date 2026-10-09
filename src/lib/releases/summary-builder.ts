import type { Blocker, GateResult, GateState, ReleaseContext } from "./gates/types";

export type ReleaseSummaryItem = {
  id: string;
  archived: boolean;
  jiraReleased: boolean;
  taskCount: number;
  deliveryReadyCount: number;
};

export type ReleaseSummary = {
  totalActive: number;
  inProgress: number;
  ready: number;
  empty: number;
  released: number;
  archived: number;
};

/**
 * Compute the 5 mutually exclusive KPI groups plus archived count.
 * Invariant: totalActive = inProgress + ready + empty + released
 */
export function computeReleaseSummary(items: ReleaseSummaryItem[]): ReleaseSummary {
  let inProgress = 0;
  let ready = 0;
  let empty = 0;
  let released = 0;
  let archived = 0;

  for (const item of items) {
    if (item.archived) {
      archived++;
      continue;
    }

    if (item.jiraReleased) {
      released++;
    } else if (item.taskCount === 0) {
      empty++;
    } else if (item.deliveryReadyCount === item.taskCount) {
      ready++;
    } else {
      inProgress++;
    }
  }

  const totalActive = inProgress + ready + empty + released;

  return {
    totalActive,
    inProgress,
    ready,
    empty,
    released,
    archived,
  };
}

/**
 * Format gate results as a concise summary string: e.g. "gate1=passed, gate2=failed".
 */
export function buildGateCheckSummary(gates: GateResult[]): string {
  return gates.map((g) => `${g.gate}=${g.state}`).join(", ");
}

/**
 * Format blockers as human-readable reasons, capped at a maximum limit.
 */
export function formatBlockerReasons(blockers: Blocker[], limit = 10): string[] {
  return blockers
    .slice(0, limit)
    .map((b) => (b.jiraKey ? `${b.jiraKey}: ${b.reason}` : b.reason));
}

export type GateSourceTimes = {
  checkedAt: string;
  taskLastSynced: Array<{ key: string; at: string }>;
  sentryCheckedAt: string | null;
};

/**
 * Build snapshot of data source synchronization timestamps for release check auditing.
 */
export function buildGateSourceTimes(ctx: ReleaseContext): GateSourceTimes {
  return {
    checkedAt: ctx.checkedAt.toISOString(),
    taskLastSynced: ctx.tasks.map((t) => ({
      key: t.jiraKey,
      at: t.lastSyncedAt.toISOString(),
    })),
    sentryCheckedAt: ctx.sentryCheckedAt?.toISOString() ?? null,
  };
}

export type GatePersistenceItem = {
  gate: string;
  state: GateState;
  summary: string;
  details?: object;
  sourceTime: Date | null;
};

/**
 * Format gate results into persistence create format for Prisma ReleaseGateResult.
 */
export function buildGatePersistencePayload(gates: GateResult[]): GatePersistenceItem[] {
  return gates.map((g) => ({
    gate: g.gate,
    state: g.state,
    summary: g.summary,
    details: g.details
      ? (JSON.parse(JSON.stringify(g.details)) as object)
      : undefined,
    sourceTime: g.sourceTime ?? null,
  }));
}

export type ReleaseCheckNotificationPayload = {
  type: "release";
  title: string;
  body: string;
  link: string;
  severity: "danger" | "warning" | "success";
  eventKey: string;
};

/**
 * Build notification payload for release ready-check status changes.
 */
export function buildReleaseCheckNotification(
  release: { version: string },
  status: "ready" | "blocked" | "unknown",
  blockers: Blocker[],
  summary: string,
  checkId?: string
): ReleaseCheckNotificationPayload {
  const reasons = formatBlockerReasons(blockers, 10);
  const severity = status === "blocked" ? "danger" : status === "unknown" ? "warning" : "success";
  const statusText =
    status === "blocked"
      ? "bị chặn"
      : status === "unknown"
        ? "chưa sẵn sàng"
        : "đã sẵn sàng";
  const body = status === "ready" ? summary : reasons.join("; ") || summary;

  return {
    type: "release",
    title: `Bản phát hành ${release.version} ${statusText}`,
    body,
    link: "/release",
    severity,
    eventKey: `release-check:${checkId ?? "latest"}:${status}`,
  };
}
