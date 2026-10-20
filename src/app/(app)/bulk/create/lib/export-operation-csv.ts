import { toCsv } from "@/lib/csv/write";

export interface OperationExportItem {
  rowIndex?: number;
  clientRef?: string;
  jiraKey?: string | null;
  status: string;
  error?: string | null;
  requested?: { summary?: string; issueTypeId?: string };
}

export function generateOperationCsv(items: OperationExportItem[]): string {
  const headers = ["STT", "Client Ref", "Jira Key", "Summary", "Trạng thái", "Lỗi / Chi tiết"];
  const headerLine = toCsv([headers], { bom: true });

  if (items.length === 0) {
    return headerLine;
  }

  const rows = items.map((item, idx) => {
    const stt = String((item.rowIndex ?? idx) + 1);
    const clientRef = item.clientRef || "";
    const jiraKey = item.jiraKey || "";
    const summary = item.requested?.summary || "";
    const statusText =
      item.status === "succeeded"
        ? "Thành công"
        : item.status === "failed"
          ? "Thất bại"
          : item.status === "blocked_by_parent"
            ? "Chờ task cha"
            : item.status;
    const errorText = item.error || "";
    return [stt, clientRef, jiraKey, summary, statusText, errorText];
  });

  return `${headerLine}\r\n${toCsv(rows, { quoteStrings: true })}`;
}

export function exportOperationCsv(
  items: OperationExportItem[],
  options?: { projectKey?: string; operationId?: string }
): void {
  if (!items || items.length === 0 || typeof document === "undefined") return;
  const csvContent = generateOperationCsv(items);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const opSuffix = options?.operationId ? options.operationId.slice(-6) : "export";
  link.download = `bulk-create-${options?.projectKey || "jira"}-${opSuffix}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
