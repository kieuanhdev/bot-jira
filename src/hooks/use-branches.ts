"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

type SyncResult = { queued?: boolean };
type LinkBody =
  | { action: "confirm" | "reject" | "unlink" }
  | { jiraKey: string | null; reason?: string };

export function useBranchSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SyncResult>("/api/branches/sync", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branches-tasks"] });
    },
  });
}

export function useBranchLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ branchId, body }: { branchId: string; body: LinkBody }) =>
      api(`/api/branches/${branchId}/link`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["branches"] });
      qc.invalidateQueries({ queryKey: ["branches-tasks"] });
    },
  });
}
