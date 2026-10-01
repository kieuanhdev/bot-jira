"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api-client";
import { releasesKeys } from "@/lib/query-keys";

// --- Types ---

type SyncResult = { result?: { totalReleases: number; tasksLinked: number } };
type CreateReleaseBody = { projectKey: string; version: string; description?: string };

export type ReleaseBlocker = {
  jiraKey: string;
  summary: string;
  code: string;
  prUrl?: string | null;
};

export class ReleasePublishError extends ApiError {
  readonly blockers: ReleaseBlocker[];
  constructor(message: string, status: number, blockers: ReleaseBlocker[] = []) {
    super(message, status);
    this.name = "ReleasePublishError";
    this.blockers = blockers;
  }
}

// --- Hooks ---

export function useReleaseSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectKey?: string) => {
      const url = projectKey
        ? `/api/releases/sync?projectKey=${encodeURIComponent(projectKey)}`
        : "/api/releases/sync";
      return api<SyncResult>(url, { method: "POST" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}

export function useCreateRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReleaseBody) =>
      api("/api/releases", { method: "POST", body }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) {
        qc.invalidateQueries({ queryKey: releasesKeys.permissionsAll() });
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["releases"] });
      qc.invalidateQueries({ queryKey: releasesKeys.permissions(variables.projectKey) });
    },
  });
}

export function useSaveReleaseNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      api(`/api/releases/${id}`, { method: "PATCH", body: { notes } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}

export function usePublishRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: string) => {
      const res = await fetch(`/api/releases/${releaseId}/release`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          throw new ReleasePublishError(
            data.error === "EMPTY_RELEASE"
              ? "Phiên bản chưa có task nào được gán trên Jira."
              : "Chưa thể phát hành do còn task chưa hoàn thành hoặc chưa merge.",
            409,
            data.blockers || []
          );
        }
        if (res.status === 428) {
          throw new ReleasePublishError(
            data.error || "Bạn cần cấu hình token Jira cá nhân trong Cài đặt.",
            428
          );
        }
        throw new ApiError(
          data.detail || data.error || "Không thể phát hành bản này trên Jira.",
          res.status
        );
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
}
