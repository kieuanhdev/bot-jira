import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getWorkerHealth } from "@/lib/health/worker-health";
import type { WorkerLog } from "../guard";

const ALERT_KEY = "worker";

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
 * Notifications go to all users via the existing outbox (in-app + push), and
 * to Discord when it is configured.
 */
export async function runHealthAlert(): Promise<WorkerLog> {
  const health = await getWorkerHealth();
  const now = new Date();

  const conditions: { key: string; title: string; body: string }[] = [];

  if (health.status === "down") {
    const gap = health.workerAgeMs === null ? "no heartbeat" : `${Math.round(health.workerAgeMs / 1000)}s`;
    conditions.push({
      key: "worker-down",
      title: "Worker down",
      body: `Worker liveness heartbeat missing (${gap}). Background syncs are not running.`,
    });
  }

  if (health.jiraSyncAgeMs !== null && health.jiraSyncAgeMs > env.jiraFreshnessMinutes * 60_000) {
    conditions.push({
      key: "jira-stale",
      title: "Jira sync stale",
      body: `Last successful Jira sync was ${Math.round(health.jiraSyncAgeMs / 1000)}s ago (> ${env.jiraFreshnessMinutes} min).`,
    });
  }

  if (health.hasErrors && health.status !== "down") {
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

  const activeKeys = conditions.map((c) => c.key).sort().join(",");

  // Compare with previously active keys to decide what to (re)announce.
  const prev = await prisma.integrationCursor.findUnique({
    where: { integration_scope: { integration: ALERT_KEY, scope: "state" } },
  });
  const prevKeys = String((prev?.stats as { activeKeys?: string } | null)?.activeKeys ?? "");
  const prevHadKeys = prevKeys.length > 0;

  let alerted = 0;
  let recovered = 0;

  // Dedupe: only announce keys that are new this cycle; when everything
  // clears, announce one recovery if there had been any alert.
  if (conditions.length > 0) {
    const newKeys = conditions.filter((c) => !prevKeys.split(",").includes(c.key));
    for (const c of newKeys) {
      const { notifyAll } = await import("@/lib/notify");
      await notifyAll({
        type: "system",
        title: c.title,
        body: c.body,
        severity: "warning",
        eventKey: `health:${c.key}:${now.toISOString().slice(0, 10)}:alert`,
      }).catch(() => null);
      await postDiscord(`${c.title}\n${c.body}`).catch(() => null);
      alerted++;
    }
  } else if (prevHadKeys) {
    const { notifyAll } = await import("@/lib/notify");
    await notifyAll({
      type: "system",
      title: "Hệ thống hoạt động bình thường (đã phục hồi)",
      body: "Worker nền và đồng bộ Jira đã phục hồi.",
      severity: "success",
      eventKey: `health:system:${now.toISOString().slice(0, 10)}:recovered`,
    }).catch(() => null);
    await postDiscord("Worker healthy (recovered) — background syncs restored.").catch(() => null);
    recovered = 1;
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

  return {
    ok: true,
    stats: {
      status: health.status,
      activeKeys,
      alerted,
      recovered,
    } as unknown as Record<string, unknown>,
  };
}

async function postDiscord(text: string): Promise<void> {
  const { hasDiscordConfig, discordProvider } = await import("@/lib/chat/discord");
  if (!hasDiscordConfig()) return;
  await discordProvider.send("", { text, blocks: [] });
}
