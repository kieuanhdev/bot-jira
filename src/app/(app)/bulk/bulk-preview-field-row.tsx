import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { formatSecondsToJira, labelList } from "./lib/bulk-utils";

export function fieldRow(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, key: string) {
  const b = before?.[key];
  const a = after?.[key];
  const changed = JSON.stringify(b) !== JSON.stringify(a) && a !== undefined;
  if (!changed && (a === undefined || a === null) && (b === undefined || b === null)) {
    return null;
  }

  let bText: string;
  let aText: string;

  if (key === "estimateSeconds") {
    bText = typeof b === "number" ? formatSecondsToJira(b) : (b ? String(b) : "—");
    aText = typeof a === "number" ? formatSecondsToJira(a) : (a ? String(a) : "—");
  } else if (key === "labels" || key === "fixVersions") {
    bText = labelList(b);
    aText = Array.isArray(a) && a.length === 0 && Array.isArray(b) && b.length > 0
      ? "(Xóa tất cả)"
      : labelList(a);
  } else if (key === "assignee") {
    bText = b ? `@${String(b)}` : "Chưa giao";
    aText = a === null ? "(Bỏ gán)" : (a ? `@${String(a)}` : "Chưa giao");
  } else if (key === "dueDate") {
    bText = b ? String(b) : "—";
    aText = a === null ? "(Xóa ngày)" : (a ? String(a) : "—");
  } else if (key === "points") {
    bText = b != null ? `${b}pt` : "—";
    aText = a === null ? "(Xóa điểm)" : (a != null ? `${a}pt` : "—");
  } else if (key === "epic") {
    bText = b ? String(b) : "—";
    aText = a === null ? "(Gỡ Epic)" : (a ? String(a) : "—");
  } else {
    bText = b == null ? "—" : String(b);
    aText = a == null ? "—" : String(a);
  }

  return (
    <div key={key} className={cn("flex items-center gap-2 rounded px-2 py-0.5 text-xs transition-colors", changed && "bg-primary/5")}>
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("truncate", changed && "text-muted-foreground line-through")}>{bText}</span>
      {changed && (
        <>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium text-foreground">{aText}</span>
          <Badge variant="success" className="ml-auto text-[10px] px-1.5 py-0">Thay đổi</Badge>
        </>
      )}
    </div>
  );
}
