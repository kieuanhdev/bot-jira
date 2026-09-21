import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { getIssueView } from "@/lib/issues/live";
import { IssueDetailClient } from "./issue-detail-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: key };
}

export default async function IssuePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const session = await getSession();
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
      })
    : null;

  // Read live from Jira (as the user) so comments posted from the web / Jira
  // show up on first paint; fall back to the cache when no token / on error.
  const view = await getIssueView(key, userJiraAuth(user));
  if (!view) notFound();
  return <IssueDetailClient issue={view} />;
}
