import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { recordSearchMetrics } from "@/lib/bulk/create-metrics";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";

const USER_SEARCH_CACHE_TTL_MS = 60_000;
const userSearchCache = new Map<
  string,
  { users: Array<{ id: string; username: string; displayName: string; avatar?: string }>; expiresAt: number }
>();

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const project = url.searchParams.get("project")?.trim().toUpperCase();
  if (!project) {
    return NextResponse.json({ error: "Missing project query parameter" }, { status: 400 });
  }

  const rawQuery = url.searchParams.get("q")?.trim() ?? "";
  const query = rawQuery.slice(0, 100);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)), 50);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
  });

  const auth = userJiraAuth(user);
  if (!auth || !auth.token) {
    return jiraCredentialsRequired();
  }

  const cacheKey = `${auth.token.slice(0, 8)}:${project}:${query.toLowerCase()}:${limit}`;
  const cached = userSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ users: cached.users });
  }

  const jira = jiraWith(auth);
  try {
    const searchStart = Date.now();
    const rawUsers = await jira.searchAssignableUsers(project, query, limit);
    const durationMs = Date.now() - searchStart;
    const users = rawUsers
      .filter((u) => u.name || u.displayName)
      .map((u) => ({
        id: u.name ?? u.key ?? "",
        username: u.name ?? "",
        displayName: u.displayName ?? u.name ?? "",
        avatar: u.avatarUrls?.["24x24"] || u.avatarUrls?.["48x48"] || undefined,
      }))
      .filter((u) => u.username);

    recordSearchMetrics({
      type: "assignees",
      projectKey: project,
      query,
      durationMs,
      resultCount: users.length,
    });

    userSearchCache.set(cacheKey, { users, expiresAt: Date.now() + USER_SEARCH_CACHE_TTL_MS });
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof JiraRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
