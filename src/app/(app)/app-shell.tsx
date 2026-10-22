"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  ChartNoAxesCombined,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Bug,
  Palette,
  CheckSquare,
  UserCheck,
} from "lucide-react";
import type { AppSession } from "@/lib/session";
import { isRealAdmin, isImpersonating } from "@/lib/session-helpers";
import { ImpersonationBanner } from "@/components/impersonation/impersonation-banner";
import { UserSwitcherDialog } from "@/components/impersonation/user-switcher-dialog";
import { UnreadBadge } from "./unread-badge";
import { FreshnessBanner } from "./freshness-banner";
import { ReconnectBanner } from "./reconnect-banner";
import { GlobalSyncIndicator } from "./global-sync-indicator";
import { Sheet } from "@/components/ui/sheet";
import { PageContainer } from "@/components/shared/page-container";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { cn } from "@/lib/utils";

type NavItemDef = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
};

type NavGroupDef = {
  title: string;
  items: NavItemDef[];
};

const navGroups: NavGroupDef[] = [
  {
    title: "Công việc",
    items: [
      { href: "/my-work", label: "Việc của tôi", icon: CheckSquare },
      { href: "/board", label: "Bảng công việc", icon: LayoutGrid },
      { href: "/stale", label: "Task cần xử lý", icon: BarChart3 },
      { href: "/watch", label: "Task theo dõi", icon: Eye },
      { href: "/notifications", label: "Thông báo", icon: Bell },
    ],
  },
  {
    title: "Delivery",
    items: [
      { href: "/sentry", label: "Lỗi Sentry", icon: Bug },
      { href: "/bulk", label: "Cập nhật hàng loạt", icon: ListChecks },
      { href: "/release", label: "Quản lý phát hành", icon: Rocket },
      { href: "/branches", label: "Nhánh & Delivery", icon: GitBranch },
    ],
  },
  {
    title: "Phân tích",
    items: [
      { href: "/reports/projects", label: "Báo cáo dự án", icon: ChartNoAxesCombined },
      { href: "/leaderboard", label: "Xếp hạng", icon: Trophy },
    ],
  },
];

const settingsNavItem: NavItemDef = { href: "/settings", label: "Cài đặt", icon: Settings };
const adminNavItem: NavItemDef = { href: "/admin", label: "Quản trị", icon: ShieldCheck };

/** Routes whose content (kanban/table) needs the whole viewport width instead of the shared page width. */
const FULL_WIDTH_ROUTES = ["/board"];

function isFullWidthRoute(pathname: string | null) {
  return FULL_WIDTH_ROUTES.some((route) => pathname?.startsWith(route));
}

