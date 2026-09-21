import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import type { JiraVersion } from "@/lib/jira/types";

/**
 * List the Jira Fix Versions for the release's project so the UI can show
 * available versions to link. Read-only proxy to Jira.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const release = await prisma.release.findUnique({
    where: { id },
    select: { projectKey: true },
  });
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!release.projectKey) {
    // Legacy label-based release has no Jira project.
    return NextResponse.json({ items: [] as JiraVersion[] });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const client = jiraWith(userJiraAuth(user));

  try {
    const versions = await client.getVersions(release.projectKey);
    return NextResponse.json({ items: versions });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: `Failed to list Jira versions: ${msg}` }, { status: 502 });
  }
}
