"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, PieChart as PieChartIcon, Radar as RadarIcon, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { MemberReportItem } from "@/lib/reports/types";
import {
  buildIndividualMemberAnalysis,
  type IndividualMemberAnalysis,
} from "./lib/member-workload-model";
import { CompositionTab } from "./member-detail/composition-tab";
import { EffortTab } from "./member-detail/effort-tab";
import { MemberMetricCards } from "./member-detail/member-metric-cards";
import { MemberToolbar } from "./member-detail/member-toolbar";
import { RadarTab } from "./member-detail/radar-tab";
import { RiskTab } from "./member-detail/risk-tab";
import { SIGNAL_CONFIG } from "./member-detail/signal-config";

interface MemberDetailReportProps {
  member: MemberReportItem;
  periodLabel: string;
  isVersionScope: boolean;
  onBack: () => void;
  onDrillDownToTasks?: (filter: {
    assignee: string;
    activity?: string;
    memberName?: string;
  }) => void;
  allMembers?: MemberReportItem[];
  onSelectMember?: (assignee: string) => void;
}

type ChartViewTab = "composition" | "radar" | "risk" | "effort";

export function MemberDetailReport({
  member,
  periodLabel,
  isVersionScope,
  onBack,
  onDrillDownToTasks,
  allMembers,
  onSelectMember,
}: MemberDetailReportProps) {
  const [activeTab, setActiveTab] = useState<ChartViewTab>("composition");

  const signal = SIGNAL_CONFIG[member.supportSignal] || SIGNAL_CONFIG.insufficient_data;

  const analysis: IndividualMemberAnalysis = useMemo(
    () => buildIndividualMemberAnalysis(member),
    [member]
  );

  // Keyboard navigation: Escape key to return to full member list
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onBack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  const drillDown = (activity?: string) => {
    onDrillDownToTasks?.({
      assignee: member.assignee,
      activity,
      memberName: member.displayName,
    });
  };

  const chartTabs = [
    { id: "composition" as const, label: "Cơ cấu công việc", icon: PieChartIcon },
    { id: "radar" as const, label: "Radar vận hành", icon: RadarIcon },
    { id: "risk" as const, label: "Rủi ro & Trạng thái", icon: BarChart3 },
    { id: "effort" as const, label: "Nỗ lực & Story Points", icon: TrendingUp },
  ];

  return (
    <section className="space-y-4" aria-labelledby="member-report-title">
      <MemberToolbar
        member={member}
        periodLabel={periodLabel}
        analysis={analysis}
        signal={signal}
        allMembers={allMembers}
        onBack={onBack}
        onSelectMember={onSelectMember}
        onDrillDown={onDrillDownToTasks ? () => drillDown() : undefined}
      />

      <MemberMetricCards
        member={member}
        analysis={analysis}
        isVersionScope={isVersionScope}
        drillDown={drillDown}
      />

      {/* Main Diagram & Analysis Card with Rich View Tabs */}
      <Card className="border-border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-card/60 p-4 pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Sơ đồ phân tích công việc của {member.displayName}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Khảo sát toàn diện về cơ cấu công việc, sức khỏe vận hành và các chỉ số nỗ lực.
              </CardDescription>
            </div>

            {/* View Mode Segmented Controls */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ChartViewTab)}>
              <TabsList className="h-auto flex-wrap justify-start gap-1 border border-border bg-muted/40">
                {chartTabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <TabsTrigger key={tab.id} value={tab.id} className="gap-1.5 px-2.5 py-1 text-xs">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tab.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6">
          {activeTab === "composition" && (
            <CompositionTab member={member} analysis={analysis} drillDown={drillDown} />
          )}
          {activeTab === "radar" && <RadarTab member={member} analysis={analysis} />}
          {activeTab === "risk" && (
            <RiskTab member={member} analysis={analysis} signal={signal} drillDown={drillDown} />
          )}
          {activeTab === "effort" && <EffortTab member={member} analysis={analysis} />}
        </CardContent>
      </Card>
    </section>
  );
}
