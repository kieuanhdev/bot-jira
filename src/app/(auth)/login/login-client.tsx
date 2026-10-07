"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  KeyRound,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Eye,
  EyeOff,
  ClipboardPaste,
  Check,
  HelpCircle,
  ArrowRight,
  Sparkles,
} from "lucide-react";

export function LoginClient() {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [pasted, setPasted] = useState(false);
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

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setToken(text.trim());
        setError(null);
        setPasted(true);
        setTimeout(() => setPasted(false), 2000);
      }
    } catch {
      // Trình duyệt có thể chưa cấp quyền clipboard, không làm ngắt trải nghiệm người dùng
    }
  }

  async function onSubmitJira(e: React.FormEvent) {
    e.preventDefault();
    const cleanToken = token.trim();
    if (!cleanToken) {
      setError("Vui lòng dán Jira API token của bạn.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await signIn("jira-token", {
        token: cleanToken,
        redirect: false,
      });

      if (res?.error) {
        setLoading(false);
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
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          Chế độ đăng nhập khẩn cấp (Emergency Break-glass).
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
            className="h-10"
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
            className="h-10"
          />
        </div>
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        <Button type="submit" disabled={loading} className="w-full h-10 cursor-pointer">
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="jira-token" className="text-sm font-semibold flex items-center gap-1.5">
            <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
            Jira Personal Access Token (PAT)
          </Label>

          {/* Quick Guide Dialog Modal */}
          <Dialog>
            <DialogTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 hover:underline transition-colors cursor-pointer"
              >
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Cách lấy token?</span>
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-5 w-5 text-primary" aria-hidden="true" />
                  Cách tạo Jira Personal Access Token
                </DialogTitle>
                <DialogDescription>
                  Chỉ mất 1 phút để tạo token xác thực từ tài khoản Jira của bạn.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2.5 py-2 text-sm text-foreground">
                <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/40 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Mở hồ sơ cá nhân trên Jira</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Đăng nhập Jira → bấm vào Avatar ở góc trên cùng bên phải → chọn <strong>Profile</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/40 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Vào mục Personal Access Tokens</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Ở menu bên trái của trang Profile, chọn <strong>Personal Access Tokens</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/40 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    3
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Tạo token mới</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Bấm nút <strong>Create token</strong>, đặt tên (ví dụ: <code className="bg-background px-1 py-0.5 rounded text-[11px] font-mono">Team Task Web</code>), chọn thời hạn và bấm <strong>Create</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/40 p-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    4
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Sao chép & dán vào hệ thống</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Sao chép mã token vừa xuất hiện và dán vào ô bên dưới. Token chỉ hiển thị 1 lần duy nhất trên Jira khi tạo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-3">
                <a
                  href="https://confluence.atlassian.com/enterprise/using-personal-access-tokens-1026032365.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer"
                >
                  <span>Xem tài liệu Atlassian chính thức</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Input container with actions */}
        <div className="relative">
          <Input
            id="jira-token"
            type={showToken ? "text" : "password"}
            autoComplete="off"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Dán Jira Personal Access Token (PAT)..."
            required
            disabled={loading}
            className="h-11 pl-3.5 pr-20 text-sm font-mono tracking-wide rounded-lg border-border/90 bg-background focus-visible:ring-primary/40 focus-visible:border-primary transition-all"
          />

          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {/* Quick paste button */}
            {!token && (
              <button
                type="button"
                onClick={handlePaste}
                title="Dán nhanh từ clipboard"
                className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                {pasted ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Đã dán</span>
                  </>
                ) : (
                  <>
                    <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-[11px]">Dán</span>
                  </>
                )}
              </button>
            )}

            {/* Toggle Visibility */}
            {token && (
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? "Ẩn token" : "Hiện token"}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Đăng nhập một lần để hệ thống đồng bộ task, worklog và quyền hạn theo đúng tài khoản của bạn.
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in-50 duration-200"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 leading-snug">{error}</div>
        </div>
      )}

      {/* Loading Skeleton / Submit button */}
      {loading ? (
        <div className="flex flex-col gap-2.5 py-1">
          <Skeleton className="h-11 w-full rounded-lg" />
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground animate-pulse">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Đang xác thực danh tính với máy chủ Jira…</span>
          </div>
        </div>
      ) : (
        <Button
          type="submit"
          disabled={loading || !token.trim()}
          className="group relative h-11 w-full rounded-lg font-semibold cursor-pointer shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/30 transition-all duration-200"
        >
          <span>Kết nối và tiếp tục</span>
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Button>
      )}

      {/* Security Trust Badges Grid */}
      <div className="mt-1 rounded-xl border border-border/70 bg-muted/30 p-3">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold text-foreground">Bảo mật chuẩn Doanh nghiệp</span>
        </div>
        <div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Mã hóa AES-256-GCM tại máy chủ nội bộ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Trình duyệt chỉ lưu phiên 30 ngày, không lưu raw token</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Không yêu cầu mật khẩu đăng nhập Jira của bạn</span>
          </div>
        </div>
      </div>

      {/* Break-glass legacy trigger */}
      {searchParams.get("legacy") === "1" && (
        <div className="pt-1 text-center">
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
