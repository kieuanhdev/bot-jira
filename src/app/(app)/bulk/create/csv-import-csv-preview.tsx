import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParsedCsvResult } from "@/lib/bulk/csv-parser";
import { MAX_BULK_CREATE_ITEMS, type BulkCreateRowInput } from "@/lib/bulk/create-types";

interface CsvImportCsvPreviewProps {
  parsed: ParsedCsvResult;
  itemsToImport: BulkCreateRowInput[];
  existingFilledCount: number;
  importMode: "replace" | "append";
  onImportModeChange: (mode: "replace" | "append") => void;
  hasTruncation: boolean;
  remainingCapacity: number;
  confirmTruncation: boolean;
  onConfirmTruncationChange: (confirmed: boolean) => void;
}

export function CsvImportCsvPreview({
  parsed,
  itemsToImport,
  existingFilledCount,
  importMode,
  onImportModeChange,
  hasTruncation,
  remainingCapacity,
  confirmTruncation,
  onConfirmTruncationChange,
}: CsvImportCsvPreviewProps) {
  return (
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
                onChange={() => onImportModeChange("append")}
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
                onChange={() => onImportModeChange("replace")}
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
              onChange={(e) => onConfirmTruncationChange(e.target.checked)}
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
  );
}
