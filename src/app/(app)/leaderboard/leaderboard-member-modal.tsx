import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LeaderboardMember } from "@/lib/leaderboard/types";
import { filterModalTasks } from "./lib/leaderboard-utils";

interface LeaderboardMemberModalProps {
  member: LeaderboardMember | null;
  onClose: () => void;
  periodLabel?: string;
}

export function LeaderboardMemberModal({
  member,
  onClose,
  periodLabel,
}: LeaderboardMemberModalProps) {
  const [taskSearch, setTaskSearch] = useState("");

  const modalTasks = useMemo(() => {
    return filterModalTasks(member?.tasks, taskSearch);
  }, [member?.tasks, taskSearch]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTaskSearch("");
      onClose();
    }
  };

  return (
    <Dialog open={Boolean(member)} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle className="text-lg font-bold">
              Nhiệm vụ đóng góp - {member?.displayName}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            {periodLabel} • Tổng {member?.completedPoints ?? 0} story points hoàn thành
          </DialogDescription>
        </DialogHeader>

        {/* Quick Stats Pills in Modal */}
        {member && (
          <div className="grid grid-cols-3 gap-2.5 my-2">
            <div className="rounded-lg bg-muted/60 p-2.5 text-center border border-border">
              <div className="text-lg font-bold text-primary tabular-nums">
                {member.completedPoints}
              </div>
              <div className="text-[11px] text-muted-foreground">Điểm đã chốt</div>
            </div>
            <div className="rounded-lg bg-muted/60 p-2.5 text-center border border-border">
              <div className="text-lg font-bold text-foreground tabular-nums">
                {member.completedTasks}
              </div>
              <div className="text-[11px] text-muted-foreground">Nhiệm vụ hoàn thành</div>
            </div>
            <div className="rounded-lg bg-muted/60 p-2.5 text-center border border-border">
              <div className="text-lg font-bold text-amber-500 tabular-nums">
                {member.inProgressPoints}
              </div>
              <div className="text-[11px] text-muted-foreground">Điểm đang làm</div>
            </div>
          </div>
        )}

        {/* Search inside modal */}
        <div className="relative my-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            type="text"
            placeholder="Tìm theo mã nhiệm vụ hoặc tiêu đề..."
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Task list inside modal */}
        <div className="flex-1 overflow-y-auto min-h-48 divide-y divide-border border rounded-md">
          {modalTasks.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground italic">
              Không tìm thấy task nào phù hợp.
            </div>
          ) : (
            modalTasks.map((t) => {
              const isDone = t.statusCategory.toLowerCase() === "done";
              return (
                <div
                  key={t.jiraKey}
                  className="p-3 hover:bg-muted/40 transition-colors flex items-start justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/board?q=${t.jiraKey}`}
                        className="font-mono font-bold text-primary hover:underline"
                      >
                        {t.jiraKey}
                      </Link>
                      <Badge
                        variant={isDone ? "success" : "info"}
                        className="text-[10px] py-0 px-1.5 h-4.5"
                      >
                        {t.status}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4.5 text-muted-foreground">
                        {t.projectKey}
                      </Badge>
                    </div>
                    <p className="text-foreground font-medium line-clamp-2 leading-relaxed">
                      {t.summary}
                    </p>
                    {t.completedAt && (
                      <p className="text-[11px] text-muted-foreground">
                        Hoàn thành: {new Date(t.completedAt).toLocaleDateString("vi-VN")}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <Badge
                      variant="default"
                      className={cn(
                        "font-bold text-xs tabular-nums px-2 py-0.5",
                        isDone ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {t.points} pts
                    </Badge>
                    <Link
                      href={`/board?q=${t.jiraKey}`}
                      className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                    >
                      <span>Mở board</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
