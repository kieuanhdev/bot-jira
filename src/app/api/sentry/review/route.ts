import { NextResponse } from "next/server";
import type { ImportState } from "@prisma/client";
import { readJsonBody } from "@/lib/api/json-body";
import { SentryReviewBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import { assertSentryRowAccess, sentryScopeFor } from "@/lib/sentry/scope";

type Decision = "reject" | "reopen";

const TRANSITIONS: Record<Decision, { from: ImportState[]; to: ImportState }> = {
  reject: { from: ["review", "pending"], to: "rejected" },
  reopen: { from: ["rejected"], to: "review" },
};

/**
 * Reject or reopen Sentry issues. Scoped to the projects the authenticated
 * user is allowed to access.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsedBody = await readJsonBody(req, SentryReviewBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const ids = body.ids;
  const decision = body.decision as Decision;

  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
  if (body.decision === "approve") {
    return NextResponse.json(
      { error: "Thao tác duyệt đã được thay thế bằng tạo task qua bulk-create" },
      { status: 400 }
    );
  }
  if (!Object.hasOwn(TRANSITIONS, decision)) {
    return NextResponse.json({ error: "decision must be reject or reopen" }, { status: 400 });
  }

  const scope = await sentryScopeFor(session);

  // Validate that every requested id exists and is accessible in the user's scope
  try {
    await Promise.all(ids.map((id) => assertSentryRowAccess(id, scope)));
  } catch {
    return NextResponse.json({ error: "Không tìm thấy lỗi Sentry" }, { status: 404 });
  }

  const { from, to } = TRANSITIONS[decision];
  const result = await prisma.sentryIssueImported.updateMany({
    where: { id: { in: ids }, state: { in: from } },
    data: {
      state: to,
      reviewedBy: session.user.email ?? session.user.id,
      reviewedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Không còn issue nào ở trạng thái phù hợp" }, { status: 409 });
  }

  await audit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: `sentry.${decision}`,
    target: ids.join(",").slice(0, 500),
    after: { state: to, count: result.count },
    source: "web",
  });

  return NextResponse.json({ ok: true, updated: result.count, state: to });
}
