import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatJiraDuration, parseJiraDuration } from "@/lib/worklogs/schema";
import {
  ArrowRightLeft,
  CheckCheck,
  Clock,
  Edit3,
  ListChecks,
  PackageOpen,
} from "lucide-react";
import { AssigneeInput } from "./bulk-assignee-input";
import { EpicInput } from "./bulk-epic-input";
import type { OperationKind, ProjectStatus } from "./lib/bulk-logic";
import type { BulkVersionOption, ProjectFieldOption } from "./lib/bulk-types";
import { statusDot } from "./lib/bulk-utils";

export function BulkOperationModeSwitch({
  operationKind,
  onChange,
}: {
  operationKind: OperationKind;
  onChange: (kind: OperationKind) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      <span className="text-xs font-semibold text-muted-foreground mr-1">Chế độ:</span>
      <Button
        type="button"
        size="sm"
        variant={operationKind === "update-fields" ? "default" : "outline"}
        onClick={() => onChange("update-fields")}
        className="gap-1.5 text-xs h-7 cursor-pointer"
      >
        <Edit3 className="h-3.5 w-3.5" />
        Cập nhật trường
      </Button>
      <Button
        type="button"
        size="sm"
        variant={operationKind === "transition" ? "default" : "outline"}
        onClick={() => onChange("transition")}
        className="gap-1.5 text-xs h-7 cursor-pointer"
      >
        <ArrowRightLeft className="h-3.5 w-3.5" />
        Chuyển trạng thái
      </Button>
      <Button
        type="button"
        size="sm"
        variant={operationKind === "log-work" ? "default" : "outline"}
        onClick={() => onChange("log-work")}
        className="gap-1.5 text-xs h-7 cursor-pointer"
      >
        <Clock className="h-3.5 w-3.5" />
        Ghi Worklog
      </Button>
    </div>
  );
}

export function BulkConfigureEmptyState() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-muted-foreground">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-foreground">Chưa có dự án nào được chọn</p>
        <p className="text-xs text-muted-foreground">Chọn dự án ở Bước 1 để tải cấu hình các trường có thể chỉnh sửa.</p>
      </div>
    </div>
  );
}

export function BulkWorklogForm({
  effectiveCount,
  worklogDuration,
  setWorklogDuration,
  isWorklogDurationValid,
  worklogStarted,
  setWorklogStarted,
  worklogComment,
  setWorklogComment,
  resetPreview,
}: {
  effectiveCount: number;
  worklogDuration: string;
  setWorklogDuration: (value: string) => void;
  isWorklogDurationValid: boolean;
  worklogStarted: string;
  setWorklogStarted: (value: string) => void;
  worklogComment: string;
  setWorklogComment: (value: string) => void;
  resetPreview: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card/60 p-4">
      <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-800 dark:text-teal-200">
        <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          Chế độ Ghi Worklog hàng loạt
        </div>
        <div>
          Mỗi task đã chọn ({effectiveCount} task) sẽ được cộng thêm thời lượng này vào thời gian đã ghi trên Jira.
          {isWorklogDurationValid && (
            <div className="mt-1 font-semibold text-teal-900 dark:text-teal-100">
              Tổng thời gian dự kiến ghi nhận: {effectiveCount} × {worklogDuration} ={" "}
              {formatJiraDuration(effectiveCount * (parseJiraDuration(worklogDuration) ?? 0))}
            </div>
          )}
        </div>
        <div className="mt-1 text-muted-foreground text-[11px]">
          * Không thay đổi Remaining Estimate (adjustEstimate = leave).
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">
            Thời lượng mỗi task <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="Ví dụ: 30m, 2h, 1d 4h..."
            value={worklogDuration}
            onChange={(e) => {
              setWorklogDuration(e.target.value);
              resetPreview();
            }}
            className={cn(
              "h-9 text-sm font-mono",
              worklogDuration.trim() && !isWorklogDurationValid && "border-destructive focus-visible:ring-destructive"
            )}
          />
          <p className="text-[11px] text-muted-foreground">
            Cú pháp Jira: <strong>m</strong> (phút), <strong>h</strong> (giờ), <strong>d</strong> (ngày = 8h), <strong>w</strong> (tuần = 5d).
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-foreground">
            Thời điểm bắt đầu <span className="text-destructive">*</span>
          </label>
          <Input
            type="datetime-local"
            value={worklogStarted}
            onChange={(e) => {
              setWorklogStarted(e.target.value);
              resetPreview();
            }}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            Thời điểm ghi nhận theo giờ địa phương.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Ghi chú (Tùy chọn)</span>
          <span className={cn("text-[11px]", worklogComment.length > 4000 ? "text-destructive font-semibold" : "text-muted-foreground")}>
            {worklogComment.length} / 4000
          </span>
        </div>
        <Textarea
          rows={2}
          placeholder="Mô tả công việc chung cho các task này..."
          value={worklogComment}
          onChange={(e) => {
            setWorklogComment(e.target.value);
            resetPreview();
          }}
          className="text-sm resize-y"
        />
      </div>
    </div>
  );
}

