import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ListFilter, Plus, RefreshCw } from "lucide-react";

const tabCls = (active: boolean) =>
  "flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
  (active
    ? "bg-primary text-primary-foreground"
    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground");

interface BoardProjectTabsProps {
  projectList: Array<{ key: string; openCount: number }>;
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
          onClick={() => {
            onSelectProject(p.key);
          }}
          className={tabCls(selectedProject === p.key)}
        >
          {p.key}
          <span
            className={
              "rounded-full px-1.5 text-xs " +
              (selectedProject === p.key ? "bg-primary-foreground/20" : "bg-background/60")
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
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
            (preferredCount > 0
              ? "border border-primary/40 bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground")
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
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
                Nhập dự án muốn có
              </p>
              <div className="flex gap-1.5">
                <Input
                  value={boardNewKey}
                  onChange={(e) => onKeyChange(e.target.value)}
                  placeholder="Mã dự án (VD: ABC)"
                  className="h-8 font-mono text-xs uppercase"
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
                  className="h-8 shrink-0 cursor-pointer px-2.5 text-xs gap-1"
                >
                  {boardValidating ? (
                    <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  Thêm
                </Button>
              </div>
              {boardValidateError && (
                <p className="mt-1 text-[11px] font-medium text-destructive">{boardValidateError}</p>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2">
              <button
                onClick={onSelectAllKeys}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Chọn tất cả
              </button>
              <Button size="sm" variant="ghost" onClick={onCommit}>
                Xong
              </Button>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
