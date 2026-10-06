import { FilterBar } from "@/components/shared/filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter } from "lucide-react";
import { ALL, type StaleResponse } from "./lib/stale-types";

interface StaleScopeFilterProps {
  project: string;
  assignee: string;
  status: string;
  reason: string;
  severity: string;
  data: StaleResponse | undefined;
  jiraUsername: string | null | undefined;
  onProjectChange: (value: string) => void;
  onAssigneeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onReset: () => void;
}

/** Global project / assignee / status / reason / severity scope filter. */
export function StaleScopeFilter({
  project,
  assignee,
  status,
  reason,
  severity,
  data,
  jiraUsername,
  onProjectChange,
  onAssigneeChange,
  onStatusChange,
  onReasonChange,
  onSeverityChange,
  onReset,
}: StaleScopeFilterProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <FilterBar
          activeCount={[project, assignee, status, reason, severity].filter((v) => v !== ALL).length}
          onReset={onReset}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden /> Phạm vi phân tích
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Select
              value={project}
              onValueChange={onProjectChange}
            >
              <SelectTrigger className="cursor-pointer" aria-label="Lọc theo dự án">
                <SelectValue placeholder="Tất cả dự án" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả dự án</SelectItem>
                {(data?.filters.projects ?? []).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={assignee}
              onValueChange={onAssigneeChange}
            >
              <SelectTrigger className="cursor-pointer" aria-label="Lọc theo người xử lý">
                <SelectValue placeholder="Tất cả người xử lý" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả người xử lý</SelectItem>
                {jiraUsername && (
                  <SelectItem value="me">Của tôi (@{jiraUsername})</SelectItem>
                )}
                <SelectItem value="unassigned">Chưa phân công</SelectItem>
                {(data?.filters.assignees ?? [])
                  .filter((item) => item !== jiraUsername)
                  .map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={onStatusChange}
            >
              <SelectTrigger className="cursor-pointer" aria-label="Lọc theo trạng thái">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả trạng thái</SelectItem>
                {(data?.filters.statuses ?? []).map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={reason}
              onValueChange={onReasonChange}
            >
              <SelectTrigger className="cursor-pointer" aria-label="Lọc theo nguyên nhân">
                <SelectValue placeholder="Tất cả nguyên nhân" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả nguyên nhân</SelectItem>
                {(data?.filters.reasons ?? []).map((item) => (
                  <SelectItem key={item} value={item}>
                    {data?.filters.reasonLabels[item] ?? item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={severity}
              onValueChange={onSeverityChange}
            >
              <SelectTrigger className="cursor-pointer" aria-label="Lọc theo mức độ">
                <SelectValue placeholder="Tất cả mức độ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tất cả mức độ</SelectItem>
                <SelectItem value="high">Khẩn cấp</SelectItem>
                <SelectItem value="warning">Cần chú ý</SelectItem>
                <SelectItem value="info">Theo dõi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </FilterBar>
      </CardContent>
    </Card>
  );
}
