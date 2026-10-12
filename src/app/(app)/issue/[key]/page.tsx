import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { getSystemJiraAuth } from "@/lib/jira/client";
import { getCachedIssueView, getIssueView } from "@/lib/issues/live";
import { IssueDetailClient } from "./issue-detail-client";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: key };
}

export default async function IssuePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  // Paint from the DB cache right away; the client then refreshes from Jira live.
  const cachedView = await getCachedIssueView(key);
  if (cachedView) return <IssueDetailClient issue={cachedView} refreshOnMount />;

  // Never synced locally: fall back to the blocking live read.
  const session = await getSession();
  const user = session?.user?.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
      })
    : null;
  const auth = userJiraAuth(user) || (await getSystemJiraAuth());
  const view = await getIssueView(key, auth);
  if (!view) notFound();
  return <IssueDetailClient issue={view} />;
}
