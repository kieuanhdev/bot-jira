"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { notifyKeys } from "@/lib/query-keys";
import { useNotificationPreferences } from "@/hooks/use-settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Bell, CheckCheck, CheckCircle2, Layers, XCircle } from "lucide-react";
import { useWebPush } from "@/hooks/use-web-push";
import {
  NOTIFICATION_CATEGORIES,
  TYPE_DETAILS,
  getTypeDetail,
  type Preferences,
} from "./lib/notification-type-details";
import { BroadcastCard } from "./notification-preferences/broadcast-card";
import { DeliveryModeCard } from "./notification-preferences/delivery-mode-card";
import { WebPushCard } from "./notification-preferences/web-push-card";

export function NotificationPreferences() {
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

  const mutation = useNotificationPreferences();

  function mutatePrefs(body: Partial<Preferences>) {
    mutation.mutate(body, {
      onSuccess: () => {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      },
    });
  }

  const values: Preferences = data ?? {
    disabledTypes: ["ai", "system"],
    broadcastEnabled: false,
    broadcastRequired: false,
    allNotificationsRequired: false,
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
  const inAppEnabledCount = values.allNotificationsRequired
    ? knownTypes.length
    : knownTypes.filter((t) => !values.disabledTypes.includes(t)).length;

  // Counts for Push
  const pushEnabledCount = knownTypes.filter((t) => !values.pushDisabledTypes.includes(t)).length;

  // Toggle in-app type
  const toggleInAppType = (typeKey: string) => {
    if (values.allNotificationsRequired) return;
    const disabledTypes = values.disabledTypes.includes(typeKey)
      ? values.disabledTypes.filter((t) => t !== typeKey)
      : [...values.disabledTypes, typeKey];
    mutatePrefs({ disabledTypes });
  };

  // Bulk toggle in-app
  const enableAllInApp = () => {
    if (values.allNotificationsRequired) return;
    mutatePrefs({ disabledTypes: [] });
  };

  const disableAllInApp = () => {
    if (values.allNotificationsRequired) return;
    mutatePrefs({ disabledTypes: [...knownTypes] });
  };

  // Toggle push master switch
  const handleTogglePushMaster = async (checked: boolean) => {
    if (checked) {
      try {
        await subscribePush();
        mutatePrefs({ pushEnabled: true });
      } catch {
        // subscribePush sets error
      }
    } else {
      try {
        await unsubscribePush();
      } catch {
        // ignore
      }
      mutatePrefs({ pushEnabled: false });
    }
  };

  // Toggle push type
  const togglePushType = (typeKey: string) => {
    const pushDisabledTypes = values.pushDisabledTypes.includes(typeKey)
      ? values.pushDisabledTypes.filter((t) => t !== typeKey)
      : [...values.pushDisabledTypes, typeKey];
    mutatePrefs({ pushDisabledTypes });
  };

  // Bulk toggle push
  const enableAllPush = () => {
    mutatePrefs({ pushDisabledTypes: [] });
  };

  const disableAllPush = () => {
    mutatePrefs({ pushDisabledTypes: [...knownTypes] });
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
    mutatePrefs({ deliveryMode: mode });
  };

  const handleDigestHourChange = (hour: string) => {
    const parsed = parseInt(hour, 10);
    if (!isNaN(parsed)) {
      mutatePrefs({ digestHour: parsed });
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
              <Badge variant="outline" className="text-success gap-1 border-success/30 shrink-0 self-start sm:self-auto">
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
                    disabled={mutation.isPending || values.allNotificationsRequired || inAppEnabledCount === knownTypes.length}
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
                    disabled={mutation.isPending || values.allNotificationsRequired || inAppEnabledCount === 0}
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
                  const info = getTypeDetail(t);
                  const Icon = info.icon;
                  const isChecked = values.allNotificationsRequired || !values.disabledTypes.includes(t);
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
                        disabled={mutation.isPending || values.allNotificationsRequired}
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
                            className="ml-auto text-2xs px-1.5 py-0 font-normal shrink-0"
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
            <FeedbackBanner tone="destructive" className="text-xs mt-2">
              Lưu thay đổi thất bại. Vui lòng kiểm tra lại kết nối.
            </FeedbackBanner>
          )}
        </CardContent>
      </Card>

      {/* Team-wide broadcasts are opt-in for regular members. */}
      <BroadcastCard
        values={values}
        pending={mutation.isPending}
        onChange={(broadcastEnabled) => mutatePrefs({ broadcastEnabled })}
      />

      <DeliveryModeCard
        values={values}
        pending={mutation.isPending}
        onModeChange={handleDeliveryModeChange}
        onHourChange={handleDigestHourChange}
      />

      <WebPushCard
        values={values}
        knownTypes={knownTypes}
        pushEnabledCount={pushEnabledCount}
        pending={mutation.isPending}
        pushSupported={pushSupported}
        pushPermission={pushPermission}
        pushHookError={pushHookError}
        testSending={testSending}
        testSent={testSent}
        onTogglePushMaster={handleTogglePushMaster}
        onTogglePushType={togglePushType}
        onEnableAllPush={enableAllPush}
        onDisableAllPush={disableAllPush}
        onTestPush={handleTestPush}
      />
    </div>
  );
}
