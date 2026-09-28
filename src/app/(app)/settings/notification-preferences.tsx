"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { notifyKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  AlertCircle,
  Bell,
  Send,
  Smartphone,
  ShieldAlert,
  MessageSquare,
  RefreshCw,
  ArrowRightLeft,
  Clock,
  Rocket,
  GitBranch,
  Cpu,
  CheckCheck,
  XCircle,
  Clock3,
  Layers,
  Sparkles,
} from "lucide-react";
import { useWebPush } from "@/hooks/use-web-push";

type Preferences = {
  disabledTypes: string[];
  pushEnabled: boolean;
  pushDisabledTypes: string[];
  knownTypes: string[];
  hasSubscription: boolean;
  deliveryMode?: string;
  digestHour?: number;
};

export type NotificationCategory = "tasks" | "release" | "system";

export interface TypeDetail {
  id: string;
  category: NotificationCategory;
  categoryLabel: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  colorClass: string;
  bgClass: string;
}

export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string; desc: string }[] = [
  {
    id: "tasks",
    label: "Công việc & Task Jira",
    desc: "Bình luận, cập nhật tiến độ, luồng xử lý và cảnh báo quá hạn SLA của task",
  },
  {
    id: "release",
    label: "Bản phát hành & CI/CD",
    desc: "Tiến trình xuất xưởng phiên bản, kết quả build CI và sự cố blocker Sentry",
  },
  {
    id: "system",
    label: "AI & Hệ thống",
    desc: "Gợi ý điểm story point từ AI, tác vụ hàng loạt và cảnh báo sức khỏe dịch vụ",
  },
];

