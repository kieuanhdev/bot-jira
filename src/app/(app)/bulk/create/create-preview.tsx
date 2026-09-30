"use client";

import { useState } from "react";
import { type BulkCreatePreviewResult } from "@/lib/bulk/create-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ShieldAlert,
} from "lucide-react";

interface CreatePreviewProps {
  preview: BulkCreatePreviewResult;
  projectKey: string;
  onBack: () => void;
  onConfirm: () => void;
  isConfirming: boolean;
  confirmError?: string | null;
  onResetConfirmError?: () => void;
}

export function CreatePreview({
  preview,
  projectKey,
  onBack,
  onConfirm,
  isConfirming,
  confirmError,
  onResetConfirmError,
}: CreatePreviewProps) {
  const [filterTab, setFilterTab] = useState<"all" | "ready" | "warning" | "blocked">("all");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const readyItems = preview.items.filter((i) => i.classification === "ready");
  const blockedItems = preview.items.filter((i) => i.classification === "blocked");
  const warningItems = preview.items.filter((i) => i.warnings.length > 0);

  const displayedItems = preview.items.filter((item) => {
    if (filterTab === "ready") return item.classification === "ready";
    if (filterTab === "blocked") return item.classification === "blocked";
    if (filterTab === "warning") return item.warnings.length > 0;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="border-border/70 bg-card p-4">
          <div className="text-xs font-medium text-muted-foreground">Tổng số task</div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {preview.total}
          </div>
        </Card>

        <Card className="border-emerald-500/20 bg-emerald-500/5 p-4 dark:border-emerald-500/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Sẵn sàng tạo
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            {preview.actionable}
          </div>
        </Card>

        <Card className="border-amber-500/20 bg-amber-500/5 p-4 dark:border-amber-500/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Có cảnh báo
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-400">
            {warningItems.length}
          </div>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5 p-4 dark:border-red-500/30">
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
            <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
            Bị chặn (Lỗi)
          </div>
          <div className="mt-1 text-2xl font-bold tracking-tight text-red-700 dark:text-red-400">
            {preview.blocked}
          </div>
        </Card>
      </div>

      {/* Main Preview Table Card */}
      <Card className="border-border/80 bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">
              Chi tiết bản xem trước từng task
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Kiểm tra các trường chuẩn hoá, cảnh báo trùng lặp và lỗi trước khi xác nhận tạo trên Jira.
            </CardDescription>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterTab("all")}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                filterTab === "all" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tất cả ({preview.total})
            </button>
            <button
              type="button"
              onClick={() => setFilterTab("ready")}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                filterTab === "ready" ? "bg-card text-emerald-700 dark:text-emerald-400 shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sẵn sàng ({readyItems.length})
            </button>
            {warningItems.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("warning")}
                className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                  filterTab === "warning" ? "bg-card text-amber-700 dark:text-amber-400 shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Cảnh báo ({warningItems.length})
              </button>
            )}
            {blockedItems.length > 0 && (
              <button
                type="button"
                onClick={() => setFilterTab("blocked")}
                className={`cursor-pointer rounded-md px-2.5 py-1 font-medium transition-colors ${
                  filterTab === "blocked" ? "bg-card text-red-700 dark:text-red-400 shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Bị chặn ({blockedItems.length})
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-y border-border bg-muted/20 font-semibold text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-2.5">#</th>
                  <th className="w-28 px-3 py-2.5">Trạng thái</th>
                  <th className="min-w-[240px] px-3 py-2.5">Tiêu đề (Summary)</th>
                  <th className="w-28 px-3 py-2.5">Loại</th>
                  <th className="w-28 px-3 py-2.5">Ưu tiên</th>
                  <th className="w-32 px-3 py-2.5">Người thực hiện</th>
                  <th className="min-w-[260px] px-3 py-2.5">Chi tiết / Thông báo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {displayedItems.map((item) => {
                  const isReady = item.classification === "ready";

                  return (
                    <tr
                      key={item.rowIndex}
                      className={`transition-colors ${
                        !isReady ? "bg-red-500/5 hover:bg-red-500/10" : "hover:bg-muted/15"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {item.rowIndex + 1}
                      </td>

                      <td className="px-3 py-3">
                        {isReady ? (
                          <Badge variant="success" className="gap-1 font-medium">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            Sẵn sàng
                          </Badge>
                        ) : (
                          <Badge variant="danger" className="gap-1 font-medium">
                            <XCircle className="h-3 w-3" aria-hidden="true" />
                            Bị chặn
                          </Badge>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{item.summary || "—"}</div>
                        {item.normalizedFields.labels && item.normalizedFields.labels.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {item.normalizedFields.labels.map((l) => (
                              <Badge key={l} variant="outline" className="px-1.5 py-0 text-[10px]">
                                {l}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-muted-foreground">
                        {item.normalizedFields.issueTypeId || "—"}
                      </td>

                      <td className="px-3 py-3 text-muted-foreground">
                        {item.normalizedFields.priorityId || "Mặc định"}
                      </td>

                      <td className="px-3 py-3 text-muted-foreground">
                        {item.normalizedFields.assignee || "Chưa gán"}
                      </td>

                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          {item.errors.map((e, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                              <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                              <span>{e.message}</span>
                            </div>
                          ))}

                          {item.warnings.map((w, i) => (
                            <div key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                              <span>{w.message}</span>
                            </div>
                          ))}

                          {item.errors.length === 0 && item.warnings.length === 0 && (
                            <span className="text-muted-foreground">Hợp lệ</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {confirmError && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-xs text-red-700 dark:text-red-400">
          <div className="flex items-center justify-between font-semibold">
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              Lỗi khi xác nhận tạo task: {confirmError}
            </span>
            {onResetConfirmError && (
              <button
                type="button"
                onClick={onResetConfirmError}
                className="text-[11px] underline hover:no-underline cursor-pointer"
              >
                Đóng
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Dữ liệu xem trước vẫn được lưu giữ an toàn. Bạn có thể kiểm tra lại kết nối/token Jira rồi bấm xác nhận lại, hoặc quay lại chỉnh sửa dữ liệu.
          </p>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onBack}
          disabled={isConfirming}
          className="gap-1.5 cursor-pointer text-xs"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Chỉnh sửa lại dữ liệu
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={() => setConfirmDialogOpen(true)}
          disabled={preview.actionable === 0 || isConfirming}
          className="gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
        >
          {isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Đang xác nhận...
            </>
          ) : (
            <>
              Xác nhận tạo {preview.actionable} task
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              Xác nhận tạo task trên Jira
            </DialogTitle>
            <DialogDescription className="text-xs">
              Vui lòng xem lại thông tin tóm tắt trước khi hệ thống đưa vào hàng đợi xử lý nền.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5 text-xs">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Dự án đích:</span>
              <span className="font-semibold text-foreground">{projectKey}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Số task sẽ tạo:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {preview.actionable} task
              </span>
            </div>
            {preview.blocked > 0 && (
              <div className="flex justify-between border-b pb-2">
                <span className="text-muted-foreground">Số task bị chặn (bỏ qua):</span>
                <span className="font-semibold text-red-600 dark:text-red-400">
                  {preview.blocked} task
                </span>
              </div>
            )}
            <div className="pt-1 text-[11px] text-muted-foreground leading-relaxed">
              ⚠️ <strong>Lưu ý:</strong> Task được tạo trực tiếp trên Jira dưới danh nghĩa tài khoản cá nhân của bạn. Không có tính năng tự động xoá/rollback sau khi task đã tạo thành công.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDialogOpen(false)}
              className="cursor-pointer text-xs"
            >
              Huỷ bỏ
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirmDialogOpen(false);
                onConfirm();
              }}
              className="cursor-pointer gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
            >
              Tôi đồng ý, tạo ngay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
