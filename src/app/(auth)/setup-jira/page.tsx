import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { prisma } from "@/lib/prisma";
import { jiraProjectList } from "@/lib/env";
import { SetupJiraClient } from "./setup-jira-client";

export const metadata: Metadata = { title: "Thiết lập dự án & Jira" };
export const dynamic = "force-dynamic";

export default async function SetupJiraPage() {
  const session = await getSession();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      jiraUserEnc: true,
      jiraTokenEnc: true,
      jiraAuth: true,
      jiraVerifiedAt: true,
      onboarded: true,
      boardProjects: true,
    },
  });

  const jiraReady = Boolean(userJiraAuth(user) && user?.jiraVerifiedAt);
  if (jiraReady && user?.onboarded) redirect("/board");

  const step = !jiraReady ? "jira" : "projects";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">
            {step === "projects" ? "Chọn các dự án của bạn" : "Kết nối Jira của bạn"}
          </CardTitle>
          <CardDescription>
            {step === "projects"
              ? "Chọn các dự án Jira muốn hiển thị trên bảng công việc của bạn."
              : "Mọi cập nhật task sẽ dùng đúng tài khoản Jira của bạn. Dữ liệu task được đồng bộ và chia sẻ cho cả đội."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetupJiraClient step={step} availableProjects={jiraProjectList} initialProjects={user?.boardProjects ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
