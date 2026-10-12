import { AlertTriangle, Flame, HelpCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import type { SupportSignal } from "@/lib/reports/types";

export const SIGNAL_CONFIG: Record<
  SupportSignal,
  { label: string; icon: LucideIcon; className: string; badgeBg: string }
> = {
  balanced: {
    label: "Cân bằng",
    icon: ShieldCheck,
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    badgeBg: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  high_load: {
    label: "Tải cao",
    icon: Flame,
    className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    badgeBg: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  needs_unblock: {
    label: "Cần gỡ nghẽn",
    icon: AlertTriangle,
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    badgeBg: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  insufficient_data: {
    label: "Chưa đủ dữ liệu",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
    badgeBg: "bg-muted text-muted-foreground",
  },
};

export type SignalStyle = (typeof SIGNAL_CONFIG)[SupportSignal];
