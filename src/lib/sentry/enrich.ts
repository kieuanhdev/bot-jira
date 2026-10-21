import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getLatestEvent, sanitizeSentryErrorMessage, type SentryCreds, type SentryEvent } from "./client";
import { sentryCredsForProject } from "./creds-for-project";

// The issue list carries no release/environment, so rows in the review queue are
// filled in from the latest event, a few per run. A failed or unreadable row is
// retried only after ENRICH_RETRY_MS so it never starves the others.
const ENRICH_BATCH = 15;
const ENRICH_CONCURRENCY = 4;
const ENRICH_TIMEOUT_MS = 5_000;
const ENRICH_RETRY_MS = 6 * 60 * 60 * 1000;
const MAX_TAG = 120;

export type EventContext = { release?: string; environment?: string; culprit?: string };

function tagValue(event: SentryEvent, key: string): string | undefined {
  const tag = (Array.isArray(event.tags) ? event.tags : []).find((t) => t?.key === key);
  const value = typeof tag?.value === "string" ? tag.value.trim() : "";
  return value ? value.slice(0, MAX_TAG) : undefined;
}

export function extractEventContext(event: SentryEvent): EventContext {
  const ctx: EventContext = {};
  const release = tagValue(event, "release");
  if (release) ctx.release = release;
  const environment = tagValue(event, "environment");
  if (environment) ctx.environment = environment;
  if (typeof event.culprit === "string" && event.culprit.trim()) ctx.culprit = event.culprit.trim().slice(0, 300);
  return ctx;
}

/** Fill release/environment on a bounded number of review rows. Never throws. */
export async function enrichSentryRows(now: Date = new Date()): Promise<{ enriched: number; skipped: number }> {
  let rows: { id: string; sentryProject: string; sentryIssueId: string }[];
  try {
    rows = await prisma.sentryIssueImported.findMany({
      where: {
        state: { in: ["review", "pending"] },
        OR: [{ enrichedAt: null }, { enrichedAt: { lt: new Date(now.getTime() - ENRICH_RETRY_MS) } }],
      },
      orderBy: [{ enrichedAt: { sort: "asc", nulls: "first" } }, { lastSeen: { sort: "desc", nulls: "last" } }],
      take: ENRICH_BATCH,
      select: { id: true, sentryProject: true, sentryIssueId: true },
    });
  } catch (err) {
    logger.warn({ message: "Sentry enrich query failed", error: err instanceof Error ? err.message : String(err) });
    return { enriched: 0, skipped: 0 };
  }

  const credsCache = new Map<string, Promise<SentryCreds | null>>();
  const credsFor = (project: string) => {
    let hit = credsCache.get(project);
    if (!hit) {
      hit = sentryCredsForProject(project).catch(() => null);
      credsCache.set(project, hit);
    }
    return hit;
  };

  let enriched = 0;
  let skipped = 0;

  const enrichOne = async (row: (typeof rows)[number]) => {
    let data: EventContext = {};
    try {
      const creds = await credsFor(row.sentryProject);
      if (creds) {
        data = extractEventContext(await getLatestEvent(row.sentryIssueId, creds, { timeoutMs: ENRICH_TIMEOUT_MS }));
        enriched++;
      } else {
        skipped++;
      }
    } catch (err) {
      skipped++;
      logger.warn({
        message: "Sentry enrich: latest event unavailable",
        sentryImportId: row.id,
        error: sanitizeSentryErrorMessage(err instanceof Error ? err.message : String(err)),
      });
    }
    await prisma.sentryIssueImported
      .update({ where: { id: row.id }, data: { ...data, enrichedAt: now } })
      .catch(() => undefined);
  };

  for (let i = 0; i < rows.length; i += ENRICH_CONCURRENCY) {
    await Promise.all(rows.slice(i, i + ENRICH_CONCURRENCY).map(enrichOne));
  }
  return { enriched, skipped };
}
