"use client";

import { MetricGrid } from "@/components/shared/metric-grid";
import { MetricCard, type MetricTone } from "@/components/shared/metric-card";
import { Layers, AlertOctagon, AlertTriangle, CheckCircle2, Trophy } from "lucide-react";

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
  const cards: Array<{
    id: string;
    label: string;
    count: number;
    icon: typeof Layers;
    tone: MetricTone;
    filterValue: string | null;
  }> = [
    {
      id: "all",
      label: "Tổng dự án",
      count: summary.total,
      icon: Layers,
      tone: "neutral",
      filterValue: null,
    },
    {
      id: "at_risk",
      label: "Rủi ro cao",
      count: summary.atRisk,
      icon: AlertOctagon,
      tone: "danger",
      filterValue: "at_risk",
    },
    {
      id: "attention",
      label: "Cần chú ý",
      count: summary.attention,
      icon: AlertTriangle,
      tone: "warning",
      filterValue: "attention",
    },
    {
      id: "healthy",
      label: "Đúng tiến độ",
      count: summary.healthy,
      icon: CheckCircle2,
      tone: "success",
      filterValue: "healthy",
    },
    {
      id: "completed",
      label: "Đã hoàn thành",
      count: summary.completed,
      icon: Trophy,
      tone: "info",
      filterValue: "completed",
    },
  ];

  return (
    <MetricGrid columns={5}>
      {cards.map((c) => {
        const isSelected =
          c.filterValue === null
            ? selectedHealth === null || selectedHealth === undefined
            : selectedHealth === c.filterValue;

        return (
          <MetricCard
            key={c.id}
            label={c.label}
            value={c.count}
            icon={c.icon}
            tone={c.tone}
            selected={isSelected}
            onClick={onFilterHealth ? () => onFilterHealth(c.filterValue) : undefined}
          />
        );
      })}
    </MetricGrid>
  );
}
