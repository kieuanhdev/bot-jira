"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import type { HealthStatus, HealthReason } from "@/lib/reports/types";

interface ProjectHealthSummaryProps {
  status: HealthStatus;
  headline: string;
  reasons: HealthReason[];
}

const HEALTH_THEME: Record<
  HealthStatus,
  {
    label: string;
    variant: "success" | "warning" | "danger" | "info" | "secondary";
    icon: LucideIcon;
    cardBorder: string;
    cardBg: string;
  }
> = {
  at_risk: {
    label: "Rủi ro cao",
    variant: "danger",
    icon: AlertOctagon,
    cardBorder: "border-red-500/30",
    cardBg: "bg-red-500/5",
  },
  attention: {
    label: "Cần chú ý",
    variant: "warning",
    icon: AlertTriangle,
    cardBorder: "border-amber-500/30",
    cardBg: "bg-amber-500/5",
  },
  healthy: {
    label: "Đúng tiến độ",
    variant: "success",
    icon: CheckCircle2,
    cardBorder: "border-emerald-500/30",
    cardBg: "bg-emerald-500/5",
  },
  completed: {
    label: "Hoàn thành",
    variant: "info",
    icon: Trophy,
    cardBorder: "border-teal-500/30",
    cardBg: "bg-teal-500/5",
  },
  unknown: {
    label: "Chưa đủ dữ liệu",
    variant: "secondary",
    icon: HelpCircle,
    cardBorder: "border-border",
    cardBg: "bg-muted/20",
  },
};

export function ProjectHealthSummary({
  status,
  headline,
  reasons,
}: ProjectHealthSummaryProps) {
  const theme = HEALTH_THEME[status] || HEALTH_THEME.unknown;
  const StatusIcon = theme.icon;

  return (
    <Card className={`border shadow-sm transition-all duration-200 ${theme.cardBorder} ${theme.cardBg}`}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2">
              <Badge variant={theme.variant} className="gap-1.5 py-1 px-2.5 text-xs font-semibold">
                <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {theme.label}
              </Badge>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Đánh giá sức khỏe dự án
              </span>
            </div>
            <p className="text-base font-semibold text-foreground leading-snug">
              {headline}
            </p>
          </div>
        </div>

        {reasons && reasons.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/50">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Chi tiết nguyên nhân & bằng chứng:
            </p>
            <ul className="space-y-1.5">
              {reasons.map((r, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${
                      r.severity === "danger"
                        ? "bg-red-500"
                        : r.severity === "warning"
                          ? "bg-amber-500"
                          : "bg-teal-500"
                    }`}
                  />
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-mono text-xs text-muted-foreground">[{r.code}]</span>
                    <span className="text-foreground">{r.message}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