export function AppShell({
  children,
  isAdmin = false,
  defaultCollapsed = false,
  session,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
  defaultCollapsed?: boolean;
  session?: AppSession;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const canImpersonate = isRealAdmin(session);
  const impersonating = isImpersonating(session);

  // Close the mobile menu when the route changes (adjust state during render).
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setMobileOpen(false);
  }

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const collapsedRef = useRef(collapsed);

  useEffect(() => {
    collapsedRef.current = collapsed;
  }, [collapsed]);

  // Sync cookie if only localStorage had legacy state (one-time migration)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      if (saved !== null && !document.cookie.includes("sidebar_collapsed=")) {
        document.cookie = `sidebar_collapsed=${saved}; path=/; max-age=31536000; SameSite=Lax`;
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    const next = !collapsedRef.current;
    setCollapsed(next);
    try {
      document.cookie = `sidebar_collapsed=${next}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("sidebar_collapsed", String(next));
    } catch {
      // ignore
    }
  }, []);

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
  }, [toggleSidebar]);

  return (
    <div className="flex min-h-screen flex-col">
      {/* Impersonation Warning Banner (Sticky at the very top of viewport) */}
      {impersonating && session?.impersonator && session?.user && (
        <ImpersonationBanner
          user={session.user}
          impersonator={session.impersonator}
          onOpenSwitcher={() => setSwitcherOpen(true)}
        />
      )}

      {/* User Switcher Dialog for Admins */}
      {canImpersonate && (
        <UserSwitcherDialog
          open={switcherOpen}
          onOpenChange={setSwitcherOpen}
          currentUserId={session?.user?.id}
          isImpersonating={impersonating}
        />
      )}

      <div className="flex min-h-screen flex-1">
        {/* Desktop Sidebar: Sticky h-screen with collapsible state */}
        <aside
          className={cn(
            "sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r bg-card transition-all duration-200 ease-in-out md:flex",
            collapsed ? "w-16" : "w-60"
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
              className="group relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
              title="Mở rộng menu (Ctrl+B)"
              aria-label="Mở rộng thanh điều hướng"
            >
              <Bot className="h-5 w-5 transition-opacity group-hover:opacity-0" aria-hidden="true" />
              <PanelLeftOpen className="absolute h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2.5 overflow-hidden">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-bold tracking-tight text-base truncate select-none text-foreground">
                  Team Task Web
                </span>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
                title="Thu gọn menu (Ctrl+B)"
                aria-label="Thu gọn thanh điều hướng"
              >
                <PanelLeftClose className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {/* Nav Links grouped into 3 sections */}
        <nav
          className={cn(
            "flex flex-1 flex-col overflow-y-auto overflow-x-hidden",
            collapsed ? "p-2 items-center gap-2" : "p-3 gap-3"
          )}
        >
          {navGroups.map((group, groupIdx) => (
            <div
              key={group.title}
              className={cn("flex flex-col", collapsed ? "w-full items-center gap-1" : "gap-1")}
            >
              {!collapsed ? (
                <div
                  className={cn(
                    "px-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground select-none",
                    groupIdx === 0 ? "pt-1 pb-1" : "pt-2 pb-1"
                  )}
                >
                  {group.title}
                </div>
              ) : groupIdx > 0 ? (
                <div className="my-1 h-px w-6 bg-border/60" aria-hidden="true" />
              ) : null}

              {group.items.map((item) => {
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
                        ? "h-10 w-10 items-center justify-center"
                        : "h-10 items-center justify-between px-3 text-sm gap-3",
                      active
                        ? "bg-primary-soft text-primary-soft-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
                        : "text-foreground/80 hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {collapsed ? (
                      <>
                        <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        <span className="sr-only">{item.label}</span>
                        {isNotification && <UnreadBadge variant="collapsed" />}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 overflow-hidden">
                          <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {isNotification && <UnreadBadge variant="inline" />}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer actions: Admin (if enabled), Settings, ThemeToggle, and Collapse Toggle */}
        <div className={cn("border-t border-border p-2 flex flex-col gap-1", collapsed ? "items-center" : "")}>
          {isAdmin && (
            <Link
              href={adminNavItem.href}
              title={adminNavItem.label}
              className={cn(
                "relative flex rounded-md font-medium transition-colors",
                collapsed
                  ? "h-10 w-10 items-center justify-center"
                  : "h-10 items-center justify-between px-3 text-sm gap-3",
                pathname?.startsWith(adminNavItem.href)
                  ? "bg-primary-soft text-primary-soft-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
                  : "text-foreground/80 hover:bg-accent hover:text-foreground"
              )}
            >
              {collapsed ? (
                <>
                  <adminNavItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="sr-only">{adminNavItem.label}</span>
                </>
              ) : (
                <div className="flex items-center gap-3 overflow-hidden">
                  <adminNavItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{adminNavItem.label}</span>
                </div>
              )}
            </Link>
          )}

          <Link
            href={settingsNavItem.href}
            title={settingsNavItem.label}
            className={cn(
              "relative flex rounded-md font-medium transition-colors",
              collapsed
                ? "h-10 w-10 items-center justify-center"
                : "h-10 items-center justify-between px-3 text-sm gap-3",
              pathname?.startsWith(settingsNavItem.href)
                ? "bg-primary-soft text-primary-soft-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
                : "text-foreground/80 hover:bg-accent hover:text-foreground"
            )}
          >
            {collapsed ? (
              <>
                <settingsNavItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="sr-only">{settingsNavItem.label}</span>
              </>
            ) : (
              <div className="flex items-center gap-3 overflow-hidden">
                <settingsNavItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="truncate">{settingsNavItem.label}</span>
              </div>
            )}
          </Link>

          {canImpersonate && (
            !collapsed ? (
              <button
                type="button"
                onClick={() => setSwitcherOpen(true)}
                className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm text-foreground/80 hover:bg-accent/40 cursor-pointer transition-colors"
                title="Đổi tài khoản người dùng để xem và kiểm tra bug"
              >
                <div className="flex items-center gap-3 overflow-hidden select-none">
                  <UserCheck className="h-[18px] w-[18px] shrink-0 text-warning" aria-hidden="true" />
                  <span className="truncate">
                    {impersonating ? "Đang đóng vai" : "Đổi tài khoản"}
                  </span>
                </div>
                <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  Admin
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setSwitcherOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer transition-colors my-1"
                title="Đổi tài khoản người dùng"
                aria-label="Đổi tài khoản người dùng"
              >
                <UserCheck className="h-[18px] w-[18px] text-warning" aria-hidden="true" />
              </button>
            )
          )}

          {!collapsed ? (
            <div className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm text-foreground/80 hover:bg-accent/40 transition-colors">
              <div className="flex items-center gap-3 overflow-hidden select-none">
                <Palette className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">Giao diện</span>
              </div>
              <ThemeToggle />
            </div>
          ) : (
            <ThemeToggle compact className="my-1" />
          )}

          <button
            type="button"
            onClick={toggleSidebar}
            className={cn(
              "flex cursor-pointer rounded-md font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
              collapsed
                ? "h-10 w-10 items-center justify-center"
                : "h-10 w-full items-center gap-3 px-3 text-sm"
            )}
            title={collapsed ? "Mở rộng menu (Ctrl+B)" : "Thu gọn menu (Ctrl+B)"}
            aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px]" aria-hidden="true" />
            ) : (
              <>
                <PanelLeftClose className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="truncate text-sm">Thu gọn menu</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile Header: Visible only on < md screens */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-sm md:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-bold tracking-tight text-base text-foreground">Team Task Web</span>
          </div>
          <div className="flex items-center gap-1.5">
            {canImpersonate && (
              <button
                type="button"
                onClick={() => setSwitcherOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
                title="Đổi tài khoản người dùng"
                aria-label="Đổi tài khoản người dùng"
              >
                <UserCheck className="h-5 w-5 text-warning" aria-hidden="true" />
              </button>
            )}
            <Link
              href="/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Thông báo"
            >
              <Bell className="h-5 w-5" aria-hidden="true" />
              <UnreadBadge variant="mobile-bell" />
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
              aria-label="Menu"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Mobile Menu */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left" title="Menu" className="max-w-xs md:hidden">
          <nav className="flex flex-col gap-3">
            {navGroups.map((group) => (
              <div key={group.title} className="flex flex-col gap-1">
                <div className="px-3 pt-1 pb-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground select-none">
                  {group.title}
                </div>
                {group.items.map((item) => {
                  const active = pathname?.startsWith(item.href);
                  const isNotification = item.href === "/notifications";
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "relative flex h-10 items-center justify-between rounded-md px-3 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary-soft text-primary-soft-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
                          : "text-foreground/80 hover:bg-accent hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {isNotification && <UnreadBadge variant="inline" />}
                    </Link>
                  );
                })}
              </div>
            ))}
  
            {/* Footer items for mobile */}
            <div className="border-t border-border pt-2 flex flex-col gap-1">
              {isAdmin && (
                <Link
                  href={adminNavItem.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "relative flex h-10 items-center justify-between rounded-md px-3 text-sm font-medium transition-colors",
                    pathname?.startsWith(adminNavItem.href)
                      ? "bg-primary-soft text-primary-soft-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
                      : "text-foreground/80 hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <adminNavItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    <span className="truncate">{adminNavItem.label}</span>
                  </div>
                </Link>
              )}
              <Link
                href={settingsNavItem.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "relative flex h-10 items-center justify-between rounded-md px-3 text-sm font-medium transition-colors",
                  pathname?.startsWith(settingsNavItem.href)
                    ? "bg-primary-soft text-primary-soft-foreground font-semibold before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r before:bg-primary"
                    : "text-foreground/80 hover:bg-accent hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <settingsNavItem.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{settingsNavItem.label}</span>
                </div>
              </Link>
              {canImpersonate && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setSwitcherOpen(true);
                  }}
                  className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm text-foreground/80 hover:bg-accent/40 cursor-pointer transition-colors text-left"
                >
                  <div className="flex items-center gap-3 select-none">
                    <UserCheck className="h-[18px] w-[18px] shrink-0 text-warning" aria-hidden="true" />
                    <span className="truncate">
                      {impersonating ? "Đang đóng vai" : "Đổi tài khoản"}
                    </span>
                  </div>
                  <span className="text-2xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    Admin
                  </span>
                </button>
              )}
              <div className="flex h-10 w-full items-center justify-between rounded-md px-3 text-sm text-foreground/80 hover:bg-accent/40 transition-colors">
                <div className="flex items-center gap-3 select-none">
                  <Palette className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">Giao diện</span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </Sheet>

        <ReconnectBanner />
        <FreshnessBanner />
        <main className="flex-1 overflow-x-auto p-4 md:p-6 xl:p-8">
          <PageContainer size={isFullWidthRoute(pathname) ? "full" : "wide"} className="h-full">
            {children}
          </PageContainer>
        </main>
        <GlobalSyncIndicator />
      </div>
    </div>
    </div>
  );
}
