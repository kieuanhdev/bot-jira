"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, getErrorMessage } from "@/lib/api-client";
import { releasesKeys, boardKeys, meKeys } from "@/lib/query-keys";
import { useReleaseSync, useCreateRelease } from "@/hooks/use-releases";
import { can } from "@/lib/permissions";
import type { ReleaseSummary } from "@/lib/releases/release-summary";
import type { ReleaseCardItem } from "../release-card";
import { extractDistinctProjects, filterReleases } from "./release-filter-model";

export function useReleaseController() {
  const { data: session } = useSession();

  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [syncMessage, setSyncMessage] = useState<{ tone: "success" | "destructive"; text: string } | null>(null);

  // Create Release Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createProject, setCreateProject] = useState("");
  const [createVersion, setCreateVersion] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const syncMutation = useReleaseSync();
  const createMutation = useCreateRelease();

  const canManage = can(session, "release.manage");
  const canPublish = can(session, "release.publish");

  // Query projects for filter dropdown
  const { data: projectsData } = useQuery<{ items: Array<{ key: string; openCount: number; selected?: boolean }> }>({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Array<{ key: string; openCount: number; selected?: boolean }> }>("/api/projects"),
  });

  // Query Jira base URL and me status for deep links
  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    staleTime: 60_000,
  });

  // Query releases with summary and sync metadata
  const { data, isLoading, refetch, isRefetching } = useQuery<{
    summary: ReleaseSummary;
    items: ReleaseCardItem[];
    jiraBaseUrl?: string | null;
    sync?: {
      state: "never_synced" | "synced" | "empty" | "forbidden" | "auth_required" | "failed";
      lastAttemptAt: string | null;
      lastSuccessAt: string | null;
      lastErrorCode: string | null;
      lastError?: string | null;
      stale: boolean;
    };
  }>({
    queryKey: ["releases", selectedProject],
    queryFn: () => {
      const p = selectedProject !== "all" ? `?projectKey=${encodeURIComponent(selectedProject)}&includeArchived=true` : "?includeArchived=true";
      return api<{
        summary: ReleaseSummary;
        items: ReleaseCardItem[];
        jiraBaseUrl?: string | null;
        sync?: {
          state: "never_synced" | "synced" | "empty" | "forbidden" | "auth_required" | "failed";
          lastAttemptAt: string | null;
          lastSuccessAt: string | null;
          lastErrorCode: string | null;
          lastError?: string | null;
          stale: boolean;
        };
      }>(`/api/releases${p}`);
    },
  });

  const jiraBaseUrl = data?.jiraBaseUrl || meStatus?.jiraBaseUrl || "";
  const syncMeta = data?.sync;
  const isSyncPending = syncMutation.isPending;

  // Query Jira permissions for creating a version in the selected project
  const {
    data: permissionData,
    isLoading: isPermissionLoading,
    isFetching: isPermissionFetching,
    error: permissionError,
    refetch: refetchPermission,
  } = useQuery<
    { projectKey: string; hasToken: boolean; canCreateVersion: boolean; reason?: string },
    ApiError
  >({
    queryKey: releasesKeys.permissions(selectedProject),
    queryFn: () =>
      api<{ projectKey: string; hasToken: boolean; canCreateVersion: boolean; reason?: string }>(
        `/api/projects/${encodeURIComponent(selectedProject)}/release-permissions`
      ),
    enabled: selectedProject !== "all",
    staleTime: 60_000,
  });

  const summary = data?.summary ?? {
    totalActive: 0,
    inProgress: 0,
    ready: 0,
    empty: 0,
    released: 0,
    archived: 0,
  };

  const releases = useMemo(() => data?.items ?? [], [data]);

  const projectList = useMemo(() => {
    return extractDistinctProjects(projectsData?.items, releases);
  }, [projectsData, releases]);

  const filteredReleases = useMemo(() => {
    return filterReleases(releases, selectedFilter, searchQuery);
  }, [releases, selectedFilter, searchQuery]);

  // Sync releases from Jira
  const handleSync = () => {
    setSyncMessage(null);
    const targetProject = selectedProject !== "all" ? selectedProject : undefined;
    syncMutation.mutate(targetProject, {
      onSuccess: (res) => {
        const prjResult = targetProject ? res.result?.projects?.find((p) => p.projectKey === targetProject) : undefined;
        if (prjResult?.state === "empty") {
          setSyncMessage({
            tone: "success",
            text: `Đồng bộ hoàn tất: Dự án ${targetProject} chưa có Fix Version nào trên Jira.`,
          });
        } else {
          setSyncMessage({
            tone: "success",
            text: `Đã đồng bộ thành công ${res.result?.totalReleases ?? 0} phiên bản (${res.result?.tasksLinked ?? 0} task).`,
          });
        }
        setTimeout(() => setSyncMessage(null), 5000);
      },
      onError: (err) => {
        setSyncMessage({ tone: "destructive", text: getErrorMessage(err, "Lỗi đồng bộ") });
        setTimeout(() => setSyncMessage(null), 5000);
      },
    });
  };

  // Create Release handler
  const handleCreateRelease = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createVersion.trim() || !createProject) {
      setCreateError("Vui lòng nhập tên phiên bản và chọn dự án");
      return;
    }
    setCreateError(null);
    createMutation.mutate(
      {
        projectKey: createProject,
        version: createVersion.trim(),
        description: createDesc.trim() || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false);
          setCreateVersion("");
          setCreateDesc("");
        },
        onError: (err) => {
          setCreateError(getErrorMessage(err, "Không thể tạo bản phát hành"));
        },
      }
    );
  };

  return {
    canManage,
    canPublish,
    selectedProject,
    setSelectedProject,
    selectedFilter,
    setSelectedFilter,
    searchQuery,
    setSearchQuery,
    syncMessage,
    setSyncMessage,
    createOpen,
    setCreateOpen,
    createProject,
    setCreateProject,
    createVersion,
    setCreateVersion,
    createDesc,
    setCreateDesc,
    createError,
    setCreateError,
    syncMutation,
    createMutation,
    data,
    isLoading,
    refetch,
    isRefetching,
    jiraBaseUrl,
    syncMeta,
    isSyncPending,
    permissionData,
    isPermissionLoading,
    isPermissionFetching,
    permissionError,
    refetchPermission,
    summary,
    projectList,
    filteredReleases,
    handleSync,
    handleCreateRelease,
  };
}
