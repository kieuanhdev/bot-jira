"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ArrowRight } from "lucide-react";
import type { MemberReportItem } from "@/lib/reports/types";
import type { IndividualMemberAnalysis } from "../lib/member-workload-model";

interface CompositionTabProps {
  member: MemberReportItem;
  analysis: IndividualMemberAnalysis;
  drillDown: (activity?: string) => void;
}

export function CompositionTab({ member, analysis, drillDown }: CompositionTabProps) {
  const [hoveredCompositionKey, setHoveredCompositionKey] = useState<string | null>(null);
  const [isPieHovered, setIsPieHovered] = useState(false);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
        {/* Donut Chart with center metric */}
        <div className="relative flex flex-col items-center justify-center lg:col-span-5">
          <div
            className="relative h-64 w-full max-w-[280px]"
            role="img"
            aria-label={`Biểu đồ cơ cấu ${analysis.totalTasks} task của ${member.displayName}`}
          >
            <ResponsiveContainer width="100%" height="100%" className="relative z-10">
              <PieChart>
                <Pie
                  data={analysis.composition.filter((c) => c.count > 0)}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={68}
                  outerRadius={104}
                  paddingAngle={analysis.composition.filter((c) => c.count > 0).length > 1 ? 3 : 0}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={true}
                  animationDuration={400}
                  onMouseEnter={(_, index) => {
                    setIsPieHovered(true);
                    const filtered = analysis.composition.filter((c) => c.count > 0);
                    setHoveredCompositionKey(filtered[index]?.key ?? null);
                  }}
                  onMouseLeave={() => {
                    setIsPieHovered(false);
                    setHoveredCompositionKey(null);
                  }}
                  onClick={(entry) => {
                    const itemKey = (entry as { key?: string }).key;
                    if (itemKey === "done") drillDown("completed");
                    else if (itemKey === "blocked") drillDown("blocked");
                    else drillDown("current_open");
                  }}
                  className="cursor-pointer"
                >
                  {analysis.composition
                    .filter((c) => c.count > 0)
                    .map((item) => (
                      <Cell
                        key={item.key}
                        fill={item.color}
                        opacity={
                          hoveredCompositionKey && hoveredCompositionKey !== item.key ? 0.4 : 1
                        }
                        className="transition-opacity duration-200"
                      />
                    ))}
                </Pie>
                <Tooltip
                  wrapperStyle={{ zIndex: 50, pointerEvents: "none" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as (typeof analysis.composition)[number];
                    return (
                      <div className="min-w-44 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-2xl">
                        <div className="mb-1 font-semibold text-foreground flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span>{item.label}</span>
                        </div>
                        <div className="text-muted-foreground">
                          <div>
                            Số lượng: <strong className="text-foreground">{item.count} task</strong>
                          </div>
                          <div>
                            Tỷ trọng: <strong className="text-foreground">{item.percentage}%</strong>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground/80">
                            {item.description}
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut center metrics */}
            <div
              className={`pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center text-center transition-opacity duration-200 ${
                isPieHovered ? "opacity-0" : "opacity-100"
              }`}
              aria-hidden="true"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {hoveredCompositionKey
                  ? analysis.composition.find((c) => c.key === hoveredCompositionKey)?.label
                  : "Tỷ lệ hoàn thành"}
              </span>
              <span className="text-3xl font-extrabold tabular-nums text-foreground">
                {hoveredCompositionKey
                  ? `${analysis.composition.find((c) => c.key === hoveredCompositionKey)?.count} task`
                  : `${analysis.completionRate}%`}
              </span>
              <span className="text-xs text-muted-foreground">
                {hoveredCompositionKey
                  ? `${analysis.composition.find((c) => c.key === hoveredCompositionKey)?.percentage}% tỷ trọng`
                  : `${member.completedTasks} / ${analysis.totalTasks} task`}
              </span>
            </div>
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            Rê chuột để xem tỷ trọng · Nhấp vào lát bánh để xem task
          </p>
        </div>

        {/* Right: 4 status breakdown cards */}
        <div className="space-y-2 lg:col-span-7">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">
              Cơ cấu 4 trạng thái công việc
            </span>
            <span>Tổng {analysis.totalTasks} task</span>
          </div>

          {analysis.composition.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.key === "done") drillDown("completed");
                else if (item.key === "blocked") drillDown("blocked");
                else drillDown("current_open");
              }}
              onMouseEnter={() => setHoveredCompositionKey(item.key)}
              onMouseLeave={() => setHoveredCompositionKey(null)}
              className={`group block w-full cursor-pointer rounded-xl border p-3 text-left transition-all duration-150 ${
                hoveredCompositionKey === item.key
                  ? "border-primary/50 bg-accent/40 shadow-xs"
                  : "border-border/70 bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                      {item.label}
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                      {item.description}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="text-sm font-bold text-foreground">
                    {item.count}{" "}
                    <span className="text-xs font-normal text-muted-foreground">task</span>
                  </span>
                  <span className="w-12 text-right font-semibold text-muted-foreground">
                    {item.percentage}%
                  </span>
                  <ArrowRight
                    className="h-3.5 w-3.5 text-primary opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Bar indicator */}
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Bottom Proportional Flow Strip */}
      <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            Dòng chảy phân bổ toàn diện (Delivery Pipeline Flow)
          </span>
          <span>100% Khối lượng</span>
        </div>

        {/* Stacked multi-color progress strip */}
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {analysis.composition.map((item) =>
            item.percentage > 0 ? (
              <div
                key={item.key}
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: item.color,
                }}
                title={`${item.label}: ${item.count} task (${item.percentage}%)`}
                className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
              />
            ) : null
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          {analysis.composition.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span>
                {item.label}: <strong className="text-foreground">{item.count}</strong> ({item.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
