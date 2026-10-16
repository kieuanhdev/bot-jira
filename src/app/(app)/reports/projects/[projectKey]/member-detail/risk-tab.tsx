"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import type { SignalStyle } from "./signal-config";
import type { MemberReportItem } from "@/lib/reports/types";
import type { IndividualMemberAnalysis } from "../lib/member-workload-model";

interface RiskTabProps {
  member: MemberReportItem;
  analysis: IndividualMemberAnalysis;
  signal: SignalStyle;
  drillDown: (activity?: string) => void;
}

export function RiskTab({ member, analysis, signal, drillDown }: RiskTabProps) {
  const SignalIcon = signal.icon;
  const riskChartData = [
    {
      key: "open",
      label: "Đang mở",
      value: member.assignedOpenTasks,
      color: "var(--chart-1)",
      activity: "current_open",
    },
    {
      key: "wip",
      label: "Đang làm (WIP)",
      value: member.currentWip,
      color: "var(--chart-3)",
      activity: "current_open",
    },
    {
      key: "blocked",
      label: "Bị nghẽn",
      value: member.currentBlocked,
      color: "var(--destructive)",
      activity: "blocked",
    },
    {
      key: "overdue",
      label: "Quá hạn",
      value: member.currentOverdue,
      color: "var(--chart-5)",
      activity: "overdue",
    },
    {
      key: "overSla",
      label: "Vượt SLA",
      value: member.currentOverSla,
      color: "var(--chart-4)",
      activity: "current_open",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Vertical Bar Chart */}
        <div className="lg:col-span-7">
          <div className="mb-2">
            <h4 className="text-sm font-semibold text-foreground">
              So sánh các lát cắt công việc & rủi ro
            </h4>
            <p className="text-xs text-muted-foreground">
              WIP, nghẽn, quá hạn và vượt SLA phản ánh các yếu tố cần hỗ trợ.
            </p>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={riskChartData}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
              >
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.6} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <YAxis
                  dataKey="label"
                  type="category"
                  width={96}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "currentColor", fontSize: 11 }}
                  className="text-muted-foreground"
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.35 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const item = payload[0].payload as (typeof riskChartData)[number];
                    return (
                      <div className="rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg">
                        <p className="font-semibold">{item.label}</p>
                        <p className="mt-1 text-muted-foreground">
                          Số lượng: <strong className="text-foreground">{item.value}</strong> task
                        </p>
                        <p className="text-[10px] text-primary mt-1">
                          Nhấp vào cột để xem danh sách task
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  isAnimationActive={true}
                  animationDuration={400}
                  onClick={(entry) => {
                    const act = (entry as { activity?: string }).activity;
                    drillDown(act);
                  }}
                  className="cursor-pointer"
                >
                  {riskChartData.map((item) => (
                    <Cell key={item.key} fill={item.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Support Signal Card & Recommendations */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <SignalIcon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h4 className="text-sm font-semibold text-foreground">
                Tín hiệu hỗ trợ hiện tại
              </h4>
            </div>

            <div className={`p-3 rounded-lg border ${signal.className} space-y-1`}>
              <div className="font-bold text-xs">{analysis.healthAssessment.title}</div>
              <p className="text-xs opacity-90">{analysis.healthAssessment.description}</p>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-foreground">
                Chi tiết các cảnh báo:
              </span>
              {member.supportReasons.length > 0 ? (
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {member.supportReasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2 rounded-lg bg-muted/40 p-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  size="compact"
                  icon={ShieldCheck}
                  title="Không có cảnh báo rủi ro"
                  description="Không có cảnh báo tắc nghẽn hay trễ hạn nào."
                  className="p-4"
                />
              )}
            </div>

            {/* Operational advice */}
            <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Đề xuất điều phối:</strong>{" "}
              {member.currentBlocked > 0
                ? "Ưu tiên tổ chức daily để làm rõ blocker và liên hệ người phụ thuộc."
                : member.currentWip >= 4
                ? "Hạn chế nhận thêm task mới, tập trung kết thúc các task đang WIP."
                : "Khối lượng đang cân bằng lý tưởng, duy trì nhịp độ hiện tại."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
