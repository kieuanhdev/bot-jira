import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession, isAdmin } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { getCurrentUserGate } from "@/lib/user-gate";
import { AppShell } from "./app-shell";
import { SessionHydrator } from "./session-hydrator";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  // Shared service credentials are only for background synchronization. Every
  // interactive user must link a verified personal Jira account and finish project onboarding.
  // Bitbucket is optional and configured in Settings.
  const [user, cookieStore] = await Promise.all([
    getCurrentUserGate(session.user.id),
    cookies(),
  ]);

  if (!user) {
    redirect("/login");
  }

  if (!userJiraAuth(user) || !user.jiraVerifiedAt || !user.onboarded) {
    redirect("/setup-jira");
  }

  const defaultCollapsed = cookieStore.get("sidebar_collapsed")?.value === "true";

  return (
    <SessionHydrator session={session}>
      <AppShell isAdmin={isAdmin(session)} defaultCollapsed={defaultCollapsed}>
        {children}
      </AppShell>
    </SessionHydrator>
  );
}
