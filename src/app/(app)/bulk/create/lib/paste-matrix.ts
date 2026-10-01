import {
  type BulkCreateRowInput,
  type BulkCreateProjectMetadata,
  MAX_BULK_CREATE_ITEMS,
} from "@/lib/bulk/create-types";
import { generateUniqueClientRef } from "@/lib/bulk/client-ref";

export interface PasteResult {
  items: BulkCreateRowInput[];
  appliedCount: number;
  message: string;
}

export function parsePastedSpreadsheet(
  clipboardText: string,
  startRowIndex: number,
  currentItems: BulkCreateRowInput[],
  metadata: BulkCreateProjectMetadata
): PasteResult | null {
  if (!clipboardText) return null;

  // Normalize newlines
  const text = clipboardText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = text.split("\n");
  // Filter trailing empty line if any
  if (rawLines.length > 1 && rawLines[rawLines.length - 1].trim() === "") {
    rawLines.pop();
  }

  if (rawLines.length === 0) return null;

  // Split lines into cells (tab-delimited from Excel/Sheets)
  const matrix = rawLines.map((line) => line.split("\t"));

  const isMultiRow = matrix.length > 1;
  const isMultiCol = matrix.some((row) => row.length > 1);

  if (!isMultiRow && !isMultiCol) {
    // Normal single-cell paste, let the browser handle it
    return null;
  }

  const existingRefs = new Set(currentItems.map((i) => i.clientRef).filter(Boolean));
  const newItems = [...currentItems];

  let appliedCount = 0;
  const maxAllowed = MAX_BULK_CREATE_ITEMS;

  for (let r = 0; r < matrix.length; r++) {
    const targetIndex = startRowIndex + r;
    if (targetIndex >= maxAllowed) break;

    const rowCells = matrix[r].map((c) => c.trim());
    const summaryText = rowCells[0] ?? "";

    if (!summaryText && rowCells.length === 1) {
      // Empty line, skip
      continue;
    }

    // Get or create row
    let targetRow: BulkCreateRowInput;
    if (targetIndex < newItems.length) {
      targetRow = { ...newItems[targetIndex] };
    } else {
      const clientRef = generateUniqueClientRef(existingRefs, "row");
      targetRow = { clientRef, summary: "" };
    }

    // Assign summary
    if (summaryText) {
      targetRow.summary = summaryText;
    }

    // If multi-column TSV, map other columns
    if (rowCells.length > 1) {
      for (let c = 1; c < rowCells.length; c++) {
        const val = rowCells[c];
        if (!val) continue;

        // Try match Issue Type
        const matchedType = metadata.issueTypes.find(
          (t) => t.name.toLowerCase() === val.toLowerCase() || t.id.toLowerCase() === val.toLowerCase()
        );
        if (matchedType && !targetRow.issueTypeId) {
          targetRow.issueTypeId = matchedType.id;
          continue;
        }

        // Try match Priority
        const matchedPriority = metadata.priorityOptions.find(
          (p) => p.name.toLowerCase() === val.toLowerCase() || p.id.toLowerCase() === val.toLowerCase()
        );
        if (matchedPriority && !targetRow.priorityId) {
          targetRow.priorityId = matchedPriority.id;
          continue;
        }

        // Try match number as story points
        const num = Number(val);
        if (metadata.pointsFieldId && Number.isFinite(num) && num >= 0 && targetRow.points == null) {
          targetRow.points = num;
          continue;
        }

        // Try match date (YYYY-MM-DD or DD/MM/YYYY)
        if (metadata.supportsDueDate && /^\d{4}-\d{2}-\d{2}$/.test(val) && !targetRow.dueDate) {
          targetRow.dueDate = val;
          continue;
        }

        // Otherwise if assignee not set and looks like a username
        if (!targetRow.assignee && /^[a-zA-Z0-9._-]+$/.test(val)) {
          targetRow.assignee = val;
          continue;
        }

        // Otherwise description
        if (!targetRow.description) {
          targetRow.description = val;
        }
      }
    }

    newItems[targetIndex] = targetRow;
    appliedCount++;
  }

  const message = `Đã dán thành công ${appliedCount} dòng từ bảng tính`;
  return {
    items: newItems,
    appliedCount,
    message,
  };
}
