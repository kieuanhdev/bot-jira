import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ListFilter, PauseCircle, Plus, RefreshCw } from "lucide-react";

const tabCls = (active: boolean) =>
  "flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-all " +
  (active
    ? "bg-card text-foreground shadow-sm border border-border"
    : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground");

interface BoardProjectTabsProps {
  projectList: Array<{ key: string; openCount: number; syncDisabled?: boolean }>;
  selectedProject: string;
  showPicker: boolean;
  preferredCount: number;
  availableKeys: string[];
  pickerSet: Set<string>;
  countMap: Map<string, number>;
  boardNewKey: string;
  boardValidating: boolean;
  boardValidateError: string | null;
  onSelectProject: (key: string) => void;
  onPrefetchProject?: (key: string) => void;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onTogglePicker: (key: string) => void;
  onSelectAllKeys: () => void;
  onCommit: () => void;
  onKeyChange: (value: string) => void;
  onAddProject: () => void;
}

/** Project tabs plus the "choose projects" picker popover. */
export function BoardProjectTabs({
  projectList,
  selectedProject,
  showPicker,
  preferredCount,
  availableKeys,
  pickerSet,
  countMap,
  boardNewKey,
  boardValidating,
  boardValidateError,
  onSelectProject,
  onPrefetchProject,
  onOpenPicker,
  onClosePicker,
  onTogglePicker,
  onSelectAllKeys,
  onCommit,
  onKeyChange,
  onAddProject,
}: BoardProjectTabsProps) {
  return (
    <>
      {projectList.map((p) => (
        <button
          key={p.key}
          onPointerEnter={() => onPrefetchProject?.(p.key)}
          onFocus={() => onPrefetchProject?.(p.key)}
          onClick={() => {
            onSelectProject(p.key);
          }}
          className={tabCls(selectedProject === p.key)}
          title={p.syncDisabled ? `${p.key}: đồng bộ Jira đã bị tắt` : undefined}
        >
          {p.key}
          {p.syncDisabled && (
            <PauseCircle className="h-4 w-4 text-warning" aria-label="Đã tắt đồng bộ" />
          )}
          <span
            className={
              "rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums " +
              (selectedProject === p.key ? "bg-muted text-foreground" : "bg-background/80 text-muted-foreground")
            }
          >
            {p.openCount}
          </span>
        </button>
      ))}

      <div className="relative">
        <button
          onClick={() => (showPicker ? onClosePicker() : onOpenPicker())}
          className={
            "flex h-10 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium transition-all " +
            (preferredCount > 0
              ? "border border-primary/30 bg-primary-soft text-primary-soft-foreground font-semibold shadow-xs"
              : "bg-muted/50 text-muted-foreground border border-transparent hover:bg-muted hover:text-foreground")
          }
        >
          <ListFilter className="h-4 w-4" />
          {preferredCount > 0 ? `${preferredCount} đã chọn` : "Chọn dự án"}
        </button>
        {showPicker && (
          <Card className="absolute left-0 top-full z-20 mt-1 w-72 p-3 shadow-lg">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Hiển thị dự án trên bảng
            </p>
            <div className="flex max-h-56 flex-col gap-1 overflow-auto">
              {availableKeys.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox checked={pickerSet.has(key)} onCheckedChange={() => onTogglePicker(key)} />
                  <span className="flex-1 font-medium">{key}</span>
                  <span className="text-xs text-muted-foreground">{countMap.get(key) ?? 0}</span>
                </label>
              ))}
            </div>

            <div className="mt-2.5 border-t border-border pt-2.5">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                Nhập dự án muốn có
              </p>
              <div className="flex gap-1.5">
                <Input
                  value={boardNewKey}
                  onChange={(e) => onKeyChange(e.target.value)}
                  placeholder="Mã dự án (VD: ABC)"
                  className="h-9 font-mono text-xs uppercase"
                  disabled={boardValidating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void onAddProject();
                    }
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={boardValidating || !boardNewKey.trim()}
                  onClick={() => void onAddProject()}
                  className="h-9 shrink-0 cursor-pointer px-3 text-xs gap-1.5"
                >
                  {boardValidating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Thêm
                </Button>
              </div>
              {boardValidateError && (
                <p className="mt-1 text-xs font-medium text-destructive">{boardValidateError}</p>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
              <button
                onClick={onSelectAllKeys}
                className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Chọn tất cả
              </button>
              <Button size="sm" variant="ghost" onClick={onCommit} className="cursor-pointer">
                Xong
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
