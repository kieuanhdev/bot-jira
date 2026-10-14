import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { jira, hasJiraCredentials } from "@/lib/jira/client";
import { bitbucket } from "@/lib/bitbucket/client";
import { sentry } from "@/lib/sentry/client";
import { env, hasBitbucketConfig, hasSentryConfig, hasOllamaConfig, hasOpenAiConfig } from "@/lib/env";
import { getWorkerHealth, isJiraFresh } from "@/lib/health/worker-health";
import { getJobSchedules } from "@/lib/queue/schedules";

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

async function ping(name: string, fn: () => Promise<unknown>): Promise<PingResult> {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    const history = recordServiceLatency(name, ms);
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

  const db = await ping("db", async () => prisma.$queryRaw`SELECT 1`);
  const workerHealth = await getWorkerHealth();

  const jiraConfigured = await hasJiraCredentials();
  const jiraHealth = jiraConfigured
    ? await ping("jira", () => jira.me())
    : { ok: false, ms: 0, error: "not configured" };

  const bitbucketHealth = hasBitbucketConfig() && bitbucket.repos().length
    ? await ping("bitbucket", () => bitbucket.listBranches(bitbucket.repos()[0]))
    : { ok: false, ms: 0, error: "not configured" };

  const sentryHealth = hasSentryConfig()
    ? await ping("sentry", () => sentry.listUnresolvedIssues(1))
    : { ok: false, ms: 0, error: "not configured" };

  const ollamaHealth = hasOllamaConfig()
    ? await ping("ollama", async () => {
        const r = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`);
        if (!r.ok) throw new Error(`ollama ${r.status}`);
      })
    : { ok: false, ms: 0, error: "not configured" };

  const openaiHealth = hasOpenAiConfig()
    ? await ping("openai", async () => {
        const r = await fetch(`${env.openaiBaseUrl.replace(/\/$/, "")}/models`, {
          headers: { Authorization: `Bearer ${env.openaiApiKey}` },
        });
        if (!r.ok) throw new Error(`openai ${r.status}`);
      })
    : { ok: false, ms: 0, error: "not configured" };

  return NextResponse.json({
    status: "ok",
    env: {
      jiraConfigured,
      bitbucketConfigured: hasBitbucketConfig(),
      sentryConfigured: hasSentryConfig(),
      llmProvider: env.llmProvider,
      openaiConfigured: hasOpenAiConfig(),
      ollamaConfigured: hasOllamaConfig(),
    },
    services: { db, jira: jiraHealth, bitbucket: bitbucketHealth, sentry: sentryHealth, openai: openaiHealth, ollama: ollamaHealth },
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
