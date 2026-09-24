"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { KeyRound, ShieldCheck, ChevronDown, ChevronUp, AlertCircle, ExternalLink } from "lucide-react";

export function LoginClient() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [showBasicAuth, setShowBasicAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Legacy fallback support for break-glass
  const [legacyMode, setLegacyMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();

  function getSafeCallbackUrl(): string {
    const raw = searchParams.get("callbackUrl");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
      return raw;
    }
    return "/board";
  }

  async function onSubmitJira(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      setError("Vui lòng dán Jira API token của bạn.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const cleanUser = username.trim();
      const res = await signIn("jira-token", {
        token: token.trim(),
        ...(cleanUser ? { username: cleanUser } : {}),
        redirect: false,
      });

      if (res?.error) {
        setLoading(false);
        // Translate or display clean error
        if (res.error === "CredentialsSignin") {
          setError("Token Jira không chính xác hoặc không có quyền truy cập.");
        } else {
          setError(res.error);
        }
        return;
      }

      router.push(getSafeCallbackUrl());
      router.refresh();
    } catch {
      setLoading(false);
      setError("Không thể kết nối đến hệ thống xác thực. Vui lòng thử lại sau.");
    }
  }

  async function onSubmitLegacy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (res?.error) {
        setLoading(false);
        setError("Email hoặc mật khẩu không chính xác.");
        return;
      }

      router.push(getSafeCallbackUrl());
      router.refresh();
    } catch {
      setLoading(false);
      setError("Lỗi kết nối. Vui lòng thử lại sau.");
    }
  }

  if (legacyMode) {
    return (
      <form onSubmit={onSubmitLegacy} className="flex flex-col gap-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
          Chế độ đăng nhập mật khẩu cũ (Rollback / Break-glass).
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@team.local"
            required
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Mật khẩu</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            disabled={loading}
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <Button type="submit" disabled={loading} className="w-full cursor-pointer">
          {loading ? "Đang xác thực…" : "Đăng nhập với mật khẩu"}
        </Button>
        <button
          type="button"
          onClick={() => {
            setLegacyMode(false);
            setError(null);
          }}
          className="text-center text-xs text-muted-foreground underline cursor-pointer hover:text-foreground transition-colors"
        >
          Quay lại đăng nhập bằng Jira Token
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitJira} className="flex flex-col gap-4">
      {/* Jira API Token field */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="jira-token" className="text-sm font-medium">
            Jira API Token
          </Label>
          <a
            href="https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors cursor-pointer"
          >
            <span>Cách tạo token</span>
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
        <div className="relative">
          <Input
            id="jira-token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Dán Jira Personal Access Token (PAT)"
            required
            disabled={loading}
            className="pr-10"
          />
          <KeyRound
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Optional Basic auth accordion */}
      <div>
        <button
          type="button"
          onClick={() => setShowBasicAuth(!showBasicAuth)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <span>{showBasicAuth ? "Ẩn tùy chọn username" : "Cần dùng Basic Auth (username + token)?"}</span>
          {showBasicAuth ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        {showBasicAuth && (
          <div className="mt-2.5 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3">
            <Label htmlFor="jira-username" className="text-xs text-muted-foreground">
              Username Jira (tùy chọn)
            </Label>
            <Input
              id="jira-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username đăng nhập Jira của bạn"
              disabled={loading}
              className="h-8 text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Hệ thống sẽ thử <strong>Bearer token</strong> trước; nếu thất bại sẽ tự động dùng Basic auth với username này.
            </p>
          </div>
        )}
      </div>

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Loading Skeleton & Submit button */}
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-md" />
          <p className="text-center text-xs text-muted-foreground animate-pulse">
            Đang xác thực với máy chủ Jira…
          </p>
        </div>
      ) : (
        <Button type="submit" disabled={loading} className="w-full cursor-pointer">
          Kết nối và tiếp tục
        </Button>
      )}

      {/* Security note */}
      <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <p className="leading-tight">
          Token được mã hóa an toàn trên máy chủ (AES-256-GCM). Trình duyệt chỉ lưu phiên đăng nhập trong 30 ngày và không bao giờ giữ raw token.
        </p>
      </div>

      {/* Break-glass legacy trigger */}
      {searchParams.get("legacy") === "1" && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => {
              setLegacyMode(true);
              setError(null);
            }}
            className="text-xs text-muted-foreground underline cursor-pointer hover:text-foreground transition-colors"
          >
            Đăng nhập quản trị khẩn cấp (Email / Mật khẩu)
          </button>
        </div>
      )}
    </form>
  );
}
