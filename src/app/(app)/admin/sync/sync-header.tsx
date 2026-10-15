"use client";

import { FolderSync, PauseCircle, Play, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

export interface SyncHeaderProps {
  generatedAt?: string;
  disabledCount: number;
  enabledCount: number;
  anyBusy: boolean;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onSyncAll: () => void;
}

export function SyncHeader({
  generatedAt,
  disabledCount,
  enabledCount,
  anyBusy,
  onEnableAll,
  onDisableAll,
  onSyncAll,
}: SyncHeaderProps) {
  return (
    <PageHeader
      icon={FolderSync}
      title="Đồng bộ dự án"
      meta={generatedAt ? `• cập nhật ${timeAgo(generatedAt)}` : undefined}
      description="Bật hoặc tắt đồng bộ Jira cho từng dự án và tuỳ chỉnh các hạng mục đồng bộ chi tiết. Dự án đã tắt sẽ không được đồng bộ dưới bất kỳ hình thức nào."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={anyBusy || disabledCount === 0}
            onClick={onEnableAll}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Bật tất cả
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={anyBusy || enabledCount === 0}
            onClick={onDisableAll}
          >
            <PauseCircle className="h-4 w-4" aria-hidden="true" />
            Tắt tất cả
          </Button>
          <Button
            size="sm"
            className="cursor-pointer gap-1.5"
            disabled={anyBusy || enabledCount === 0}
            onClick={onSyncAll}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Đồng bộ tất cả
          </Button>
        </>
      }
    />
  );
}
