import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api/guards";
import { jiraWith } from "@/lib/jira/client";
import { userJiraAuth } from "@/lib/user-creds";
import { notifyWatchersOfComment } from "@/lib/issues/notify-watchers";
import { upsertJiraComments } from "@/lib/issues/cache";
import { jiraCredentialsRequired } from "@/lib/jira/credentials-required";
import { readJsonBody } from "@/lib/api/json-body";
import { IssueCommentBodySchema } from "@/lib/api/schemas";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const session = guard.session;
  const { key } = await ctx.params;

  const bodyResult = await readJsonBody(req, IssueCommentBodySchema);
  if (!bodyResult.ok) return bodyResult.response;

  const body = bodyResult.data.body?.trim() ?? "";
  if (!body) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
  });
  const auth = userJiraAuth(user);
  if (!auth) {
    return jiraCredentialsRequired();
  }
  const client = jiraWith(auth);

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

  // Notify watchers (excluding the author) that a new comment landed.
  try {
    const commentId = (created as { id?: string } | undefined)?.id ?? null;
    await notifyWatchersOfComment(key, authorName || "User", body.trim(), commentId);
  } catch {
    /* ignore notification errors */
  }

  // Cache only the returned comment; fetching every comment here can delay
  // delivery and consume other authors' comments before the sync notifies them.
  if (created?.id) {
    await upsertJiraComments(key, [created]).catch(() => null);
  }

  return NextResponse.json({ ok: true, comment: { author: authorName, body: body.trim() } });
}
