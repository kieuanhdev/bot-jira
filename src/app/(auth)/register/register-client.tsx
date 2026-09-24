"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type RegResult = { user: { email: string }; jiraConfigured: boolean };

export function RegisterClient() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // After a successful register we auto-sign-in.
  async function onRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = (await res.json()) as RegResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Không thể tạo tài khoản");
        return;
      }
      // Auto sign-in.
      const auth = await signIn("credentials", { email, password, redirect: false });
      if (!auth || auth.error) {
        setError("Tài khoản đã được tạo nhưng không thể tự đăng nhập. Hãy đăng nhập lại.");
        router.replace("/login");
        return;
      }
      router.replace("/setup-jira");
      router.refresh();
    } catch {
      setError("Lỗi kết nối mạng");
    } finally {
      setLoading(false);
    }
  }

  // Show a friendly "go link your Jira" banner once we're signed in on this page.
  const { data: session } = useSession();

  return (
    <div className="flex flex-col gap-4">
      {session?.user ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
          <CardTitle className="text-base">Chào mừng bạn</CardTitle>
            <CardDescription>
              Tài khoản đã sẵn sàng. Tiếp theo, hãy liên kết tài khoản Jira (và Bitbucket) để
              các task &amp; nhánh hiển thị chính xác dưới tên bạn.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/setup-jira")} className="w-full">
              Liên kết Jira và Bitbucket
            </Button>
          </CardContent>
        </Card>
      ) : (
        <form onSubmit={onRegister} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Họ và tên</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tên của bạn"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@team.local"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reg-password">Mật khẩu</Label>
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
              required
              minLength={6}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Đang tạo…" : "Tạo tài khoản"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Đã có tài khoản?{" "}
            <Link href="/login" className="font-medium underline underline-offset-4">
              Đăng nhập
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
