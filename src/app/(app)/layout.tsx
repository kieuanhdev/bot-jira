import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { prisma } from "@/lib/prisma";
import { AppShell } from "./app-shell";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  // There is no shared team token: every user must link their own Jira token
  // before using the app. Gate the whole (app) group on that.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, onboarded: true },
  });
  // Must link Jira, then complete first-run onboarding (pick projects) once.
  if (!userJiraAuth(user) || !user?.onboarded) redirect("/setup-jira");

  return <AppShell>{children}</AppShell>;
}
