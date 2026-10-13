"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldAlert } from "lucide-react";
import type { Preferences } from "../lib/notification-type-details";

interface BroadcastCardProps {
  values: Preferences;
  pending: boolean;
  onChange: (enabled: boolean) => void;
}

export function BroadcastCard({ values, pending, onChange }: BroadcastCardProps) {
  return (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-base">
        <ShieldAlert className="h-4 w-4 text-primary" aria-hidden="true" />
        Thông báo chung toàn đội
      </CardTitle>
      <CardDescription>
        Nhận các thông báo phát cho toàn hệ thống như release, CI, Sentry và tình trạng dịch vụ.
        Thông báo liên quan trực tiếp đến bạn vẫn được giữ ngay cả khi mục này tắt.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <label className="flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4 cursor-pointer transition-colors duration-150 hover:bg-muted/30">
        <div className="space-y-1">
          <span className="text-sm font-semibold text-foreground block">
            Cho phép thông báo broadcast
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Mặc định chỉ quản trị viên nhận broadcast; các vai trò khác có thể tự bật khi cần.
            {values.broadcastRequired
              ? " Quản trị viên luôn nhận toàn bộ thông báo hệ thống."
              : " Bạn có thể bật khi muốn theo dõi hoạt động chung của toàn đội."}
          </p>
        </div>
        <Checkbox
          checked={values.broadcastRequired || values.broadcastEnabled}
          onCheckedChange={(checked) => onChange(Boolean(checked))}
          disabled={pending || values.broadcastRequired}
          className="h-5 w-5 shrink-0 cursor-pointer"
          aria-label="Cho phép thông báo chung toàn đội"
        />
      </label>
    </CardContent>
  </Card>
  );
}
