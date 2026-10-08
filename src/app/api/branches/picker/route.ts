import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { confirmedKeysByBranch } from "@/lib/bitbucket/branch-links";

/**
 * Branch picker for "attach branch to task". Lists live branches that are not yet
 * linked to `jiraKey` — including branches that already deliver another task,
 * since one branch may be linked to several tasks.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const jiraKey = (url.searchParams.get("jiraKey") ?? "").trim().toUpperCase();
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "15", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 50)) : 15;

  const rows = await prisma.branchInfo.findMany({
    where: {
      deletedAt: null,
      linkState: { notIn: ["rejected", "manual_unlinked"] },
      ...(jiraKey
        ? { NOT: { issueLinks: { some: { jiraKey, linkState: "confirmed" } } } }
        : {}),
      ...(q
        ? {
            OR: [
              { branch: { contains: q, mode: "insensitive" } },
              { repo: { contains: q, mode: "insensitive" } },
              { prTitle: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastCommitAt: { sort: "desc", nulls: "last" } }, { checkedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      repo: true,
      branch: true,
      prTitle: true,
      prState: true,
      lastCommitAt: true,
    },
  });

  const keys = await confirmedKeysByBranch(rows.map((r) => r.id));
  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      lastCommitAt: r.lastCommitAt ? r.lastCommitAt.toISOString() : null,
      linkedKeys: keys.get(r.id) ?? [],
    })),
  });
}
