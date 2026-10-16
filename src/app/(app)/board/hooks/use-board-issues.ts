"use client";

import { useMemo } from "react";
import {
  useIssues,
  useMoreIssues,
  type BoardFilters,
  type IssueItem,
  type IssueSuccessResponse,
} from "@/hooks/use-issues";

interface UseBoardIssuesOptions {
  filters: BoardFilters;
  enabled: boolean;
  onLoadMoreError: (msg: string) => void;
}

export function useBoardIssues({
  filters,
  enabled,
  onLoadMoreError,
}: UseBoardIssuesOptions) {
  const {
    data,
    isLoading,
    isFetching,
    isError: issuesError,
    refetch: refetchIssues,
  } = useIssues(filters, { enabled });

  const issueData: IssueSuccessResponse | null =
    data && "items" in data ? (data as IssueSuccessResponse) : null;

  const {
    items: extraIssues,
    hasMore,
    loading: loadingMore,
    loadMore,
  } = useMoreIssues(filters, issueData, {
    onError: (e) => onLoadMoreError(`Couldn't load more tasks: ${e.message.slice(0, 80)}`),
  });

  const issues: IssueItem[] = useMemo(
    () => (issueData ? [...issueData.items, ...extraIssues] : [...extraIssues]),
    [issueData, extraIssues]
  );

  return {
    issues,
    issueData,
    isLoading,
    isFetching,
    issuesError,
    refetchIssues,
    hasMore,
    loadingMore,
    loadMore,
  };
}
