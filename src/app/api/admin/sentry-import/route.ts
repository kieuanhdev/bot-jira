import { NextResponse } from "next/server";
import type { ImportState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getSession, isAdmin } from "@/lib/session";
import { getJiraIssueUrl } from "@/lib/utils";

const STATES: ImportState[] = ["review", "pending", "approved", "created", "rejected", "failed", "ignored"];

/**
 * Admin view of the Sentry import queue: the review list (new Sentry issues
 * waiting for a decision) plus approved/created/rejected/failed rows. Accepts
 * `?state=a,b`; `review` also matches legacy `pending` rows. Admin-only.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!isAdmin(session)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(req.url);
  const requested = (url.searchParams.get("state") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is ImportState => (STATES as string[]).includes(s));
  if (requested.includes("review")) requested.push("pending");

  const [items, grouped] = await Promise.all([
    prisma.sentryIssueImported.findMany({
      where: requested.length ? { state: { in: requested } } : undefined,
      orderBy: [{ lastSeen: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.sentryIssueImported.groupBy({ by: ["state"], _count: { _all: true } }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) {
    const key = g.state === "pending" ? "review" : g.state;
    counts[key] = (counts[key] ?? 0) + g._count._all;
  }

  return NextResponse.json({
    counts,
    requireApproval: env.sentryImportRequireApproval,
    items: items.map((r) => ({
      id: r.id,
      sentryProject: r.sentryProject,
      sentryIssueId: r.sentryIssueId,
      shortId: r.shortId,
      title: r.title,
      level: r.level,
      permalinkUrl: r.permalinkUrl,
      eventCount: r.eventCount,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
      targetProject: r.targetProject,
      jiraKey: r.jiraKey,
      jiraUrl: getJiraIssueUrl(env.jiraBaseUrl, r.jiraKey),
      state: r.state === "pending" ? "review" : r.state,
      attemptCount: r.attemptCount,
      lastError: r.lastError,
      lastAttemptAt: r.lastAttemptAt,
      importedAt: r.importedAt,
      reviewedBy: r.reviewedBy,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
  });
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
