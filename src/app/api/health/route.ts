import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { jira, hasJiraCredentials } from "@/lib/jira/client";
import { bitbucket } from "@/lib/bitbucket/client";
import { sentry } from "@/lib/sentry/client";
import { env, hasBitbucketConfig, hasSentryConfig, hasOpenAiConfig } from "@/lib/env";
import { getWorkerHealth, isJiraFresh } from "@/lib/health/worker-health";
import { getJobSchedules } from "@/lib/queue/schedules";
import { withTimeout } from "@/lib/async/with-timeout";

export type PingResult = {
  ok: boolean;
  ms: number;
  error?: string;
  history?: number[];
};

const servicePingHistory: Record<string, number[]> = {};

function recordServiceLatency(name: string, ms: number): number[] {
  const history = servicePingHistory[name] ?? [];
  history.push(ms);
  if (history.length > 20) history.shift();
  servicePingHistory[name] = history;
  return [...history];
}

async function ping(name: string, fn: () => Promise<unknown>, timeoutMs: number = 5000): Promise<PingResult> {
  const started = Date.now();
  try {
    const res = await withTimeout(fn(), timeoutMs);
    const ms = Date.now() - started;
    const history = recordServiceLatency(name, ms);
    if (res === "timeout") {
      return { ok: false, ms, error: `timeout after ${timeoutMs}ms`, history };
    }
    return { ok: true, ms, history };
  } catch (e) {
    const ms = Date.now() - started;
    const history = recordServiceLatency(name, ms);
    return { ok: false, ms, error: (e as Error).message.slice(0, 200), history };
  }
}

export async function GET() {
  // Read-only infrastructure status. Worker lifecycle belongs to the separate
  // worker process and this endpoint intentionally has no startup side effect.
  const session = await getSession();
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pingDb = async (): Promise<PingResult> => {
    return ping("db", async () => prisma.$queryRaw`SELECT 1`);
  };

  const pingJira = async (): Promise<{ configured: boolean; health: PingResult }> => {
    const configured = await hasJiraCredentials();
    if (!configured) {
      return { configured, health: { ok: false, ms: 0, error: "not configured" } };
    }
    const health = await ping("jira", () => jira.me());
    return { configured, health };
  };

  const pingBitbucket = async (): Promise<PingResult> => {
    if (!hasBitbucketConfig() || !bitbucket.repos().length) {
      return { ok: false, ms: 0, error: "not configured" };
    }
    return ping("bitbucket", () => bitbucket.listBranches(bitbucket.repos()[0]));
  };

  const pingSentry = async (): Promise<PingResult> => {
    if (!hasSentryConfig()) {
      return { ok: false, ms: 0, error: "not configured" };
    }
    return ping("sentry", () => sentry.listUnresolvedIssues(1));
  };

  const pingOpenai = async (): Promise<PingResult> => {
    if (!hasOpenAiConfig()) {
      return { ok: false, ms: 0, error: "not configured" };
    }
    return ping("openai", async () => {
      const r = await fetch(`${env.openaiBaseUrl.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${env.openaiApiKey}` },
      });
      if (!r.ok) throw new Error(`openai ${r.status}`);
    });
  };

  const [
    dbSettled,
    workerHealthSettled,
    jiraSettled,
    bitbucketSettled,
    sentrySettled,
    openaiSettled,
  ] = await Promise.allSettled([
    pingDb(),
    getWorkerHealth(),
    pingJira(),
    pingBitbucket(),
    pingSentry(),
    pingOpenai(),
  ]);

  const db: PingResult =
    dbSettled.status === "fulfilled"
      ? dbSettled.value
      : { ok: false, ms: 0, error: (dbSettled.reason as Error)?.message ?? "db check failed" };

  const workerHealth =
    workerHealthSettled.status === "fulfilled"
      ? workerHealthSettled.value
      : {
          status: "down" as const,
          workerAgeMs: null,
          jiraSyncAgeMs: null,
          hasErrors: true,
          checkedAt: new Date().toISOString(),
          jobs: [],
          staleProjects: [],
          failingProjects: [],
          jiraSyncPaused: false,
          failingJobs: [],
          runningJobs: [],
          stuckJobs: [],
        };

  const jiraResult =
    jiraSettled.status === "fulfilled"
      ? jiraSettled.value
      : { configured: false, health: { ok: false, ms: 0, error: (jiraSettled.reason as Error)?.message ?? "jira check failed" } };

  const bitbucketHealth: PingResult =
    bitbucketSettled.status === "fulfilled"
      ? bitbucketSettled.value
      : { ok: false, ms: 0, error: (bitbucketSettled.reason as Error)?.message ?? "bitbucket check failed" };

  const sentryHealth: PingResult =
    sentrySettled.status === "fulfilled"
      ? sentrySettled.value
      : { ok: false, ms: 0, error: (sentrySettled.reason as Error)?.message ?? "sentry check failed" };

  const openaiHealth: PingResult =
    openaiSettled.status === "fulfilled"
      ? openaiSettled.value
      : { ok: false, ms: 0, error: (openaiSettled.reason as Error)?.message ?? "openai check failed" };

  const jiraConfigured = jiraResult.configured;
  const jiraHealth = jiraResult.health;

  return NextResponse.json({
    status: "ok",
    env: {
      jiraConfigured,
      bitbucketConfigured: hasBitbucketConfig(),
      sentryConfigured: hasSentryConfig(),
      llmProvider: env.llmProvider,
      openaiConfigured: hasOpenAiConfig(),
    },
    services: {
      db,
      jira: jiraHealth,
      bitbucket: bitbucketHealth,
      sentry: sentryHealth,
      openai: openaiHealth,
    },
    worker: {
      status: workerHealth.status,
      jiraFresh: isJiraFresh(workerHealth),
      workerAgeMs: workerHealth.workerAgeMs,
      jiraSyncAgeMs: workerHealth.jiraSyncAgeMs,
      hasErrors: workerHealth.hasErrors,
      staleProjects: workerHealth.staleProjects ?? [],
      failingProjects: workerHealth.failingProjects ?? [],
      jiraSyncPaused: Boolean(workerHealth.jiraSyncPaused),
      failingJobs: workerHealth.failingJobs ?? [],
      runningJobs: workerHealth.runningJobs ?? [],
      stuckJobs: workerHealth.stuckJobs ?? [],
    },
    workers: workerHealth.jobs,
    schedules: getJobSchedules(env.pollIntervalMs),
  });
}

