import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth, userJiraUsername } from "@/lib/user-creds";

/**
 * Tells the client whether the current user has their own Jira token linked,
 * and (if linked) their Jira identity. Used to gate the app and to default the
 * board's assignee filter to "you". There is no shared team token.
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
    });
  }

  return NextResponse.json({
    jiraLinked: true,
    onboarded: Boolean(user?.onboarded),
    jiraName: userJiraUsername(user),
    jiraVerifiedAt: user?.jiraVerifiedAt ?? null,
  });
}
