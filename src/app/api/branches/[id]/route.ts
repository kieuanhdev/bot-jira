import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { evaluateBranchAttention } from "@/lib/bitbucket/branch-risk";
import { env } from "@/lib/env";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const branch = await prisma.branchInfo.findUnique({
    where: { id },
    include: {
      issue: {
        select: {
          jiraKey: true,
          summary: true,
          description: true,
          status: true,
          statusCategory: true,
          assigneeJira: true,
          priority: true,
          points: true,
          dueDate: true,
          labels: true,
          fixVersionNames: true,
        },
      },
    },
  });

  if (!branch) {
    return NextResponse.json({ error: "Branch not found" }, { status: 404 });
  }

  const attentionSignals = evaluateBranchAttention({
    jiraKey: branch.jiraKey,
    suggestedJiraKey: branch.suggestedJiraKey,
    taskStatus: branch.issue?.status,
    taskStatusCategory: branch.issue?.statusCategory,
    prState: branch.prState,
    merged: branch.merged,
    checkedAt: branch.checkedAt,
  });

  const baseBbUrl = env.bitbucketBaseUrl.replace(/\/$/, "");
  const [projectKey, repoSlug] = branch.repo.split("/");
  const branchBitbucketUrl =
    projectKey && repoSlug
      ? `${baseBbUrl}/projects/${projectKey}/repos/${repoSlug}/browse?at=refs%2Fheads%2F${encodeURIComponent(branch.branch)}`
      : null;

  return NextResponse.json({
    branch: {
      ...branch,
      attentionSignals,
      externalUrls: {
        bitbucketBranch: branchBitbucketUrl,
        bitbucketPr: branch.prUrl ?? null,
      },
    },
  });
}
