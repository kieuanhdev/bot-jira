import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";

/**
 * M2 — Admin view of the Sentry import queue. Lists pending/failed rows so an
 * operator can see what is stuck and why, and trigger a retry of one.
 * Read + retry are admin-only.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? undefined;

  const items = await prisma.sentryIssueImported.findMany({
    where: state ? { state: state as "pending" | "created" | "failed" | "ignored" } : undefined,
    orderBy: [{ state: "asc" }, { lastAttemptAt: "desc" }],
    take: 200,
  });

  return NextResponse.json({
    items: items.map((r) => ({
      id: r.id,
      sentryProject: r.sentryProject,
      sentryIssueId: r.sentryIssueId,
      jiraKey: r.jiraKey,
      state: r.state,
      attemptCount: r.attemptCount,
      lastError: r.lastError,
      lastAttemptAt: r.lastAttemptAt,
      importedAt: r.importedAt,
    })),
  });
}

/**
 * Retry one import row. Resets its attempt counter and error so the scheduled
 * `sentry-import` worker picks it up again. Admin-only.
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
    data: { state: "pending", attemptCount: 0, lastError: null, lastAttemptAt: new Date() },
  });

  return NextResponse.json({ ok: true, id: row.id, state: "pending" });
}
