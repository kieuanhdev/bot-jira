import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { notifyUser } from "@/lib/notify";
import { upsertJiraComments } from "@/lib/issues/cache";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { key } = await ctx.params;
  const { body } = (await req.json()) as { body?: string };
  if (!body?.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  // Act as the current user when they've linked their own Jira token;
  // otherwise fall back to the shared team token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
  });
  const client = jiraWith(userJiraAuth(user));

  let created;
  try {
    created = await client.addComment(key, body.trim());
  } catch (e) {
    return NextResponse.json({ error: `Jira error: ${(e as Error).message}` }, { status: 502 });
  }

  const authorName =
    (created as { author?: { displayName?: string; name?: string } } | undefined)?.author
      ?.displayName ||
    user?.jiraUsername ||
    session.user.name ||
    session.user.email;

  // Refresh the comment cache from Jira so the new comment shows up locally.
  try {
    const comments = await client.getComments(key);
    await upsertJiraComments(key, comments);
  } catch {
    // Cache refresh is best-effort; the comment is already in Jira.
  }

  // Notify watchers (excluding the author) that a new comment landed.
  try {
    let authorUserId: string | null = null;
    try {
      const authorUser = await prisma.user.findFirst({
        where: { jiraUsername: authorName },
        select: { id: true },
      });
      authorUserId = authorUser?.id ?? null;
    } catch {
      /* identity mapping is best-effort */
    }

    const watcherRows = await prisma.watch.findMany({
      where: { jiraKey: key },
      select: { userId: true },
    });
    for (const w of watcherRows) {
      if (w.userId === authorUserId) continue;
      await notifyUser(w.userId, {
        type: "comment",
        title: `New comment on ${key}`,
        body: `${authorName}: ${body.trim().slice(0, 160)}`,
        link: `/issue/${key}`,
      }).catch(() => null);
    }
  } catch {
    /* ignore notification errors */
  }

  return NextResponse.json({ ok: true, comment: { author: authorName, body: body.trim() } });
}
