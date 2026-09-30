import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getWorkerHealth } from "@/lib/health/worker-health";
import type { WorkerLog } from "../guard";
import { enqueueJiraRecoveries } from "../jira-recovery";

const ALERT_KEY = "worker";
export type HealthAlertOptions = {
  enqueueJiraRecovery?: (projectKey: string) => Promise<string | null>;
};


/**
 * OPS-03 — Worker/freshness alerting.
 *
 * Runs on the 5-minute `health-alert` schedule. For each alert condition it
 * compares against the previous recorded state (stored in the same
 * IntegrationCursor row, under the `worker`/`worker-recovery` scope) so a
 * problem raised once is not re-announced every cycle (dedupe, plan §OPS-03),
 * and a resolved problem produces exactly one recovery notification.
 *
 * Alert conditions (each deduped independently):
 *  - worker down (liveness heartbeat missing / > 2 min)
 *  - jira sync stale (no successful poll > JIRA_FRESHNESS_MINUTES)
 *  - a job reported an error more recently than it last succeeded
 *
 * Notifications go to all users via the existing outbox. That unified path
 * fans out to in-app, push, and each user's private Discord destination.
 */
export async function runHealthAlert(options: HealthAlertOptions = {}): Promise<WorkerLog> {
  const health = await getWorkerHealth();
  const now = new Date();

  // The watchdog is also a repair loop: stale and failed projects get an
  // elevated-priority, deduped reconciliation job while the worker is alive.
  const recoveryProjects = health.status === "down" || health.status === "unknown"
    ? []
    : [...(health.staleProjects ?? []), ...(health.failingProjects ?? [])];
  const recovery = options.enqueueJiraRecovery
    ? await enqueueJiraRecoveries(recoveryProjects, options.enqueueJiraRecovery)
    : { requested: 0, queued: 0, coalesced: 0, failed: 0, errors: [] };

  if (recovery.failed > 0) {
    console.error(JSON.stringify({
      level: "error",
      job: "health-alert",
      message: "Failed to enqueue one or more Jira recovery jobs",
      errors: recovery.errors,
    }));
  }

  const conditions: { key: string; title: string; body: string }[] = [];

  if (health.status === "down") {
    const gap = health.workerAgeMs === null ? "no heartbeat" : `${Math.round(health.workerAgeMs / 1000)}s`;
    conditions.push({
      key: "worker-down",
      title: "Worker down",
      body: `Worker liveness heartbeat missing (${gap}). Background syncs are not running.`,
    });
  }

  if (health.staleProjects && health.staleProjects.length > 0) {
    for (const projectKey of [...health.staleProjects].sort()) {
      conditions.push({
        key: `jira-stale:${projectKey}`,
        title: `Jira sync stale: ${projectKey}`,
        body: `Dự án chưa được đồng bộ mới (> ${env.jiraFreshnessMinutes} phút): ${projectKey}. Đang kích hoạt tự phục hồi.`,
      });
    }
  } else if (health.jiraSyncAgeMs !== null && health.jiraSyncAgeMs > env.jiraFreshnessMinutes * 60_000) {
    conditions.push({
      key: "jira-stale",
      title: "Jira sync stale",
      body: `Last successful Jira sync was ${Math.round(health.jiraSyncAgeMs / 1000)}s ago (> ${env.jiraFreshnessMinutes} min).`,
    });
  }

  if (health.failingProjects && health.failingProjects.length > 0 && health.status !== "down") {
    for (const projectKey of [...health.failingProjects].sort()) {
      conditions.push({
        key: `jira-failed:${projectKey}`,
        title: `Jira sync failed: ${projectKey}`,
        body: `Đồng bộ Jira thất bại cho dự án: ${projectKey}. Đang kích hoạt tự phục hồi.`,
      });
    }
  }

  if (health.hasErrors && health.status !== "down" && (!health.failingProjects || health.failingProjects.length === 0)) {
    const failing = health.jobs.filter((j) => j.lastErrorAt).slice(0, 3);
    const detail = failing.map((j) => `${j.job}${j.lastError ? `: ${j.lastError.slice(0, 80)}` : ""}`).join("; ");
    conditions.push({
      key: "job-error",
      title: "Background job error",
      body: detail || "A background job reported an error.",
    });
  }

  const OUTBOX_BACKLOG_MINUTES = 10;
  const backlog = await prisma.notificationOutbox.findFirst({
    where: { state: "pending", createdAt: { lt: new Date(now.getTime() - OUTBOX_BACKLOG_MINUTES * 60_000) } },
    select: { id: true },
  }).catch(() => null);
  if (backlog) {
    conditions.push({
      key: "outbox-backlog",
      title: "Notification outbox backlog",
      body: "There are undelivered push notifications older than 10 minutes.",
    });
  }

  const activeKeyList = conditions.map((c) => c.key).sort();
  const activeKeys = activeKeyList.join(",");

  // Compare with previously active keys to decide what to (re)announce.
  const prev = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: ALERT_KEY, scope: "state" } },
  });
  const prevKeys = String((prev?.stats as { activeKeys?: string } | null)?.activeKeys ?? "");
  const prevKeyList = prevKeys ? prevKeys.split(",") : [];
  const prevHadKeys = prevKeys.length > 0;

  let alerted = 0;
  let recovered = 0;

  // Dedupe alerts: announce keys that are new this cycle
  if (conditions.length > 0) {
    const newKeys = conditions.filter((c) => !prevKeyList.includes(c.key));
    for (const c of newKeys) {
      const { notifyAll } = await import("@/lib/notify");
      await notifyAll({
        type: "system",
        title: c.title,
        body: c.body,
        severity: "warning",
        eventKey: `health:${c.key}:${now.toISOString().slice(0, 10)}:alert`,
      }).catch(() => null);
      alerted++;
    }
  }

  // Recovery notifications: announce keys that cleared this cycle
  const resolvedKeys = prevKeyList.filter((k) => k && !activeKeyList.includes(k));
  for (const key of resolvedKeys) {
    const { notifyAll } = await import("@/lib/notify");
    if (key.startsWith("jira-stale:")) {
      const projectKey = key.slice("jira-stale:".length);
      await notifyAll({
        type: "system",
        title: `Đồng bộ Jira đã phục hồi: ${projectKey}`,
        body: `Dự án ${projectKey} đã đồng bộ thành công trở lại.`,
        severity: "success",
        eventKey: `health:${key}:${now.toISOString().slice(0, 10)}:recovered`,
      }).catch(() => null);
      recovered++;
    } else if (key.startsWith("jira-failed:")) {
      const projectKey = key.slice("jira-failed:".length);
      await notifyAll({
        type: "system",
        title: `Đồng bộ Jira đã phục hồi: ${projectKey}`,
        body: `Dự án ${projectKey} đã đồng bộ thành công và không còn lỗi.`,
        severity: "success",
        eventKey: `health:${key}:${now.toISOString().slice(0, 10)}:recovered`,
      }).catch(() => null);
      recovered++;
    } else if (key === "worker-down") {
      await notifyAll({
        type: "system",
        title: "Worker đã hoạt động trở lại",
        body: "Tiến trình worker nền đã ghi nhận liveness heartbeat.",
        severity: "success",
        eventKey: `health:worker-down:${now.toISOString().slice(0, 10)}:recovered`,
      }).catch(() => null);
      recovered++;
    }
  }

  // If everything cleared and there were unresolved keys before, send overall recovery
  if (conditions.length === 0 && prevHadKeys && recovered === 0) {
    const { notifyAll } = await import("@/lib/notify");
    await notifyAll({
      type: "system",
      title: "Hệ thống hoạt động bình thường (đã phục hồi)",
      body: "Worker nền và đồng bộ Jira đã phục hồi.",
      severity: "success",
      eventKey: `health:system:${now.toISOString().slice(0, 10)}:recovered`,
    }).catch(() => null);
    recovered++;
  }

  // Persist the new active-key set for next cycle's dedupe comparison.
  await prisma.integrationCursor.upsert({
    where: { integration_scope: { integration: ALERT_KEY, scope: "state" } },
    create: {
      integration: ALERT_KEY,
      scope: "state",
      lastStartedAt: now,
      lastSuccessAt: now,
      stats: { activeKeys } as object,
    },
    update: {
      lastStartedAt: now,
      lastSuccessAt: now,
      lastError: null,
      stats: { activeKeys } as object,
    },
  }).catch(() => null);

  console.info(JSON.stringify({
    level: recovery.failed > 0 ? "warn" : "info",
    job: "health-alert",
    status: health.status,
    recoveryRequested: recovery.requested,
    recoveryQueued: recovery.queued,
    recoveryCoalesced: recovery.coalesced,
    recoveryFailed: recovery.failed,
    alerted,
    recovered,
    activeKeys,
  }));

  return {
    ok: recovery.failed === 0,
    stats: {
      status: health.status,
      activeKeys,
      alerted,
      recovered,
      recoveryRequested: recovery.requested,
      recoveryQueued: recovery.queued,
      recoveryCoalesced: recovery.coalesced,
      recoveryFailed: recovery.failed,
      ...(recovery.errors.length > 0 ? { recoveryErrors: recovery.errors } : {}),
    } as unknown as Record<string, unknown>,
    ...(recovery.errors.length > 0 ? { errors: recovery.errors } : {}),
  };
}
