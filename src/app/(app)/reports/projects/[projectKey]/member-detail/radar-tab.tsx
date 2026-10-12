"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import type { MemberReportItem } from "@/lib/reports/types";
import type { IndividualMemberAnalysis } from "../lib/member-workload-model";

interface RadarTabProps {
  member: MemberReportItem;
  analysis: IndividualMemberAnalysis;
}

export function RadarTab({ member, analysis }: RadarTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
        {/* Radar Chart */}
        <div className="relative flex flex-col items-center justify-center lg:col-span-5">
          <div
            className="relative h-72 w-full max-w-[320px]"
            role="img"
            aria-label={`Sơ đồ radar sức khỏe vận hành của ${member.displayName}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={analysis.operationalMetrics}>
                <PolarGrid stroke="var(--border)" strokeOpacity={0.8} />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 500 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  stroke="var(--border)"
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name="Điểm sức khỏe"
                  dataKey="score"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="var(--primary)"
                  fillOpacity={0.3}
                  isAnimationActive={true}
                  animationDuration={500}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as (typeof analysis.operationalMetrics)[number];
                    return (
                      <div className="rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
                        <div className="font-semibold text-foreground">{item.metric}</div>
                        <div className="mt-1 text-muted-foreground">
                          Điểm: <strong className="text-foreground">{item.score}/100</strong>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {item.description} ({item.valueDisplay})
                        </div>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Health summary badge under radar */}
          <div className="mt-2 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 shadow-2xs">
              <span className="text-xs font-medium text-muted-foreground">Điểm vận hành:</span>
              <span className="text-sm font-bold text-foreground">
                {analysis.healthScore}/100
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  analysis.healthAssessment.status === "optimal"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : analysis.healthAssessment.status === "attention"
                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                    : "bg-red-500/15 text-red-600 dark:text-red-400"
                }`}
              >
                {analysis.healthAssessment.status === "optimal"
                  ? "Tối ưu"
                  : analysis.healthAssessment.status === "attention"
                  ? "Cần lưu ý"
                  : "Cần hỗ trợ"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: 5 Operational Dimension Detail Bars */}
        <div className="space-y-3 lg:col-span-7">
          <div className="mb-2">
            <h4 className="text-sm font-semibold text-foreground">
              5 Trục đánh giá độ mượt dòng việc
            </h4>
            <p className="text-xs text-muted-foreground">
              Đo lường từ dữ liệu thực tế giúp nhóm phát hiện tải cao hoặc nguy cơ quá hạn.
            </p>
          </div>

          {analysis.operationalMetrics.map((m) => (
            <div
              key={m.metric}
              className="rounded-xl border border-border/70 bg-card p-3 shadow-2xs space-y-2"
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">{m.metric}</span>
                  <span className="text-[11px] text-muted-foreground">
                    ({m.valueDisplay})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      m.status === "good"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        : m.status === "warning"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : "bg-red-500/15 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {m.status === "good" ? "Tốt" : m.status === "warning" ? "Cảnh báo" : "Rủi ro"}
                  </span>
                  <span className="font-mono text-xs font-bold text-foreground">
                    {m.score}/100
                  </span>
                </div>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ${
                    m.status === "good"
                      ? "bg-emerald-500"
                      : m.status === "warning"
                      ? "bg-amber-500"
                      : "bg-red-500"
                  }`}
                  style={{ width: `${m.score}%` }}
                />
              </div>

              <p className="text-[11px] text-muted-foreground">{m.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
