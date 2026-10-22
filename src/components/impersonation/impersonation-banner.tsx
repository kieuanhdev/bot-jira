"use client";

import { useState } from "react";
import { AlertTriangle, LogOut, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImpersonationBannerProps {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    jiraUsername?: string | null;
    role?: string;
  };
  impersonator: {
    id: string;
    name?: string | null;
    email?: string | null;
    role: string;
  };
  onOpenSwitcher?: () => void;
}

export function ImpersonationBanner({
  user,
  impersonator,
  onOpenSwitcher,
}: ImpersonationBannerProps) {
  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    try {
      setStopping(true);
      const res = await fetch("/api/admin/impersonate/stop", {
        method: "POST",
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setStopping(false);
      }
    } catch {
      setStopping(false);
    }
  };

  const displayName = user.name || user.jiraUsername || user.email || "Thành viên";
  const userIdentifier = user.jiraUsername
    ? `@${user.jiraUsername}`
    : user.email || "";

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 w-full bg-warning/15 border-b border-warning/30 text-foreground px-4 py-2 text-xs sm:text-sm backdrop-blur-sm transition-all"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle
            className="h-4 w-4 shrink-0 text-warning"
            aria-hidden="true"
          />
          <div className="truncate">
            <span>Bạn đang xem hệ thống với tư cách </span>
            <strong className="font-semibold text-foreground">
              {displayName}
            </strong>
            {userIdentifier && (
              <span className="text-muted-foreground ml-1">
                ({userIdentifier})
              </span>
            )}
            <span className="text-muted-foreground text-xs hidden md:inline ml-2">
              · Phiên Admin gốc: {impersonator.name || "Admin"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenSwitcher && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenSwitcher}
              className="h-7 text-xs border-warning/30 bg-card hover:bg-accent text-foreground cursor-pointer px-2.5 transition-colors"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Đổi người khác
            </Button>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={handleStop}
            disabled={stopping}
            className="h-7 text-xs bg-warning text-warning-foreground hover:bg-warning/90 font-medium cursor-pointer px-3 shadow-xs transition-colors"
          >
            <LogOut className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            {stopping ? "Đang trở lại..." : "Quay lại Admin"}
          </Button>
        </div>
      </div>
    </div>
  );
}
