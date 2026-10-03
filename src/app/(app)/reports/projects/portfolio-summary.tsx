"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Layers, CheckCircle2, AlertTriangle, AlertOctagon, Trophy } from "lucide-react";

interface PortfolioSummaryProps {
  summary: {
    total: number;
    healthy: number;
    attention: number;
    atRisk: number;
    completed: number;
    unknown: number;
  };
  onFilterHealth?: (health: string | null) => void;
  selectedHealth?: string | null;
}

export function PortfolioSummary({
  summary,
  onFilterHealth,
  selectedHealth,
}: PortfolioSummaryProps) {
  const cards = [
    {
      id: "all",
      label: "Tổng dự án",
      count: summary.total,
      icon: Layers,
      color: "text-foreground",
      bg: "bg-muted/50",
      filterValue: null,
      border: selectedHealth === null ? "ring-2 ring-primary" : "border-border",
    },
    {
      id: "at_risk",
      label: "Rủi ro cao",
      count: summary.atRisk,
      icon: AlertOctagon,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/10",
      badgeVariant: "danger" as const,
      filterValue: "at_risk",
      border: selectedHealth === "at_risk" ? "ring-2 ring-red-500" : "border-border",
    },
    {
      id: "attention",
      label: "Cần chú ý",
      count: summary.attention,
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/10",
      badgeVariant: "warning" as const,
      filterValue: "attention",
      border: selectedHealth === "attention" ? "ring-2 ring-amber-500" : "border-border",
    },
    {
      id: "healthy",
      label: "Đúng tiến độ",
      count: summary.healthy,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/10",
      badgeVariant: "success" as const,
      filterValue: "healthy",
      border: selectedHealth === "healthy" ? "ring-2 ring-emerald-500" : "border-border",
    },
    {
      id: "completed",
      label: "Đã hoàn thành",
      count: summary.completed,
      icon: Trophy,
      color: "text-teal-600 dark:text-teal-400",
      bg: "bg-teal-500/10",
      badgeVariant: "info" as const,
      filterValue: "completed",
      border: selectedHealth === "completed" ? "ring-2 ring-teal-500" : "border-border",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const Icon = c.icon;
        const isClickable = !!onFilterHealth;
        const isSelected =
          c.filterValue === null
            ? selectedHealth === null || selectedHealth === undefined
            : selectedHealth === c.filterValue;

        return (
          <Card
            key={c.id}
            role={isClickable ? "button" : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onClick={() => onFilterHealth?.(c.filterValue)}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onFilterHealth?.(c.filterValue);
              }
            }}
            className={`transition-all duration-200 ${
              isClickable ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : ""
            } ${c.border} ${isSelected && isClickable ? "bg-muted/40 shadow-sm" : ""}`}
          >
            <CardContent className="p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold tracking-tight">{c.count}</p>
              </div>
              <div className={`p-2.5 rounded-lg ${c.bg}`}>
                <Icon className={`h-5 w-5 ${c.color}`} aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
