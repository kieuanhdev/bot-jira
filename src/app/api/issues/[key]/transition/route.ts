import { NextResponse } from "next/server";
import { jiraWith } from "@/lib/jira/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { notifyUser } from "@/lib/notify";
import { userJiraAuth } from "@/lib/user-creds";
import { refreshJiraIssueCache } from "@/lib/issues/cache";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;
  const { transitionId } = (await req.json()) as { transitionId: string };
  if (!transitionId) return NextResponse.json({ error: "transitionId required" }, { status: 400 });

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
  const client = jiraWith(auth);

  try {
    await client.transition(key, transitionId);
  } catch (e) {
    const err = e as { status?: number };
    const status = typeof err?.status === "number" ? err.status : null;
    if (status === 401 || status === 403) {
      // The user's Jira token was rejected or lacks permission for this
      // transition. Surface it distinctly so the UI can say "no permission"
      // rather than a generic upstream error.
      return NextResponse.json(
        { error: "You do not have permission to perform this transition.", code: "permission" },
        { status: 403 }
      );
    }
    if (status === 400 || status === 409) {
      // The workflow does not allow this transition from the current state.
      return NextResponse.json(
        { error: "This transition is not available from the current state.", code: "workflow" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: `Jira transition failed (${status ?? "unknown"})`, code: "upstream" }, { status: 502 });
  }

  const cacheSynced = await refreshJiraIssueCache(client, key);

  // Notify watchers (best-effort).
  try {
    const issue = await prisma.issueCache.findUnique({
      where: { jiraKey: key },
      include: { comments: false },
    });
    const watcherRows = await prisma.watch.findMany({
      where: { jiraKey: key },
      include: { user: true },
    });
    const targetStatus = issue?.status ?? "updated";
    const eventKey = `jira-transition:${key}:${targetStatus}:${transitionId}`;
    for (const w of watcherRows) {
      await notifyUser(w.userId, {
        type: "transition",
        title: `Trạng thái ${key} đã thay đổi`,
        body: `Trạng thái hiện tại: ${targetStatus}`,
        link: `/issue/${key}`,
        severity: "info",
        eventKey,
      }).catch(() => null);
    }
  } catch {
    /* ignore notification errors */
  }

  return NextResponse.json({ ok: true, cacheSynced });
}
