"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Trophy,
  Rocket,
  GitBranch,
  BarChart3,
  Eye,
  Settings,
  Bot,
  ListChecks,
  Bell,
  Menu,
  X,
  ChartNoAxesCombined,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useUnreadCount } from "@/hooks/use-notifications";
import { FreshnessBanner } from "./freshness-banner";
import { ReconnectBanner } from "./reconnect-banner";
import { GlobalSyncIndicator } from "./global-sync-indicator";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/board", label: "Bảng công việc", icon: LayoutGrid },
  { href: "/reports/projects", label: "Báo cáo", icon: ChartNoAxesCombined },
  { href: "/leaderboard", label: "Bảng xếp hạng", icon: Trophy },
  { href: "/bulk", label: "Thao tác hàng loạt", icon: ListChecks },
  { href: "/release", label: "Phát hành", icon: Rocket },
  { href: "/branches", label: "Quản lý nhánh", icon: GitBranch },
  { href: "/stale", label: "Task tồn đọng", icon: BarChart3 },
  { href: "/watch", label: "Đang theo dõi", icon: Eye },
  { href: "/notifications", label: "Thông báo", icon: Bell },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const unreadCount = useUnreadCount();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem("sidebar_collapsed");
        if (saved !== null) {
          setCollapsed(saved === "true");
        }
      } catch {
        // ignore
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar_collapsed", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar: Sticky h-screen with collapsible state */}
      <aside
        className={cn(
          "sticky top-0 z-50 hidden h-screen shrink-0 flex-col border-r bg-card transition-all duration-200 ease-in-out md:flex",
          collapsed ? "w-16" : "w-56"
        )}
        aria-label="Thanh điều hướng chính"
      >
        {/* Header */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b transition-all duration-200",
            collapsed ? "justify-center px-2" : "justify-between px-3"
          )}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              className="group relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
              title="Mở rộng menu (Ctrl+B)"
              aria-label="Mở rộng thanh điều hướng"
            >
              <Bot className="h-4.5 w-4.5 transition-opacity group-hover:opacity-0" aria-hidden="true" />
              <PanelLeftOpen className="absolute h-4.5 w-4.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2.5 overflow-hidden">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
                </span>
                <span className="font-semibold tracking-tight text-sm truncate select-none">
                  Team Task Web
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Thu gọn menu (Ctrl+B)"
                aria-label="Thu gọn thanh điều hướng"
              >
                <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Nav Links */}
        <nav
          className={cn(
            "flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden",
            collapsed ? "p-2 items-center" : "p-3"
          )}
        >
          {nav.map((item) => {
            const active = pathname?.startsWith(item.href);
            const isNotification = item.href === "/notifications";
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "relative flex rounded-md font-medium transition-colors",
                  collapsed
                    ? "h-10 w-10 items-center justify-center text-sm"
                    : "items-center justify-between px-3 py-2 text-sm",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {collapsed ? (
                  <>
                    <item.icon className={cn("h-4.5 w-4.5 shrink-0", active && "text-primary")} aria-hidden="true" />
                    <span className="sr-only">{item.label}</span>
                    {isNotification && unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums ring-2 ring-card">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {isNotification && unreadCount > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white tabular-nums">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div className="border-t p-2 flex flex-col gap-1">
          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              "flex cursor-pointer rounded-md font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              collapsed
                ? "h-9 w-full items-center justify-center"
                : "w-full items-center gap-3 px-3 py-2 text-sm"
            )}
            title={collapsed ? "Mở rộng menu (Ctrl+B)" : "Thu gọn menu (Ctrl+B)"}
            aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-xs text-muted-foreground">Thu gọn menu</span>
              </>
            )}
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
            </nav>
          </div>
        )}

        <ReconnectBanner />
        <FreshnessBanner />
        <main className="flex-1 overflow-x-auto p-4 md:p-6">{children}</main>
        <GlobalSyncIndicator />
      </div>
    </div>
  );
}
