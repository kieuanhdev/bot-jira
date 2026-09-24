"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertCircle, AlertTriangle, ArrowRight, CalendarClock, CalendarX, CheckCircle2,
  ChevronRight, CircleGauge, Clock3, Filter, Inbox, ListTodo, Lock, RefreshCw,
  RotateCcw, Search, ShieldAlert, Sparkles, Target, User, UserRoundX, Users, X,
} from "lucide-react";

type Severity = "info" | "warning" | "high";
type PointAlertLevel = "within" | "warning" | "high";
type SortMode = "priority" | "overBy" | "stateAge" | "overdue";
type FocusMode = "all" | "high" | "blocked" | "overdue" | "unassigned";

interface Task {
  jiraKey: string; projectKey: string; summary: string; status: string; statusGroup: string;
  assigneeJira: string | null; type: string; priority: string; points: number | null;
  fixVersionNames: string[]; dueDate: string | null; timeSpent: number | null;
  totalAgeDays: number; stateAgeDays: number; inactiveDays: number; blockedDays: number;
  staleReason: string; staleReasonLabel: string; severity: Severity; slaDays: number;
  overByDays: number; baselineLevel: PointAlertLevel; expectedCycleMax: number | null;
  alertThreshold: number | null; overdueDays: number; labels: string[];
}

interface Bottleneck { status: string; group: string; count: number; avgStateAge: number; totalOverBy: number }
interface SupportEntry { assignee: string; taskCount: number; reasons: { reason: string; label: string; count: number }[]; avgStateAge: number }
interface BlockedTask { jiraKey: string; summary: string; status: string; assigneeJira: string | null; blockedDays: number; reason: string; reasonLabel: string }
interface TrendPoint { week: string; count: number }
interface WipEntry { assignee: string; taskCount: number; statuses: string[] }
interface MyWorkTask {
  jiraKey: string;
  summary: string;
  status: string;
  points: number | null;
  updatedAt: string | null;
}
interface MyWorkInfo {
  username: string | null;
  totalActive: number;
  totalStale: number;
  wipCount: number;
  tasks: MyWorkTask[];
}
interface Summary {
  totalActive: number; totalStale: number; totalHigh: number; totalBlocked: number;
  totalNoAssignee: number; worstOverBy: number; totalOverdue: number;
  totalBaselineAlert: number; wipCount: number;
}
interface StaleResponse {
  tasks: Task[]; bottleneck: Bottleneck[]; support: SupportEntry[]; blocked: BlockedTask[];
  trend: TrendPoint[]; wip: WipEntry[];
  filters: { projects: string[]; assignees: string[]; statuses: string[]; reasons: string[]; reasonLabels: Record<string, string> };
  myWork?: MyWorkInfo;
  summary: Summary;
}

const ALL = "all";
const SEVERITY_VARIANT: Record<Severity, "info" | "warning" | "danger"> = { info: "info", warning: "warning", high: "danger" };
const SEVERITY_LABEL: Record<Severity, string> = { info: "Theo dõi", warning: "Cần chú ý", high: "Khẩn cấp" };
const GROUP_DOT: Record<string, string> = {
  Backlog: "bg-muted-foreground/50", "To Do": "bg-sky-500", "In Progress": "bg-primary",
  "In Review": "bg-amber-500", Done: "bg-emerald-500",
};
const ACTION_BY_REASON: Record<string, string> = {
  no_assignee: "Chỉ định người xử lý", waiting_to_start: "Ưu tiên lại hoặc bắt đầu",
  in_progress_no_update: "Chốt tiến độ và bước tiếp theo", waiting_review: "Tìm hoặc nhắc reviewer",
  waiting_qa: "Bắt đầu hoặc làm rõ QA", waiting_other_team: "Theo dõi phụ thuộc bên ngoài",
  blocked: "Tháo gỡ điểm nghẽn", unknown: "Kiểm tra ánh xạ quy trình",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{SEVERITY_LABEL[severity]}</Badge>;
}

function priorityScore(task: Task) {
  const severity = task.severity === "high" ? 3 : task.severity === "warning" ? 2 : 1;
  const blocked = task.staleReason === "blocked" || task.blockedDays > 0 ? 30_000 : 0;
  const unassigned = !task.assigneeJira ? 20_000 : 0;
  return severity * 100_000 + (task.overdueDays > 0 ? 50_000 + task.overdueDays * 100 : 0) + blocked + unassigned + task.overByDays;
}

