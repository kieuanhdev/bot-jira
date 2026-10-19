import { AlertTriangle, Flame, HelpCircle, ShieldCheck, type LucideIcon } from "lucide-react";
import type { SupportSignal } from "@/lib/reports/types";

export const SIGNAL_CONFIG: Record<
  SupportSignal,
  { label: string; icon: LucideIcon; className: string; badgeBg: string }
> = {
  balanced: {
    label: "Cân bằng",
    icon: ShieldCheck,
    className: "bg-success/10 text-success border-success/20",
    badgeBg: "bg-success/15 text-success",
  },
  high_load: {
    label: "Tải cao",
    icon: Flame,
    className: "bg-warning/10 text-warning border-warning/20",
    badgeBg: "bg-warning/15 text-warning",
  },
  needs_unblock: {
    label: "Cần gỡ nghẽn",
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive border-destructive/20",
    badgeBg: "bg-destructive/15 text-destructive",
  },
  insufficient_data: {
    label: "Chưa đủ dữ liệu",
    icon: HelpCircle,
    className: "bg-muted text-muted-foreground border-border",
    badgeBg: "bg-muted text-muted-foreground",
  },
};

export type SignalStyle = (typeof SIGNAL_CONFIG)[SupportSignal];
