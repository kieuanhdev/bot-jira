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
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const url = new URL(req.url);
  const paramProjectKey = url.searchParams.get("projectKey")?.trim();

  let targetProjectKey: string | null = null;

  if (id === "tmp" || !id) {
    targetProjectKey = paramProjectKey ?? null;
    if (!targetProjectKey) {
      return NextResponse.json({ items: [] as JiraVersion[] });
    }
  } else {
    const release = await prisma.release.findUnique({
      where: { id },
      select: { projectKey: true },
    });
    if (!release) {
      if (paramProjectKey) {
        targetProjectKey = paramProjectKey;
      } else {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
    } else {
      targetProjectKey = release.projectKey || paramProjectKey || null;
    }
  }

  if (!targetProjectKey) {
    return NextResponse.json({ items: [] as JiraVersion[] });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  let auth = userJiraAuth(user);
  if (!auth) {
    const { getSystemJiraAuth } = await import("@/lib/jira/client");
    auth = await getSystemJiraAuth();
  }
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  const client = jiraWith(auth);

  try {
    const versions = await client.getVersions(targetProjectKey);
    return NextResponse.json({ items: versions });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: `Failed to list Jira versions: ${msg}` }, { status: 502 });
  }
}
