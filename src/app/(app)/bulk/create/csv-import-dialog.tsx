"use client";

import { useState, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { parseBulkCreateCsv, type ParsedCsvResult } from "@/lib/bulk/csv-parser";
import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import {
  Upload,

  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Download,
  Info,
  HelpCircle,
  XCircle,
  Loader2,
} from "lucide-react";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (
    items: BulkCreateRowInput[],
    source: { type: "csv" | "paste" | "excel"; fileName?: string | null },
    mode: "replace" | "append"
  ) => void;
  existingFilledCount: number;
  projectKey?: string;
  metadata?: BulkCreateProjectMetadata;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_EXTENSIONS = [".xlsx", ".csv", ".tsv", ".txt"];

interface ExcelImportResponse {
  items: BulkCreateRowInput[];
  manifest?: {
    schemaVersion: number;
    projectKey: string;
    projectName?: string;
    generatedAt: string;
    metadataFingerprint: string;
    maxItems: number;
  } | null;
  isStaleMetadata?: boolean;
  projectKeyMatch?: boolean;
  fileProjectKey?: string;
  stats?: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    skippedEmptyCount: number;
    overflowCount: number;
  };
  errors?: Array<{ row: number; col?: string; message: string }>;
  warnings?: string[];
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  existingFilledCount,
  projectKey,
  metadata,
}: CsvImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste" | "guide">("file");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsvResult | null>(null);
  const [excelResult, setExcelResult] = useState<ExcelImportResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [importMode, setImportMode] = useState<"replace" | "append">(
    existingFilledCount > 0 ? "append" : "replace"
  );
  const [confirmTruncation, setConfirmTruncation] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingCapacity =
    importMode === "replace"
      ? MAX_BULK_CREATE_ITEMS
      : Math.max(0, MAX_BULK_CREATE_ITEMS - existingFilledCount);

  async function processFile(file: File) {
    setFileError(null);
    setFileName(file.name);
    setParsed(null);
    setExcelResult(null);

    // 1. File size check (5 MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
      setFileError(`Tệp "${file.name}" (${sizeMb} MB) vượt quá dung lượng tối đa cho phép là 5 MB.`);
      return;
    }

    // 2. Extension check
    const dotIdx = file.name.lastIndexOf(".");
    const ext = dotIdx >= 0 ? file.name.slice(dotIdx).toLowerCase() : "";
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(
        `Định dạng tệp "${ext || "không xác định"}" không được hỗ trợ. Vui lòng chọn tệp .xlsx, .csv, .tsv hoặc .txt.`
      );
      return;
    }

    // 3. Handle Excel file (.xlsx) via backend API
    if (ext === ".xlsx") {
      setIsProcessing(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (projectKey) {
          formData.append("project", projectKey);
        }

        const res = await fetch("/api/bulk/create/excel-import", {
          method: "POST",
          body: formData,
        });

        const data: ExcelImportResponse & { error?: string } = await res.json();
        if (!res.ok) {
          setFileError(data.error || `Lỗi khi xử lý file Excel (${res.status})`);
          return;
        }

        setExcelResult(data);
      } catch (err) {
        setFileError(`Không thể tải và đọc file Excel: ${(err as Error).message}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // 4. Handle text/csv file with FileReader
    const reader = new FileReader();
    reader.onerror = () => {
      setFileError("Đã xảy ra lỗi khi đọc nội dung tệp. Vui lòng kiểm tra lại tệp và thử lại.");
    };
    reader.onload = (e) => {
      const content = String(e.target?.result ?? "");
      if (!content.trim()) {
        setFileError(`Tệp "${file.name}" trống, không có dữ liệu để nhập.`);
        return;
      }
      try {
        const res = parseBulkCreateCsv(content, undefined, remainingCapacity);
        setParsed(res);
      } catch (err) {
        setFileError(`Không thể phân tích cú pháp tệp CSV: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function handlePasteChange(text: string) {
    setRawText(text);
    setFileError(null);
    setExcelResult(null);
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    const res = parseBulkCreateCsv(text, undefined, remainingCapacity);
    setParsed(res);
  }

  async function handleDownloadExcelTemplate() {
    if (!projectKey) return;
    setDownloadingExcel(true);
    setFileError(null);
    try {
      const res = await fetch(`/api/bulk/create/excel-template?project=${encodeURIComponent(projectKey)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Không thể tải mẫu Excel" }));
        throw new Error(err.error || `Lỗi tải file (${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition");
      let filename = `bulk-create-${projectKey}.xlsx`;
      if (disposition && disposition.includes("filename=")) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) filename = match[1];
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setFileError(`Lỗi khi tải mẫu Excel: ${(err as Error).message}`);
    } finally {
      setDownloadingExcel(false);
    }
  }

  function handleDownloadCsvTemplate() {
    const templateCsv =
      "\uFEFF" +
      `clientRef,summary,issueType,parentRef,parentKey,description,assignee,priority,labels,points,originalEstimate,dueDate,fixVersions\n` +
      `TASK-001,Xây API đăng nhập,Task,,,Mô tả API,user.name,High,"backend,api",5,1d 4h,2026-10-10,"Release 1"\n` +
      `TASK-002,Thiết kế schema,Sub-task,TASK-001,,Mô tả schema,user.name,Medium,backend,2,2h,2026-10-08,"Release 1"\n` +
      `TASK-003,Test với task cha cũ,Sub-task,,ABC-123,Mô tả test,user.name,Medium,test,1,1h,2026-10-09,"Release 1"\n`;

    const blob = new Blob([templateCsv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk-create-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Calculate items to import
  const rawItems = excelResult ? excelResult.items : parsed ? parsed.items : [];
  const itemsToImport = rawItems.slice(0, remainingCapacity);
  const hasTruncation = rawItems.length > remainingCapacity;
  const excelHasErrors = Boolean(excelResult?.errors?.length);
  const isImportDisabled =
    (!parsed && !excelResult) ||
    itemsToImport.length === 0 ||
    excelHasErrors ||
    (hasTruncation && !confirmTruncation);

  function handleConfirmImport() {
    if (itemsToImport.length === 0) return;
    const sourceType = excelResult ? "excel" : activeTab === "file" ? "csv" : "paste";
    onImport(
      itemsToImport,
      {
        type: sourceType,
        fileName: activeTab === "file" ? fileName : null,
      },
      importMode
    );
    onOpenChange(false);
    // Reset state
    setParsed(null);
    setExcelResult(null);
    setRawText("");
    setFileName(null);
    setFileError(null);
    setConfirmTruncation(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
              Nhập task từ Excel / CSV
            </DialogTitle>
            <div className="flex flex-wrap items-center gap-2">
              {projectKey && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleDownloadExcelTemplate}
                  disabled={downloadingExcel || (metadata && !metadata.canCreate)}
                  title={`Tải mẫu Excel theo dự án ${projectKey}`}
                  className="h-8 gap-1.5 text-xs cursor-pointer bg-teal-600 hover:bg-teal-700 text-white font-medium"
                >
                  {downloadingExcel ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Tải mẫu Excel ({projectKey})
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDownloadCsvTemplate}
                className="h-8 gap-1.5 text-xs cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Tải CSV mẫu
              </Button>
            </div>
          </div>
          <DialogDescription className="text-xs">
            Hỗ trợ file Excel (.xlsx) chuẩn theo dự án có dropdown, hoặc file .csv, .tsv, .txt UTF-8 và dán dữ liệu trực tiếp.
          </DialogDescription>
        </DialogHeader>

        {/* Tab switch */}
        <div className="flex shrink-0 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`cursor-pointer border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "file"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Tải lên file (Excel / CSV)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("paste")}
            className={`cursor-pointer border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "paste"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Dán dữ liệu (Paste)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("guide")}
            className={`cursor-pointer border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "guide"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Quy tắc định dạng
            </span>
          </button>
        </div>

        {/* Tab contents (Scrollable) */}
        <div className="flex-1 overflow-y-auto pr-1 py-3 space-y-4">
          {/* Tab 1: File Upload */}
          {activeTab === "file" && (
            <div>
              <div
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (!isProcessing) fileInputRef.current?.click();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label="Tải lên tệp Excel hoặc CSV"
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-7 text-center transition-colors focus:outline-hidden focus:ring-2 focus:ring-primary ${
                  isDragging
                    ? "border-primary bg-primary/10"
                    : "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-primary/5"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv,.tsv,.txt"
                  className="hidden"
                  onChange={handleFileInputChange}
                  disabled={isProcessing}
                />
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-9 w-9 text-primary animate-spin" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground">Đang xử lý tệp Excel...</p>
                  </div>
                ) : (
                  <>
                    <FileSpreadsheet className="mb-2 h-9 w-9 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                    <p className="text-sm font-medium text-foreground">
                      {fileName ? fileName : "Nhấp để chọn file Excel (.xlsx) / CSV hoặc kéo thả vào đây"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Hỗ trợ: .xlsx, .csv, .tsv · Tối đa 5 MB · Tối đa {MAX_BULK_CREATE_ITEMS} dòng
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Paste */}
          {activeTab === "paste" && (
            <div className="space-y-2">
              <Textarea
                placeholder="Dán dữ liệu từ Excel / Google Sheets vào đây...&#10;summary	issueType	description	priority&#10;Thiết kế API	Task	Mô tả có dấu phẩy	High&#10;Sửa lỗi đăng nhập	Bug	Không đăng nhập được	Highest"
                rows={7}
                value={rawText}
                onChange={(e) => handlePasteChange(e.target.value)}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                Mẹo: Sao chép các cột từ Excel hoặc Google Sheets (bao gồm cả dòng tiêu đề) rồi dán trực tiếp vào ô trên.
              </p>
            </div>
          )}

          {/* Tab 3: Formatting Guide */}
          {activeTab === "guide" && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3.5 text-xs">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <Info className="h-4 w-4 text-primary" aria-hidden="true" />
                Bảng quy tắc cột chuẩn (Canonical Columns)
              </div>
              <p className="text-muted-foreground leading-relaxed text-[11px]">
                Hệ thống hỗ trợ cả tiêu đề tiếng Anh và tiếng Việt. Tiêu đề không phân biệt chữ hoa, chữ thường.
              </p>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-muted/60 font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-2">Cột chuẩn</th>
                      <th className="p-2">Bắt buộc</th>
                      <th className="p-2">Định dạng chấp nhận</th>
                      <th className="p-2">Ví dụ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    <tr>
                      <td className="p-2 font-mono font-medium">summary</td>
                      <td className="p-2 text-destructive font-semibold">Có</td>
                      <td className="p-2 text-muted-foreground">Văn bản 1–255 ký tự</td>
                      <td className="p-2 font-mono">Sửa lỗi đăng nhập</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">issueType</td>
                      <td className="p-2 text-destructive font-semibold">Có</td>
                      <td className="p-2 text-muted-foreground">Tên hoặc ID loại công việc (chọn từ dropdown trong file mẫu)</td>
                      <td className="p-2 font-mono">Task [10001], Task</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">clientRef</td>
                      <td className="p-2 text-destructive font-semibold">Có</td>
                      <td className="p-2 text-muted-foreground">Mã định danh duy nhất trong file (vd: TASK-001)</td>
                      <td className="p-2 font-mono">TASK-001</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">parentRef</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">clientRef của task cha TRONG CÙNG BATCH</td>
                      <td className="p-2 font-mono">TASK-001</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">parentKey</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Jira key của task cha ĐÃ CÓ SẴN (không điền cùng parentRef)</td>
                      <td className="p-2 font-mono">ABC-123</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">description</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Văn bản chi tiết mô tả</td>
                      <td className="p-2 font-mono">Mô tả tác vụ</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">assignee</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Tên [username] hoặc username Jira</td>
                      <td className="p-2 font-mono">Nguyễn Văn A [nguyenvana]</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">priority</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Tên [ID] hoặc tên mức ưu tiên</td>
                      <td className="p-2 font-mono">High [3], Medium</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">labels</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Phân cách bằng dấu phẩy</td>
                      <td className="p-2 font-mono">backend, api</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">points</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Số nguyên không âm (0, 1, 2, 3...)</td>
                      <td className="p-2 font-mono">3</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">originalEstimate</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Thời gian theo chuẩn Jira</td>
                      <td className="p-2 font-mono">1d 4h, 30m</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">dueDate</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Định dạng YYYY-MM-DD</td>
                      <td className="p-2 font-mono">2026-10-10</td>
                    </tr>
                    <tr>
                      <td className="p-2 font-mono font-medium">fixVersions</td>
                      <td className="p-2 text-muted-foreground">Không</td>
                      <td className="p-2 text-muted-foreground">Tên hoặc ID phiên bản Jira</td>
                      <td className="p-2 font-mono">Release 1.0 [10420]</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* File validation error */}
          {fileError && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>{fileError}</div>
            </div>
          )}

          {/* Excel Parsed Result Preview */}
          {excelResult && (
            <div className="space-y-3 rounded-md border bg-card p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span className="font-semibold text-foreground">
                    Kết quả đọc file Excel: {excelResult.stats?.validCount ?? excelResult.items.length} task hợp lệ
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  {excelResult.manifest?.projectKey && (
                    <Badge variant="outline" className="text-teal-600 dark:text-teal-400 border-teal-500/30">
                      Project: {excelResult.manifest.projectKey}
                    </Badge>
                  )}
                  <Badge variant="outline">Tổng dòng: {excelResult.stats?.totalRows ?? excelResult.items.length}</Badge>
                  <Badge variant="success">Hợp lệ: {excelResult.stats?.validCount ?? excelResult.items.length}</Badge>
                  {(excelResult.stats?.errorCount ?? (excelResult.errors?.length || 0)) > 0 && (
                    <Badge variant="danger">Lỗi: {excelResult.stats?.errorCount ?? excelResult.errors?.length}</Badge>
                  )}
                </div>
              </div>

              {/* Stale Metadata Warning */}
              {excelResult.isStaleMetadata && (
                <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Mẫu Excel cũ hơn cấu hình Jira hiện tại</p>
                    <p className="text-[11px]">
                      Cấu hình của dự án trên Jira đã thay đổi kể từ khi file mẫu này được tải. Dữ liệu vẫn được nạp vào bảng và sẽ được kiểm tra lại với cấu hình mới nhất.
                    </p>
                  </div>
                </div>
              )}

              {/* Import Mode Selection */}
              {existingFilledCount > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="font-medium text-foreground">
                    Bảng hiện đang có {existingFilledCount} task. Vui lòng chọn cách nhập:
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-xs">
                      <input
                        type="radio"
                        name="importModeExcel"
                        value="append"
                        checked={importMode === "append"}
                        onChange={() => setImportMode("append")}
                        className="text-primary"
                      />
                      <span>
                        Nối tiếp vào bảng (còn chỗ:{" "}
                        <strong className="text-primary">
                          {Math.max(0, MAX_BULK_CREATE_ITEMS - existingFilledCount)}
                        </strong>{" "}
                        task)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-xs">
                      <input
                        type="radio"
                        name="importModeExcel"
                        value="replace"
                        checked={importMode === "replace"}
                        onChange={() => setImportMode("replace")}
                        className="text-primary"
                      />
                      <span>
                        Thay thế toàn bộ bảng (sức chứa: <strong>{MAX_BULK_CREATE_ITEMS}</strong> task)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Truncation Warning */}
              {hasTruncation && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Dữ liệu vượt quá sức chứa còn lại của bảng!</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed">
                        Tệp có <strong>{rawItems.length}</strong> task hợp lệ, nhưng theo chế độ đã chọn chỉ có thể nhận thêm <strong>{remainingCapacity}</strong> task.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer font-medium text-[11px]">
                    <input
                      type="checkbox"
                      checked={confirmTruncation}
                      onChange={(e) => setConfirmTruncation(e.target.checked)}
                      className="rounded border-amber-500/50"
                    />
                    <span>Tôi hiểu và đồng ý chỉ nhập {remainingCapacity} task đầu tiên.</span>
                  </label>
                </div>
              )}

              {/* Errors list */}
              {excelResult.errors && excelResult.errors.length > 0 && (
                <div className="rounded border border-red-500/20 bg-red-500/5 p-2.5 text-[11px] text-red-700 dark:text-red-400 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Các dòng có lỗi ({excelResult.errors.length} lỗi):
                  </div>
                  <p>Hãy sửa các ô này trong file Excel rồi tải lại. Nút nhập được mở khi file không còn lỗi.</p>
                  <ul className="list-disc pl-5 space-y-0.5 max-h-24 overflow-y-auto">
                    {excelResult.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                    {excelResult.errors.length > 10 && (
                      <li className="font-medium">...và {excelResult.errors.length - 10} lỗi khác</li>
                    )}
                  </ul>
                </div>
              )}

              {/* General warnings */}
              {excelResult.warnings && excelResult.warnings.length > 0 && (
                <div className="space-y-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {excelResult.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              {/* Preview table (up to 5 rows) */}
              {itemsToImport.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-medium text-muted-foreground text-[11px]">
                    Bản xem trước dữ liệu ({Math.min(5, itemsToImport.length)} / {itemsToImport.length} dòng):
                  </div>
                  <div className="overflow-x-auto rounded border border-border/50">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-muted/40 font-semibold text-muted-foreground">
                        <tr>
                          <th className="p-1.5 w-8">#</th>
                          <th className="p-1.5">Tiêu đề (Summary)</th>
                          <th className="p-1.5">Loại</th>
                          <th className="p-1.5">Mức ưu tiên</th>
                          <th className="p-1.5">Người thực hiện</th>
                          <th className="p-1.5">Task cha</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {itemsToImport.slice(0, 5).map((item, i) => (
                          <tr key={i} className="hover:bg-muted/10">
                            <td className="p-1.5 font-mono text-muted-foreground">{item.clientRef || i + 1}</td>
                            <td className="p-1.5 font-medium text-foreground truncate max-w-[200px]">
                              {item.summary || "—"}
                            </td>
                            <td className="p-1.5 text-muted-foreground">{item.issueTypeId || "Mặc định"}</td>
                            <td className="p-1.5 text-muted-foreground">{item.priorityId || "Mặc định"}</td>
                            <td className="p-1.5 text-muted-foreground">{item.assignee || "—"}</td>
                            <td className="p-1.5 text-muted-foreground">
                              {item.parent?.type === "batch"
                                ? `Ref: ${item.parent.clientRef}`
                                : item.parent?.type === "jira"
                                  ? `Jira: ${item.parent.jiraKey}`
                                  : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CSV Parsed Result Preview */}
          {parsed && !excelResult && (
            <div className="space-y-3 rounded-md border bg-card p-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                  <span className="font-semibold text-foreground">
                    Kết quả nhận diện: {parsed.validCount} task hợp lệ
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  <Badge variant="outline">Tổng dòng: {parsed.totalRows}</Badge>
                  <Badge variant="success">Hợp lệ: {parsed.validCount}</Badge>
                  {parsed.errorCount > 0 && <Badge variant="danger">Lỗi: {parsed.errorCount}</Badge>}
                  {parsed.skippedEmptyCount > 0 && (
                    <Badge variant="secondary">Trống: {parsed.skippedEmptyCount}</Badge>
                  )}
                  {parsed.overflowCount > 0 && (
                    <Badge variant="warning">Vượt giới hạn: {parsed.overflowCount}</Badge>
                  )}
                </div>
              </div>

              {/* Import Mode Selection when table already has items */}
              {existingFilledCount > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <div className="font-medium text-foreground">
                    Bảng hiện đang có {existingFilledCount} task. Vui lòng chọn cách nhập:
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-xs">
                      <input
                        type="radio"
                        name="importModeCsv"
                        value="append"
                        checked={importMode === "append"}
                        onChange={() => setImportMode("append")}
                        className="text-primary"
                      />
                      <span>
                        Nối tiếp vào bảng (còn chỗ:{" "}
                        <strong className="text-primary">
                          {Math.max(0, MAX_BULK_CREATE_ITEMS - existingFilledCount)}
                        </strong>{" "}
                        task)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-xs">
                      <input
                        type="radio"
                        name="importModeCsv"
                        value="replace"
                        checked={importMode === "replace"}
                        onChange={() => setImportMode("replace")}
                        className="text-primary"
                      />
                      <span>
                        Thay thế toàn bộ bảng (sức chứa: <strong>{MAX_BULK_CREATE_ITEMS}</strong> task)
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Capacity Truncation Warning */}
              {hasTruncation && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                    <div>
                      <p className="font-semibold">Dữ liệu vượt quá sức chứa còn lại của bảng!</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed">
                        Tệp có <strong>{parsed.items.length}</strong> task hợp lệ, nhưng theo chế độ đã chọn chỉ có thể nhận thêm <strong>{remainingCapacity}</strong> task.{" "}
                        <strong>{parsed.items.length - remainingCapacity}</strong> task ở cuối tệp sẽ bị bỏ qua.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer font-medium text-[11px]">
                    <input
                      type="checkbox"
                      checked={confirmTruncation}
                      onChange={(e) => setConfirmTruncation(e.target.checked)}
                      className="rounded border-amber-500/50"
                    />
                    <span>Tôi hiểu và đồng ý chỉ nhập {remainingCapacity} task đầu tiên.</span>
                  </label>
                </div>
              )}

              {/* Unrecognized Headers Warning */}
              {parsed.unrecognizedHeaders.length > 0 && (
                <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Các cột không nhận diện được sẽ bị bỏ qua:</p>
                    <p className="font-mono text-[11px]">{parsed.unrecognizedHeaders.join(", ")}</p>
                  </div>
                </div>
              )}

              {/* Duplicate Canonical Headers Warning */}
              {parsed.duplicateCanonicalHeaders.length > 0 && (
                <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2.5 text-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <p className="font-semibold">Phát hiện cột trùng trường dữ liệu:</p>
                    <p className="text-[11px]">{parsed.duplicateCanonicalHeaders.join(", ")}</p>
                  </div>
                </div>
              )}

              {/* Errors list */}
              {parsed.errors.length > 0 && (
                <div className="rounded border border-red-500/20 bg-red-500/5 p-2.5 text-[11px] text-red-700 dark:text-red-400 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Các dòng có lỗi ({parsed.errors.length} lỗi):
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5 max-h-24 overflow-y-auto">
                    {parsed.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                    {parsed.errors.length > 10 && (
                      <li className="font-medium">...và {parsed.errors.length - 10} lỗi khác</li>
                    )}
                  </ul>
                </div>
              )}

              {/* General warnings */}
              {parsed.warnings.length > 0 && (
                <div className="space-y-1 text-[11px] text-amber-700 dark:text-amber-400">
                  {parsed.warnings.map((w, i) => (
                    <p key={i}>⚠️ {w}</p>
                  ))}
                </div>
              )}

              {/* Recognized columns */}
              {Object.keys(parsed.recognizedHeaders).length > 0 && (
                <div className="text-[11px]">
                  <span className="font-medium text-muted-foreground">Cột tương ứng: </span>
                  <span className="text-foreground font-mono">
                    {Object.entries(parsed.recognizedHeaders)
                      .map(([orig, target]) => `${orig} → ${target}`)
                      .join(", ")}
                  </span>
                </div>
              )}

              {/* Preview table (up to 5 rows) */}
              {itemsToImport.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-medium text-muted-foreground text-[11px]">
                    Bản xem trước dữ liệu ({Math.min(5, itemsToImport.length)} / {itemsToImport.length} dòng):
                  </div>
                  <div className="overflow-x-auto rounded border border-border/50">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-muted/40 font-semibold text-muted-foreground">
                        <tr>
                          <th className="p-1.5 w-8">#</th>
                          <th className="p-1.5">Tiêu đề (Summary)</th>
                          <th className="p-1.5">Loại</th>
                          <th className="p-1.5">Mức ưu tiên</th>
                          <th className="p-1.5">Người thực hiện</th>
                          <th className="p-1.5">Nhãn</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {itemsToImport.slice(0, 5).map((item, i) => (
                          <tr key={i} className="hover:bg-muted/10">
                            <td className="p-1.5 font-mono text-muted-foreground">{i + 1}</td>
                            <td className="p-1.5 font-medium text-foreground truncate max-w-[200px]">
                              {item.summary || "—"}
                            </td>
                            <td className="p-1.5 text-muted-foreground">{item.issueTypeId || "Mặc định"}</td>
                            <td className="p-1.5 text-muted-foreground">{item.priorityId || "Mặc định"}</td>
                            <td className="p-1.5 text-muted-foreground">{item.assignee || "—"}</td>
                            <td className="p-1.5 text-muted-foreground">{item.labels?.join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer text-xs"
          >
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={handleConfirmImport}
            disabled={isImportDisabled}
            className="cursor-pointer gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold"
          >
            Nhập vào bảng ({itemsToImport.length} task)
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
