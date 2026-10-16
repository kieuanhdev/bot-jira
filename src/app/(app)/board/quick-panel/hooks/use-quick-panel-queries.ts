"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { getJiraIssueUrl } from "@/lib/utils";
import {
  issuesKeys,
  meKeys,
  transitionsKeys,
  branchesForKeys,
  watchKeys,
  boardKeys,
} from "@/lib/query-keys";
import type { IssueItem } from "@/hooks/use-issues";
import { issueCachedDetailQuery, issueDetailQuery } from "../../lib/issue-detail-queries";

export function useQuickPanelQueries(issue: IssueItem, jiraBaseUrl: string) {
  const qc = useQueryClient();
  const { data: me } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string; bitbucketBaseUrl?: string }>("/api/me/status"),
    staleTime: 60_000,
  });

  const { data: detail, isPending: detailLoading } = useQuery({
    ...issueDetailQuery(issue.jiraKey),
    retry: 1,
  });

  const { data: cachedDetail } = useQuery({
    ...issueCachedDetailQuery(issue.jiraKey),
    retry: 0,
  });

  const { data: transitions } = useQuery({
    queryKey: transitionsKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ transitions: { id: string; to?: { name?: string } | string }[] }>(
        `/api/issues/${issue.jiraKey}/transitions`
      ),
    retry: 1,
  });

  const { data: branchesData, refetch: refetchBranches } = useQuery({
    queryKey: branchesForKeys.forIssue(issue.jiraKey),
    queryFn: () =>
      api<{ items: { repo: string; branch: string; prUrl?: string | null }[]; bitbucketBaseUrl?: string | null }>(
        `/api/issues/${issue.jiraKey}/branches`
      ),
    staleTime: 15_000,
  });

  const bitbucketBaseUrl = branchesData?.bitbucketBaseUrl || me?.bitbucketBaseUrl || "";
  const jiraUrl = getJiraIssueUrl(jiraBaseUrl || me?.jiraBaseUrl, issue.jiraKey);

  const { data: isWatching } = useQuery({
    queryKey: watchKeys.all,
    queryFn: () => api<{ items: { jiraKey: string }[] }>("/api/watch"),
    select: (d) => d.items.some((w) => w.jiraKey === issue.jiraKey),
    staleTime: 30_000,
    retry: 1,
  });

  const [watchOverride, setWatchOverride] = useState<boolean | null>(null);
  const watched = watchOverride ?? Boolean(isWatching);

  async function toggleWatch() {
    const next = !watched;
    setWatchOverride(next);
    try {
      const res = await api<{ watching: boolean }>(`/api/issues/${issue.jiraKey}/watch`, {
        method: "POST",
        body: {},
      });
      setWatchOverride(res.watching);
      qc.invalidateQueries({ queryKey: watchKeys.all });
    } catch {
      setWatchOverride(!next);
    }
  }

  const { data: projectVersions } = useQuery({
    queryKey: issuesKeys.versions(issue.jiraKey),
    queryFn: () => api<{ items: { id: string; name: string }[] }>(`/api/issues/${issue.jiraKey}/versions`),
    staleTime: 60_000,
  });

  const { data: projectsData } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () =>
      api<{
        items: Array<{
          key: string;
          features?: Record<string, boolean>;
          syncEnabled?: boolean;
        }>;
      }>("/api/projects"),
    staleTime: 60_000,
  });

  const issueProjectKey = (issue.projectKey || issue.jiraKey.split("-")[0]).toUpperCase();
  const currentProject = projectsData?.items?.find((p) => p.key === issueProjectKey);
  const commentsDisabled = currentProject?.features?.comments === false;

  return {
    me,
    detail,
    cachedDetail,
    detailLoading,
    transitions,
    branchesData,
    refetchBranches,
    bitbucketBaseUrl,
    jiraUrl,
    isWatching,
    projectVersions,
    commentsDisabled,
    watched,
    toggleWatch,
  };
}
