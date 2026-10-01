import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { jiraWith, JiraRequestError } from "@/lib/jira/client";
import { recordSearchMetrics } from "@/lib/bulk/create-metrics";

const PARENT_SEARCH_CACHE_TTL_MS = 30_000;
const parentSearchCache = new Map<
  string,
  { issues: Array<{ key: string; summary: string; issueTypeName: string; status: string }>; expiresAt: number }
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
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }

  const cacheKey = `${auth.token.slice(0, 8)}:${project}:${query.toLowerCase()}:${limit}`;
  const cached = parentSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({ issues: cached.issues });
  }

  const jira = jiraWith(auth);
  try {
    const searchStart = Date.now();
    const issues = await jira.searchParentIssues(project, query, limit);
    const durationMs = Date.now() - searchStart;

    recordSearchMetrics({
      type: "parents",
      projectKey: project,
      query,
      durationMs,
      resultCount: issues.length,
    });

    parentSearchCache.set(cacheKey, { issues, expiresAt: Date.now() + PARENT_SEARCH_CACHE_TTL_MS });
    return NextResponse.json({ issues });
  } catch (err) {
    if (err instanceof JiraRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.status || 500 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
