"use client";

import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { PackageOpen } from "lucide-react";
import { AssigneeInput } from "./bulk-assignee-input";
import { EpicInput } from "./bulk-epic-input";
import type { PeopleRole, PeopleState, PersonFieldState } from "./lib/use-bulk-field-state";
import type { BulkVersionOption, ProjectFieldOption } from "./lib/bulk-types";

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
  people: PeopleState;
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
  setPerson: (role: PeopleRole, patch: Partial<PersonFieldState>) => void;
}

export const PEOPLE_ROLE_LABELS: Record<PeopleRole, string> = {
  reporter: "Reporter",
  approver: "Approver",
  tester: "Tester",
};

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
    estimate, dueDate, clearDueDate, fixVersions, clearFixVersions, epic, clearEpic, people,
  } = values;
  const {
    setAssignee, setClearAssignee, setLabel, setClearLabels, setPriority, setIssueType, setPoints,
    setClearPoints, setEstimate, setDueDate, setClearDueDate, setFixVersions, setClearFixVersions,
    setEpic, setClearEpic, setPerson,
  } = setters;

  // REF-033.5: Parse selected labels once to avoid O(labels²) in render loop
  const selectedLabels = useMemo(
    () => label.split(",").map((item) => item.trim()).filter(Boolean),
    [label]
  );
  const selectedLabelsSet = useMemo(
    () => new Set(selectedLabels),
    [selectedLabels]
  );

  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card/60 p-4 sm:grid-cols-2">
      {enabledFields.has("assignee") && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">Người phụ trách (Jira username)</span>
            <span className="text-2xs text-muted-foreground">Tự động gợi ý từ dự án</span>
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
                const checked = selectedLabelsSet.has(option);
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
            <span className="text-2xs text-destructive font-medium">Định dạng không hợp lệ. Ví dụ hợp lệ: 30m, 2h, 1d 4h.</span>
          ) : (
            <span className="text-2xs text-muted-foreground">Hỗ trợ các đơn vị thời gian Jira: w (tuần), d (ngày), h (giờ), m (phút).</span>
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
              <span className="text-2xs text-muted-foreground">
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
            <span className="text-2xs text-muted-foreground">Gợi ý từ dự án {filterProject}</span>
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

      {(Object.keys(PEOPLE_ROLE_LABELS) as PeopleRole[]).map((role) =>
        enabledFields.has(role) ? (
          <div key={role} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-foreground">{PEOPLE_ROLE_LABELS[role]} (Jira username)</span>
            <AssigneeInput
              value={people[role].value}
              onChange={(v) => {
                setPerson(role, { value: v });
                resetPreview();
              }}
              options={availableAssignees}
              disabled={people[role].clear}
            />
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={people[role].clear}
                onCheckedChange={(v) => {
                  setPerson(role, { clear: v === true });
                  resetPreview();
                }}
              />
              Xóa {PEOPLE_ROLE_LABELS[role]}
            </label>
          </div>
        ) : null
      )}
    </div>
  );
}
