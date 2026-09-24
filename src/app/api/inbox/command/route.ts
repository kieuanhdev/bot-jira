import { NextResponse } from "next/server";
import { jiraWith } from "@/lib/jira/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseCommand } from "@/lib/inbox/parser";
import { userJiraAuth } from "@/lib/user-creds";
import { refreshJiraIssueCache } from "@/lib/issues/cache";

export type CommandResult = {
  key: string;
  ok: boolean;
  error?: string;
  transitionedTo?: string;
};

/**
 * Accept a free-form command, parse it, and apply the transition to each key.
 * Returns per-key results so the UI can show a transcript.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { text } = (await req.json()) as { text: string };
  const parsed = parseCommand(text);

  if (!parsed.ok) {
    return NextResponse.json({
      ok: false,
      reason: parsed.reason,
      results: [] as CommandResult[],
    });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json(
      { error: "Bạn cần cấu hình token Jira cá nhân trong Settings.", code: "jira_credentials_required" },
      { status: 428 }
    );
  }
  const jira = jiraWith(auth);

  const results: CommandResult[] = [];
  for (const key of parsed.keys) {
    try {
      const t = await jira.findTransition(key, parsed.status);
      if (!t) {
        results.push({ key, ok: false, error: `No transition to "${parsed.status}" from current state` });
        continue;
      }
      await jira.transition(key, t.id);
      await refreshJiraIssueCache(jira, key);
      results.push({ key, ok: true, transitionedTo: t.to?.name ?? parsed.status });
    } catch (e) {
      results.push({ key, ok: false, error: (e as Error).message.slice(0, 200) });
    }
  }

  return NextResponse.json({
    ok: true,
    status: parsed.status,
    results,
  });
}
