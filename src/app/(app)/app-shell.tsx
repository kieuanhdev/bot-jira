"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutGrid,
  Rocket,
  GitBranch,
  BarChart3,
  Inbox,
  Eye,
  Settings,
  Bot,
  ListChecks,
  Bell,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useUnreadCount } from "@/hooks/use-notifications";
import { FreshnessBanner } from "./freshness-banner";
import { ReconnectBanner } from "./reconnect-banner";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/board", label: "Bảng công việc", icon: LayoutGrid },
  { href: "/bulk", label: "Thao tác hàng loạt", icon: ListChecks },
  { href: "/release", label: "Phát hành", icon: Rocket },
  { href: "/branches", label: "Quản lý nhánh", icon: GitBranch },
  { href: "/stale", label: "Task tồn đọng", icon: BarChart3 },
  { href: "/inbox", label: "Hộp thư lệnh", icon: Inbox },
  { href: "/watch", label: "Đang theo dõi", icon: Eye },
  { href: "/notifications", label: "Thông báo", icon: Bell },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar: Sticky h-screen */}
      <aside className="sticky top-0 z-50 hidden h-screen w-56 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4.5 w-4.5 text-primary" />
          </span>
          <span className="font-semibold tracking-tight">Team Task Web</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const active = pathname?.startsWith(item.href);
            const isNotification = item.href === "/notifications";
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                  <span>{item.label}</span>
                </div>
                {isNotification && unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-3">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header: Visible only on < md screens */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-sm md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-4.5 w-4.5 text-primary" />
            </span>
            <span className="font-semibold tracking-tight text-sm">Team Task Web</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Thông báo"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white tabular-nums">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
              aria-label="Menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* Mobile Menu Dropdown */}
        {mobileOpen && (
          <div className="border-b bg-card p-3 shadow-lg md:hidden">
            <nav className="flex flex-col gap-1">
              {nav.map((item) => {
                const active = pathname?.startsWith(item.href);
                const isNotification = item.href === "/notifications";
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                      <span>{item.label}</span>
                    </div>
                    {isNotification && unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
              <div className="mt-2 border-t pt-2">
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            </nav>
          </div>
        )}

        <ReconnectBanner />
        <FreshnessBanner />
        <main className="flex-1 overflow-x-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
