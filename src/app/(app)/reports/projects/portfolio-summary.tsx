"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Layers } from "lucide-react";
import { PORTFOLIO_HEALTH_CONFIG } from "@/lib/reports/health-style";

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
      ...PORTFOLIO_HEALTH_CONFIG.at_risk,
      count: summary.atRisk,
      filterValue: "at_risk",
      border: selectedHealth === "at_risk" ? PORTFOLIO_HEALTH_CONFIG.at_risk.ring : "border-border",
    },
    {
      ...PORTFOLIO_HEALTH_CONFIG.attention,
      count: summary.attention,
      filterValue: "attention",
      border: selectedHealth === "attention" ? PORTFOLIO_HEALTH_CONFIG.attention.ring : "border-border",
    },
    {
      ...PORTFOLIO_HEALTH_CONFIG.healthy,
      count: summary.healthy,
      filterValue: "healthy",
      border: selectedHealth === "healthy" ? PORTFOLIO_HEALTH_CONFIG.healthy.ring : "border-border",
    },
    {
      ...PORTFOLIO_HEALTH_CONFIG.completed,
      count: summary.completed,
      filterValue: "completed",
      border: selectedHealth === "completed" ? PORTFOLIO_HEALTH_CONFIG.completed.ring : "border-border",
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