function sortTasks(tasks: Task[], mode: SortMode) {
  return [...tasks].sort((a, b) => {
    if (mode === "stateAge") return b.stateAgeDays - a.stateAgeDays;
    if (mode === "overdue") return b.overdueDays - a.overdueDays || b.overByDays - a.overByDays;
    if (mode === "overBy") return b.overByDays - a.overByDays;
    return priorityScore(b) - priorityScore(a);
  });
}

function matchesFocus(task: Task, focus: FocusMode) {
  if (focus === "high") return task.severity === "high";
  if (focus === "blocked") return task.staleReason === "blocked" || task.blockedDays > 0;
  if (focus === "overdue") return task.overdueDays > 0;
  if (focus === "unassigned") return !task.assigneeJira;
  return true;
}

function formatTimeSpent(seconds: number | null) {
  if (seconds == null) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ""}`;
  return minutes > 0 ? `${minutes}m` : `${seconds}s`;
}

function formatDueDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function TaskMeta({ task }: { task: Task }) {
  const worklog = formatTimeSpent(task.timeSpent);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      <span>{task.projectKey} · {task.type}</span>
      {task.points != null && <span>{task.points} điểm</span>}
      {task.fixVersionNames.length > 0 && <span className="max-w-48 truncate">{task.fixVersionNames.join(", ")}</span>}
      {worklog && <span>{worklog} đã ghi nhận</span>}
    </div>
  );
}

function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {filtered ? <Search className="h-6 w-6 text-muted-foreground" aria-hidden /> : <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />}
        </span>
        <div>
          <p className="text-sm font-semibold">{filtered ? "Không có task phù hợp với lăng kính này" : "Luồng công việc đang trong giới hạn"}</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">{filtered ? "Thử đổi phạm vi, từ khóa hoặc xóa bộ lọc để xem toàn bộ task vượt SLA." : "Không có task hoạt động nào vượt SLA theo trạng thái trong phạm vi hiện tại."}</p>
        </div>
        {filtered && <Button className="cursor-pointer" variant="outline" size="sm" onClick={onClear}><RotateCcw aria-hidden /> Xóa bộ lọc</Button>}
      </CardContent>
    </Card>
  );
}

function MyWorkHealthyState({
  myWork,
  onViewTeam,
}: {
  myWork?: MyWorkInfo;
  onViewTeam: () => void;
}) {
  return (
    <Card className="shadow-none border-emerald-500/25 bg-emerald-500/[0.035]">
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                Tuyệt vời! Bạn không có task nào bị tồn đọng
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {myWork?.totalActive
                  ? `Toàn bộ ${myWork.totalActive} task bạn đang phụ trách đều có tiến độ ổn định và nằm trong thời hạn SLA cho phép.`
                  : "Bạn hiện không có task nào đang chờ xử lý trong phạm vi đã chọn."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onViewTeam}
            className="cursor-pointer shrink-0 border-primary/30 text-primary hover:bg-primary/10 transition-colors"
          >
            Xem toàn dự án
            <ArrowRight className="h-4 w-4 ml-1.5" aria-hidden="true" />
          </Button>
        </div>

        {myWork?.tasks && myWork.tasks.length > 0 && (
          <div className="rounded-lg border border-border/70 bg-card overflow-hidden">
            <div className="border-b bg-muted/40 px-4 py-2.5 flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Task bạn đang thực hiện ({myWork.tasks.length})
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Trong hạn SLA</span>
            </div>
            <div className="divide-y divide-border">
              {myWork.tasks.map((task) => (
                <Link
                  key={task.jiraKey}
                  href={`/issue/${task.jiraKey}`}
                  className="group flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/40 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-primary group-hover:underline">
                        {task.jiraKey}
                      </span>
                      <Badge variant="secondary" className="text-[11px] font-normal">
                        {task.status}
                      </Badge>
                      {task.points != null && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {task.points}pt
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-foreground font-medium group-hover:text-primary transition-colors">
                      {task.summary}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      Đang chạy tốt
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none" aria-hidden="true" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FocusCard({ active, count, description, icon: Icon, label, onClick, tone }: {
  active: boolean; count: number; description: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string; onClick: () => void; tone: "danger" | "warning";
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(
      "group min-w-0 cursor-pointer rounded-lg border bg-card p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      "hover:border-primary/50 hover:bg-muted/30", active && "border-primary bg-primary/5 ring-1 ring-primary/20",
    )}>
      <div className="flex items-start justify-between gap-3">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", tone === "danger" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}><Icon className="h-4 w-4" aria-hidden /></span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{count}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
    </button>
  );
}

function InsightBrief({ data, staleRate }: { data: StaleResponse; staleRate: number }) {
  const topBottleneck = data.bottleneck[0];
  const topReason = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const task of data.tasks) {
      const current = counts.get(task.staleReason) ?? { label: task.staleReasonLabel, count: 0 };
      current.count += 1;
      counts.set(task.staleReason, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0];
  }, [data.tasks]);
  const healthLabel = staleRate >= 30 ? "Cần can thiệp ngay" : staleRate >= 15 ? "Đang tích tụ rủi ro" : "Trong tầm kiểm soát";
  const recommendation = data.summary.totalHigh > 0
    ? `Xử lý ${data.summary.totalHigh} task khẩn cấp trước, bắt đầu từ các mục quá hạn hoặc đang bị chặn.`
    : data.summary.totalBlocked > 0
      ? `Tổ chức tháo gỡ ${data.summary.totalBlocked} task bị chặn trước khi nhận thêm WIP.`
      : data.summary.totalNoAssignee > 0
        ? `Phân công chủ sở hữu cho ${data.summary.totalNoAssignee} task để tránh tiếp tục già hóa.`
        : "Ưu tiên các task vượt SLA lâu nhất và xác nhận bước tiếp theo với người xử lý.";
  return (
    <Card className="overflow-hidden border-primary/20 bg-primary/[0.035] shadow-none">
      <CardContent className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><Sparkles className="h-4 w-4" aria-hidden /> Tóm tắt điều hành</div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{healthLabel}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{recommendation}</p>
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium">Tỷ lệ task vượt SLA</span><span className="font-semibold tabular-nums">{staleRate}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Tỷ lệ task vượt SLA" aria-valuenow={staleRate} aria-valuemin={0} aria-valuemax={100}>
              <div className={cn("h-full rounded-full transition-[width] duration-200", staleRate >= 30 ? "bg-red-500" : staleRate >= 15 ? "bg-amber-500" : "bg-primary")} style={{ width: `${Math.min(100, staleRate)}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{data.summary.totalStale} trên {data.summary.totalActive} task đang hoạt động trong phạm vi chọn.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-lg border bg-background/70 p-3.5"><p className="text-xs text-muted-foreground">Điểm nghẽn lớn nhất</p><p className="mt-1 truncate text-sm font-semibold">{topBottleneck?.status ?? "Chưa ghi nhận"}</p><p className="mt-1 text-xs text-muted-foreground">{topBottleneck ? `${topBottleneck.count} task · trung bình ${topBottleneck.avgStateAge} ngày` : "Không có dữ liệu"}</p></div>
          <div className="rounded-lg border bg-background/70 p-3.5"><p className="text-xs text-muted-foreground">Nguyên nhân phổ biến nhất</p><p className="mt-1 truncate text-sm font-semibold">{topReason?.label ?? "Chưa ghi nhận"}</p><p className="mt-1 text-xs text-muted-foreground">{topReason ? `${topReason.count} task cần cùng một kiểu can thiệp` : "Không có dữ liệu"}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionQueue({ tasks, focus }: { tasks: Task[]; focus: FocusMode }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" aria-hidden /> {focus === "all" ? "Kế hoạch can thiệp hôm nay" : "Hàng đợi theo lăng kính đã chọn"}</CardTitle><CardDescription className="mt-1 text-xs">Xếp hạng minh bạch theo mức độ, quá hạn, bị chặn, thiếu người xử lý và số ngày vượt SLA.</CardDescription></div>
        <Badge variant="outline" className="shrink-0">{Math.min(6, tasks.length)} việc đầu tiên</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {tasks.length === 0 ? <div className="flex flex-col items-center gap-2 py-10 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Inbox className="h-5 w-5 text-muted-foreground" aria-hidden /></span><p className="text-sm font-medium">Không có task trong lăng kính này</p><p className="text-xs text-muted-foreground">Chọn một lăng kính khác để tiếp tục phân loại.</p></div> : (
          <div className="divide-y">{tasks.slice(0, 6).map((task, index) => (
            <Link key={task.jiraKey} href={`/issue/${task.jiraKey}`} className="group grid cursor-pointer gap-3 px-5 py-4 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center">
              <span className="hidden h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground sm:flex">{index + 1}</span>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-primary">{task.jiraKey}</span><SeverityBadge severity={task.severity} />{task.overdueDays > 0 && <Badge variant="danger">Quá hạn {task.overdueDays} ngày</Badge>}{!task.assigneeJira && <Badge variant="warning">Chưa phân công</Badge>}</div><p className="mt-1 line-clamp-1 text-sm font-medium">{task.summary || "Task chưa đặt tên"}</p><p className="mt-1 text-xs text-muted-foreground">{task.status} · {task.assigneeJira ?? "Chưa có người xử lý"}</p></div>
              <div className="flex items-center justify-between gap-4 sm:justify-end"><div className="text-left sm:text-right"><p className="text-xs font-semibold">{ACTION_BY_REASON[task.staleReason] ?? "Kiểm tra bước tiếp theo"}</p><p className="mt-1 text-xs tabular-nums text-muted-foreground">{task.stateAgeDays}/{task.slaDays} ngày · vượt {task.overByDays} ngày</p></div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground motion-reduce:transform-none" aria-hidden /></div>
            </Link>
          ))}</div>
        )}
      </CardContent>
    </Card>
  );
}

