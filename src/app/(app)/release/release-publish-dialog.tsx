"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Rocket,
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
  CheckSquare,
  Loader2,
  ExternalLink,
} from "lucide-react";
import type { ReleaseBlocker } from "@/lib/releases/release-readiness";

interface ReleasePublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  releaseId: string;
  version: string;
  projectKey: string;
  taskCount: number;
  doneCount: number;
  gitCompleteCount: number;
  deliveryReadyCount: number;
  releaseDate?: string | null;
  onSuccess: () => void;
}

export function ReleasePublishDialog({
  open,
  onOpenChange,
  releaseId,
  version,
  projectKey,
  taskCount,
  doneCount,
  gitCompleteCount,
  deliveryReadyCount,
  releaseDate,
  onSuccess,
}: ReleasePublishDialogProps) {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<ReleaseBlocker[]>([]);

  const handlePublish = async () => {
    setLoading(true);
    setErrorMsg(null);
    setBlockers([]);

    try {
      const res = await fetch(`/api/releases/${releaseId}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.status === 409) {
        setErrorMsg(
          data.error === "EMPTY_RELEASE"
            ? "Phiên bản chưa có task nào được gán trên Jira."
            : "Chưa thể phát hành do còn task chưa hoàn thành hoặc chưa merge."
        );
        setBlockers(data.blockers || []);
        return;
      }

      if (res.status === 428) {
        setErrorMsg(data.error || "Bạn cần cấu hình token Jira cá nhân trong Cài đặt.");
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.detail || data.error || "Không thể phát hành bản này trên Jira.");
        return;
      }

      // Success
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setErrorMsg((err as Error).message || "Lỗi mạng khi phát hành");
    } finally {
      setLoading(false);
    }
  };

  const isReady = taskCount > 0 && deliveryReadyCount === taskCount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Rocket className="h-5 w-5 text-teal-500" aria-hidden="true" />
            Phát hành Fix Version trên Jira
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Xác nhận phát hành phiên bản <span className="font-semibold text-foreground">{version}</span> thuộc dự án{" "}
            <span className="font-semibold text-foreground">{projectKey}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg bg-muted/40 border border-border">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Tổng số task</div>
              <div className="text-lg font-bold text-foreground mt-0.5">{taskCount}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Jira Done</div>
              <div className="text-lg font-bold text-emerald-500 mt-0.5">
                {doneCount} / {taskCount}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Git Merged</div>
              <div className="text-lg font-bold text-teal-500 mt-0.5">
                {gitCompleteCount} / {taskCount}
              </div>
            </div>
          </div>

          {releaseDate && (
            <div className="text-xs text-muted-foreground">
              Ngày phát hành dự kiến: <span className="text-foreground font-medium">{new Date(releaseDate).toLocaleDateString("vi-VN")}</span>
            </div>
          )}

          {/* Important notice */}
          <div className="rounded-lg border border-border p-3 bg-card text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">ℹ️ Lưu ý quan trọng:</p>
            <p>
              Thao tác này chỉ đánh dấu Fix Version là <span className="text-foreground font-medium">&quot;Released&quot;</span> trên Jira. Hệ thống <span className="text-foreground font-medium">không tự động deploy</span> mã nguồn phần mềm.
            </p>
          </div>

          {/* Error / Blockers alert */}
          {errorMsg && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-2">
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>

              {blockers.length > 0 && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto pl-5">
                  {blockers.map((b, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-1 text-[11px]">
                      <span className="font-mono font-semibold text-foreground">{b.jiraKey}:</span>
                      <span>{b.summary}</span>
                      <Badge variant="outline" className="text-[10px] py-0 h-4 border-destructive/30">
                        {b.code}
                      </Badge>
                      {b.prUrl && (
                        <a
                          href={b.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-primary inline-flex items-center gap-0.5"
                        >
                          PR <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handlePublish}
            disabled={loading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Đang xử lý...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" aria-hidden="true" />
                Xác nhận phát hành
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
