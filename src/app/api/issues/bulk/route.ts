import { NextResponse } from "next/server";
import { jiraWith } from "@/lib/jira/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { refreshJiraIssueCache } from "@/lib/issues/cache";

export type BulkAction =
  | { kind: "assign"; value: string | null }
  | { kind: "add-labels"; value: string[] }
  | { kind: "remove-labels"; value: string[] }
  | { kind: "set-points"; value: number | null }
  | { kind: "set-priority"; value: string }
  | { kind: "transition"; value: string }; // target status name

type Result = { key: string; ok: boolean; error?: string; warning?: string };

/**
 * Apply a single bulk action to many issues. Each issue is updated via the Jira
 * REST API and results are reported per-item.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { keys, action } = (await req.json()) as {
    keys: string[];
    action: BulkAction;
  };
  if (!Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: "keys required" }, { status: 400 });
  }

  // Act as the current user if they linked their own Jira token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const jira = jiraWith(userJiraAuth(user));

  const results: Result[] = [];

  for (const key of keys) {
    try {
      switch (action.kind) {
        case "assign":
          await jira.updateIssue(key, { assignee: action.value });
          break;
        case "add-labels": {
          const issue = await prisma.issueCache.findUnique({ where: { jiraKey: key }, select: { labels: true } });
          const merged = Array.from(new Set([...(issue?.labels ?? []), ...action.value]));
          await jira.updateIssue(key, { labels: merged });
          break;
        }
        case "remove-labels": {
          const issue = await prisma.issueCache.findUnique({ where: { jiraKey: key }, select: { labels: true } });
          const drop = new Set(action.value);
          const kept = (issue?.labels ?? []).filter((l) => !drop.has(l));
          await jira.updateIssue(key, { labels: kept });
          break;
        }
        case "set-points":
          await jira.updateIssue(key, { points: action.value });
          break;
        case "set-priority":
          await jira.updateIssue(key, { priority: action.value });
          break;
        case "transition": {
          const t = await jira.findTransition(key, action.value);
          if (!t) throw new Error(`No transition to "${action.value}"`);
          await jira.transition(key, t.id);
          break;
        }
        default:
          throw new Error("unknown action");
      }
      const cacheSynced = await refreshJiraIssueCache(jira, key);
      results.push({ key, ok: true, ...(!cacheSynced ? { warning: "Jira updated; cache refresh will retry in background" } : {}) });
    } catch (e) {
      results.push({ key, ok: false, error: (e as Error).message.slice(0, 200) });
    }
  }

  const okKeys = results.filter((r) => r.ok).map((r) => r.key);

  return NextResponse.json({
    results,
    success: okKeys.length,
    failed: results.length - okKeys.length,
  });
}
