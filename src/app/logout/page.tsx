"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";
import { Skeleton } from "@/components/ui/skeleton";

export default function LogoutPage() {
  useEffect(() => {
    void signOut({ callbackUrl: "/login" });
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <Skeleton className="h-4 w-40" />
      <p className="text-sm text-muted-foreground">Đang đăng xuất…</p>
    </main>
  );
}
