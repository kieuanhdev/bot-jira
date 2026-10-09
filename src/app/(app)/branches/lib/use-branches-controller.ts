"use client";

import { useState, useTransition, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { branchesKeys } from "@/lib/query-keys";
import { useBranchSync, useBranchLink } from "@/hooks/use-branches";
import {
  type BranchFilterState,
  type BranchesQueryResult,
  type BranchRowItem,
  type TaskDeliveryQueryResult,
  type ReviewSuggestionItem,
} from "../branch-types";
import {
  parseBranchFilters,
  buildBranchFilterParams,
  buildTaskQueryUrl,
  buildBranchQueryUrl,
  toBranchRowItem,
} from "./branches-filter-model";

export function useBranchesController() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [toast, setToast] = useState<string | null>(null);
  const [selectedBranchForDrawer, setSelectedBranchForDrawer] = useState<BranchRowItem | null>(null);
  const [selectedBranchForLink, setSelectedBranchForLink] = useState<BranchRowItem | null>(null);
  const [attachTask, setAttachTask] = useState<{ jiraKey: string; summary: string } | null>(null);
  const [prTask, setPrTask] = useState<{ jiraKey: string; summary: string } | null>(null);
  const [bulkLinkIds, setBulkLinkIds] = useState<string[] | undefined>(undefined);

  const syncMutation = useBranchSync();
  const linkMutation = useBranchLink();

  const toBranchRow = useCallback((item: {
    id: string;
    repo: string;
    branch: string;
    suggestedJiraKey?: string | null;
    jiraKey?: string | null;
    prTitle?: string | null;
    prUrl?: string | null;
  }): BranchRowItem => toBranchRowItem(item), []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const filters: BranchFilterState = useMemo(() => {
    return parseBranchFilters(searchParams);
  }, [searchParams]);

  const updateFilters = useCallback(
    (patch: Partial<BranchFilterState>) => {
      const next = { ...filters, ...patch };
      const params = buildBranchFilterParams(next);
      const queryStr = params.toString();
      startTransition(() => {
        router.replace(`${pathname}${queryStr ? `?${queryStr}` : ""}`, { scroll: false });
      });
    },
    [filters, pathname, router]
  );

  const resetFilters = useCallback(() => {
    startTransition(() => {
      router.replace(pathname, { scroll: false });
    });
  }, [pathname, router]);

  const taskQueryUrl = useMemo(() => buildTaskQueryUrl(filters), [filters]);
  const branchQueryUrl = useMemo(() => buildBranchQueryUrl(filters), [filters]);
  const isTechnicalView = filters.view === "all-branches";

  const taskQueryResult = useQuery<TaskDeliveryQueryResult>({
    queryKey: branchesKeys.tasks(filters),
    queryFn: () => api<TaskDeliveryQueryResult>(taskQueryUrl),
    enabled: !isTechnicalView,
    placeholderData: (prev) => prev,
    refetchInterval: 60000,
  });

  const branchQueryResult = useQuery<BranchesQueryResult>({
    queryKey: branchesKeys.list(filters),
    queryFn: () => api<BranchesQueryResult>(branchQueryUrl),
    enabled: isTechnicalView,
    placeholderData: (prev) => prev,
    refetchInterval: 60000,
  });

  const facetQueryResult = useQuery<BranchesQueryResult>({
    queryKey: branchesKeys.facets,
    queryFn: () => api<BranchesQueryResult>("/api/branches?pageSize=1"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: meStatus } = useQuery({
    queryKey: ["me-status"],
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string; bitbucketBaseUrl?: string }>("/api/me/status"),
    staleTime: 5 * 60 * 1000,
  });

  const bitbucketBaseUrl =
    branchQueryResult.data?.bitbucketBaseUrl ??
    taskQueryResult.data?.bitbucketBaseUrl ??
    meStatus?.bitbucketBaseUrl ??
    null;

  const jiraBaseUrl =
    branchQueryResult.data?.jiraBaseUrl ??
    taskQueryResult.data?.jiraBaseUrl ??
    meStatus?.jiraBaseUrl ??
    null;

  const isLoading = isTechnicalView ? branchQueryResult.isLoading : taskQueryResult.isLoading;
  const isError = isTechnicalView ? branchQueryResult.isError : taskQueryResult.error;
  const error = isTechnicalView ? branchQueryResult.error : taskQueryResult.error;
  const refetch = isTechnicalView ? branchQueryResult.refetch : taskQueryResult.refetch;

  const freshness = isTechnicalView
    ? branchQueryResult.data?.freshness
    : facetQueryResult.data?.freshness;

  const projectOptions = facetQueryResult.data?.facets.projects ?? [];
  const repoOptions = facetQueryResult.data?.facets.repositories ?? [];

  const handleSyncNow = () => {
    syncMutation.mutate(undefined, {
      onSuccess: (data) =>
        showToast(data.queued ? "Đã đưa tác vụ đồng bộ vào hàng đợi nền" : "Đồng bộ nhánh thành công"),
      onError: (err) => showToast(`Đồng bộ thất bại: ${getErrorMessage(err)}`),
    });
  };

  const handleConfirmSuggestion = async (branchId: string) => {
    try {
      await linkMutation.mutateAsync({ branchId, body: { action: "confirm" } });
      showToast("Đã xác nhận liên kết Jira task thành công");
    } catch (err) {
      showToast(getErrorMessage(err));
    }
  };

  const handleConfirmAll = async () => {
    try {
      await linkMutation.mutateAsync({ branchId: "all", body: { action: "confirm_all" } });
      showToast("Đã gắn tất cả các nhánh gợi ý vào hệ thống thành công");
    } catch (err) {
      showToast(getErrorMessage(err));
    }
  };

  const handleRejectSuggestion = async (branchId: string) => {
    try {
      await linkMutation.mutateAsync({ branchId, body: { action: "reject" } });
      showToast("Đã từ chối gợi ý liên kết");
    } catch (err) {
      showToast(getErrorMessage(err));
    }
  };

  const handleUnlinkBranch = (branchId: string) => {
    linkMutation.mutate(
      { branchId, body: { action: "unlink" } },
      {
        onSuccess: () => {
          showToast("Đã hủy liên kết Jira task");
          setSelectedBranchForDrawer(null);
        },
        onError: (err) => showToast(getErrorMessage(err)),
      }
    );
  };

  const handleTaskLinkSuccess = (msg: string) => {
    showToast(msg);
    setAttachTask(null);
  };

  const handleBulkConfirm = (items: ReviewSuggestionItem[]) => {
    setBulkLinkIds(items.map((i) => i.id));
    if (items[0]) {
      setSelectedBranchForLink(toBranchRow(items[0]));
    }
  };

  const handleBulkReject = async (items: ReviewSuggestionItem[]) => {
    try {
      await Promise.all(
        items.map((i) => linkMutation.mutateAsync({ branchId: i.id, body: { action: "reject" } }))
      );
      showToast(`Đã từ chối ${items.length} gợi ý liên kết`);
    } catch (err) {
      showToast(`Lỗi khi từ chối hàng loạt: ${getErrorMessage(err)}`);
    }
  };

  return {
    toast,
    filters,
    updateFilters,
    resetFilters,
    isTechnicalView,
    isLoading,
    isError,
    error,
    refetch,
    freshness,
    projectOptions,
    repoOptions,
    bitbucketBaseUrl,
    jiraBaseUrl,
    syncMutation,
    branchQueryResult,
    taskQueryResult,
    selectedBranchForDrawer,
    setSelectedBranchForDrawer,
    selectedBranchForLink,
    setSelectedBranchForLink,
    attachTask,
    setAttachTask,
    prTask,
    setPrTask,
    bulkLinkIds,
    setBulkLinkIds,
    toBranchRow,
    handleSyncNow,
    handleConfirmSuggestion,
    handleConfirmAll,
    handleRejectSuggestion,
    handleUnlinkBranch,
    handleTaskLinkSuccess,
    handleBulkConfirm,
    handleBulkReject,
    showToast,
  };
}
