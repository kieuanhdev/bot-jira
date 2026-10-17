import { NextResponse } from "next/server";
import type { ImportState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { audit } from "@/lib/audit";

// Jira's own limits for a summary (255) and a description (~32k).
const MAX_SUMMARY = 255;
const MAX_DESCRIPTION = 30_000;

type Decision = "approve" | "reject" | "reopen";

// Allowed source states per decision; the target state is applied atomically
// so double-clicks and concurrent reviewers cannot both win.
const TRANSITIONS: Record<Decision, { from: ImportState[]; to: ImportState }> = {
  approve: { from: ["review", "pending", "rejected"], to: "approved" },
  reject: { from: ["review", "pending"], to: "rejected" },
  reopen: { from: ["rejected"], to: "review" },
};

/**
 * Decide on Sentry issues in the review queue. Approving queues the Jira task
 * (filed by the `sentry-import` worker, triggered right away); rejecting
 * keeps the issue out of Jira for good unless it is reopened. Admin-only.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { ids?: unknown; decision?: unknown; summary?: unknown; description?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.length > 0).slice(0, 100)
    : [];
  const decision = body.decision as Decision;
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (!Object.hasOwn(TRANSITIONS, decision)) {
    return NextResponse.json({ error: "decision must be approve, reject or reopen" }, { status: 400 });
  }

  // Edits to the generated Jira task apply to a single approved issue only.
  const edits: { draftSummary?: string; draftDescription?: string } = {};
  if (decision === "approve" && ids.length === 1) {
    if (typeof body.summary === "string") {
      const summary = body.summary.trim();
      if (!summary || summary.length > MAX_SUMMARY || /[\r\n]/.test(summary)) {
        return NextResponse.json(
          { error: `Tiêu đề phải có 1 dòng, dài tối đa ${MAX_SUMMARY} ký tự` },
          { status: 400 }
        );
      }
      edits.draftSummary = summary;
    }
    if (typeof body.description === "string") {
      if (body.description.length > MAX_DESCRIPTION) {
        return NextResponse.json(
          { error: `Mô tả dài tối đa ${MAX_DESCRIPTION} ký tự` },
          { status: 400 }
        );
      }
      edits.draftDescription = body.description;
    }
  }

  const { from, to } = TRANSITIONS[decision];
  const result = await prisma.sentryIssueImported.updateMany({
    where: { id: { in: ids }, state: { in: from } },
    data: {
      state: to,
      reviewedBy: session.user.email ?? session.user.id,
      reviewedAt: new Date(),
      ...(decision === "approve" ? { attemptCount: 0, lastError: null, lastAttemptAt: null } : {}),
      ...edits,
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Không còn issue nào ở trạng thái phù hợp" }, { status: 409 });
  }

  await audit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: `admin.sentry.${decision}`,
    target: ids.join(",").slice(0, 500),
    after: { state: to, count: result.count, edited: Object.keys(edits).length > 0 },
    source: "web",
  });

  let queued = false;
  if (decision === "approve") {
    try {
      const { enqueueSentryImport } = await import("@/lib/queue/boss");
      queued = (await enqueueSentryImport()) !== null;
    } catch {
      /* the 5-minute cron files approved rows anyway */
    }
  }

  return NextResponse.json({ ok: true, updated: result.count, state: to, queued });
}
