import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { prisma } from "@/lib/prisma";
import { jiraProjectList } from "@/lib/env";
import { SetupJiraClient } from "./setup-jira-client";

export const metadata: Metadata = { title: "Set up Jira" };
export const dynamic = "force-dynamic";

export default async function SetupJiraPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, onboarded: true, boardProjects: true },
  });

  // Already fully set up? Go to the board.
  if (userJiraAuth(user) && user?.onboarded) redirect("/board");

  const step = userJiraAuth(user) ? "projects" : "token";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {step === "projects" ? "Choose your projects" : "Connect your Jira"}
          </CardTitle>
          <CardDescription>
            {step === "projects"
              ? "Pick which Jira projects to show on your board. Leave none selected to show nothing."
              : "You must link your own Jira account to use this app. Your board will show the tasks assigned to you. Tokens are encrypted and stored only on your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupJiraClient step={step} availableProjects={jiraProjectList} initialProjects={user?.boardProjects ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
