import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { getIssueView } from "@/lib/issues/live";
import { refreshJiraIssueCache } from "@/lib/issues/cache";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const view = await getIssueView(key, userJiraAuth(user));
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ issue: view });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;
  const patch = (await req.json()) as {
    summary?: string;
    description?: string;
    assignee?: string | null;
    labels?: string[];
    priority?: string;
    points?: number | null;
  };

  // Act as the current user if they linked their own Jira token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const client = jiraWith(userJiraAuth(user));

  // Push metadata changes to Jira (source of truth).
  try {
    await client.updateIssue(key, patch);
  } catch (e) {
    return NextResponse.json({ error: `Jira update failed: ${(e as Error).message}` }, { status: 502 });
  }

  const cacheSynced = await refreshJiraIssueCache(client, key);
  return NextResponse.json({ ok: true, cacheSynced });
}
