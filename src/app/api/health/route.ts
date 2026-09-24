import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { jira } from "@/lib/jira/client";
import { bitbucket } from "@/lib/bitbucket/client";
import { sentry } from "@/lib/sentry/client";
import { env, hasJiraConfig, hasBitbucketConfig, hasSentryConfig, hasOllamaConfig, hasOpenAiConfig } from "@/lib/env";
import { getWorkerHealth, isJiraFresh } from "@/lib/health/worker-health";

async function ping(name: string, fn: () => Promise<unknown>): Promise<{ ok: boolean; ms: number; error?: string }> {
  const started = Date.now();
  try {
    await fn();
    return { ok: true, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: (e as Error).message.slice(0, 200) };
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

  const jiraHealth = hasJiraConfig()
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
      jiraConfigured: hasJiraConfig(),
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
    },
    workers: workerHealth.jobs,
  });
}
