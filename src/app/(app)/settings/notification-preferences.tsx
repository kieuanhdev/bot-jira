"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Bell,
  Send,
  Smartphone,
  ShieldAlert,
} from "lucide-react";
import { useWebPush } from "@/hooks/use-web-push";

type Preferences = {
  disabledTypes: string[];
  pushEnabled: boolean;
  pushDisabledTypes: string[];
  knownTypes: string[];
  hasSubscription: boolean;
};

const TYPE_DETAILS: Record<string, { label: string; desc: string }> = {
  comment: {
    label: "Bình luận trên task theo dõi",
    desc: "Khi ai đó để lại bình luận trên task bạn đang theo dõi.",
  },
  transition: {
    label: "Thay đổi trạng thái task",
    desc: "Khi trạng thái workflow của task được chuyển tiếp.",
  },
  stale: {
    label: "Cảnh báo task tồn đọng / quá hạn SLA",
    desc: "Khi task bạn được gán không có cập nhật vượt quá giới hạn SLA.",
  },
  release: {
    label: "Trạng thái bản phát hành",
    desc: "Khi bản phát hành bị chặn hoặc đã được phát hành thành công.",
  },
  sentry: {
    label: "Lỗi Sentry nghiêm trọng",
    desc: "Khi phát hiện sự cố blocker từ Sentry ảnh hưởng bản phát hành.",
  },
  ci: {
    label: "Kết quả build & CI",
    desc: "Khi có kết quả build CI từ commit liên quan đến bản phát hành.",
  },
  ai: {
    label: "Gợi ý điểm story point từ AI",
    desc: "Khi mô hình AI hoàn tất ước lượng cho task mới.",
  },
  system: {
    label: "Thông báo hệ thống & sức khỏe worker",
    desc: "Khi có thao tác hàng loạt hoặc cảnh báo sự cố tiến trình nền.",
  },
};

export function NotificationPreferences() {
  const qc = useQueryClient();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const {
    isSupported: pushSupported,
    permission: pushPermission,
    subscribe: subscribePush,
    unsubscribe: unsubscribePush,
    sendTestNotification,
    error: pushHookError,
  } = useWebPush();

  const { data, isLoading } = useQuery<Preferences>({
    queryKey: ["notify", "preferences"],
    queryFn: () => api<Preferences>("/api/notify/preferences"),
  });

  const mutation = useMutation({
    mutationFn: (body: Partial<Preferences>) =>
      api<Preferences>("/api/notify/preferences", { method: "PATCH", body }),
    onSuccess: (next) => {
      qc.setQueryData(["notify", "preferences"], next);
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
  };

  const knownTypes = values.knownTypes.length > 0 ? values.knownTypes : Object.keys(TYPE_DETAILS);

  // Toggle in-app type
  const toggleInAppType = (typeKey: string) => {
    const disabledTypes = values.disabledTypes.includes(typeKey)
      ? values.disabledTypes.filter((t) => t !== typeKey)
      : [...values.disabledTypes, typeKey];
    mutation.mutate({ disabledTypes });
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

  return (
    <div className="space-y-6">
      {/* Web In-App Notifications */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
                Thông báo trên ứng dụng (In-app)
              </CardTitle>
              <CardDescription className="mt-1">
                Quản lý các loại thông báo xuất hiện trong hộp thư và chuông thông báo trên thanh tiêu đề.
              </CardDescription>
            </div>
            {saveSuccess && (
              <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 gap-1 border-emerald-500/30">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Đã lưu
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Đang tải tuỳ chọn…
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {knownTypes.map((t) => {
                const info = TYPE_DETAILS[t] ?? { label: t, desc: "" };
                const isChecked = !values.disabledTypes.includes(t);
                return (
                  <label
                    key={t}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors duration-150 ${
                      isChecked
                        ? "border-border hover:bg-muted/40"
                        : "border-border/60 bg-muted/20 opacity-75"
                    }`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleInAppType(t)}
                      disabled={mutation.isPending}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-sm font-medium leading-none block text-foreground">
                        {info.label}
                      </span>
                      {info.desc && (
                        <p className="text-xs text-muted-foreground leading-normal">{info.desc}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-center gap-2 text-xs text-destructive mt-2">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <span>Lưu thay đổi thất bại. Vui lòng thử lại.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Web Push Notifications (Opt-in) */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                Thông báo đẩy ngoài trình duyệt (Web Push)
              </CardTitle>
              <CardDescription className="mt-1">
                Nhận thông báo nổi ngay cả khi bạn không mở tab ứng dụng. Mặc định tính năng này tắt và chỉ gửi khi bạn cho phép.
              </CardDescription>
            </div>
            {values.pushEnabled && (
              <Badge variant="outline" className="text-teal-600 dark:text-teal-400 border-teal-500/30">
                Đang bật
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
            <div className="rounded-lg border border-border p-4 bg-muted/20 space-y-4">
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
                    className="h-5 w-5"
                  />
                  <label htmlFor="push-master-toggle" className="text-sm font-medium cursor-pointer">
                    {values.pushEnabled ? "Bật" : "Tắt"}
                  </label>
                </div>
              </div>

              {values.pushEnabled && (
                <div className="pt-3 border-t border-border/80 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    Trạng thái kết nối:{" "}
                    <span className="font-medium text-foreground">
                      {values.hasSubscription ? "Đã đăng ký thiết bị" : "Chờ đăng ký subscription"}
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
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
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
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {pushHookError}
            </p>
          )}

          {/* Types configured for Web Push */}
          {values.pushEnabled && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">Loại sự kiện được bắn Push ra ngoài</h4>
                <p className="text-xs text-muted-foreground">
                  Chỉ những sự kiện được chọn bên dưới mới hiển thị thông báo ngoài màn hình. (Tắt ở đây không làm mất thông báo trong ứng dụng).
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {knownTypes.map((t) => {
                  const info = TYPE_DETAILS[t] ?? { label: t, desc: "" };
                  const isChecked = !values.pushDisabledTypes.includes(t);
                  return (
                    <label
                      key={`push-${t}`}
                      className={`flex items-start gap-3 rounded-lg border p-2.5 cursor-pointer text-xs transition-colors duration-150 ${
                        isChecked
                          ? "border-border hover:bg-muted/40"
                          : "border-border/60 bg-muted/20 opacity-75"
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => togglePushType(t)}
                        disabled={mutation.isPending}
                        className="mt-0.5"
                      />
                      <span className="font-medium text-foreground">{info.label}</span>
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
