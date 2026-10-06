import { MAX_BULK_CREATE_ITEMS } from "@/lib/bulk/create-types";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_EXTENSIONS = [".xlsx", ".csv", ".tsv", ".txt"] as const;

export function validateImportFile(fileName: string, fileSize: number): {
  error?: string;
  ext: string;
  isExcel: boolean;
} {
  if (fileSize > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (fileSize / (1024 * 1024)).toFixed(2);
    return {
      error: `Tệp "${fileName}" (${sizeMb} MB) vượt quá dung lượng tối đa cho phép là 5 MB.`,
      ext: "",
      isExcel: false,
    };
  }

  const dotIdx = fileName.lastIndexOf(".");
  const ext = dotIdx >= 0 ? fileName.slice(dotIdx).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
    return {
      error: `Định dạng tệp "${ext || "không xác định"}" không được hỗ trợ. Vui lòng chọn tệp .xlsx, .csv, .tsv hoặc .txt.`,
      ext,
      isExcel: false,
    };
  }

  return {
    ext,
    isExcel: ext === ".xlsx",
  };
}

export function calcRemainingCapacity(
  importMode: "replace" | "append",
  existingFilledCount: number
): number {
  return importMode === "replace"
    ? MAX_BULK_CREATE_ITEMS
    : Math.max(0, MAX_BULK_CREATE_ITEMS - existingFilledCount);
}

export function generateCsvTemplate(): string {
  return (
    "\uFEFF" +
    `clientRef,summary,issueType,parentRef,parentKey,description,assignee,priority,labels,points,originalEstimate,dueDate,fixVersions\n` +
    `TASK-001,Xây API đăng nhập,Task,,,Mô tả API,user.name,High,"backend,api",5,1d 4h,2026-10-10,"Release 1"\n` +
    `TASK-002,Thiết kế schema,Sub-task,TASK-001,,Mô tả schema,user.name,Medium,backend,2,2h,2026-10-08,"Release 1"\n` +
    `TASK-003,Test với task cha cũ,Sub-task,,ABC-123,Mô tả test,user.name,Medium,test,1,1h,2026-10-09,"Release 1"\n`
  );
}
