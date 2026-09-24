import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterClient } from "./register-client";

export const metadata: Metadata = { title: "Đăng ký tài khoản" };

export default function RegisterPage() {
  // Public registration is deprecated in favor of Jira token login.
  // Redirect to /login unless legacy password login is explicitly enabled.
  if (process.env.LEGACY_PASSWORD_LOGIN !== "1") {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Bot className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <CardTitle className="text-xl">Tạo tài khoản mới</CardTitle>
          <CardDescription>
            (Chế độ chuyển tiếp) Tham gia bảng công việc nhóm.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegisterClient />
        </CardContent>
      </Card>
    </div>
  );
}
