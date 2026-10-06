import { Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { LeaderboardTimeframe } from "@/lib/leaderboard/types";
import { ALL_PROJECTS } from "./lib/leaderboard-utils";

interface LeaderboardFilterBarProps {
  timeframe: LeaderboardTimeframe;
  setTimeframe: (tf: LeaderboardTimeframe) => void;
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
  selectedQuarter: number;
  setSelectedQuarter: (quarter: number) => void;
  selectedProject: string;
  setSelectedProject: (project: string) => void;
  projects: string[];
  periodLabel?: string;
  currentYear: number;
  currentMonth: number;
  currentQuarter: number;
}

export function LeaderboardFilterBar({
  timeframe,
  setTimeframe,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  selectedQuarter,
  setSelectedQuarter,
  selectedProject,
  setSelectedProject,
  projects,
  periodLabel,
  currentYear,
  currentMonth,
  currentQuarter,
}: LeaderboardFilterBarProps) {
  return (
    <Card className="border bg-card shadow-xs">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Timeframe primary tabs */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-muted p-1 border border-border">
            <button
              type="button"
              onClick={() => setTimeframe("month")}
              className={cn(
                "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                timeframe === "month"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Theo Tháng
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("quarter")}
              className={cn(
                "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                timeframe === "quarter"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Theo Quý
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("year")}
              className={cn(
                "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                timeframe === "year"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Theo Năm
            </button>
            <button
              type="button"
              onClick={() => setTimeframe("all")}
              className={cn(
                "cursor-pointer rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all duration-150",
                timeframe === "all"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Tất Cả
            </button>
          </div>

          {/* Granular Period Selectors & Project Dropdown */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Specific Month selector */}
            {timeframe === "month" && (
              <div className="w-36">
                <Select
                  value={selectedMonth.toString()}
                  onValueChange={(val) => setSelectedMonth(parseInt(val, 10))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Chọn tháng" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={m.toString()} className="text-xs">
                        Tháng {m} {m === currentMonth && selectedYear === currentYear ? "(Hiện tại)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Specific Quarter selector */}
            {timeframe === "quarter" && (
              <div className="w-36">
                <Select
                  value={selectedQuarter.toString()}
                  onValueChange={(val) => setSelectedQuarter(parseInt(val, 10))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Chọn quý" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((q) => (
                      <SelectItem key={q} value={q.toString()} className="text-xs">
                        Quý {q} {q === currentQuarter && selectedYear === currentYear ? "(Hiện tại)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Year selector (for month, quarter, and year modes) */}
            {timeframe !== "all" && (
              <div className="w-28">
                <Select
                  value={selectedYear.toString()}
                  onValueChange={(val) => setSelectedYear(parseInt(val, 10))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Năm" />
                  </SelectTrigger>
                  <SelectContent>
                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                      <SelectItem key={y} value={y.toString()} className="text-xs">
                        Năm {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Project filter */}
            <div className="w-40">
              <Select value={selectedProject} onValueChange={setSelectedProject}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Dự án mobile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS} className="text-xs">
                    Tất cả dự án mobile ({projects.length})
                  </SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs">
                      Dự án {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active period label pill */}
            {periodLabel && (
              <Badge variant="outline" className="hidden xl:inline-flex gap-1.5 py-1.5 px-3 bg-muted/60 text-xs">
                <Calendar className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{periodLabel}</span>
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
