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
import { Textarea } from "@/components/ui/textarea";
import { parseBulkCreateCsv, type ParsedCsvResult } from "@/lib/bulk/csv-parser";
import { MAX_BULK_CREATE_ITEMS } from "@/lib/bulk/create-types";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  Download,
  HelpCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import type {
  CsvImportDialogProps,
  ExcelImportResponse,
} from "./lib/csv-import-types";
import {
  calcRemainingCapacity,
  generateCsvTemplate,
  resolveCsvNamesToIds,
  validateImportFile,
} from "./lib/csv-import-utils";
import { CsvImportFormattingGuide } from "./csv-import-formatting-guide";
import { CsvImportExcelPreview } from "./csv-import-excel-preview";
import { CsvImportCsvPreview } from "./csv-import-csv-preview";

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

  const remainingCapacity = calcRemainingCapacity(importMode, existingFilledCount);

  async function processFile(file: File) {
    setFileError(null);
    setFileName(file.name);
    setParsed(null);
    setExcelResult(null);

    const validation = validateImportFile(file.name, file.size);
    if (validation.error) {
      setFileError(validation.error);
      return;
    }

    // Handle Excel file (.xlsx) via backend API
    if (validation.isExcel) {
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

    // Handle text/csv file with FileReader
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
    const templateCsv = generateCsvTemplate();
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
  const rawItems = excelResult
    ? excelResult.items
    : parsed
      ? resolveCsvNamesToIds(parsed.items, metadata)
      : [];
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
          {activeTab === "guide" && <CsvImportFormattingGuide />}

          {/* File validation error */}
          {fileError && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>{fileError}</div>
            </div>
          )}

          {/* Excel Parsed Result Preview */}
          {excelResult && (
            <CsvImportExcelPreview
              excelResult={excelResult}
              itemsToImport={itemsToImport}
              existingFilledCount={existingFilledCount}
              importMode={importMode}
              onImportModeChange={setImportMode}
              hasTruncation={hasTruncation}
              remainingCapacity={remainingCapacity}
              confirmTruncation={confirmTruncation}
              onConfirmTruncationChange={setConfirmTruncation}
            />
          )}

          {/* CSV Parsed Result Preview */}
          {parsed && !excelResult && (
            <CsvImportCsvPreview
              parsed={parsed}
              itemsToImport={itemsToImport}
              existingFilledCount={existingFilledCount}
              importMode={importMode}
              onImportModeChange={setImportMode}
              hasTruncation={hasTruncation}
              remainingCapacity={remainingCapacity}
              confirmTruncation={confirmTruncation}
              onConfirmTruncationChange={setConfirmTruncation}
            />
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
