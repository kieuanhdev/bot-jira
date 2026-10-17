"use client";

import { CornerDownLeft, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickPanelFooterProps {
  watched: boolean;
  onToggleWatch: () => void;
  jiraUrl: string | null;
  onOpenFull: () => void;
}

export function QuickPanelFooter({
  watched,
  onToggleWatch,
  jiraUrl,
  onOpenFull,
}: QuickPanelFooterProps) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t px-4 py-3">
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleWatch}
        className="cursor-pointer gap-1.5"
        title={watched ? "Bỏ theo dõi task này" : "Theo dõi task này"}
      >
        {watched ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
        {watched ? "Watching" : "Watch"}
      </Button>

      {jiraUrl && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(jiraUrl, "_blank", "noopener");
          }}
          className="cursor-pointer gap-1.5 text-xs"
          title="Mở xem trên Jira"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" /> Xem trên Jira
        </Button>
      )}

      <Button
        size="sm"
        className="ml-auto cursor-pointer gap-1.5"
        onClick={onOpenFull}
        title="Mở trang chi tiết"
      >
        <CornerDownLeft className="h-4 w-4" aria-hidden="true" /> Full detail
      </Button>
    </div>
  );
}
