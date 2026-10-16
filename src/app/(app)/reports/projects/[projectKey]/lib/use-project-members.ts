"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { reportsKeys } from "@/lib/query-keys";
import { queryPolicy } from "@/lib/query-policy";
import type { ProjectMembersResponse } from "@/lib/reports/types";

export interface UseProjectMembersOptions {
  enabled?: boolean;
}

/**
 * Deduplicated React Query hook for project members report.
 * Shared across project-report-client, members-tab, and tasks-tab.
 */
export function useProjectMembers(
  projectKey: string,
  params: Record<string, string>,
  options?: UseProjectMembersOptions
) {
  return useQuery<ProjectMembersResponse>({
    queryKey: reportsKeys.members(projectKey, params),
    queryFn: () => {
      const sp = new URLSearchParams(params);
      return api<ProjectMembersResponse>(
        `/api/reports/projects/${projectKey}/members?${sp.toString()}`
      );
    },
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: queryPolicy.reports.members.staleTime,
    gcTime: queryPolicy.reports.members.gcTime,
  });
}
