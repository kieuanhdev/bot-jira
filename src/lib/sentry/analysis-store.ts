import { Prisma, type SentryAnalysis, type SentryIssueImported } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { readStoredResult, releaseToGitTag, type SentryAnalysisResult } from "./analysis";
import { looksSystemLevel, titleKey } from "./fixability";

export const MAX_ATTEMPTS = 3;
/** A claimed job not finished within this window goes back to the queue. */
export const LEASE_MS = 10 * 60_000;
const MAX_ERROR_LENGTH = 500;

export type SentryAnalysisState = "none" | SentryAnalysis["state"];

export type SentryAnalysisView = {
  state: SentryAnalysisState;
  result: SentryAnalysisResult | null;
  error: string | null;
  gitRef: string | null;
  requestedAt: string | null;
  finishedAt: string | null;
};

const NONE: SentryAnalysisView = {
  state: "none",
  result: null,
  error: null,
  gitRef: null,
  requestedAt: null,
  finishedAt: null,
};

export function toAnalysisView(row: SentryAnalysis | null): SentryAnalysisView {
  if (!row) return NONE;
  return {
    state: row.state,
    result: row.state === "done" ? readStoredResult(row.result) : null,
    error: row.state === "failed" ? row.error : null,
    gitRef: row.gitRef,
    requestedAt: row.requestedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export async function getAnalysis(importId: string): Promise<SentryAnalysisView> {
  return toAnalysisView(await prisma.sentryAnalysis.findUnique({ where: { importId } }));
}

/** Finished analyses of several issues, keyed by import id (issues without one are absent). */
export async function getDoneAnalyses(importIds: string[]): Promise<Map<string, SentryAnalysisResult>> {
  const out = new Map<string, SentryAnalysisResult>();
  if (importIds.length === 0) return out;
  const rows = await prisma.sentryAnalysis.findMany({
    where: { importId: { in: importIds }, state: "done" },
    select: { importId: true, result: true },
  });
  for (const r of rows) {
    const result = readStoredResult(r.result);
    if (result) out.set(r.importId, result);
  }
  return out;
}

/**
 * Queue an analysis for one issue. Idempotent: a queued/running job is left
 * alone, and a finished one is only redone with `force`.
 */
export async function requestAnalysis(
  row: Pick<SentryIssueImported, "id" | "release">,
  requestedBy: string,
  force = false
): Promise<SentryAnalysisView> {
  const existing = await prisma.sentryAnalysis.findUnique({ where: { importId: row.id } });
  if (existing && (existing.state === "pending" || existing.state === "running")) {
    return toAnalysisView(existing);
  }
  if (existing && existing.state === "done" && !force) return toAnalysisView(existing);

  const fresh = {
    state: "pending" as const,
    error: null,
    release: row.release,
    gitRef: releaseToGitTag(row.release),
    requestedBy,
    requestedAt: new Date(),
    startedAt: null,
    finishedAt: null,
    leaseUntil: null,
    attempts: 0,
  };
  const saved = await prisma.sentryAnalysis.upsert({
    where: { importId: row.id },
    create: { importId: row.id, ...fresh },
    update: { ...fresh, result: Prisma.DbNull },
  });
  return toAnalysisView(saved);
}

export type ClaimedAnalysis = { id: string; importId: string; requestedBy: string | null };

/**
 * Hand the oldest queued job to a runner. Rows whose lease expired are retried
 * until `MAX_ATTEMPTS`, then failed. `SKIP LOCKED` keeps two runners from
 * taking the same row.
 */
export async function claimNextAnalysis(): Promise<ClaimedAnalysis | null> {
  // JS dates for every comparison/write so the SQL never depends on the DB session time zone.
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + LEASE_MS);
  await prisma.$executeRaw`
    UPDATE "SentryAnalysis"
    SET "state" = 'failed', "error" = 'Runner không hoàn thành sau nhiều lần thử', "finishedAt" = ${now}, "leaseUntil" = NULL
    WHERE "state" = 'running' AND "leaseUntil" < ${now} AND "attempts" >= ${MAX_ATTEMPTS}`;
  const rows = await prisma.$queryRaw<ClaimedAnalysis[]>`
    UPDATE "SentryAnalysis"
    SET "state" = 'running', "startedAt" = ${now}, "attempts" = "attempts" + 1, "leaseUntil" = ${leaseUntil}
    WHERE "id" = (
      SELECT "id" FROM "SentryAnalysis"
      WHERE "state" = 'pending' OR ("state" = 'running' AND "leaseUntil" < ${now})
      ORDER BY "requestedAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "importId", "requestedBy"`;
  return rows[0] ?? null;
}

/** Record a runner's outcome; only a `running` job can be finished. Returns false when it was not. */
export async function finishAnalysis(
  id: string,
  outcome: { ok: true; result: SentryAnalysisResult } | { ok: false; error: string }
): Promise<boolean> {
  const data: Prisma.SentryAnalysisUpdateManyMutationInput = outcome.ok
    ? { state: "done", result: outcome.result, error: null, finishedAt: new Date(), leaseUntil: null }
    : {
        state: "failed",
        error: outcome.error.slice(0, MAX_ERROR_LENGTH),
        finishedAt: new Date(),
        leaseUntil: null,
      };
  const res = await prisma.sentryAnalysis.updateMany({ where: { id, state: "running" }, data });
  return res.count === 1;
}

const MAX_TOP = 50;
const DEFAULT_ACTIVE_DAYS = 14;
const DEFAULT_MIN_EVENTS = 100;
/** Only these levels are treated as real errors; warning/info/debug are tracking noise. */
const ERROR_LEVELS = ["fatal", "error"];

export type TopOptions = {
  /** Only issues seen again within this many days ("still happening"). */
  activeDays?: number;
  /** Only issues with at least this many events ("frequent"). */
  minEvents?: number;
};

/**
 * Look at the `limit` most frequent errors that are still happening and queue an
 * analysis for those that have none. The shortlist is: review queue, level fatal/error,
 * last seen within `activeDays`, at least `minEvents` events, most events first, one per
 * kind of error (same title). An error that is already analysed keeps its slot and queues
 * nothing, so a lower-ranked error is never pulled up to replace it: once the top is
 * covered, later runs cost nothing until a new error enters the top.
 * OS/backend-level noise (ANR, HTTP 5xx, network, Firebase rules...) never counts.
 * An issue with a job in any state is left alone, so a failing one is not retried in a loop.
 */
export async function enqueueTopAnalyses(
  limit: number,
  { activeDays = DEFAULT_ACTIVE_DAYS, minEvents = DEFAULT_MIN_EVENTS }: TopOptions = {}
): Promise<{ queued: string[] }> {
  const take = Math.min(Math.max(Math.trunc(limit) || 0, 0), MAX_TOP);
  if (take === 0) return { queued: [] };
  const since = new Date(Date.now() - Math.max(activeDays, 1) * 86_400_000);
  const [candidates, analysed] = await Promise.all([
    prisma.sentryIssueImported.findMany({
      where: {
        state: "review",
        level: { in: ERROR_LEVELS },
        lastSeen: { gte: since },
        eventCount: { gte: Math.max(minEvents, 1) },
      },
      orderBy: [{ eventCount: "desc" }, { lastSeen: "desc" }],
      take: take * 8,
      select: {
        id: true,
        release: true,
        shortId: true,
        sentryIssueId: true,
        title: true,
        culprit: true,
        analysis: { select: { id: true } },
      },
    }),
    prisma.sentryIssueImported.findMany({ where: { analysis: { isNot: null } }, select: { title: true, culprit: true } }),
  ]);
  const covered = new Set(analysed.map(titleKey));
  const seen = new Set<string>();
  const queue: typeof candidates = [];
  let slots = 0;
  for (const row of candidates) {
    if (slots >= take) break;
    const key = titleKey(row);
    if (looksSystemLevel(row) || seen.has(key)) continue;
    seen.add(key);
    slots += 1;
    if (!row.analysis && !covered.has(key)) queue.push(row);
  }
  for (const row of queue) await requestAnalysis(row, "auto-top");
  return { queued: queue.map((r) => r.shortId ?? r.sentryIssueId) };
}