export const TYPE_DETAILS: Record<string, TypeDetail> = {
  comment: {
    id: "comment",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Bình luận trên task & PR",
    desc: "Khi ai đó để lại bình luận trên task Jira bạn theo dõi hoặc trên Bitbucket Pull Request liên quan.",
    icon: MessageSquare,
    colorClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10 border-blue-500/20",
  },
  issue: {
    id: "issue",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Cập nhật thông tin task theo dõi",
    desc: "Khi task thay đổi người phụ trách (assignee), mô tả, độ ưu tiên, phiên bản hoặc các trường thông tin quan trọng.",
    icon: RefreshCw,
    colorClass: "text-cyan-600 dark:text-cyan-400",
    bgClass: "bg-cyan-500/10 border-cyan-500/20",
  },
  transition: {
    id: "transition",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Chuyển trạng thái workflow task",
    desc: "Khi trạng thái workflow của task được chuyển tiếp (ví dụ: To Do → In Progress → In Review → Done).",
    icon: ArrowRightLeft,
    colorClass: "text-purple-600 dark:text-purple-400",
    bgClass: "bg-purple-500/10 border-purple-500/20",
  },
  stale: {
    id: "stale",
    category: "tasks",
    categoryLabel: "Công việc & Task Jira",
    label: "Cảnh báo task tồn đọng / quá hạn SLA",
    desc: "Khi task bạn được gán không có cập nhật hoặc đứng yên ở một trạng thái vượt quá số ngày SLA quy định.",
    icon: Clock,
    colorClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10 border-amber-500/20",
  },
  release: {
    id: "release",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Trạng thái bản phát hành (Release)",
    desc: "Khi bản phát hành Fix Version sẵn sàng đóng gói, bị chặn bởi release gate hoặc đã được xuất xưởng thành công.",
    icon: Rocket,
    colorClass: "text-teal-600 dark:text-teal-400",
    bgClass: "bg-teal-500/10 border-teal-500/20",
  },
  ci: {
    id: "ci",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Kết quả build & kiểm thử CI",
    desc: "Khi tiến trình CI hoàn tất thành công, thất bại hoặc bị hủy trên commit phát hành liên quan.",
    icon: GitBranch,
    colorClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 border-emerald-500/20",
  },
  sentry: {
    id: "sentry",
    category: "release",
    categoryLabel: "Bản phát hành & CI/CD",
    label: "Lỗi Sentry blocker nghiêm trọng",
    desc: "Khi phát hiện sự cố blocker hoặc ngoại lệ mới từ Sentry có nguy cơ ảnh hưởng trực tiếp đến đợt phát hành.",
    icon: ShieldAlert,
    colorClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/10 border-rose-500/20",
  },
  ai: {
    id: "ai",
    category: "system",
    categoryLabel: "AI & Hệ thống",
    label: "Gợi ý điểm story point từ AI",
    desc: "Khi mô hình AI (OpenAI / Ollama) hoàn tất phân tích yêu cầu và đề xuất điểm ước lượng cho task mới.",
    icon: Cpu,
    colorClass: "text-indigo-600 dark:text-indigo-400",
    bgClass: "bg-indigo-500/10 border-indigo-500/20",
  },
  system: {
    id: "system",
    category: "system",
    categoryLabel: "AI & Hệ thống",
    label: "Thông báo hệ thống & tiến trình nền",
    desc: "Khi thao tác hàng loạt (bulk operations) hoàn tất hoặc cảnh báo sức khỏe của worker nền / đồng bộ Jira.",
    icon: Bell,
    colorClass: "text-slate-600 dark:text-slate-400",
    bgClass: "bg-slate-500/10 border-slate-500/20",
  },
};

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, "0")}:00`,
}));

export function NotificationPreferences() {
  const qc = useQueryClient();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>("all");

  const {
    isSupported: pushSupported,
    permission: pushPermission,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    sendTestNotification,
    error: pushHookError,
  } = useWebPush();

  const { data, isLoading } = useQuery<Preferences>({
    queryKey: notifyKeys.preferences,
    queryFn: () => api<Preferences>("/api/notify/preferences"),
  });

  const mutation = useMutation({
    mutationFn: (body: Partial<Preferences>) =>
      api<Preferences>("/api/notify/preferences", { method: "PATCH", body }),
    onSuccess: (next) => {
      qc.setQueryData(notifyKeys.preferences, next);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  const values: Preferences = data ?? {
    disabledTypes: [],
    pushEnabled: false,
    pushDisabledTypes: [],
    knownTypes: Object.keys(TYPE_DETAILS),
    hasSubscription: false,
    deliveryMode: "instant",
    digestHour: 8,
  };

  const knownTypes = values.knownTypes.length > 0 ? values.knownTypes : Object.keys(TYPE_DETAILS);

  // Grouped types
  const filteredTypes = useMemo(() => {
    if (activeCategoryFilter === "all") return knownTypes;
    return knownTypes.filter((t) => TYPE_DETAILS[t]?.category === activeCategoryFilter);
  }, [knownTypes, activeCategoryFilter]);

  // Counts for In-App
  const inAppEnabledCount = knownTypes.filter((t) => !values.disabledTypes.includes(t)).length;

  // Counts for Push
  const pushEnabledCount = knownTypes.filter((t) => !values.pushDisabledTypes.includes(t)).length;

  // Toggle in-app type
  const toggleInAppType = (typeKey: string) => {
    const disabledTypes = values.disabledTypes.includes(typeKey)
      ? values.disabledTypes.filter((t) => t !== typeKey)
      : [...values.disabledTypes, typeKey];
    mutation.mutate({ disabledTypes });
  };

  // Bulk toggle in-app
  const enableAllInApp = () => {
    mutation.mutate({ disabledTypes: [] });
  };

  const disableAllInApp = () => {
    mutation.mutate({ disabledTypes: [...knownTypes] });
  };

  // Toggle push master switch
  const handleTogglePushMaster = async (checked: boolean) => {
    if (checked) {
      try {
        await subscribePush();
        mutation.mutate({ pushEnabled: true });
      } catch {
        // subscribePush sets error
      }
    } else {
      try {
        await unsubscribePush();
      } catch {
        // ignore
      }
      mutation.mutate({ pushEnabled: false });
    }
  };

  // Toggle push type
  const togglePushType = (typeKey: string) => {
    const pushDisabledTypes = values.pushDisabledTypes.includes(typeKey)
      ? values.pushDisabledTypes.filter((t) => t !== typeKey)
      : [...values.pushDisabledTypes, typeKey];
    mutation.mutate({ pushDisabledTypes });
  };

  // Bulk toggle push
  const enableAllPush = () => {
    mutation.mutate({ pushDisabledTypes: [] });
  };

  const disableAllPush = () => {
    mutation.mutate({ pushDisabledTypes: [...knownTypes] });
  };

  const handleTestPush = async () => {
    setTestSending(true);
    setTestSent(false);
    try {
      await sendTestNotification();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } catch {
      // handled in hook
    } finally {
      setTestSending(false);
    }
  };

  // Toggle delivery mode
  const handleDeliveryModeChange = (mode: "instant" | "digest") => {
    mutation.mutate({ deliveryMode: mode });
  };

  const handleDigestHourChange = (hour: string) => {
    const parsed = parseInt(hour, 10);
    if (!isNaN(parsed)) {
      mutation.mutate({ digestHour: parsed });
    }
  };

  return (
    <div className="space-y-6">
      {/* Web In-App Notifications */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
                  Thông báo trên ứng dụng (In-app)
                </CardTitle>
                {!isLoading && (
                  <Badge variant="secondary" className="font-mono text-xs">
                    {inAppEnabledCount}/{knownTypes.length} đang bật
                  </Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                Tùy chỉnh các loại sự kiện hiển thị trên hộp thư nhanh, chuông thông báo và trang thông báo.
              </CardDescription>
            </div>
            {saveSuccess && (
              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 gap-1 border-emerald-500/30 shrink-0 self-start sm:self-auto">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Đã lưu cài đặt
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4 py-2" aria-label="Đang tải tùy chọn thông báo">
              <div className="flex gap-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-28" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Category Filter and Quick Actions Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/60">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button
                    type="button"
                    variant={activeCategoryFilter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setActiveCategoryFilter("all")}
                    className="h-8 text-xs cursor-pointer gap-1.5"
                  >
                    <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    Tất cả ({knownTypes.length})
                  </Button>
                  {NOTIFICATION_CATEGORIES.map((cat) => {
                    const countInCat = knownTypes.filter((t) => TYPE_DETAILS[t]?.category === cat.id).length;
                    return (
                      <Button
                        key={cat.id}
                        type="button"
                        variant={activeCategoryFilter === cat.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveCategoryFilter(cat.id)}
                        className="h-8 text-xs cursor-pointer"
                      >
                        {cat.label} ({countInCat})
                      </Button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={enableAllInApp}
                    disabled={mutation.isPending || inAppEnabledCount === knownTypes.length}
                    className="h-8 text-xs cursor-pointer text-primary hover:text-primary gap-1"
                  >
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Bật tất cả
                  </Button>
                  <span className="text-border text-xs">|</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={disableAllInApp}
                    disabled={mutation.isPending || inAppEnabledCount === 0}
                    className="h-8 text-xs cursor-pointer text-muted-foreground hover:text-destructive gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Tắt tất cả
                  </Button>
                </div>
              </div>

              {/* Notification Type Cards Grid */}
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredTypes.map((t) => {
                  const info = TYPE_DETAILS[t] ?? {
                    id: t,
                    category: "tasks",
                    categoryLabel: "Khác",
                    label: t,
                    desc: "",
                    icon: Bell,
                    colorClass: "text-muted-foreground",
                    bgClass: "bg-muted/30 border-border",
                  };
                  const Icon = info.icon;
                  const isChecked = !values.disabledTypes.includes(t);
                  return (
                    <label
                      key={t}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all duration-150 ${
                        isChecked
                          ? "border-border bg-card shadow-xs hover:border-primary/40 hover:bg-muted/30"
                          : "border-border/60 bg-muted/15 opacity-65 hover:opacity-90 hover:bg-muted/25"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleInAppType(t)}
                        disabled={mutation.isPending}
                        className="mt-1 shrink-0"
                      />
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center justify-center p-1 rounded-md border ${info.bgClass}`}>
                            <Icon className={`h-3.5 w-3.5 ${info.colorClass}`} aria-hidden="true" />
                          </span>
                          <span className="text-sm font-medium leading-tight text-foreground truncate">
                            {info.label}
                          </span>
                          <Badge
                            variant={isChecked ? "success" : "secondary"}
                            className="ml-auto text-[10px] px-1.5 py-0 font-normal shrink-0"
                          >
                            {isChecked ? "Bật" : "Tắt"}
                          </Badge>
                        </div>
                        {info.desc && (
                          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {info.desc}
                          </p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}

          {mutation.isError && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Lưu thay đổi thất bại. Vui lòng kiểm tra lại kết nối.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Mode & Frequency */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
            Hình thức &amp; Tần suất gửi
          </CardTitle>
          <CardDescription>
            Chọn gửi ngay lập tức khi phát sinh sự kiện hoặc tổng hợp định kỳ hàng ngày.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <label
              className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all duration-150 ${
                values.deliveryMode !== "digest"
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <input
                type="radio"
                name="delivery-mode"
                className="mt-1 cursor-pointer accent-primary"
                checked={values.deliveryMode !== "digest"}
                onChange={() => handleDeliveryModeChange("instant")}
                disabled={mutation.isPending}
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Gửi tức thì (Mặc định)</span>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Khuyên dùng</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Nhận ngay thông báo khi có bình luận, chuyển trạng thái hoặc sự cố blocker.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-all duration-150 ${
                values.deliveryMode === "digest"
                  ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:bg-muted/30"
              }`}
            >
              <input
                type="radio"
                name="delivery-mode"
                className="mt-1 cursor-pointer accent-primary"
                checked={values.deliveryMode === "digest"}
                onChange={() => handleDeliveryModeChange("digest")}
                disabled={mutation.isPending}
              />
              <div className="space-y-1.5 flex-1">
                <span className="text-sm font-semibold text-foreground block">Bản tin tổng hợp hàng ngày</span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Gộp các thông báo phát sinh và gửi tổng hợp một lần mỗi ngày vào khung giờ bạn chọn.
                </p>
                {values.deliveryMode === "digest" && (
                  <div className="pt-2 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Giờ nhận:</span>
                    <Select
                      value={String(values.digestHour ?? 8)}
                      onValueChange={handleDigestHourChange}
                      disabled={mutation.isPending}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs cursor-pointer">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOURS.map((h) => (
                          <SelectItem key={h.value} value={String(h.value)} className="cursor-pointer text-xs">
                            {h.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Web Push Notifications (Opt-in) */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Smartphone className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                Thông báo đẩy ngoài màn hình (Web Push)
              </CardTitle>
              <CardDescription className="mt-1">
                Nhận thông báo nổi ngay cả khi bạn không mở tab trình duyệt. Hoàn toàn bảo mật và chỉ kích hoạt khi bạn đồng ý.
              </CardDescription>
            </div>
            {values.pushEnabled && (
              <Badge variant="outline" className="text-teal-600 dark:text-teal-400 border-teal-500/30 shrink-0 self-start sm:self-auto">
                {pushEnabledCount}/{knownTypes.length} loại đang đẩy
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!pushSupported ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium">Trình duyệt không hỗ trợ Web Push</p>
                <p className="text-xs mt-0.5 opacity-90">
                  Trình duyệt hiện tại không hỗ trợ Service Worker hoặc PushManager. Bạn vẫn có thể sử dụng thông báo in-app bình thường.
                </p>
              </div>
            </div>
          ) : pushPermission === "denied" ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive flex items-start gap-2.5">
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-medium">Quyền thông báo đã bị chặn trên trình duyệt</p>
                <p className="text-xs mt-0.5 opacity-90">
                  Vui lòng bấm vào biểu tượng ổ khóa bên cạnh thanh địa chỉ trình duyệt, bật lại quyền &quot;Thông báo&quot; và tải lại trang.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-sm font-semibold block text-foreground">
                    Bật thông báo Web Push trên thiết bị này
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Khi bật, trình duyệt sẽ yêu cầu cấp quyền hiển thị thông báo ngoài màn hình.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="push-master-toggle"
                    checked={values.pushEnabled}
                    onCheckedChange={(checked) => handleTogglePushMaster(Boolean(checked))}
                    disabled={mutation.isPending}
                    className="h-5 w-5 cursor-pointer"
                  />
                  <label htmlFor="push-master-toggle" className="text-sm font-medium cursor-pointer">
                    {values.pushEnabled ? "Bật" : "Tắt"}
                  </label>
                </div>
              </div>

              {values.pushEnabled && (
                <div className="pt-3 border-t border-border/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Trạng thái kết nối:{" "}
                    <span className="font-medium text-foreground">
                      {values.hasSubscription ? "Đã đăng ký thiết bị thành công" : "Chờ đăng ký subscription"}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestPush}
                    disabled={testSending}
                    className="cursor-pointer text-xs h-8 gap-1.5"
                  >
                    {testSending ? (
                      <span className="flex items-center gap-1.5">
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Đang gửi…
                      </span>
                    ) : (
                      <Send className="h-3 w-3" aria-hidden="true" />
                    )}
                    {testSent ? "Đã gửi thử!" : "Gửi thông báo thử"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {pushHookError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {pushHookError}
            </p>
          )}

          {/* Types configured for Web Push */}
          {values.pushEnabled && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                    Loại sự kiện được bắn Push ra ngoài màn hình
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Chỉ những sự kiện được chọn bên dưới mới phát âm thanh / thông báo ngoài màn hình. (Tắt ở đây không làm mất thông báo trong ứng dụng).
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={enableAllPush}
                    disabled={mutation.isPending || pushEnabledCount === knownTypes.length}
                    className="h-7 text-xs cursor-pointer text-teal-600 dark:text-teal-400 hover:text-teal-700 gap-1"
                  >
                    <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Bật tất cả
                  </Button>
                  <span className="text-border text-xs">|</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={disableAllPush}
                    disabled={mutation.isPending || pushEnabledCount === 0}
                    className="h-7 text-xs cursor-pointer text-muted-foreground hover:text-destructive gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Tắt tất cả
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {knownTypes.map((t) => {
                  const info = TYPE_DETAILS[t] ?? {
                    id: t,
                    category: "tasks",
                    categoryLabel: "Khác",
                    label: t,
                    desc: "",
                    icon: Bell,
                    colorClass: "text-muted-foreground",
                    bgClass: "bg-muted/30 border-border",
                  };
                  const Icon = info.icon;
                  const isChecked = !values.pushDisabledTypes.includes(t);
                  return (
                    <label
                      key={`push-${t}`}
                      className={`flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer text-xs transition-colors duration-150 ${
                        isChecked
                          ? "border-teal-500/30 bg-teal-500/5 hover:bg-teal-500/10"
                          : "border-border/60 bg-muted/20 opacity-70 hover:opacity-90"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => togglePushType(t)}
                        disabled={mutation.isPending}
                        className="shrink-0"
                      />
                      <Icon className={`h-3.5 w-3.5 shrink-0 ${info.colorClass}`} aria-hidden="true" />
                      <span className="font-medium text-foreground truncate flex-1">{info.label}</span>
                      <Badge
                        variant={isChecked ? "success" : "secondary"}
                        className="text-[10px] px-1 py-0 font-normal shrink-0"
                      >
                        {isChecked ? "Push bật" : "Push tắt"}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
