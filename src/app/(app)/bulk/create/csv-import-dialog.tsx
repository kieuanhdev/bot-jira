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
import { type BulkCreateRowInput, MAX_BULK_CREATE_ITEMS } from "@/lib/bulk/create-types";
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (items: BulkCreateRowInput[], source: { type: "csv" | "paste"; fileName?: string | null }) => void;
  currentCount: number;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  currentCount,
}: CsvImportDialogProps) {
  const [activeTab, setActiveTab] = useState<"file" | "paste">("file");
  const [rawText, setRawText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsvResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result ?? "");
      const res = parseBulkCreateCsv(content);
      setParsed(res);
    };
    reader.readAsText(file);
  }

  function handlePasteChange(text: string) {
    setRawText(text);
    if (!text.trim()) {
      setParsed(null);
      return;
    }
    const res = parseBulkCreateCsv(text);
    setParsed(res);
  }

  function handleConfirmImport() {
    if (!parsed || parsed.items.length === 0) return;
    onImport(parsed.items, {
      type: activeTab === "file" ? "csv" : "paste",
      fileName: activeTab === "file" ? fileName : null,
    });
    onOpenChange(false);
    // Reset state
    setParsed(null);
    setRawText("");
    setFileName(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" aria-hidden="true" />
            Nhập danh sách task từ CSV / Bảng tính
          </DialogTitle>
          <DialogDescription className="text-xs">
            Hỗ trợ tải lên file .csv hoặc dán trực tiếp dữ liệu từ Excel, Google Sheets (phân cách bằng tab hoặc dấu phẩy).
          </DialogDescription>
        </DialogHeader>

        {/* Tab switch */}
        <div className="flex border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`cursor-pointer border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
              activeTab === "file"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Tải lên file CSV
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
        </div>

        {/* Tab contents */}
        {activeTab === "file" ? (
          <div className="py-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              <FileText className="mb-2 h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">
                {fileName ? fileName : "Nhấp để chọn file CSV hoặc kéo thả vào đây"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Định dạng chuẩn: UTF-8, kích thước tối đa 5MB, tối đa {MAX_BULK_CREATE_ITEMS} dòng.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-3">
            <Textarea
              placeholder="Dán dữ liệu từ Excel / Google Sheets vào đây...&#10;summary	issueType	description	priority&#10;Task 1	Task	Mô tả	High"
              rows={8}
              value={rawText}
              onChange={(e) => handlePasteChange(e.target.value)}
              className="font-mono text-xs leading-relaxed"
            />
          </div>
        )}

        {/* Parsed Result Preview */}
        {parsed && (
          <div className="space-y-3 rounded-md border bg-card p-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <span className="font-semibold text-foreground">
                  Đã nhận diện {parsed.totalRows} task hợp lệ
                </span>
              </div>
              <Badge variant="outline" className="font-mono text-[11px]">
                {Object.keys(parsed.recognizedHeaders).length} cột nhận diện được
              </Badge>
            </div>

            {parsed.warnings.length > 0 && (
              <div className="flex items-start gap-2 rounded bg-amber-500/10 p-2 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <div className="space-y-0.5">
                  {parsed.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Recognized columns */}
            <div>
              <span className="font-medium text-muted-foreground">Cột tương ứng: </span>
              <span className="text-foreground">
                {Object.entries(parsed.recognizedHeaders)
                  .map(([orig, target]) => `${orig} → ${target}`)
                  .join(", ")}
              </span>
            </div>

            {/* First 3 preview rows */}
            {parsed.items.length > 0 && (
              <div className="overflow-x-auto rounded border border-border/50">
                <table className="w-full text-left">
                  <thead className="bg-muted/40 font-semibold text-muted-foreground">
                    <tr>
                      <th className="p-1.5">#</th>
                      <th className="p-1.5">Tiêu đề (Summary)</th>
                      <th className="p-1.5">Loại</th>
                      <th className="p-1.5">Mức ưu tiên</th>
                      <th className="p-1.5">Nhãn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {parsed.items.slice(0, 3).map((item, i) => (
                      <tr key={i} className="hover:bg-muted/10">
                        <td className="p-1.5 font-mono text-muted-foreground">{i + 1}</td>
                        <td className="p-1.5 font-medium text-foreground truncate max-w-[200px]">{item.summary || "—"}</td>
                        <td className="p-1.5">{item.issueTypeId || "Mặc định"}</td>
                        <td className="p-1.5">{item.priorityId || "Mặc định"}</td>
                        <td className="p-1.5">{item.labels?.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="cursor-pointer">
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={handleConfirmImport}
            disabled={!parsed || parsed.items.length === 0}
            className="cursor-pointer gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Nhập vào bảng ({parsed?.totalRows ?? 0} task)
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
