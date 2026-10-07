import { SearchField } from "@/components/shared/search-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw } from "lucide-react";
import { ALL } from "./lib/stale-types";
import type { StdSortMode, StdStaleFilter } from "./lib/stale-utils";

export function StandardizationFilterCard({
  stdSearch,
  stdProjectFilter,
  stdStaleFilter,
  stdSort,
  projects,
  hasStdFilters,
  onSearchChange,
  onProjectChange,
  onStaleChange,
  onSortChange,
  onClear,
}: {
  stdSearch: string;
  stdProjectFilter: string;
  stdStaleFilter: StdStaleFilter;
  stdSort: StdSortMode;
  projects: string[];
  hasStdFilters: boolean;
  onSearchChange: (value: string) => void;
  onProjectChange: (value: string) => void;
  onStaleChange: (value: StdStaleFilter) => void;
  onSortChange: (value: StdSortMode) => void;
  onClear: () => void;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <SearchField
              value={stdSearch}
              onChange={onSearchChange}
              placeholder="Tìm mã Jira, tên task…"
              ariaLabel="Tìm trong task chuẩn hóa"
            />

            <Select
              value={stdProjectFilter}
              onValueChange={(val) => onProjectChange(val)}
            >
              <SelectTrigger className="cursor-pointer text-xs" aria-label="Lọc theo dự án">
                <SelectValue placeholder="Dự án" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả dự án</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={stdStaleFilter}
              onValueChange={(val) => onStaleChange(val as "ALL" | "stale" | "healthy")}
            >
              <SelectTrigger className="cursor-pointer text-xs" aria-label="Lọc theo tình trạng SLA">
                <SelectValue placeholder="Tình trạng SLA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Mọi trạng thái SLA</SelectItem>
                <SelectItem value="stale">Đang ngâm (Vượt SLA)</SelectItem>
                <SelectItem value="healthy">Trong hạn SLA</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={stdSort}
              onValueChange={(val) =>
                onSortChange(val as "missing-desc" | "stateAge-desc" | "updated-desc" | "key-asc")
              }
            >
              <SelectTrigger className="cursor-pointer text-xs" aria-label="Sắp xếp">
                <SelectValue placeholder="Sắp xếp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="missing-desc">Thiếu nhiều mục nhất</SelectItem>
                <SelectItem value="stateAge-desc">Ngâm lâu nhất</SelectItem>
                <SelectItem value="updated-desc">Mới cập nhật nhất</SelectItem>
                <SelectItem value="key-asc">Mã Jira (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {hasStdFilters && (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3 mr-1" aria-hidden /> Xóa bộ lọc
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
