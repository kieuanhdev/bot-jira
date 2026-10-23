import type { SentryIssueImported } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { logger } from "@/lib/logger";
import { getAnalysis, requestAnalysis, type SentryAnalysisView } from "@/lib/sentry/analysis-store";
import { assertSentryRowAccess, sentryScopeFor } from "@/lib/sentry/scope";

export type SentryAnalysisResponse = SentryAnalysisView;

async function authorize(params: Promise<{ id: string }>) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  const { id } = await params;
  const scope = await sentryScopeFor(session);
  let row: SentryIssueImported;
  try {
    row = await assertSentryRowAccess(id, scope);
  } catch {
    return { response: NextResponse.json({ error: "Không tìm thấy lỗi Sentry" }, { status: 404 }) };
  }
  return { session, row };
}

/** Current analysis of one Sentry issue (`state: "none"` when never requested). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(params);
  if ("response" in auth) return auth.response;
  return NextResponse.json<SentryAnalysisResponse>(await getAnalysis(auth.row.id));
}

/**
 * Queue an analysis. A queued/running job is left alone; a finished one is only
 * redone with `?force=1`. The host-side runner picks it up and fills in the result.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(params);
  if ("response" in auth) return auth.response;
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const view = await requestAnalysis(auth.row, auth.session.user.id, force);
    return NextResponse.json<SentryAnalysisResponse>(view);
  } catch (err) {
    logger.error({
      message: "Failed to queue sentry analysis",
      sentryImportId: auth.row.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Không thể yêu cầu phân tích lỗi" }, { status: 500 });
  }
}
