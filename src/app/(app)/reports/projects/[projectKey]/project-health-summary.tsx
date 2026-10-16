"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { HealthStatus, HealthReason } from "@/lib/reports/types";
import { HEALTH_THEME } from "@/lib/reports/health-style";

interface ProjectHealthSummaryProps {
  status: HealthStatus;
  headline: string;
  reasons: HealthReason[];
}

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
