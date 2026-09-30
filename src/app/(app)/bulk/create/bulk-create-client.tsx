"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreatePreviewResult,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { CreateDefaultsForm } from "./create-defaults-form";
import { CreateTaskGrid } from "./create-task-grid";
import { CreatePreview } from "./create-preview";
import { CreateProgress } from "./create-progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlusCircle,
  CheckCheck,
  RotateCcw,
  FolderKanban,
  AlertCircle,
  ArrowRight,
  ListPlus,
  Edit3,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "input" | "preview" | "progress";

export function BulkCreateClient() {
  const [userSelectedProject, setUserSelectedProject] = useState<string>("");
  const [step, setStep] = useState<Step>("input");
  const [defaults, setDefaults] = useState<BulkCreateFieldDefaults>({});
  const [items, setItems] = useState<BulkCreateRowInput[]>([
    { clientRef: "row-1", summary: "" },
    { clientRef: "row-2", summary: "" },
    { clientRef: "row-3", summary: "" },
  ]);
  const [source, setSource] = useState<{ type: "grid" | "paste" | "csv"; fileName?: string | null }>({
    type: "grid",
  });
  const [previewData, setPreviewData] = useState<BulkCreatePreviewResult | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);

  // Project change confirmation state
  const [pendingProjectKey, setPendingProjectKey] = useState<string | null>(null);
  const [confirmProjectDialogOpen, setConfirmProjectDialogOpen] = useState(false);

  // Query user available projects
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: Array<{ key: string; openCount?: number }> }>("/api/projects"),
    staleTime: 5 * 60 * 1000,
  });

  const availableProjects = useMemo(() => {
    const list = (projectsData?.items ?? []).map((p) => p.key);
    return list.length > 0 ? list : ["EPM", "CICM", "MR", "EDM", "EMA", "ETM", "MHRM", "ECM"];
  }, [projectsData?.items]);

  // Derive projectKey: use userSelectedProject if explicitly set, else fall back to first available project
  const projectKey = userSelectedProject || availableProjects[0] || "";

  // Query metadata for selected project
  const {
    data: metadata,
    isLoading: metadataLoading,
    error: metadataError,
    refetch: refetchMetadata,
  } = useQuery({
    queryKey: ["bulk-create-metadata", projectKey],
    queryFn: () => api<BulkCreateProjectMetadata>(`/api/bulk/create/metadata?project=${projectKey}`),
    enabled: Boolean(projectKey),
    staleTime: 5 * 60 * 1000,
  });

  // Preview mutation: pass object directly without double JSON.stringify
  const previewMutation = useMutation({
    mutationFn: () =>
      api<BulkCreatePreviewResult>("/api/bulk/create", {
        method: "POST",
        body: {
          projectKey,
          defaults,
          items: items.filter((i) => i.summary.trim().length > 0),
          metadataFingerprint: metadata?.fingerprint,
          source,
        },
      }),
    onSuccess: (data) => {
      setPreviewData(data);
      setStep("preview");
    },
  });

  // Confirm mutation: pass object directly without double JSON.stringify
  const confirmMutation = useMutation({
    mutationFn: () =>
      api<{ operationId: string; queued: boolean }>("/api/bulk/create", {
        method: "POST",
        body: {
          confirm: true,
          operationId: previewData?.operationId,
        },
      }),
    onSuccess: (data) => {
      setActiveOperationId(data.operationId);
      setStep("progress");
    },
  });

  const filledCount = items.filter((i) => i.summary.trim().length > 0).length;

  function handleResetAll() {
    setStep("input");
    setPreviewData(null);
    setActiveOperationId(null);
    setItems([
      { clientRef: "row-1", summary: "" },
      { clientRef: "row-2", summary: "" },
      { clientRef: "row-3", summary: "" },
    ]);
    setDefaults({});
  }

  function handleProjectSelect(newKey: string) {
    if (newKey === projectKey) return;
    const hasData =
      items.some((i) => Boolean(i.summary.trim())) || Object.keys(defaults).length > 0;
    if (hasData) {
      setPendingProjectKey(newKey);
      setConfirmProjectDialogOpen(true);
    } else {
      setUserSelectedProject(newKey);
    }
  }

  function applyProjectChange(newKey: string) {
    setUserSelectedProject(newKey);
    setDefaults({});
    // Preserve general text content, reset project-specific options
    setItems((prev) =>
      prev.map((item) => ({
        clientRef: item.clientRef,
        summary: item.summary,
        description: item.description,
        assignee: item.assignee,
        originalEstimate: item.originalEstimate,
        dueDate: item.dueDate,
        points: item.points,
        labels: item.labels,
        issueTypeId: undefined,
        priorityId: undefined,
        fixVersionIds: undefined,
      }))
    );
    setPreviewData(null);
    setActiveOperationId(null);
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Top Navigation Switcher */}
      <div className="flex border-b border-border">
        <Link
          href="/bulk"
          className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          Cập nhật task hàng loạt
        </Link>
        <Link
          href="/bulk/create"
          className="flex items-center gap-2 border-b-2 border-primary px-4 py-2.5 text-xs font-semibold text-primary cursor-pointer transition-colors"
        >
          <ListPlus className="h-4 w-4" aria-hidden="true" />
          Tạo task mới hàng loạt
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PlusCircle className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider">Jira Data Center</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tạo task hàng loạt theo dự án
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground leading-relaxed">
            Chọn dự án, nhập danh sách công việc qua bảng hoặc copy-paste từ Excel/CSV, xem trước chuẩn hoá và tạo task an toàn trên nền background.
          </p>
        </div>

        {projectKey && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
              Dự án: {projectKey}
            </Badge>
            <Badge variant={filledCount > 0 ? "info" : "secondary"} className="px-3 py-1 text-xs">
              {filledCount} task đã sẵn sàng
            </Badge>
          </div>
        )}
      </header>

      {/* Progress Steps Header */}
      <ol
        aria-label="Tiến trình tạo task hàng loạt"
        className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card shadow-xs"
      >
        {[
          { number: 1, label: "Nhập dữ liệu & Mặc định", active: step === "input", done: step !== "input" },
          { number: 2, label: "Xem trước & Xác nhận", active: step === "preview", done: step === "progress" },
          { number: 3, label: "Tiến độ & Kết quả", active: step === "progress", done: false },
        ].map((s) => (
          <li
            key={s.number}
            className={cn(
              "flex min-w-0 items-center gap-2 border-r border-border px-3 py-3 text-xs last:border-r-0 sm:px-4 sm:text-sm",
              s.active && "bg-primary/5 text-foreground font-semibold",
              !s.active && !s.done && "text-muted-foreground",
              s.done && "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                s.done
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : s.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted"
              )}
            >
              {s.done ? <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> : s.number}
            </span>
            <span className="truncate">{s.label}</span>
          </li>
        ))}
      </ol>

      {/* Step 1: Input & Defaults */}
      {step === "input" && (
        <div className="space-y-6">
          {/* Project Selector Card */}
          <Card className="border-border/80 bg-card p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <FolderKanban className="h-4 w-4" aria-hidden="true" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Chọn dự án Jira</div>
                  <div className="text-xs text-muted-foreground">
                    Metadata trường và quyền tạo task sẽ được tải theo dự án đã chọn.
                  </div>
                </div>
              </div>

              <div className="w-full sm:w-64">
                <Select value={projectKey} onValueChange={handleProjectSelect}>
                  <SelectTrigger className="h-9 text-xs cursor-pointer">
                    <SelectValue placeholder="Chọn một dự án..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs cursor-pointer">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Empty State when no project is selected */}
          {!projectKey && (
            <Card className="border-dashed border-border p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Chưa chọn dự án Jira
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vui lòng chọn một dự án ở trên để tải loại issue, phiên bản và nhập danh sách task.
              </p>
            </Card>
          )}

          {/* Loading Metadata Skeleton */}
          {metadataLoading && (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          )}

          {/* Error State */}
          {metadataError && !metadataLoading && (
            <Card className="border-red-500/30 bg-red-500/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Không thể tải thông tin dự án {projectKey}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {metadataError instanceof Error ? metadataError.message : "Đã xảy ra lỗi khi kết nối tới Jira. Vui lòng kiểm tra lại token cá nhân trong Cài đặt."}
              </p>
              <div className="mt-4 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchMetadata()}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Thử lại
                </Button>
              </div>
            </Card>
          )}

          {/* Permission Error State */}
          {metadata && !metadata.canCreate && (
            <Card className="border-red-500/30 bg-red-500/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Không thể tạo task trong dự án {projectKey}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {metadata.permissionReason || "Tài khoản của bạn không có quyền CREATE_ISSUES trên dự án này."}
              </p>
            </Card>
          )}

          {/* Main Form and Grid when metadata is loaded and canCreate is true */}
          {metadata && metadata.canCreate && (
            <div className="space-y-6">
              {/* Shared Defaults Form */}
              <CreateDefaultsForm
                metadata={metadata}
                defaults={defaults}
                onChange={setDefaults}
              />

              {/* Editable Task Grid */}
              <CreateTaskGrid
                metadata={metadata}
                defaults={defaults}
                items={items}
                onChange={setItems}
                onSourceChange={setSource}
              />

              {/* Bottom Action Footer */}
              <div className="flex items-center justify-between border-t border-border pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetAll}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Xoá làm lại từ đầu
                </Button>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => previewMutation.mutate()}
                  disabled={filledCount === 0 || previewMutation.isPending}
                  className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold cursor-pointer"
                >
                  {previewMutation.isPending ? (
                    "Đang kiểm tra dữ liệu..."
                  ) : (
                    <>
                      Kiểm tra & Xem trước {filledCount} task
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>

              {previewMutation.isError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">
                  Lỗi kiểm tra xem trước: {previewMutation.error.message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Preview & Confirm */}
      {step === "preview" && previewData && (
        <CreatePreview
          preview={previewData}
          projectKey={projectKey}
          onBack={() => setStep("input")}
          onConfirm={() => confirmMutation.mutate()}
          isConfirming={confirmMutation.isPending}
          confirmError={confirmMutation.isError ? confirmMutation.error.message : null}
          onResetConfirmError={() => confirmMutation.reset()}
        />
      )}

      {/* Step 3: Progress & Results */}
      {step === "progress" && activeOperationId && (
        <CreateProgress
          operationId={activeOperationId}
          onReset={handleResetAll}
        />
      )}

      {/* Project Change Confirmation Dialog */}
      <Dialog open={confirmProjectDialogOpen} onOpenChange={setConfirmProjectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              Xác nhận thay đổi dự án Jira
            </DialogTitle>
            <DialogDescription className="text-xs">
              Bảng hiện tại đang có dữ liệu task hoặc cài đặt mặc định.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
            Dự án sẽ chuyển sang <strong>{pendingProjectKey}</strong>. Các giá trị phụ thuộc vào dự án cũ (Loại task, Mức ưu tiên, Phiên bản) và các giá trị mặc định sẽ được đặt lại. Tiêu đề và mô tả công việc sẽ được giữ nguyên.
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingProjectKey(null);
                setConfirmProjectDialogOpen(false);
              }}
              className="cursor-pointer text-xs"
            >
              Huỷ bỏ
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                if (pendingProjectKey) {
                  applyProjectChange(pendingProjectKey);
                }
                setPendingProjectKey(null);
                setConfirmProjectDialogOpen(false);
              }}
              className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
            >
              Đồng ý chuyển dự án
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
