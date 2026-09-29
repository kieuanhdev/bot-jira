"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Clock, CheckCircle2, AlertCircle, Rocket, Archive } from "lucide-react";
import type { ReleaseSummary } from "@/lib/releases/release-summary";

interface ReleaseSummaryCardsProps {
  summary: ReleaseSummary;
  selectedFilter: string;
  onSelectFilter: (filter: string) => void;
}

export function ReleaseSummaryCards({
  summary,
  selectedFilter,
  onSelectFilter,
}: ReleaseSummaryCardsProps) {
  const cards = [
    {
      id: "all",
      label: "Tổng hoạt động",
      count: summary.totalActive,
      icon: Layers,
      description: "Tất cả phiên bản chưa lưu trữ",
      color: "border-border text-foreground",
      activeColor: "ring-2 ring-primary border-primary bg-primary/5",
    },
    {
      id: "in_progress",
      label: "Đang thực hiện",
      count: summary.inProgress,
      icon: Clock,
      description: "Có task chưa Done hoặc PR chưa merge",
      color: "border-amber-500/30 text-amber-500",
      activeColor: "ring-2 ring-amber-500 border-amber-500 bg-amber-500/5",
    },
    {
      id: "ready",
      label: "Sẵn sàng",
      count: summary.ready,
      icon: CheckCircle2,
      description: "Tất cả task Done & Git đã merge",
      color: "border-teal-500/30 text-teal-500",
      activeColor: "ring-2 ring-teal-500 border-teal-500 bg-teal-500/5",
    },
    {
      id: "empty",
      label: "Chưa có task",
      count: summary.empty,
      icon: AlertCircle,
      description: "Chưa có task nào được gán",
      color: "border-muted-foreground/30 text-muted-foreground",
      activeColor: "ring-2 ring-muted-foreground border-muted-foreground bg-muted/20",
    },
    {
      id: "released",
      label: "Đã phát hành",
      count: summary.released,
      icon: Rocket,
      description: "Đã phát hành trên Jira",
      color: "border-emerald-500/30 text-emerald-500",
      activeColor: "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-500/5",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const isSelected = selectedFilter === card.id;

          return (
            <Card
              key={card.id}
              onClick={() => onSelectFilter(card.id)}
              className={`cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                isSelected ? card.activeColor : "border-border hover:border-primary/40 bg-card"
              }`}
            >
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground line-clamp-1">
                    {card.label}
                  </span>
                  <div className={`p-1.5 rounded-lg bg-muted/40 ${card.color}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                </div>
                <div className="mt-1">
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {card.count}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                    {card.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {summary.archived > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSelectFilter(selectedFilter === "archived" ? "all" : "archived")}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              selectedFilter === "archived"
                ? "bg-muted text-foreground border-primary"
                : "text-muted-foreground border-dashed border-border hover:border-border hover:text-foreground"
            }`}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Đã lưu trữ (Archived):</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
              {summary.archived}
            </Badge>
          </button>
        </div>
      )}
    </div>
  );
}
