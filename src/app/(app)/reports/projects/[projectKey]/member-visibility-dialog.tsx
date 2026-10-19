"use client";

import { useState, useMemo } from "react";
import { SlidersHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchField } from "@/components/shared/search-field";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { MemberReportItem } from "@/lib/reports/types";

interface MemberVisibilityDialogProps {
  members: MemberReportItem[];
  selectedAssignees: string[];
  hasSavedSelection: boolean;
  onSave: (assignees: string[]) => void;
  onShowAll: () => void;
}

export function MemberVisibilityDialog({
  members,
  selectedAssignees,
  hasSavedSelection,
  onSave,
  onShowAll,
}: MemberVisibilityDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>([]);

  const openDialog = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setQuery("");
      setDraft(hasSavedSelection ? selectedAssignees : members.map((member) => member.assignee));
    }
  };

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return members;
    return members.filter(
      (member) =>
        member.displayName.toLowerCase().includes(normalized) ||
        member.assignee.toLowerCase().includes(normalized)
    );
  }, [members, query]);

  const selected = new Set(draft);
  const allSelected = members.length > 0 && members.every((member) => selected.has(member.assignee));

  const toggleMember = (assignee: string) => {
    setDraft((current) =>
      current.includes(assignee)
        ? current.filter((item) => item !== assignee)
        : [...current, assignee]
    );
  };

  const handleSave = () => {
    onSave(draft);
    setOpen(false);
  };

  const handleShowAll = () => {
    onShowAll();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="cursor-pointer">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Chọn thành viên
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-md overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle>Chọn thành viên cần xem</DialogTitle>
          <DialogDescription>
            Lựa chọn được lưu riêng cho dự án này trên trình duyệt hiện tại.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Tìm tên hoặc @username..."
            ariaLabel="Tìm tên hoặc @username"
          />

          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Đã chọn {draft.length}/{members.length} người</span>
            <button
              type="button"
              onClick={() => setDraft(allSelected ? [] : members.map((member) => member.assignee))}
              className="cursor-pointer font-medium text-primary transition-colors hover:text-primary/80"
            >
              {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member) => {
                const checkboxId = `member-visibility-${member.assignee}`;
                return (
                  <label
                    key={member.assignee}
                    htmlFor={checkboxId}
                    className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={selected.has(member.assignee)}
                      onCheckedChange={() => toggleMember(member.assignee)}
                    />
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold uppercase text-primary ring-1 ring-primary/20">
                      {member.displayName.trim().slice(0, 2)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{member.displayName}</span>
                      {member.assignee !== "unassigned" && (
                        <span className="block truncate font-mono text-2xs text-muted-foreground">@{member.assignee}</span>
                      )}
                    </span>
                  </label>
                );
              })
            ) : (
              <EmptyState
                size="compact"
                icon={Users}
                title="Không tìm thấy thành viên"
                hint="Thử tìm bằng tên hoặc username khác."
                className="border-0 rounded-none py-8"
              />
            )}
          </div>
          {draft.length === 0 && (
            <p className="text-xs text-destructive">Hãy chọn ít nhất một thành viên để lưu.</p>
          )}
        </div>

        <DialogFooter className="border-t border-border bg-muted/30 px-5 py-4 sm:justify-between sm:space-x-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleShowAll} className="cursor-pointer">
            Hiển thị tất cả
          </Button>
          <Button type="button" size="sm" disabled={draft.length === 0} onClick={handleSave} className="cursor-pointer">
            Lưu lựa chọn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
