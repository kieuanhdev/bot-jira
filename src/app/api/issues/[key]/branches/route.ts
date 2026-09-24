import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

/**
 * Branches linked to this issue via confirmed `BranchInfo.jiraKey`,
 * plus pending suggestions for this issue.
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

  // Confirmed links from database relation
  const rows = await prisma.branchInfo.findMany({
    where: {
      deletedAt: null,
      jiraKey: key,
      linkState: { notIn: ["rejected", "manual_unlinked"] },
    },
    orderBy: { checkedAt: "desc" },
  });

  // Query suggested branches (found candidate key in PR title, comment or unconfirmed)
  const suggestedRows = await prisma.branchInfo.findMany({
    where: {
      deletedAt: null,
      jiraKey: null,
      suggestedJiraKey: key,
      linkState: { notIn: ["rejected", "manual_unlinked"] },
    },
    orderBy: { checkedAt: "desc" },
  });

  return NextResponse.json({
    items: rows,
    suggestedItems: suggestedRows,
  });
}
