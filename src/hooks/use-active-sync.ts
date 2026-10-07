"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { syncKeys, issuesKeys, boardKeys, freshnessKeys, reportsKeys } from "@/lib/query-keys";
import type { ActiveJiraSyncResponse } from "@/app/api/sync/jira/active/route";

export function useActiveSync(specificProject?: string) {
  const qc = useQueryClient();
  const [justFinished, setJustFinished] = useState<string[]>([]);
  const prevSyncingRef = useRef<string[]>([]);

  const query = useQuery<ActiveJiraSyncResponse>({
    queryKey: syncKeys.active,
    queryFn: () => api<ActiveJiraSyncResponse>("/api/sync/jira/active"),
    refetchInterval: (queryState) => {
      const activeCount = queryState.state.data?.syncingProjects?.length ?? 0;
      return activeCount > 0 ? 2500 : 15000;
    },
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const rawSyncing = query.data?.syncingProjects;
  const syncingProjects = useMemo(() => rawSyncing ?? [], [rawSyncing]);
  const activeSyncs = query.data?.activeSyncs ?? [];

  useEffect(() => {
    const prev = prevSyncingRef.current;
    if (prev.length > 0) {
      // Find projects that were syncing previously but are no longer syncing
      const finished = prev.filter((p) => !syncingProjects.includes(p));
      if (finished.length > 0) {
        setJustFinished(finished);

        // Auto-refresh queries when sync completes
        void qc.invalidateQueries({ queryKey: issuesKeys.all });
        void qc.invalidateQueries({ queryKey: boardKeys.projects });
        void qc.invalidateQueries({ queryKey: freshnessKeys.all });
        void qc.invalidateQueries({ queryKey: reportsKeys.all });

        // Auto-clear justFinished after 3.5s
        const t = setTimeout(() => {
          setJustFinished([]);
        }, 3500);
        return () => clearTimeout(t);
      }
    }
    prevSyncingRef.current = syncingProjects;
  }, [syncingProjects, qc]);

  const isAnySyncing = syncingProjects.length > 0;
  const isTargetSyncing = specificProject
    ? syncingProjects.includes(specificProject.toUpperCase())
    : isAnySyncing;

  return {
    syncingProjects,
    activeSyncs,
    isAnySyncing,
    isTargetSyncing,
    justFinished,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
