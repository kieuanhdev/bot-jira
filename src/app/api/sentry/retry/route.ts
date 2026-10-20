import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { SentryRetryBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";

/**
 * Retry one failed import row. Resets its attempt counter and error and marks
 * it approved so the worker files it again. Admin-only.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsedBody = await readJsonBody(req, SentryRetryBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const row = await prisma.sentryIssueImported.findUnique({ where: { id: body.id } });
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  await prisma.sentryIssueImported.update({
    where: { id: row.id },
    data: { state: "approved", attemptCount: 0, lastError: null, lastAttemptAt: null },
  });

  return NextResponse.json({ ok: true, id: row.id, state: "approved" });
}
