import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IssueItem } from "@/hooks/use-issues";
import { DateCell, FixVersionCell, PointsCell, SelectCell } from "./board-list-inline-cells";
import { PRIORITIES } from "./lib/quick-panel-utils";
import type { ListOptions } from "./board-list-view";

const toIsoDay = (d: string | null) => (d ? `${d}T00:00:00.000Z` : null);

/** Sticky bar shown while rows are ticked: one dropdown per editable field. */
export function BoardListBulkBar({
  selected,
  options,
  onEdits,
  onBulkTransition,
  onClear,
}: {
  selected: IssueItem[];
  options: ListOptions;
  onEdits: (
    targets: IssueItem[],
    api: Record<string, unknown>,
    itemFor: (issue: IssueItem) => Partial<IssueItem>
  ) => void;
  onBulkTransition: (targets: IssueItem[], toStatus: string) => void;
  onClear: () => void;
}) {
  const set = (api: Record<string, unknown>, item: Partial<IssueItem>) =>
    onEdits(selected, api, () => item);
  const people = (field: "assignee" | "reporter" | "approver" | "tester", list: string[], clear?: string) => {
    const itemKey = `${field}Jira` as "assigneeJira" | "reporterJira" | "approverJira" | "testerJira";
    const label = { assignee: "Assignee", reporter: "Reporter", approver: "Approver", tester: "Tester" }[field];
    return (
      <SelectCell
        label={`${label} cho ${selected.length} task`}
        display={label}
        value={null}
        options={list}
        clearLabel={clear}
        onChange={(v) => set({ [field]: v }, { [itemKey]: v })}
      />
    );
  };

  return (
    <div
      role="region"
      aria-label="Sửa hàng loạt"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-primary/10 px-3 py-2 text-xs backdrop-blur"
    >
      <span className="font-semibold text-foreground">{selected.length} task đã chọn</span>
      <span className="text-muted-foreground">· Đặt giá trị cho tất cả:</span>
      <SelectCell
        label="Status"
        display="Status"
        value={null}
        options={options.statuses}
        onChange={(v) => v && onBulkTransition(selected, v)}
      />
      {people("assignee", options.assignees, "Chưa gán")}
      <SelectCell
        label="Priority"
        display="Priority"
        value={null}
        options={PRIORITIES}
        onChange={(v) => v && set({ priority: v }, { priority: v })}
      />
      <PointsCell
        jiraKey={selected[0].jiraKey}
        value={null}
        display="Points"
        onChange={(points) => set({ points }, { points })}
      />
      <DateCell
        label="Due"
        display="Due"
        value={null}
        onChange={(d) => set({ dueDate: d }, { dueDate: toIsoDay(d) })}
      />
      <SelectCell
        label="Type"
        display="Type"
        value={null}
        options={options.types}
        onChange={(v) => v && set({ issueType: v }, { type: v })}
      />
      <SelectCell
        label="Epic"
        display="Epic"
        value={null}
        options={options.epics}
        clearLabel="Bỏ epic"
        onChange={(v) => set({ epic: v }, { epic: v })}
      />
      <FixVersionCell
        jiraKey={selected[0].jiraKey}
        names={[]}
        display="Fix version"
        onToggle={(version, on) =>
          on &&
          onEdits(selected, { addFixVersion: version }, (i) => ({
            fixVersionNames: i.fixVersionNames.includes(version)
              ? i.fixVersionNames
              : [...i.fixVersionNames, version],
          }))
        }
      />
      {people("reporter", options.reporters)}
      {people("approver", options.approvers, "Xóa approver")}
      {people("tester", options.testers, "Xóa tester")}
      <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={onClear}>
        <X aria-hidden className="h-3.5 w-3.5" /> Bỏ chọn
      </Button>
    </div>
  );
}
