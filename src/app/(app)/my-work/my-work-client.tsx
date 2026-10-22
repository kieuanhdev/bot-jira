"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { myWorkKeys } from "@/lib/query-keys";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { MyWorkKpiCards } from "./components/my-work-kpi-cards";
import { MyTasksTab } from "./components/my-tasks-tab";
import { MyAnalyticsTab } from "./components/my-analytics-tab";
import { MyTimelineTab } from "./components/my-timeline-tab";
import { MyActivityTab } from "./components/my-activity-tab";
import {
  CheckSquare,
  BarChart3,
  Calendar,
  History,
  RotateCw,
} from "lucide-react";
import type { MyWorkSummary, TaskRoleFilter } from "@/lib/my-work/service";

import type { ComponentType } from "react";

type MainTab = "tasks" | "analytics" | "timeline" | "activity";

export function MyWorkClient() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<MainTab>("tasks");
  const [selectedRole, setSelectedRole] = useState<TaskRoleFilter>("assigned");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: summary, isLoading: isSummaryLoading } = useQuery<MyWorkSummary>({
    queryKey: myWorkKeys.summary(),
    queryFn: () => api<MyWorkSummary>("/api/my-work/summary"),
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: myWorkKeys.all });
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSelectRoleFromKpi = (role: TaskRoleFilter) => {
    setSelectedRole(role);
    setActiveTab("tasks");
  };

  const tabs: Array<{ id: MainTab; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: "tasks", label: "Nhiệm vụ của tôi", icon: CheckSquare },
    { id: "analytics", label: "Hiệu suất cá nhân", icon: BarChart3 },
    { id: "timeline", label: "Lộ trình Timeline", icon: Calendar },
    { id: "activity", label: "Hoạt động gần đây", icon: History },
  ];

  return (
    <PageContainer>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <PageHeader
          icon={CheckSquare}
          title="Không gian làm việc cá nhân"
          description="Quản lý toàn diện các nhiệm vụ được giao, các task cần duyệt/test, lộ trình hạn chót và biểu đồ phân tích năng suất của bạn."
          actions={
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} aria-hidden="true" />
              <span>Làm mới</span>
            </button>
          }
        />

        {/* 4 Metric KPI Cards */}
        <MyWorkKpiCards
          summary={summary}
          loading={isSummaryLoading}
          selectedRole={activeTab === "tasks" ? selectedRole : undefined}
          onSelectRole={handleSelectRoleFromKpi}
        />

        {/* Main Tab Navigation */}
        <div className="border-b border-border flex items-center gap-2 overflow-x-auto scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Tab Content */}
        <div className="pt-2">
          {activeTab === "tasks" && (
            <MyTasksTab
              initialRole={selectedRole}
              onRoleChange={(r) => setSelectedRole(r)}
            />
          )}

          {activeTab === "analytics" && <MyAnalyticsTab />}

          {activeTab === "timeline" && <MyTimelineTab />}

          {activeTab === "activity" && <MyActivityTab />}
        </div>
      </div>
    </PageContainer>
  );
}
