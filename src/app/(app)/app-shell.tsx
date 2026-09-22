"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { NotificationBell } from "./notification-popover";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/board", label: "Board", icon: LayoutGrid },
  { href: "/bulk", label: "Bulk edit", icon: ListChecks },
  { href: "/release", label: "Release", icon: Rocket },
  { href: "/branches", label: "Branches", icon: GitBranch },
  { href: "/stale", label: "Stale", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/watch", label: "Watch", icon: Eye },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4.5 w-4.5 text-primary" />
          </span>
          <span className="font-semibold tracking-tight">Team Task Web</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-40 flex h-14 items-center justify-between gap-3 border-b bg-card/50 px-4 backdrop-blur-sm">
          <UserMenu />
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-x-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
