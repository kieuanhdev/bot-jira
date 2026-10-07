import type { Metadata } from "next";
import { Suspense } from "react";
import { Bot, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginClient } from "./login-client";

export const metadata: Metadata = {
  title: "Kết nối Jira — Team Task Web",
  description: "Đăng nhập nhanh chóng và bảo mật vào Team Task Web bằng Jira API token.",
};

export default function LoginPage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 overflow-hidden bg-background">
      {/* Ambient background glows */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[420px] bg-primary/15 blur-[120px] rounded-full dark:bg-primary/20"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-10 w-[450px] h-[350px] bg-secondary/15 blur-[120px] rounded-full dark:bg-secondary/15"
        aria-hidden="true"
      />

      {/* Subtle background tech pattern */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-15 dark:opacity-20"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md flex flex-col gap-6">
        {/* Status pill badge */}
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Jira Data Center & Cloud Workspace</span>
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-border/80 bg-card/90 backdrop-blur-xl shadow-2xl transition-all duration-300">
          <CardHeader className="items-center text-center pb-5">
            <div className="mb-3 relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 shadow-inner">
              <Bot className="h-7 w-7 text-primary" aria-hidden="true" />
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              Team Task Web
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-xs leading-relaxed">
              Kết nối một lần bằng Jira Personal Access Token để đồng bộ task, worklog và bảng công việc nhóm.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-0">
            <Suspense fallback={<Skeleton className="h-56 w-full rounded-lg" />}>
              <LoginClient />
            </Suspense>
          </CardContent>
        </Card>

        {/* Footer info */}
        <footer className="text-center text-xs text-muted-foreground">
          <p>© Team Task Web · Nền tảng điều phối công việc nội bộ</p>
        </footer>
      </div>
    </main>
  );
}