function AgingDistribution({ tasks }: { tasks: Task[] }) {
  const bands = [
    { label: "Mới vượt", hint: "1–2 ngày", count: tasks.filter((task) => task.overByDays <= 2).length, color: "bg-sky-500" },
    { label: "Cần can thiệp", hint: "3–5 ngày", count: tasks.filter((task) => task.overByDays >= 3 && task.overByDays <= 5).length, color: "bg-amber-500" },
    { label: "Rủi ro cao", hint: "6–10 ngày", count: tasks.filter((task) => task.overByDays >= 6 && task.overByDays <= 10).length, color: "bg-orange-500" },
    { label: "Nợ kéo dài", hint: ">10 ngày", count: tasks.filter((task) => task.overByDays > 10).length, color: "bg-red-500" },
  ];
  const max = Math.max(1, ...bands.map((band) => band.count));
  return <div className="space-y-4">{bands.map((band) => <div key={band.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-xs"><span className="font-medium">{band.label} <span className="font-normal text-muted-foreground">· {band.hint}</span></span><span className="font-semibold tabular-nums">{band.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-[width] duration-200", band.color)} style={{ width: `${(band.count / max) * 100}%` }} /></div></div>)}</div>;
}

export function StaleClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<"my-work" | "team">("my-work");
  const [project, setProject] = useState(ALL);
  const [assignee, setAssignee] = useState<string>("me");
  const [status, setStatus] = useState(ALL);
  const [reason, setReason] = useState(ALL);
  const [severity, setSeverity] = useState(ALL);
  const [focus, setFocus] = useState<FocusMode>("all");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [visibleCount, setVisibleCount] = useState(50);

  const handleViewModeChange = (mode: "my-work" | "team") => {
    setViewMode(mode);
    setAssignee(mode === "my-work" ? "me" : ALL);
    setVisibleCount(50);
  };

  const params = new URLSearchParams();
  if (project !== ALL) params.set("project", project);
  if (assignee !== ALL) params.set("assignee", assignee);
  if (status !== ALL) params.set("status", status);
  if (reason !== ALL) params.set("reason", reason);
  if (severity !== ALL) params.set("severity", severity);
  const queryString = params.toString();
  const { data, dataUpdatedAt, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["stale", project, assignee, status, reason, severity],
    queryFn: () => api<StaleResponse>(`/api/stale${queryString ? `?${queryString}` : ""}`),
    refetchInterval: 60_000, retry: 1,
  });

  const focusedTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi");
    return (data?.tasks ?? []).filter((task) => matchesFocus(task, focus) && (!normalizedQuery || [task.jiraKey, task.summary, task.status, task.assigneeJira ?? "", task.staleReasonLabel, task.projectKey].some((value) => value.toLocaleLowerCase("vi").includes(normalizedQuery))));
  }, [data?.tasks, focus, query]);
  const sortedTasks = useMemo(() => sortTasks(focusedTasks, sortMode), [focusedTasks, sortMode]);
  const visibleTasks = sortedTasks.slice(0, visibleCount);
  const priorityTasks = useMemo(() => sortTasks(focusedTasks, "priority"), [focusedTasks]);
  const hasServerFilters = [project, assignee, status, reason, severity].some((value) => value !== ALL);
  const hasAnyFilter = hasServerFilters || focus !== "all" || query.trim().length > 0;
  const clearFilters = () => {
    setProject(ALL);
    if (viewMode === "my-work") {
      setAssignee("me");
    } else {
      setAssignee(ALL);
    }
    setStatus(ALL);
    setReason(ALL);
    setSeverity(ALL);
    setFocus("all");
    setQuery("");
    setVisibleCount(50);
  };
  const selectFocus = (next: FocusMode) => { setFocus((current) => current === next ? "all" : next); setVisibleCount(50); };
  const summary = data?.summary;
  const staleRate = summary && summary.totalActive > 0 ? Math.round((summary.totalStale / summary.totalActive) * 100) : 0;
  const focusCounts = {
    high: data?.tasks.filter((task) => matchesFocus(task, "high")).length ?? 0,
    blocked: data?.tasks.filter((task) => matchesFocus(task, "blocked")).length ?? 0,
    overdue: data?.tasks.filter((task) => matchesFocus(task, "overdue")).length ?? 0,
    unassigned: data?.tasks.filter((task) => matchesFocus(task, "unassigned")).length ?? 0,
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><CircleGauge className="h-4 w-4" aria-hidden /> Sức khỏe luồng công việc</div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Phân tích task tồn đọng</h1><p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">Biến dữ liệu vượt SLA thành kế hoạch can thiệp: việc nào cần làm trước, điểm nghẽn nằm ở đâu và nhóm nào đang cần hỗ trợ.</p></div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{dataUpdatedAt > 0 && <span className="hidden sm:inline">Cập nhật lúc {new Date(dataUpdatedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>}<Button className="cursor-pointer" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} aria-label="Làm mới dữ liệu phân tích"><RefreshCw className={cn(isFetching && "animate-spin motion-reduce:animate-none")} aria-hidden /> Làm mới</Button></div>
      </header>

      {/* View Switcher: Việc của tôi vs Toàn dự án */}
      <div className="flex items-center justify-between">
        <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-1" aria-label="Góc nhìn phân tích">
          <button
            type="button"
            aria-pressed={viewMode === "my-work"}
            onClick={() => handleViewModeChange("my-work")}
            className={cn(
              "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
              viewMode === "my-work"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
            Việc của tôi
            {data?.myWork && (
              <span
                className={cn(
                  "ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-semibold tabular-nums",
                  data.myWork.totalStale > 0
                    ? "bg-red-500/20 text-red-600 dark:text-red-400"
                    : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                )}
              >
                {data.myWork.totalStale}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "team"}
            onClick={() => handleViewModeChange("team")}
            className={cn(
              "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors flex items-center gap-1.5",
              viewMode === "team"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Toàn dự án
            {data?.summary && (
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {data.summary.totalStale}
              </span>
            )}
          </button>
        </div>
      </div>

      <Card className="shadow-none"><CardContent className="p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex items-center gap-2 text-sm font-semibold xl:mr-2"><Filter className="h-4 w-4 text-muted-foreground" aria-hidden /> Phạm vi phân tích</div>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={project} onValueChange={(value) => { setProject(value); setVisibleCount(50); }}><SelectTrigger className="cursor-pointer" aria-label="Lọc theo dự án"><SelectValue placeholder="Tất cả dự án" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Tất cả dự án</SelectItem>{(data?.filters.projects ?? []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={assignee} onValueChange={(value) => {
            setAssignee(value);
            if (value === "me") {
              setViewMode("my-work");
            } else if (viewMode === "my-work") {
              setViewMode("team");
            }
            setVisibleCount(50);
          }}>
            <SelectTrigger className="cursor-pointer" aria-label="Lọc theo người xử lý"><SelectValue placeholder="Tất cả người xử lý" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả người xử lý</SelectItem>
              {session?.user?.jiraUsername && (
                <SelectItem value="me">Của tôi (@{session.user.jiraUsername})</SelectItem>
              )}
              <SelectItem value="unassigned">Chưa phân công</SelectItem>
              {(data?.filters.assignees ?? [])
                .filter((item) => item !== session?.user?.jiraUsername)
                .map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => { setStatus(value); setVisibleCount(50); }}><SelectTrigger className="cursor-pointer" aria-label="Lọc theo trạng thái"><SelectValue placeholder="Tất cả trạng thái" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Tất cả trạng thái</SelectItem>{(data?.filters.statuses ?? []).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
          <Select value={reason} onValueChange={(value) => { setReason(value); setVisibleCount(50); }}><SelectTrigger className="cursor-pointer" aria-label="Lọc theo nguyên nhân"><SelectValue placeholder="Tất cả nguyên nhân" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Tất cả nguyên nhân</SelectItem>{(data?.filters.reasons ?? []).map((item) => <SelectItem key={item} value={item}>{data?.filters.reasonLabels[item] ?? item}</SelectItem>)}</SelectContent></Select>
          <Select value={severity} onValueChange={(value) => { setSeverity(value); setVisibleCount(50); }}><SelectTrigger className="cursor-pointer" aria-label="Lọc theo mức độ"><SelectValue placeholder="Tất cả mức độ" /></SelectTrigger><SelectContent><SelectItem value={ALL}>Tất cả mức độ</SelectItem><SelectItem value="high">Khẩn cấp</SelectItem><SelectItem value="warning">Cần chú ý</SelectItem><SelectItem value="info">Theo dõi</SelectItem></SelectContent></Select>
        </div>
        {hasAnyFilter && <Button className="cursor-pointer self-start xl:self-auto" variant="ghost" size="sm" onClick={clearFilters}><RotateCcw aria-hidden /> Xóa lọc</Button>}
      </div></CardContent></Card>

      {isLoading && <><Skeleton className="h-64 rounded-lg" /><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-36 rounded-lg" />)}</div><Skeleton className="h-80 rounded-lg" /></>}
      {!isLoading && error && !data && <Card className="border-red-500/30 shadow-none"><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10"><AlertCircle className="h-6 w-6 text-red-700 dark:text-red-400" aria-hidden /></span><div><p className="text-sm font-semibold">Không thể tải dữ liệu phân tích tồn đọng</p><p className="mt-1 max-w-sm text-xs text-muted-foreground">{error instanceof Error ? error.message : "Vui lòng thử lại."}</p></div><Button className="cursor-pointer" variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw aria-hidden /> Thử lại</Button></CardContent></Card>}
      {data && summary && <InsightBrief data={data} staleRate={staleRate} />}

      {data && summary && data.tasks.length > 0 && <>
        <section aria-labelledby="focus-heading">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><h2 id="focus-heading" className="text-base font-semibold">Lăng kính ưu tiên</h2><p className="mt-1 text-xs text-muted-foreground">Chọn một nhóm để thu hẹp hàng đợi hành động và danh sách chi tiết.</p></div>{focus !== "all" && <Button className="cursor-pointer" variant="ghost" size="sm" onClick={() => setFocus("all")}><X aria-hidden /> Bỏ lăng kính</Button>}</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <FocusCard active={focus === "high"} count={focusCounts.high} description="Mức độ cao, cần xác nhận chủ sở hữu và bước tiếp theo ngay." icon={ShieldAlert} label="Khẩn cấp" onClick={() => selectFocus("high")} tone="danger" />
            <FocusCard active={focus === "blocked"} count={focusCounts.blocked} description="Không thể tiến triển nếu phụ thuộc hoặc quyết định chưa được tháo gỡ." icon={Lock} label="Đang bị chặn" onClick={() => selectFocus("blocked")} tone="danger" />
            <FocusCard active={focus === "overdue"} count={focusCounts.overdue} description="Đã vượt hạn bàn giao, cần thương lượng lại phạm vi hoặc thời hạn." icon={CalendarX} label="Đã quá hạn" onClick={() => selectFocus("overdue")} tone="warning" />
            <FocusCard active={focus === "unassigned"} count={focusCounts.unassigned} description="Chưa có người chịu trách nhiệm nên nguy cơ tiếp tục già hóa cao." icon={UserRoundX} label="Chưa phân công" onClick={() => selectFocus("unassigned")} tone="warning" />
          </div>
        </section>

        <ActionQueue tasks={priorityTasks} focus={focus} />

        <section aria-labelledby="diagnostic-heading">
          <div className="mb-3"><h2 id="diagnostic-heading" className="text-base font-semibold">Chẩn đoán nguyên nhân</h2><p className="mt-1 text-xs text-muted-foreground">Dùng các tín hiệu bên dưới để điều chỉnh quy trình, không để đánh giá hiệu suất cá nhân.</p></div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card className="shadow-none"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><CircleGauge className="h-4 w-4 text-primary" aria-hidden /> Điểm nghẽn quy trình</CardTitle><CardDescription className="text-xs">Bấm một trạng thái để lọc toàn bộ phân tích.</CardDescription></CardHeader><CardContent className="space-y-2">{data.bottleneck.slice(0, 6).map((item) => { const max = data.bottleneck[0]?.count || 1; return <button key={item.status} type="button" onClick={() => setStatus(item.status)} className="w-full cursor-pointer rounded-md p-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 font-medium"><span className={cn("h-2 w-2 shrink-0 rounded-full", GROUP_DOT[item.group] ?? "bg-muted-foreground/50")} aria-hidden /><span className="truncate">{item.status}</span></span><span className="shrink-0 tabular-nums text-muted-foreground">{item.count} task · TB {item.avgStateAge} ngày</span></div><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/75" style={{ width: `${(item.count / max) * 100}%` }} /></div></button>; })}</CardContent></Card>
            <Card className="shadow-none"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><CalendarClock className="h-4 w-4 text-primary" aria-hidden /> Tuổi của phần việc tồn đọng</CardTitle><CardDescription className="text-xs">Phân tầng theo số ngày đã vượt SLA để tránh nợ quy trình kéo dài.</CardDescription></CardHeader><CardContent><AgingDistribution tasks={data.tasks} /></CardContent></Card>
            <Card className="shadow-none"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" aria-hidden /> Nơi cần hỗ trợ</CardTitle><CardDescription className="text-xs">Điều phối theo loại trở ngại và khối lượng, không xếp hạng cá nhân.</CardDescription></CardHeader><CardContent className="space-y-1">{data.support.slice(0, 6).map((entry) => <button key={entry.assignee} type="button" onClick={() => entry.assignee === "(unassigned)" ? selectFocus("unassigned") : setAssignee(entry.assignee)} className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-md p-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.assignee === "(unassigned)" ? "Chưa phân công" : entry.assignee}</p><p className="mt-1 truncate text-xs text-muted-foreground">{entry.reasons[0]?.label ?? "Cần xem xét"} · TB {entry.avgStateAge} ngày</p></div><div className="flex shrink-0 items-center gap-2"><span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">{entry.taskCount}</span><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden /></div></button>)}</CardContent></Card>
          </div>
        </section>

        <Card className="shadow-none">
          <CardHeader className="gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between lg:space-y-0"><div><CardTitle className="flex items-center gap-2 text-base"><ListTodo className="h-4 w-4 text-primary" aria-hidden /> Danh sách xử lý chi tiết</CardTitle><CardDescription className="mt-1 text-xs">{focusedTasks.length} trong {data.tasks.length} task vượt SLA · mọi thời gian tính theo ngày làm việc.</CardDescription></div><div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto"><div className="relative min-w-0 sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }} className="pl-9" placeholder="Tìm key, nội dung, người xử lý…" aria-label="Tìm trong task tồn đọng" /></div><Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}><SelectTrigger className="cursor-pointer sm:w-52" aria-label="Sắp xếp task tồn đọng"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="priority">Ưu tiên can thiệp</SelectItem><SelectItem value="overBy">Vượt SLA nhiều nhất</SelectItem><SelectItem value="stateAge">Ở trạng thái lâu nhất</SelectItem><SelectItem value="overdue">Quá hạn nhiều nhất</SelectItem></SelectContent></Select></div></CardHeader>
          <CardContent className="p-0">
            {visibleTasks.length === 0 ? <EmptyState filtered onClear={clearFilters} /> : <>
              <div className="divide-y lg:hidden">{visibleTasks.map((task) => <Link key={task.jiraKey} href={`/issue/${task.jiraKey}`} className="block cursor-pointer px-5 py-4 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className="font-mono text-xs font-semibold text-primary">{task.jiraKey}</span><p className="mt-1 line-clamp-2 text-sm font-medium">{task.summary || "Task chưa đặt tên"}</p></div><SeverityBadge severity={task.severity} /></div><div className="mt-3 flex flex-wrap gap-1.5"><Badge variant="secondary">{task.status}</Badge><Badge variant="outline">{task.staleReasonLabel}</Badge>{task.overdueDays > 0 && <Badge variant="danger">Quá hạn {task.overdueDays} ngày</Badge>}</div><div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{task.assigneeJira ?? "Chưa phân công"}</span><span className="tabular-nums">{task.stateAgeDays}/{task.slaDays} ngày · +{task.overByDays} ngày</span></div></Link>)}</div>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground">
                      <th className="px-5 py-3 font-medium">Task</th>
                      <th className="px-3 py-3 font-medium">Chủ sở hữu &amp; trạng thái</th>
                      <th className="px-3 py-3 font-medium">Can thiệp đề xuất</th>
                      <th className="px-3 py-3 text-right font-medium">Tuổi / SLA</th>
                      <th className="px-3 py-3 font-medium">Rủi ro bàn giao</th>
                      <th className="px-5 py-3 text-right font-medium">Mức độ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleTasks.map((task) => (
                      <tr
                        key={task.jiraKey}
                        onClick={() => router.push(`/issue/${task.jiraKey}`)}
                        className="cursor-pointer transition-colors duration-150 hover:bg-muted/40 group"
                      >
                        <td className="max-w-sm px-5 py-3.5 align-top">
                          <Link
                            href={`/issue/${task.jiraKey}`}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-pointer font-mono text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {task.jiraKey}
                          </Link>
                          <p className="mt-1 line-clamp-2 font-medium group-hover:text-primary transition-colors">
                            {task.summary || "Task chưa đặt tên"}
                          </p>
                          <TaskMeta task={task} />
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <p className={cn("text-xs font-medium", !task.assigneeJira && "text-amber-700 dark:text-amber-400")}>
                            {task.assigneeJira ?? "Chưa phân công"}
                          </p>
                          <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className={cn("h-1.5 w-1.5 rounded-full", GROUP_DOT[task.statusGroup] ?? "bg-muted-foreground/50")} aria-hidden />
                            {task.status}
                          </span>
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <p className="text-xs font-semibold">
                            {ACTION_BY_REASON[task.staleReason] ?? "Kiểm tra bước tiếp theo"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">{task.staleReasonLabel}</p>
                        </td>
                        <td className="px-3 py-3.5 text-right align-top tabular-nums">
                          <p className="text-xs font-semibold">{task.stateAgeDays} / {task.slaDays} ngày</p>
                          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">+{task.overByDays} ngày vượt</p>
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          {task.overdueDays > 0 ? (
                            <Badge variant="danger">Quá hạn {task.overdueDays} ngày</Badge>
                          ) : task.dueDate ? (
                            <span className="text-xs text-muted-foreground">Hạn {formatDueDate(task.dueDate)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Chưa có hạn chót</span>
                          )}
                          {task.expectedCycleMax == null ? (
                            <p className="mt-1.5 text-xs text-muted-foreground">Chưa có baseline theo điểm</p>
                          ) : task.baselineLevel !== "within" && (
                            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">Vượt baseline {task.points} điểm</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right align-top">
                          <SeverityBadge severity={task.severity} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>}
            {visibleCount < sortedTasks.length && <div className="flex flex-col items-center gap-2 border-t px-6 py-4"><p className="text-xs text-muted-foreground">Đang hiển thị {visibleCount} trên {sortedTasks.length} task</p><Button className="cursor-pointer" variant="outline" size="sm" onClick={() => setVisibleCount((count) => count + 50)}>Xem thêm 50 task</Button></div>}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-none"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><Clock3 className="h-4 w-4 text-primary" aria-hidden /> Áp lực WIP</CardTitle><CardDescription className="text-xs">Toàn bộ việc đang làm/review trong phạm vi, không chỉ task vượt SLA.</CardDescription></CardHeader><CardContent>{data.wip.length === 0 ? <div className="flex flex-col items-center gap-2 py-5 text-center"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Users className="h-5 w-5 text-muted-foreground" aria-hidden /></span><p className="text-xs text-muted-foreground">Không có WIP trong phạm vi hiện tại.</p></div> : <div className="space-y-2">{data.wip.slice(0, 7).map((entry) => <div key={entry.assignee} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"><span className="min-w-0 truncate text-sm font-medium">{entry.assignee === "(unassigned)" ? "Chưa phân công" : entry.assignee}</span><div className="flex shrink-0 items-center gap-2"><span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:block">{entry.statuses.join(" · ")}</span><span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-muted px-2 text-xs font-semibold tabular-nums">{entry.taskCount}</span></div></div>)}</div>}</CardContent></Card>
          <Card className="shadow-none"><CardHeader className="pb-4"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden /> Kiểm tra chất lượng dữ liệu</CardTitle><CardDescription className="text-xs">Các tín hiệu cần hoàn thiện để phân tích và dự báo chính xác hơn.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">Task chưa có người xử lý</p><p className="mt-1 text-xs text-muted-foreground">Không xác định được chủ sở hữu hành động.</p></div><Badge variant={summary.totalNoAssignee > 0 ? "warning" : "success"}>{summary.totalNoAssignee}</Badge></div><div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">Thiếu baseline theo story point</p><p className="mt-1 text-xs text-muted-foreground">Chưa đủ cơ sở so sánh chu kỳ theo độ lớn.</p></div><Badge variant="outline">{data.tasks.filter((task) => task.expectedCycleMax == null).length}</Badge></div><div className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">Task chưa có hạn chót</p><p className="mt-1 text-xs text-muted-foreground">Khó đánh giá rủi ro bàn giao theo thời gian.</p></div><Badge variant="outline">{data.tasks.filter((task) => !task.dueDate).length}</Badge></div></CardContent></Card>
        </div>
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><UserRoundX className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Các góc nhìn theo người xử lý chỉ phục vụ điều phối hỗ trợ và tháo gỡ điểm nghẽn. Không sử dụng chúng như bảng xếp hạng hiệu suất cá nhân.</p>
      </>}
      {data && data.tasks.length === 0 && (
        viewMode === "my-work" && [status, reason, severity].every((v) => v === ALL) && !query.trim() && focus === "all" ? (
          <MyWorkHealthyState
            myWork={data.myWork}
            onViewTeam={() => handleViewModeChange("team")}
          />
        ) : (
          <EmptyState filtered={hasAnyFilter} onClear={clearFilters} />
        )
      )}
    </div>
  );
}
