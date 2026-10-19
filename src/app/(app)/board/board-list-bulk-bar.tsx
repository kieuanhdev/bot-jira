import { useState } from "react";
import { Pencil, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
  // Bulk edits touch many tasks at once, so every change waits for an explicit confirmation.
  const [pending, setPending] = useState<{ text: string; run: () => void } | null>(null);
  const ask = (text: string, run: () => void) => setPending({ text, run });
  const set = (text: string, api: Record<string, unknown>, item: Partial<IssueItem>) =>
    ask(text, () => onEdits(selected, api, () => item));
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
        onChange={(v) => set(`${label} → ${v ?? "(bỏ giá trị)"}`, { [field]: v }, { [itemKey]: v })}
      />
    );
  };

  return (
    <div
      role="region"
      aria-label="Sửa hàng loạt"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary-soft px-3 py-2 text-xs backdrop-blur"
    >
      <span className="font-semibold text-primary-soft-foreground">{selected.length} task đã chọn</span>
      <span className="text-muted-foreground">· Đặt giá trị cho tất cả:</span>
      <SelectCell
        label="Status"
        display="Status"
        value={null}
        options={options.statuses}
        onChange={(v) => v && ask(`Status → ${v}`, () => onBulkTransition(selected, v))}
      />
      {people("assignee", options.assignees, "Chưa gán")}
      <SelectCell
        label="Priority"
        display="Priority"
        value={null}
        options={PRIORITIES}
        onChange={(v) => v && set(`Priority → ${v}`, { priority: v }, { priority: v })}
      />
      <PointsCell
        jiraKey={selected[0].jiraKey}
        value={null}
        display="Points"
        onChange={(points) => set(`Points → ${points ?? "(xóa)"}`, { points }, { points })}
      />
      <DateCell
        label="Due"
        display="Due"
        value={null}
        onChange={(d) => set(`Due → ${d ?? "(xóa)"}`, { dueDate: d }, { dueDate: toIsoDay(d) })}
      />
      <SelectCell
        label="Type"
        display="Type"
        value={null}
        options={options.types}
        onChange={(v) => v && set(`Type → ${v}`, { issueType: v }, { type: v })}
      />
      <SelectCell
        label="Epic"
        display="Epic"
        value={null}
        options={options.epics}
        clearLabel="Bỏ epic"
        onChange={(v) => set(`Epic → ${v ?? "(bỏ epic)"}`, { epic: v }, { epic: v })}
      />
      <FixVersionCell
        jiraKey={selected[0].jiraKey}
        names={[]}
        display="Fix version"
        onToggle={(version, on) =>
          on &&
          ask(`Thêm Fix version → ${version}`, () =>
            onEdits(selected, { addFixVersion: version }, (i) => ({
              fixVersionNames: i.fixVersionNames.includes(version)
                ? i.fixVersionNames
                : [...i.fixVersionNames, version],
            }))
          )
        }
      />
      {people("reporter", options.reporters)}
      {people("approver", options.approvers, "Xóa approver")}
      {people("tester", options.testers, "Xóa tester")}
      <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 px-2.5 text-xs font-medium cursor-pointer hover:bg-background/40" onClick={onClear}>
        <X aria-hidden className="h-4 w-4" /> Bỏ chọn
      </Button>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        icon={Pencil}
        title={`Sửa ${selected.length} task?`}
        description="Thay đổi sẽ được áp dụng cho tất cả task đã chọn."
        confirmLabel="Áp dụng"
        onConfirm={() => {
          pending?.run();
          setPending(null);
        }}
      >
        <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">{pending?.text}</div>
        <p className="text-xs text-muted-foreground">
          {selected
            .slice(0, 8)
            .map((i) => i.jiraKey)
            .join(", ")}
          {selected.length > 8 ? ` và ${selected.length - 8} task khác` : ""}
        </p>
      </ConfirmDialog>
    </div>
  );
}
