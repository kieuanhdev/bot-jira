import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Lightweight issue lookup (key / summary) from IssueCache, used by pickers
 * such as the branch → Jira task link dialog.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ items: [] });

  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "8", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 20)) : 8;

  const items = await prisma.issueCache.findMany({
    where: {
      OR: [
        { jiraKey: { startsWith: q.toUpperCase() } },
        { jiraKey: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { jiraKey: true, summary: true, status: true, statusCategory: true, assigneeJira: true },
    orderBy: [{ updatedAt: { sort: "desc", nulls: "last" } }],
    take: limit,
  });

  return NextResponse.json({ items });
}
