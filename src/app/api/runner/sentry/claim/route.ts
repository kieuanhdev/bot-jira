import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getLatestEvent, sanitizeSentryErrorMessage } from "@/lib/sentry/client";
import { sentryCredsForProject } from "@/lib/sentry/creds-for-project";
import { digestSentryEvent, scrubSentryText, type SentryEventDigest } from "@/lib/sentry/event-digest";
import { claimNextAnalysis, finishAnalysis } from "@/lib/sentry/analysis-store";
import { releaseToGitTag } from "@/lib/sentry/analysis";
import { rejectUnlessRunner } from "@/lib/sentry/runner-auth";

const EVENT_TIMEOUT_MS = 10_000;
const MAX_TITLE = 300;

export type RunnerJob = {
  analysisId: string;
  sentryProject: string;
  release: string | null;
  gitRef: string | null;
  issue: {
    shortId: string | null;
    title: string | null;
    level: string | null;
    culprit: string | null;
    eventCount: number | null;
    userCount: number | null;
    environment: string | null;
    firstSeen: string | null;
    lastSeen: string | null;
  };
  /** Latest event, already scrubbed of secrets and personal data; null when Sentry was unreadable. */
  digest: SentryEventDigest | null;
};

/**
 * The runner asks for work: claims the oldest queued analysis and returns what
 * it needs (issue facts + latest-event digest), so the runner needs no Sentry
 * token. 204 when nothing is queued.
 */
export async function POST(req: Request) {
  const denied = rejectUnlessRunner(req);
  if (denied) return denied;

  // Auto-queued jobs whose event has no frame in the app's own code are closed here
  // (a code reading cannot explain them); a job someone asked for by hand always runs.
  for (let skipped = 0; skipped < MAX_SKIPS_PER_CLAIM; skipped++) {
    const job = await nextJob();
    if (!job) return new NextResponse(null, { status: 204 });
    if ("skip" in job) {
      await finishAnalysis(job.skip, { ok: false, error: "Bỏ qua: lỗi không có frame nào trong code của app, đọc code không giải thích được." });
      continue;
    }
    return NextResponse.json<RunnerJob>(job.payload);
  }
  return new NextResponse(null, { status: 204 });
}

const MAX_SKIPS_PER_CLAIM = 10;

async function nextJob(): Promise<{ skip: string } | { payload: RunnerJob } | null> {
  const claimed = await claimNextAnalysis();
  if (!claimed) return null;

  const row = await prisma.sentryIssueImported.findUnique({ where: { id: claimed.importId } });
  if (!row) return null;

  let digest: SentryEventDigest | null = null;
  try {
    const creds = await sentryCredsForProject(row.sentryProject);
    if (creds) {
      digest = digestSentryEvent(await getLatestEvent(row.sentryIssueId, creds, { timeoutMs: EVENT_TIMEOUT_MS }));
    }
  } catch (err) {
    logger.warn({
      message: "Sentry latest event unavailable for runner job",
      sentryImportId: row.id,
      error: sanitizeSentryErrorMessage(err instanceof Error ? err.message : String(err)),
    });
  }

  if (claimed.requestedBy === "auto-top" && digest && digest.frames.length === 0) return { skip: claimed.id };

  const payload: RunnerJob = {
    analysisId: claimed.id,
    sentryProject: row.sentryProject,
    release: row.release,
    gitRef: releaseToGitTag(row.release),
    issue: {
      shortId: row.shortId,
      title: row.title ? scrubSentryText(row.title, MAX_TITLE) : null,
      level: row.level,
      culprit: row.culprit,
      eventCount: row.eventCount,
      userCount: row.userCount,
      environment: row.environment,
      firstSeen: row.firstSeen?.toISOString() ?? null,
      lastSeen: row.lastSeen?.toISOString() ?? null,
    },
    digest,
  };
  return { payload };
}
