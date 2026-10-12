"use client";

import { AlertCircle, CheckCheck, Send, ShieldAlert, Smartphone, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { getTypeDetail, type Preferences } from "../lib/notification-type-details";

interface WebPushCardProps {
  values: Preferences;
  knownTypes: string[];
  pushEnabledCount: number;
  pending: boolean;
  pushSupported: boolean;
  pushPermission: NotificationPermission | string;
  pushHookError: string | null;
  testSending: boolean;
  testSent: boolean;
  onTogglePushMaster: (checked: boolean) => void;
  onTogglePushType: (type: string) => void;
  onEnableAllPush: () => void;
  onDisableAllPush: () => void;
  onTestPush: () => void;
}

export function WebPushCard({
  values,
  knownTypes,
  pushEnabledCount,
  pending,
  pushSupported,
  pushPermission,
  pushHookError,
  testSending,
  testSent,
  onTogglePushMaster,
  onTogglePushType,
  onEnableAllPush,
  onDisableAllPush,
  onTestPush,
}: WebPushCardProps) {
  return (
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
                onCheckedChange={(checked) => onTogglePushMaster(Boolean(checked))}
                disabled={pending}
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
                onClick={onTestPush}
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
                onClick={onEnableAllPush}
                disabled={pending || pushEnabledCount === knownTypes.length}
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
                onClick={onDisableAllPush}
                disabled={pending || pushEnabledCount === 0}
                className="h-7 text-xs cursor-pointer text-muted-foreground hover:text-destructive gap-1"
              >
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Tắt tất cả
              </Button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {knownTypes.map((t) => {
              const info = getTypeDetail(t);
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
                    onCheckedChange={() => onTogglePushType(t)}
                    disabled={pending}
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
  );
}
