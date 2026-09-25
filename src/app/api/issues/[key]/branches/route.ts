import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth, userBitbucketCreds } from "@/lib/user-creds";
import { jiraWith } from "@/lib/jira/client";
import { createBranchForIssue, type BranchParams } from "@/lib/bulk/ops";

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

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      bitbucketUserEnc: true,
      bitbucketTokenEnc: true,
    },
  });

  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }

  const bbCreds = userBitbucketCreds(user);
  if (!bbCreds) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình Bitbucket trong Settings để tạo nhánh.", code: "bitbucket_credentials_required" },
      { status: 428 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as BranchParams;
  const jira = jiraWith(auth);
  const result = await createBranchForIssue(jira, key, body, bbCreds);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, branch: result.branch, repo: result.repo });
}
