import type { SentryIssueImported } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { getLatestEvent, sanitizeSentryErrorMessage } from "@/lib/sentry/client";
import { sentryCredsForProject } from "@/lib/sentry/creds-for-project";
import { digestSentryEvent, type SentryEventDigest } from "@/lib/sentry/event-digest";
import { assertSentryRowAccess, sentryScopeFor } from "@/lib/sentry/scope";

const EVENT_TIMEOUT_MS = 10_000;

export type SentryDetailResponse = {
  digest: SentryEventDigest | null;
  /** Why `digest` is null: nobody holds a token that can read the project, or Sentry failed. */
  reason: "ok" | "no_token" | "error";
};

/**
 * Latest event of one Sentry issue (exception, in-app stack frames, whitelisted
 * tags), already scrubbed of secrets and personal data by `digestSentryEvent`.
 * Read on demand for the detail drawer; nothing is persisted.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const scope = await sentryScopeFor(session);

  let row: SentryIssueImported;
  try {
    row = await assertSentryRowAccess(id, scope);
  } catch {
    return NextResponse.json({ error: "Không tìm thấy lỗi Sentry" }, { status: 404 });
  }

  try {
    const creds = await sentryCredsForProject(row.sentryProject);
    if (!creds) {
      return NextResponse.json<SentryDetailResponse>({ digest: null, reason: "no_token" });
    }
    const event = await getLatestEvent(row.sentryIssueId, creds, { timeoutMs: EVENT_TIMEOUT_MS });
    return NextResponse.json<SentryDetailResponse>({ digest: digestSentryEvent(event), reason: "ok" });
  } catch (err) {
    logger.warn({
      message: "Sentry latest event unavailable for detail",
      sentryImportId: id,
      error: sanitizeSentryErrorMessage(err instanceof Error ? err.message : String(err)),
    });
    return NextResponse.json<SentryDetailResponse>({ digest: null, reason: "error" });
  }
}
