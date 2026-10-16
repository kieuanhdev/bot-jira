import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { listSentryImports } from "@/lib/admin/sentry";

export { listSentryImports };

/**
 * Admin view of the Sentry import queue: the review list (new Sentry issues
 * waiting for a decision) plus approved/created/rejected/failed rows. Accepts
 * `?state=a,b`; `review` also matches legacy `pending` rows. Admin-only.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const stateParam = url.searchParams.get("state") ?? undefined;
  const data = await listSentryImports(stateParam);

  return NextResponse.json(data);
}

/**
 * Retry one failed import row. Resets its attempt counter and error and marks
 * it approved so the `sentry-import` worker files it again. Admin-only.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json()) as { id?: string };
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const row = await prisma.sentryIssueImported.findUnique({ where: { id: body.id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.sentryIssueImported.update({
    where: { id: row.id },
    data: { state: "approved", attemptCount: 0, lastError: null, lastAttemptAt: null },
  });

  return NextResponse.json({ ok: true, id: row.id, state: "approved" });
}
