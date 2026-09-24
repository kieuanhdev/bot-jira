import type { Metadata } from "next";
import { Suspense } from "react";
import { Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Kết nối Jira — Team Task Web",
  description: "Đăng nhập nhanh chóng và bảo mật vào Team Task Web bằng Jira API token.",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Bot className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">Team Task Web</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Kết nối Jira token của bạn một lần để truy cập bảng công việc nhóm
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 w-full rounded-md" />}>
            <LoginClient />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
