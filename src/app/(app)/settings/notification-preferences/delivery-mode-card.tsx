"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock3 } from "lucide-react";
import { HOURS, type Preferences } from "../lib/notification-type-details";

interface DeliveryModeCardProps {
  values: Preferences;
  pending: boolean;
  onModeChange: (mode: "instant" | "digest") => void;
  onHourChange: (hour: string) => void;
}

export function DeliveryModeCard({ values, pending, onModeChange, onHourChange }: DeliveryModeCardProps) {
  return (
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
            onChange={() => onModeChange("instant")}
            disabled={pending}
          />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Gửi tức thì (Mặc định)</span>
              <Badge variant="outline" className="text-2xs text-primary border-primary/30">Khuyên dùng</Badge>
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
            onChange={() => onModeChange("digest")}
            disabled={pending}
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
                  onValueChange={onHourChange}
                  disabled={pending}
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
  );
}
