import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth, userJiraUsername } from "@/lib/user-creds";
import { env } from "@/lib/env";

/**
 * Tells the client whether the current user has their own Jira token linked,
 * and (if linked) their Jira identity. Used to gate the app and to default the
 * board's assignee filter to "you". There is no shared team token.
 *
 * Also returns the Jira base URL so the client can build deep links (e.g.
 * "Open in Jira"). This is a public value (the app's Jira host), not a secret.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraVerifiedAt: true,
      jiraUsername: true,
      onboarded: true,
    },
  });

  const auth = userJiraAuth(user);
  if (!auth) {
    return NextResponse.json({
      jiraLinked: false,
      onboarded: Boolean(user?.onboarded),
      jiraName: null,
      jiraVerifiedAt: user?.jiraVerifiedAt ?? null,
      jiraBaseUrl: env.jiraBaseUrl,
    });
  }

  return NextResponse.json({
    jiraLinked: true,
    onboarded: Boolean(user?.onboarded),
    jiraName: userJiraUsername(user),
    jiraVerifiedAt: user?.jiraVerifiedAt ?? null,
    jiraBaseUrl: env.jiraBaseUrl,
  });
}
