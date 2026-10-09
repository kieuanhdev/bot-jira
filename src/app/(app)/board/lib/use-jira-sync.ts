"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useActiveSync } from "@/hooks/use-active-sync";
import { api } from "@/lib/api-client";
import { boardKeys, freshnessKeys, issuesTouchingProjects } from "@/lib/query-keys";
import { isBoardSyncBusy, resolveBoardSyncPoll, type BoardSyncStatusResponse } from "./board-sync-model";
import type { BoardSyncState } from "./board-types";

/** Queue a Jira sync for the selected project and poll its status until it settles. */
export function useJiraSync(selectedProject: string, setToast: (message: string | null) => void) {
  const qc = useQueryClient();
  const { isTargetSyncing } = useActiveSync(selectedProject);
  const [boardSync, setBoardSync] = useState<{
    projectKey: string;
    state: BoardSyncState;
    acceptedAt?: string;
    pollStartMs?: number;
  }>({ projectKey: "", state: "idle" });

  const effectiveBoardSync = useMemo(() => {
    if (boardSync.state !== "idle") return boardSync;
    if (isTargetSyncing && selectedProject) {
      return { projectKey: selectedProject, state: "running" as BoardSyncState };
    }
    return boardSync;
  }, [boardSync, isTargetSyncing, selectedProject]);

  const isCurrentProjectSyncing =
    (effectiveBoardSync.projectKey === selectedProject && isBoardSyncBusy(effectiveBoardSync.state)) ||
    isTargetSyncing;

  useEffect(() => {
    if (boardSync.state !== "queued" && boardSync.state !== "running") return;
    const { projectKey, acceptedAt, pollStartMs = Date.now() } = boardSync;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    async function checkStatus() {
      const elapsed = Date.now() - pollStartMs;
      if (elapsed > 60_000) {
        if (!cancelled) {
          setToast("Chưa nhận được trạng thái đồng bộ. Hãy kiểm tra worker hoặc thử lại.");
          setBoardSync({ projectKey: "", state: "idle" });
        }
        return;
      }

      try {
        const queryParams = new URLSearchParams({ projectKey });
        if (acceptedAt) queryParams.set("since", acceptedAt);
        const response = await api<BoardSyncStatusResponse>(
          `/api/sync/jira/status?${queryParams.toString()}`
        );
        if (cancelled) return;

        const outcome = resolveBoardSyncPoll(response, elapsed);
        if (outcome.kind === "succeeded") {
          void qc.invalidateQueries({ predicate: issuesTouchingProjects([projectKey]) });
          void qc.invalidateQueries({ queryKey: boardKeys.projects });
          void qc.invalidateQueries({ queryKey: freshnessKeys.all });
          setToast(`Đã đồng bộ ${projectKey}.`);
          setBoardSync({ projectKey, state: "succeeded" });
          setTimeout(() => {
            if (!cancelled) setBoardSync({ projectKey: "", state: "idle" });
          }, 2000);
          return;
        }
        if (outcome.kind === "failed") {
          setToast(`Không thể đồng bộ ${projectKey}: ${outcome.error}`);
          setBoardSync({ projectKey, state: "failed" });
          setTimeout(() => {
            if (!cancelled) setBoardSync({ projectKey: "", state: "idle" });
          }, 3500);
          return;
        }
        if (outcome.state === "running" && boardSync.state !== "running") {
          setBoardSync((previous) =>
            previous.projectKey === projectKey ? { ...previous, state: "running" } : previous
          );
        }
        timer = setTimeout(checkStatus, outcome.delayMs);
      } catch {
        if (!cancelled) timer = setTimeout(checkStatus, 2500);
      }
    }

    timer = setTimeout(checkStatus, 800);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [boardSync, qc, setToast]);

  async function syncJira() {
    if (!selectedProject || isCurrentProjectSyncing) return;
    const targetProject = selectedProject;
    setBoardSync({ projectKey: targetProject, state: "enqueueing" });
    setToast(`Đang gửi yêu cầu đồng bộ ${targetProject}…`);
    try {
      const response = await api<{ state: "queued" | "already_running"; acceptedAt: string }>(
        "/api/sync/jira",
        { method: "POST", body: { projectKey: targetProject } }
      );
      setToast(
        response.state === "already_running"
          ? `${targetProject} đang được đồng bộ. Dữ liệu sẽ tự cập nhật khi hoàn tất.`
          : `${targetProject} đang chờ đồng bộ.`
      );
      setBoardSync({
        projectKey: targetProject,
        state: "queued",
        acceptedAt: response.acceptedAt || new Date().toISOString(),
        pollStartMs: Date.now(),
      });
    } catch (error) {
      setToast(`Không thể đồng bộ ${targetProject}: ${(error as Error).message.slice(0, 100)}`);
      setBoardSync({ projectKey: "", state: "idle" });
    }
  }

  return { boardSync: effectiveBoardSync, isCurrentProjectSyncing, syncJira };
}
