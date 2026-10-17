import { NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasOpenAiConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { generateJson } from "@/lib/ai/generate-json";
import { isAiUnavailable } from "@/lib/ai/errors";
import { buildSentrySummaryPrompt, parseSentrySummary } from "@/lib/ai/sentry-summary-prompt";
import { getLatestEvent, sanitizeSentryErrorMessage } from "@/lib/sentry/client";
import { sentryCredsForProject } from "@/lib/sentry/creds-for-project";
import { digestSentryEvent, type SentryEventDigest } from "@/lib/sentry/event-digest";
import { MSG_NOT_FOUND } from "@/lib/sentry/create-from-form";

const EVENT_TIMEOUT_MS = 10_000;

/**
 * AI rewrite of one Sentry issue into a task summary/description for the admin
 * review form. Reads the latest event (stacktrace) when some stored Sentry token
 * can; otherwise summarizes from the imported snapshot (`usedEvent: false`).
 * Nothing is persisted. Admin-only.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!hasOpenAiConfig()) {
    return NextResponse.json({ error: "AI chưa được cấu hình" }, { status: 503 });
  }
  const { id } = await params;

  const row = await prisma.sentryIssueImported.findUnique({
    where: { id },
    select: {
      sentryProject: true,
      sentryIssueId: true,
      shortId: true,
      title: true,
      permalinkUrl: true,
      level: true,
      eventCount: true,
      firstSeen: true,
      lastSeen: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: MSG_NOT_FOUND }, { status: 404 });
  }

  let digest: SentryEventDigest | null = null;
  try {
    const creds = await sentryCredsForProject(row.sentryProject);
    if (creds) {
      const event = await getLatestEvent(row.sentryIssueId, creds, { timeoutMs: EVENT_TIMEOUT_MS });
      digest = digestSentryEvent(event);
    }
  } catch (err) {
    logger.warn({
      message: "Sentry latest event unavailable for AI summary",
      sentryImportId: id,
      error: sanitizeSentryErrorMessage(err instanceof Error ? err.message : String(err)),
    });
    digest = null;
  }

  try {
    const result = await generateJson(buildSentrySummaryPrompt(row, digest), (obj) =>
      parseSentrySummary(obj, row)
    );
    return NextResponse.json({ ...result, usedEvent: digest !== null });
  } catch (err) {
    if (isAiUnavailable(err)) {
      return NextResponse.json({ error: "AI không phản hồi, thử lại" }, { status: 502 });
    }
    logger.error({
      message: "Sentry AI summary failed",
      sentryImportId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Không thể tóm tắt lỗi bằng AI" }, { status: 500 });
  }
}
