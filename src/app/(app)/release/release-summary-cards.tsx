"use client";

import { Layers, Clock, CheckCircle2, AlertCircle, Rocket, Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MetricCard, type MetricTone } from "@/components/shared/metric-card";
import { MetricGrid } from "@/components/shared/metric-grid";
import type { ReleaseSummary } from "@/lib/releases/release-summary";

interface ReleaseSummaryCardsProps {
  summary: ReleaseSummary;
  selectedFilter: string;
  onSelectFilter: (filter: string) => void;
}

type CardDef = {
  id: string;
  label: string;
  description: string;
  icon: typeof Layers;
  tone: MetricTone;
  valueKey: keyof ReleaseSummary;
};

const CARDS: CardDef[] = [
  { id: "all", label: "Tổng hoạt động", description: "Tất cả phiên bản chưa lưu trữ", icon: Layers, tone: "neutral", valueKey: "totalActive" },
  { id: "in_progress", label: "Đang thực hiện", description: "Có task chưa Done hoặc PR chưa merge", icon: Clock, tone: "warning", valueKey: "inProgress" },
  { id: "ready", label: "Sẵn sàng", description: "Tất cả task Done & Git đã merge", icon: CheckCircle2, tone: "primary", valueKey: "ready" },
  { id: "empty", label: "Chưa có task", description: "Chưa có task nào được gán", icon: AlertCircle, tone: "neutral", valueKey: "empty" },
  { id: "released", label: "Đã phát hành", description: "Đã phát hành trên Jira", icon: Rocket, tone: "success", valueKey: "released" },
];

/**
 * Domain wrapper over the shared MetricGrid/MetricCard. Maps release readiness
 * groups to semantic tones; the archived toggle below is release-specific and
 * intentionally kept as a domain affordance.
 */
export function ReleaseSummaryCards({
  summary,
  selectedFilter,
  onSelectFilter,
}: ReleaseSummaryCardsProps) {
  return (
    <div className="space-y-3">
      <MetricGrid columns={5}>
        {CARDS.map((card) => (
          <MetricCard
            key={card.id}
            label={card.label}
            value={summary[card.valueKey]}
            description={card.description}
            icon={card.icon}
            tone={card.tone}
            selected={selectedFilter === card.id}
            onClick={() => onSelectFilter(card.id)}
          />
        ))}
      </MetricGrid>

      {summary.archived > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSelectFilter(selectedFilter === "archived" ? "all" : "archived")}
            aria-pressed={selectedFilter === "archived"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
              selectedFilter === "archived"
                ? "border-primary bg-muted text-foreground"
                : "border-dashed border-border text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Đã lưu trữ (Archived):</span>
            <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px]">
              {summary.archived}
            </Badge>
          </button>
        </div>
      )}
    </div>
  );
}
