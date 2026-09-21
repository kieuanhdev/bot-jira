import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Branches linked to this issue via a `branch:<name>` label.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const issue = await prisma.issueCache.findUnique({
    where: { jiraKey: key },
    select: { labels: true },
  });
  if (!issue) return NextResponse.json({ error: "not found" }, { status: 404 });

  const branchNames = issue.labels
    .filter((l) => l.startsWith("branch:"))
    .map((l) => l.slice("branch:".length));

  if (branchNames.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const rows = await prisma.branchInfo.findMany({
    where: { branch: { in: branchNames } },
    orderBy: { checkedAt: "desc" },
  });
  return NextResponse.json({ items: rows });
}
