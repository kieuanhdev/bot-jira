"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { boardKeys, meKeys } from "@/lib/query-keys";
import type { BoardBootstrap } from "@/lib/board/bootstrap";
import type { Project } from "../lib/board-types";

export function useBoardUserContext(initialBootstrap?: BoardBootstrap | null) {
  const { data: projects } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Project[] }>("/api/projects"),
    initialData: initialBootstrap?.projects,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const allProjects = useMemo(() => projects?.items ?? [], [projects?.items]);

  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () =>
      api<{ jiraName: string | null; jiraBaseUrl?: string; role?: string; canBoardTeam?: boolean }>("/api/me/status"),
    initialData: initialBootstrap?.meStatus,
    retry: 0,
  });
  const myName = meStatus?.jiraName ?? null;
  const jiraBaseUrl = meStatus?.jiraBaseUrl ?? "";
  const canUseTeamMode = Boolean(meStatus?.canBoardTeam);

  const {
    data: prefs,
    isError: prefsError,
    refetch: refetchPrefs,
  } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    initialData: initialBootstrap?.preferences,
  });

  const preferred = useMemo(() => prefs?.projects ?? [], [prefs?.projects]);
  const availableKeys = useMemo(() => prefs?.available ?? [], [prefs?.available]);

  return {
    allProjects,
    myName,
    jiraBaseUrl,
    canUseTeamMode,
    prefs,
    prefsError,
    refetchPrefs,
    preferred,
    availableKeys,
  };
}