export function BulkTransitionForm({
  effectiveCount,
  filterProject,
  allProjectStatuses,
  targetStatus,
  setTargetStatus,
  resetPreview,
}: {
  effectiveCount: number;
  filterProject: string;
  allProjectStatuses: ProjectStatus[];
  targetStatus: string;
  setTargetStatus: (value: string) => void;
  resetPreview: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card/60 p-4">
      <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-foreground">
        <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          Chế độ chuyển trạng thái hàng loạt
        </div>
        <p className="text-muted-foreground">
          Chọn trạng thái bạn muốn chuyển đến cho {effectiveCount} task đã chọn trong dự án {filterProject}.
          Jira sẽ kiểm tra luồng workflow transition có hợp lệ với từng task hay không tại bước Xem trước.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          Trạng thái đích <span className="text-destructive">*</span>
        </label>

        {allProjectStatuses.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {allProjectStatuses.map((st) => {
              const isSelected = targetStatus === st.name;
              const dot = statusDot(st.name, st.category);
              return (
                <button
                  key={st.name}
                  type="button"
                  onClick={() => {
                    setTargetStatus(st.name);
                    resetPreview();
                  }}
                  className={cn(
                    "cursor-pointer flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all shadow-2xs",
                    isSelected
                      ? "border-primary bg-primary/15 text-primary ring-2 ring-primary/30 font-semibold"
                      : "border-border bg-background hover:bg-muted/60 text-foreground"
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", dot)} aria-hidden />
                  <span>{st.name}</span>
                  {isSelected && <CheckCheck className="h-3.5 w-3.5 text-primary ml-1" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2 max-w-sm">
          <Select
            value={targetStatus}
            onValueChange={(val) => {
              setTargetStatus(val);
              resetPreview();
            }}
          >
            <SelectTrigger className="h-9 bg-background text-sm">
              <SelectValue placeholder="— Hoặc chọn từ danh sách trạng thái —" />
            </SelectTrigger>
            <SelectContent>
              {allProjectStatuses.map((st) => (
                <SelectItem key={st.name} value={st.name}>
                  <span className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", statusDot(st.name, st.category))} />
                    <span>{st.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!targetStatus && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Vui lòng chọn một trạng thái đích để tiếp tục xem trước thay đổi.
          </p>
        )}
      </div>
    </div>
  );
}

/** Checkboxes for the editable fields available in the project. */
export function BulkFieldPicker({
  availableFieldMap,
  enabledFields,
  onToggleField,
}: {
  availableFieldMap: Map<string, ProjectFieldOption>;
  enabledFields: Set<string>;
  onToggleField: (field: string) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { id: "assignee", label: "Người phụ trách" },
        { id: "labels", label: "Nhãn" },
        { id: "priority", label: "Độ ưu tiên" },
        { id: "issueType", label: "Type" },
        { id: "points", label: "Story/Task Points" },
        { id: "estimate", label: "Original Estimate" },
        { id: "dueDate", label: "Due date" },
        { id: "fixVersions", label: "Fix Versions" },
        { id: "epic", label: "Epic / Task cha" },
      ].map(({ id, label }) => {
        const isAvailable = availableFieldMap.get(id)?.available ?? true;
        const isEnabled = enabledFields.has(id);
        return (
          <label
            key={id}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
              !isAvailable && "opacity-60 cursor-not-allowed bg-muted/20 border-dashed",
              isAvailable && isEnabled && "border-primary bg-primary/10 text-primary font-medium",
              isAvailable && !isEnabled && "hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-2">
              <Checkbox
                checked={isEnabled && isAvailable}
                disabled={!isAvailable}
                onCheckedChange={() => isAvailable && onToggleField(id)}
              />
              <span>{label}</span>
            </div>
            {!isAvailable && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                Không khả dụng
              </Badge>
            )}
          </label>
        );
      })}
    </div>
  );
}

export interface BulkFieldValuesState {
  assignee: string;
  clearAssignee: boolean;
  label: string;
  clearLabels: boolean;
  priority: string;
  issueType: string;
  points: string;
  clearPoints: boolean;
  estimate: string;
  dueDate: string;
  clearDueDate: boolean;
  fixVersions: string[];
  clearFixVersions: boolean;
  epic: string;
  clearEpic: boolean;
}

export interface BulkFieldSetters {
  setAssignee: (value: string) => void;
  setClearAssignee: (value: boolean) => void;
  setLabel: (value: string) => void;
  setClearLabels: (value: boolean) => void;
  setPriority: (value: string) => void;
  setIssueType: (value: string) => void;
  setPoints: (value: string) => void;
  setClearPoints: (value: boolean) => void;
  setEstimate: (value: string) => void;
  setDueDate: (value: string) => void;
  setClearDueDate: (value: boolean) => void;
  setFixVersions: (updater: (current: string[]) => string[]) => void;
  setClearFixVersions: (value: boolean) => void;
  setEpic: (value: string) => void;
  setClearEpic: (value: boolean) => void;
}

/** Value inputs for every enabled field. */
export function BulkFieldInputs({
  filterProject,
  enabledFields,
  values,
  setters,
  resetPreview,
  availableAssignees,
  labelOptions,
  priorityOptions,
  versionOptions,
  versionsLoading,
  availableFieldMap,
  isEstimateValid,
}: {
  filterProject: string;
  enabledFields: Set<string>;
  values: BulkFieldValuesState;
  setters: BulkFieldSetters;
  resetPreview: () => void;
  availableAssignees: string[];
  labelOptions: string[];
  priorityOptions: string[];
  versionOptions: BulkVersionOption[];
  versionsLoading: boolean;
  availableFieldMap: Map<string, ProjectFieldOption>;
  isEstimateValid: boolean;
}) {
  const {
    assignee, clearAssignee, label, clearLabels, priority, issueType, points, clearPoints,
    estimate, dueDate, clearDueDate, fixVersions, clearFixVersions, epic, clearEpic,
  } = values;
  const {
    setAssignee, setClearAssignee, setLabel, setClearLabels, setPriority, setIssueType, setPoints,
    setClearPoints, setEstimate, setDueDate, setClearDueDate, setFixVersions, setClearFixVersions,
    setEpic, setClearEpic,
  } = setters;

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card/60 p-4 sm:grid-cols-2">
      {enabledFields.has("assignee") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Người phụ trách (Jira username)</span>
            <span className="text-[10px] text-muted-foreground">Tự động gợi ý từ dự án</span>
          </div>
          <AssigneeInput
            value={assignee}
            onChange={(v) => {
              setAssignee(v);
              resetPreview();
            }}
            options={availableAssignees}
            disabled={clearAssignee}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <Checkbox
              checked={clearAssignee}
              onCheckedChange={(value) => {
                setClearAssignee(value === true);
                resetPreview();
              }}
            />
            Bỏ gán người phụ trách (Unassigned)
          </label>
        </div>
      )}

      {enabledFields.has("labels") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Nhãn (Labels)</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={clearLabels}
                onCheckedChange={(v) => {
                  setClearLabels(v === true);
                  resetPreview();
                }}
              />
              Xóa tất cả nhãn
            </label>
          </div>
          <Input
            value={label}
            disabled={clearLabels}
            onChange={(e) => {
              setLabel(e.target.value);
              resetPreview();
            }}
            placeholder="release-1.4.2, frontend (cách nhau bằng dấu phẩy)"
          />
          {!clearLabels && labelOptions.length > 0 && (
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
              {labelOptions.map((option) => {
                const selectedLabels = label.split(",").map((item) => item.trim()).filter(Boolean);
                const checked = selectedLabels.includes(option);
                return (
                  <label key={option} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs hover:bg-muted">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) => {
                        const next = nextChecked === true
                          ? Array.from(new Set([...selectedLabels, option]))
                          : selectedLabels.filter((item) => item !== option);
                        setLabel(next.join(", "));
                        resetPreview();
                      }}
                    />
                    {option}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {enabledFields.has("priority") && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">Độ ưu tiên (Priority)</span>
          <Select
            value={priority}
            onValueChange={(v) => {
              setPriority(v === "ALL" ? "" : v);
              resetPreview();
            }}
          >
            <SelectTrigger><SelectValue placeholder="Chọn độ ưu tiên" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">— Chưa chọn —</SelectItem>
              {priorityOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {enabledFields.has("issueType") && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">Type</span>
          <Select value={issueType} onValueChange={(value) => { setIssueType(value === "NONE" ? "" : value); resetPreview(); }}>
            <SelectTrigger><SelectValue placeholder="Chọn Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Chưa chọn —</SelectItem>
              {(availableFieldMap.get("issueType")?.options ?? []).map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {enabledFields.has("points") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Story Points / Task Points</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={clearPoints}
                onCheckedChange={(v) => {
                  setClearPoints(v === true);
                  resetPreview();
                }}
              />
              Bỏ / Xóa điểm
            </label>
          </div>
          <Select
            value={points}
            disabled={clearPoints}
            onValueChange={(v) => {
              setPoints(v === "NONE" ? "" : v);
              resetPreview();
            }}
          >
            <SelectTrigger><SelectValue placeholder="Chọn số điểm" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Chưa chọn —</SelectItem>
              {[0, 1, 2, 3, 5, 8, 13, 21].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {enabledFields.has("estimate") && availableFieldMap.get("estimate")?.available !== false && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-foreground">Original Estimate</span>
          <Input
            value={estimate}
            onChange={(e) => {
              setEstimate(e.target.value);
              resetPreview();
            }}
            placeholder="Ví dụ: 2h, 1d 4h, 30m"
            className={cn(!isEstimateValid && "border-destructive focus-visible:ring-destructive")}
          />
          {!isEstimateValid ? (
            <span className="text-[11px] text-destructive font-medium">Định dạng không hợp lệ. Ví dụ hợp lệ: 30m, 2h, 1d 4h.</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Hỗ trợ các đơn vị thời gian Jira: w (tuần), d (ngày), h (giờ), m (phút).</span>
          )}
        </div>
      )}

      {enabledFields.has("dueDate") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Due date (Hạn hoàn thành)</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={clearDueDate}
                onCheckedChange={(v) => {
                  setClearDueDate(v === true);
                  resetPreview();
                }}
              />
              Xóa Due date hiện tại
            </label>
          </div>
          <Input
            type="date"
            value={dueDate}
            disabled={clearDueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              resetPreview();
            }}
          />
        </div>
      )}

      {enabledFields.has("fixVersions") && (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Fix Versions ({filterProject})</span>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={clearFixVersions}
                onCheckedChange={(v) => {
                  setClearFixVersions(v === true);
                  resetPreview();
                }}
              />
              Xóa tất cả Fix Versions
            </label>
          </div>
          {clearFixVersions ? (
            <p className="text-xs text-muted-foreground italic">Tất cả Fix Versions trên các task đã chọn sẽ bị xóa.</p>
          ) : versionsLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : versionOptions.length > 0 ? (
            <>
              <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 md:grid-cols-3">
                {versionOptions.map((version) => (
                  <label key={version.name} className="flex cursor-pointer items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm hover:bg-muted/50 border">
                    <Checkbox
                      checked={fixVersions.includes(version.name)}
                      onCheckedChange={(checked) => {
                        setFixVersions((current) => checked === true
                          ? Array.from(new Set([...current, version.name]))
                          : current.filter((name) => name !== version.name));
                        resetPreview();
                      }}
                    />
                    <span className="truncate">{version.name}</span>
                  </label>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Có thể chọn một hoặc nhiều version. Danh sách được lấy từ dự án {filterProject}.
              </span>
            </>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                <PackageOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium">Chưa có Fix Version trên Jira cho dự án {filterProject}</p>
                <p className="text-xs text-muted-foreground">Tạo version trên Jira cho project đã chọn rồi tải lại trang.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {enabledFields.has("epic") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Epic / Task cha</span>
            <span className="text-[10px] text-muted-foreground">Gợi ý từ dự án {filterProject}</span>
          </div>
          <EpicInput
            projectKey={filterProject}
            value={epic}
            onChange={(v) => {
              setEpic(v);
              resetPreview();
            }}
            disabled={clearEpic}
          />
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
            <Checkbox
              checked={clearEpic}
              onCheckedChange={(v) => {
                setClearEpic(v === true);
                resetPreview();
              }}
            />
            Gỡ Epic khỏi task (Unlink Epic)
          </label>
        </div>
      )}
    </div>
  );
}
