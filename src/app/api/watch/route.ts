import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/** List the current user's watched tasks, joined with their cache data. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const watches = await prisma.watch.findMany({
    where: { userId: session.user.id },
    orderBy: { watchedAt: "desc" },
  });
  if (watches.length === 0) return NextResponse.json({ items: [] });

  const keys = watches.map((w) => w.jiraKey);
  const issues = await prisma.issueCache.findMany({
    where: { jiraKey: { in: keys } },
    select: {
      jiraKey: true,
      summary: true,
      status: true,
      assigneeJira: true,
      points: true,
      labels: true,
      updatedAt: true,
    },
  });
  const byKey = new Map(issues.map((i) => [i.jiraKey, i]));

  return NextResponse.json({
    items: watches
      .map((w) => {
        const issue = byKey.get(w.jiraKey);
        return issue ? { ...issue, watchedAt: w.watchedAt } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  });
}
