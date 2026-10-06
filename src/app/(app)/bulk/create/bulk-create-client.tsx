"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreatePreviewResult,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { BulkCreateEditorShell } from "./bulk-create-editor-shell";
import { getStoredEditorMode, setStoredEditorMode } from "./lib/editor-preferences";
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
  ListPlus,
  Edit3,
  AlertTriangle,
  Maximize2,
  Sparkles,
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
  const [source, setSource] = useState<{ type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null }>({
    type: "grid",
  });
  const [previewData, setPreviewData] = useState<BulkCreatePreviewResult | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(() => getStoredEditorMode() === "fullscreen");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSavedTime, setDraftSavedTime] = useState<number | null>(null);
  const draftRestoredRef = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleToggleFullscreen() {
    const next = !isEditorFullscreen;
    setIsEditorFullscreen(next);
    setStoredEditorMode(next ? "fullscreen" : "standard");
  }

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

  const draftKey = `bulk-create-draft:${projectKey}`;

  const saveDraft = useCallback((itemsToSave: BulkCreateRowInput[], defaultsToSave: BulkCreateFieldDefaults) => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    setIsSavingDraft(true);
    draftSaveTimer.current = setTimeout(() => {
      try {
        const hasContent = itemsToSave.some((i) => i.summary.trim()) || Object.keys(defaultsToSave).length > 0;
        if (hasContent) {
          const now = Date.now();
          localStorage.setItem(draftKey, JSON.stringify({ items: itemsToSave, defaults: defaultsToSave, savedAt: now }));
          setDraftSavedTime(now);
        } else {
          localStorage.removeItem(draftKey);
          setDraftSavedTime(null);
        }
      } catch { /* quota exceeded or unavailable */ }
      finally {
        setIsSavingDraft(false);
      }
    }, 1000);
  }, [draftKey]);

  // Restore draft on project change
  useEffect(() => {
    if (!projectKey || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const hasContent = parsed.items.some((i: { summary?: string }) => i.summary?.trim());
          if (hasContent) {
            queueMicrotask(() => setDraftAvailable(true));
            return;
          }
        }
      }
    } catch { /* ignore */ }
  }, [projectKey, draftKey]);

  // Auto-save draft on items/defaults change
  useEffect(() => {
    if (step !== "input") return;
    if (draftRestoredRef.current) {
      saveDraft(items, defaults);
    }
  }, [items, defaults, step, saveDraft]);

  function handleRestoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(parsed.items);
          if (parsed.defaults) setDefaults(parsed.defaults);
        }
      }
    } catch { /* ignore */ }
    setDraftAvailable(false);
    draftRestoredRef.current = true;
  }

  function handleDiscardDraft() {
    localStorage.removeItem(draftKey);
    setDraftAvailable(false);
    draftRestoredRef.current = true;
  }

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
    mutationFn: (overrideItems?: BulkCreateRowInput[]) =>
      api<BulkCreatePreviewResult>("/api/bulk/create", {
        method: "POST",
        body: {
          projectKey,
          defaults,
          items: (overrideItems || items).filter((i) => i.summary.trim().length > 0),
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
      localStorage.removeItem(draftKey);
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

  function handleDiscardBlockedRows() {
    if (!previewData) return;
    const blockedIndices = new Set(
      previewData.items.filter((i) => i.classification === "blocked").map((i) => i.rowIndex)
    );
    if (blockedIndices.size === 0) return;

    const remaining = items.filter((_, idx) => !blockedIndices.has(idx));
    if (remaining.length === 0) {
      setItems([
        { clientRef: "row-1", summary: "" },
        { clientRef: "row-2", summary: "" },
        { clientRef: "row-3", summary: "" },
      ]);
      setPreviewData(null);
      setStep("input");
      return;
    }

    setItems(remaining);
    previewMutation.mutate(remaining);
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
      draftRestoredRef.current = false;
      setDraftAvailable(false);
    }
  }

  function applyProjectChange(newKey: string) {
    setUserSelectedProject(newKey);
    setDefaults({});
    setDraftAvailable(false);
    draftRestoredRef.current = false;
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

  const stepsConfig = [
    {
      number: 1,
      title: "Nhập dữ liệu & Mặc định",
      desc: filledCount > 0 ? `${filledCount} task đã sẵn sàng` : "Nhập hoặc dán từ bảng tính",
      active: step === "input",
      done: step !== "input",
      clickable: step === "preview",
      onClick: () => {
        if (step === "preview") setStep("input");
      },
    },
    {
      number: 2,
      title: "Xem trước & Xác nhận",
      desc: previewData ? `${previewData.actionable} task sẵn sàng tạo` : "Kiểm tra chuẩn hoá",
      active: step === "preview",
      done: step === "progress",
      clickable: step === "input" && Boolean(previewData),
      onClick: () => {
        if (step === "input" && previewData) setStep("preview");
      },
    },
    {
      number: 3,
      title: "Tiến độ & Kết quả",
      desc: activeOperationId ? "Hàng đợi nền Jira" : "Tạo tự động trên Jira",
      active: step === "progress",
      done: false,
      clickable: false,
      onClick: undefined,
    },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Top Segmented Navigation Switcher */}
      <nav aria-label="Điều hướng tác vụ hàng loạt" className="flex items-center">
        <div className="inline-flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border/80 shadow-2xs">
          <Link
            href="/bulk"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-background/50 cursor-pointer transition-all duration-150"
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cập nhật task hàng loạt</span>
          </Link>
          <Link
            href="/bulk/create"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-primary bg-background shadow-xs cursor-pointer transition-all duration-150 border border-border/50"
          >
            <ListPlus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span>Tạo task mới hàng loạt</span>
            <span className="ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-primary/10 text-primary font-mono font-medium">
              DC REST v2
            </span>
          </Link>
        </div>
      </nav>

      {/* Header Hero */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border/80 bg-card/60 p-4 sm:p-5 backdrop-blur-xs shadow-xs">
        <div>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">Jira Data Center • Batch Operations</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Tạo task hàng loạt theo dự án
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground leading-relaxed">
            Soạn thảo danh sách công việc, copy-paste từ Excel/Google Sheets hoặc nhập file CSV. Hệ thống kiểm tra hợp lệ thời gian thực và tạo task an toàn qua hàng đợi background.
          </p>
        </div>

        {/* Project Selector & Actions in Header */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start sm:self-center">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 shadow-2xs">
            <FolderKanban className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
            <span className="text-xs text-muted-foreground font-medium">Dự án:</span>
            <div className="w-28 sm:w-32">
              <Select value={projectKey} onValueChange={handleProjectSelect}>
                <SelectTrigger className="h-7 border-0 p-0 text-xs font-bold text-foreground focus:ring-0 cursor-pointer shadow-none">
                  <SelectValue placeholder="Chọn dự án" />
                </SelectTrigger>
                <SelectContent>
                  {availableProjects.map((p) => (
                    <SelectItem key={p} value={p} className="text-xs cursor-pointer font-medium">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Badge variant={filledCount > 0 ? "info" : "secondary"} className="h-8 px-2.5 text-xs font-medium">
            {filledCount} task sẵn sàng
          </Badge>

          {step === "input" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleFullscreen}
              className="h-8 gap-1.5 text-xs font-medium cursor-pointer border-border hover:bg-muted text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Toàn màn hình</span>
            </Button>
          )}
        </div>
      </header>

      {/* Interactive Progress Steps */}
      <ol
        aria-label="Tiến trình tạo task hàng loạt"
        className="grid grid-cols-1 sm:grid-cols-3 overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs select-none divide-y sm:divide-y-0 sm:divide-x divide-border/60"
      >
        {stepsConfig.map((s) => {
          const Tag = s.clickable ? "button" : "div";
          return (
            <li key={s.number}>
              <Tag
                type={s.clickable ? "button" : undefined}
                onClick={s.onClick}
                disabled={!s.clickable}
                className={cn(
                  "w-full text-left flex items-center gap-3 px-4 py-3.5 transition-colors",
                  s.active && "bg-primary/5 text-foreground font-medium",
                  !s.active && !s.done && "text-muted-foreground",
                  s.done && "text-foreground",
                  s.clickable && "cursor-pointer hover:bg-muted/40"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-transform duration-150",
                    s.done
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : s.active
                        ? "border-primary bg-primary text-primary-foreground shadow-xs scale-105"
                        : "border-border bg-muted/60 text-muted-foreground"
                  )}
                >
                  {s.done ? <CheckCheck className="h-4 w-4" aria-hidden="true" /> : s.number}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs sm:text-sm font-semibold">{s.title}</span>
                    {s.clickable && (
                      <span className="text-[10px] text-primary underline">Quay lại</span>
                    )}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">{s.desc}</div>
                </div>
              </Tag>
            </li>
          );
        })}
      </ol>

      {/* Step 1: Input & Defaults */}
      {step === "input" && (
        <div className="space-y-4">
          {/* Empty State when no project is selected */}
          {!projectKey && (
            <Card className="border-dashed border-border p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FolderKanban className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Chưa chọn dự án Jira
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Vui lòng chọn một dự án ở thanh tiêu đề trên để tải loại issue, phiên bản và nhập danh sách task.
              </p>
            </Card>
          )}

          {/* Loading Metadata Skeleton */}
          {metadataLoading && (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-80 w-full rounded-lg" />
            </div>
          )}

          {/* Error State */}
          {metadataError && !metadataLoading && (
            <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Không thể tải thông tin dự án {projectKey}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
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
            <Card className="border-destructive/30 bg-destructive/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Không thể tạo task trong dự án {projectKey}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                {metadata.permissionReason || "Tài khoản Jira của bạn không có quyền CREATE_ISSUES trên dự án này."}
              </p>
            </Card>
          )}

          {/* Main Workspace when metadata is loaded and canCreate is true */}
          {metadata && metadata.canCreate && (
            <div className="space-y-4">
              {/* Draft Restore Banner */}
              {draftAvailable && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-2xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2.5 text-xs">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">
                        Tìm thấy bản nháp chưa hoàn tất cho dự án {projectKey}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        Bạn có muốn khôi phục lại danh sách task và cài đặt mặc định đã soạn thảo từ phiên trước?
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleRestoreDraft}
                      className="h-7.5 px-3 text-xs font-semibold cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-2xs"
                    >
                      Khôi phục bản nháp
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleDiscardDraft}
                      className="h-7.5 px-2.5 text-xs cursor-pointer text-muted-foreground hover:text-destructive"
                    >
                      Bỏ qua
                    </Button>
                  </div>
                </div>
              )}

              {/* Fullscreen / Inline Editor Shell */}
              <BulkCreateEditorShell
                metadata={metadata}
                projectKey={projectKey}
                availableProjects={availableProjects}
                onSelectProject={handleProjectSelect}
                defaults={defaults}
                onDefaultsChange={setDefaults}
                items={items}
                onItemsChange={setItems}
                onSourceChange={setSource}
                isFullscreen={isEditorFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
                onPreview={() => previewMutation.mutate()}
                isPreviewPending={previewMutation.isPending}
                isSavingDraft={isSavingDraft}
                draftSavedTime={draftSavedTime}
                focusRow={focusRow}
                focusField={focusField}
                onClearFocusRow={() => {
                  setFocusRow(null);
                  setFocusField(null);
                }}
              />

              {previewMutation.isError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Lỗi kiểm tra xem trước: {previewMutation.error.message}</span>
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
          onFixRow={(rowIndex, field) => {
            setFocusRow(rowIndex);
            setFocusField(field || null);
            setIsEditorFullscreen(true);
            setStep("input");
          }}
          onDiscardBlockedRows={handleDiscardBlockedRows}
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
              Bảng soạn thảo hiện tại đang có dữ liệu task hoặc cài đặt mặc định.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
            Dự án sẽ chuyển sang <strong>{pendingProjectKey}</strong>. Các giá trị phụ thuộc vào dự án cũ (Loại task, Mức ưu tiên, Phiên bản) và các giá trị mặc định sẽ được đặt lại để tương thích. Tiêu đề và mô tả công việc sẽ được giữ nguyên an toàn.
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
