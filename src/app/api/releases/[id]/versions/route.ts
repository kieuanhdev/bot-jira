import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import type { JiraVersion } from "@/lib/jira/types";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { findReleaseById } from "@/lib/releases/repository";
import { fetchProjectJiraVersions } from "@/lib/releases/jira-mutation";

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
    const release = await findReleaseById(id);
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
    return jiraCredentialsRequired();
  }

  try {
    const versions = await fetchProjectJiraVersions(targetProjectKey, auth);
    return NextResponse.json({ items: versions });
  } catch (e) {
    const msg = (e as Error).message;
    return NextResponse.json({ error: `Failed to list Jira versions: ${msg}` }, { status: 502 });
  }
}
