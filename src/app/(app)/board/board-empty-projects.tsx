import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ListFilter, Plus, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

/** Shown when no Jira project is selected yet: add a project key or pick from the available list. */
export function BoardNoProjectsState({
  boardNewKey,
  boardValidating,
  boardValidateError,
  hasAvailableKeys,
  onKeyChange,
  onAddProject,
  onPickFromList,
}: {
  boardNewKey: string;
  boardValidating: boolean;
  boardValidateError: string | null;
  hasAvailableKeys: boolean;
  onKeyChange: (value: string) => void;
  onAddProject: () => void;
  onPickFromList: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4">
      <EmptyState
        icon={ListFilter}
        title="Chưa chọn dự án nào"
        hint="Chọn các dự án Jira muốn hiển thị trên bảng, hoặc nhập mã dự án bên dưới để bắt đầu."
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="mt-2 flex w-full max-w-xs flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-xs">
              <Label className="text-left text-xs font-semibold text-foreground">
                Nhập mã dự án Jira muốn có
              </Label>
              <div className="flex gap-2">
                <Input
                  value={boardNewKey}
                  onChange={(e) => onKeyChange(e.target.value)}
                  placeholder="VD: ABC, MOBILE..."
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
                  disabled={boardValidating || !boardNewKey.trim()}
                  onClick={() => void onAddProject()}
                  className="h-8 shrink-0 cursor-pointer text-xs gap-1.5"
                >
                  {boardValidating ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Kiểm tra & Thêm
                </Button>
              </div>
              {boardValidateError && (
                <p className="text-left text-xs font-medium text-destructive">{boardValidateError}</p>
              )}
            </div>

            {hasAvailableKeys && (
              <Button variant="outline" size="sm" onClick={onPickFromList} className="cursor-pointer gap-1.5">
                <ListFilter className="h-4 w-4" /> Chọn từ danh sách có sẵn
              </Button>
            )}
          </div>
        }
        className="border-0 bg-transparent py-4"
      />
    </div>
  );
}
