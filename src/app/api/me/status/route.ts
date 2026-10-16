import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth, userJiraUsername } from "@/lib/user-creds";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";

export async function getMeStatus(sessionUser: { id: string; role?: string }) {
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraVerifiedAt: true,
      jiraUsername: true,
      onboarded: true,
      role: true,
    },
  });

  const auth = userJiraAuth(user);

  const base = {
    onboarded: Boolean(user?.onboarded),
    jiraVerifiedAt: user?.jiraVerifiedAt ? user.jiraVerifiedAt.toISOString() : null,
    jiraBaseUrl: env.jiraBaseUrl,
    bitbucketBaseUrl: env.bitbucketBaseUrl || null,
    role: user?.role ?? sessionUser.role ?? "member",
    canBoardTeam: can({ user: { role: user?.role ?? sessionUser.role } }, "board.team"),
  };

  if (!auth) {
    return {
      jiraLinked: false,
      jiraName: null,
      ...base,
    };
  }

  return {
    jiraLinked: true,
    jiraName: userJiraUsername(user),
    ...base,
  };
}

/**
 * Tells the client whether the current user has their own Jira token linked,
 * and (if linked) their Jira identity. Used to gate the app and to default the
 * board's assignee filter to "you". There is no shared team token.
 *
 * Also returns the Jira base URL so the client can build deep links (e.g.
 * "Open in Jira"). This is a public value (the app's Jira host), not a secret.
 */
export async function GET() {
  const reqStart = Date.now();
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await getMeStatus(session.user);
  const dur = Date.now() - reqStart;
  const headers = { "Server-Timing": `total;dur=${dur}` };

  return NextResponse.json(result, { headers });
}

