import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import type { BoardSyncState } from "./lib/board-types";

/** "Đồng bộ Jira" button reflecting the sync state of the selected project. */
export function BoardSyncButton({
  boardSync,
  selectedProject,
  isCurrentProjectSyncing,
  isFetching,
  onSync,
}: {
  boardSync: { projectKey: string; state: BoardSyncState };
  selectedProject: string;
  isCurrentProjectSyncing: boolean;
  isFetching: boolean;
  onSync: () => void;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSync}
      disabled={isCurrentProjectSyncing}
      className="gap-1.5 cursor-pointer"
      title={
        isCurrentProjectSyncing
          ? boardSync.state === "enqueueing"
            ? `Đang gửi yêu cầu đồng bộ ${selectedProject}…`
            : boardSync.state === "running"
            ? `Đang đồng bộ Jira cho ${selectedProject}…`
            : `${selectedProject} đang chờ đồng bộ.`
          : `Đồng bộ Jira cho ${selectedProject}`
      }
    >
      <RefreshCw
        className={cn(
          "h-4 w-4",
          (isCurrentProjectSyncing || isFetching) && "animate-spin motion-reduce:animate-none"
        )}
      />
      {boardSync.projectKey === selectedProject && boardSync.state === "enqueueing"
        ? "Đang gửi…"
        : boardSync.projectKey === selectedProject && boardSync.state === "queued"
        ? "Đang chờ…"
        : boardSync.projectKey === selectedProject && boardSync.state === "running"
        ? "Đang đồng bộ…"
        : boardSync.projectKey === selectedProject && boardSync.state === "succeeded"
        ? "Đã đồng bộ"
        : "Đồng bộ Jira"}
    </Button>
  );
}
