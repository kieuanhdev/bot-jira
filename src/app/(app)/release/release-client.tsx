"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { releasesKeys, boardKeys } from "@/lib/query-keys";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Rocket,
  RefreshCw,
  Plus,
  Search,
  PackageOpen,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Archive,
  Layers,
  Loader2,
} from "lucide-react";
import { ReleaseSummaryCards } from "./release-summary-cards";
import { ReleaseCard, type ReleaseCardItem } from "./release-card";
import type { ReleaseSummary } from "@/lib/releases/release-summary";

export function ReleaseClient() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Create Release Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [createProject, setCreateProject] = useState("");
  const [createVersion, setCreateVersion] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canManage = can(session, "release.manage");
  const canPublish = can(session, "release.publish");

  // Query projects for filter dropdown
  const { data: projectsData } = useQuery<{ items: Array<{ key: string; openCount: number }> }>({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Array<{ key: string; openCount: number }> }>("/api/projects"),
  });

  // Query releases with summary
  const { data, isLoading, refetch, isRefetching } = useQuery<{
    summary: ReleaseSummary;
    items: ReleaseCardItem[];
  }>({
    queryKey: ["releases", selectedProject],
    queryFn: () => {
      const p = selectedProject !== "all" ? `?projectKey=${encodeURIComponent(selectedProject)}&includeArchived=true` : "?includeArchived=true";
      return api<{ summary: ReleaseSummary; items: ReleaseCardItem[] }>(`/api/releases${p}`);
    },
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

  // Combined Distinct projects list
  const projectList = useMemo(() => {
    const set = new Set<string>();
    (projectsData?.items ?? []).forEach((p) => set.add(p.key));
    releases.forEach((r) => {
      if (r.projectKey) set.add(r.projectKey);
    });
    return Array.from(set).sort();
  }, [projectsData, releases]);

  // Client-side filtering by KPI group and search query
  const filteredReleases = useMemo(() => {
    return releases.filter((r) => {
      // 1. KPI filter
      if (selectedFilter === "archived") {
        if (!r.archived) return false;
      } else {
        if (r.archived) return false;

        if (selectedFilter === "in_progress") {
          if (r.readiness !== "in_progress") return false;
        } else if (selectedFilter === "ready") {
          if (r.readiness !== "ready") return false;
        } else if (selectedFilter === "empty") {
          if (r.readiness !== "empty") return false;
        } else if (selectedFilter === "released") {
          if (r.readiness !== "released") return false;
        }
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesVersion = r.version.toLowerCase().includes(q);
        const matchesProject = r.projectKey.toLowerCase().includes(q);
        const matchesDesc = (r.description || "").toLowerCase().includes(q);
        const matchesTask = r.tasks.some(
          (t) => t.jiraKey.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q)
        );
        return matchesVersion || matchesProject || matchesDesc || matchesTask;
      }

      return true;
    });
  }, [releases, selectedFilter, searchQuery]);

  // Sync releases from Jira
  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const url =
        selectedProject !== "all"
          ? `/api/releases/sync?projectKey=${encodeURIComponent(selectedProject)}`
          : "/api/releases/sync";
      const res = await fetch(url, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setSyncMessage(`Lỗi đồng bộ: ${json.error || "Thất bại"}`);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["releases"] });
        await refetch();
        setSyncMessage(
          `Đã đồng bộ thành công ${json.result?.totalReleases ?? 0} phiên bản (${json.result?.tasksLinked ?? 0} task).`
        );
      }
    } catch (e) {
      setSyncMessage(`Lỗi mạng: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // Create Release handler
  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createVersion.trim() || !createProject) {
      setCreateError("Vui lòng nhập tên phiên bản và chọn dự án");
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey: createProject,
          version: createVersion.trim(),
          description: createDesc.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setCreateError(json.error || "Không thể tạo bản phát hành");
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["releases"] });
      await refetch();
      setCreateOpen(false);
      setCreateVersion("");
      setCreateDesc("");
    } catch (err) {
      setCreateError((err as Error).message || "Lỗi mạng khi tạo bản phát hành");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Rocket className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Quản lý phát hành
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Theo dõi Fix Version Jira và trạng thái merge Git từ Bitbucket
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons (only visible if manager) */}
        {canManage && (
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing || isRefetching}
              className="gap-1.5 cursor-pointer text-xs"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing || isRefetching ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Đồng bộ từ Jira
            </Button>

            <Button
              size="sm"
              onClick={() => {
                setCreateProject(selectedProject !== "all" ? selectedProject : projectList[0] || "");
                setCreateOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 cursor-pointer text-xs"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo bản phát hành
            </Button>
          </div>
        )}
      </div>

      {/* Sync message banner */}
      {syncMessage && (
        <div className="p-3 rounded-lg bg-muted text-xs text-foreground border border-border flex items-center justify-between">
          <span>{syncMessage}</span>
          <button
            type="button"
            onClick={() => setSyncMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      )}

      {/* KPI Summary Cards */}
      <ReleaseSummaryCards
        summary={summary}
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
      />

      {/* Filters & Search row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Project selector */}
          <div className="w-48">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Chọn dự án" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Tất cả dự án
                </SelectItem>
                {projectList.map((key) => (
                  <SelectItem key={key} value={key} className="text-xs">
                    Dự án: {key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick filter pills */}
          <div className="hidden lg:flex items-center gap-1 bg-muted/30 p-0.5 rounded-lg border border-border text-xs">
            <button
              type="button"
              onClick={() => setSelectedFilter("all")}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                selectedFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tất cả
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("in_progress")}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                selectedFilter === "in_progress"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Đang thực hiện
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("ready")}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                selectedFilter === "ready"
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sẵn sàng
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("empty")}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                selectedFilter === "empty"
                  ? "bg-muted text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Chưa có task
            </button>
            <button
              type="button"
              onClick={() => setSelectedFilter("released")}
              className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                selectedFilter === "released"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Đã phát hành
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Tìm theo tên, project, task..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs"
          />
        </div>
      </div>

      {/* Release List */}
      <div className="space-y-3.5">
        {isLoading ? (
          // Loading Skeletons
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="p-5 rounded-xl border border-border bg-card space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-6 w-24" />
                </div>
                <Skeleton className="h-8 w-28" />
              </div>
              <Skeleton className="h-12 w-full rounded-lg" />
              <div className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          ))
        ) : filteredReleases.length === 0 ? (
          // Empty state
          <div className="py-16 text-center rounded-xl border border-dashed border-border bg-card p-8 flex flex-col items-center justify-center">
            <div className="p-4 rounded-full bg-muted/60 mb-3">
              <PackageOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="text-base font-semibold text-foreground">
              Không tìm thấy bản phát hành nào
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {searchQuery
                ? "Không có phiên bản nào khớp với từ khóa tìm kiếm của bạn."
                : "Chưa có Fix Version nào trong phạm vi đã chọn hoặc cần đồng bộ từ Jira."}
            </p>
            {canManage && !searchQuery && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="mt-4 gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Đồng bộ từ Jira ngay
              </Button>
            )}
          </div>
        ) : (
          filteredReleases.map((release) => (
            <ReleaseCard
              key={release.id}
              release={release}
              canManage={canManage}
              canPublish={canPublish}
              onRefresh={refetch}
            />
          ))
        )}
      </div>

      {/* Create Release Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <form onSubmit={handleCreateRelease}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-foreground">
                <Plus className="h-5 w-5 text-teal-500" aria-hidden="true" />
                Tạo bản phát hành mới
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                Tạo Fix Version trên Jira và liên kết các task thuộc phiên bản này.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-project" className="text-xs font-semibold">
                  Dự án Jira <span className="text-destructive">*</span>
                </Label>
                <Select value={createProject} onValueChange={setCreateProject}>
                  <SelectTrigger id="create-project" className="text-xs">
                    <SelectValue placeholder="Chọn dự án" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectList.map((key) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-version" className="text-xs font-semibold">
                  Tên phiên bản (Fix Version) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="create-version"
                  placeholder="Ví dụ: v1.0.0 hoặc Release-2026-10"
                  value={createVersion}
                  onChange={(e) => setCreateVersion(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="create-desc" className="text-xs font-semibold">
                  Mô tả (tùy chọn)
                </Label>
                <Input
                  id="create-desc"
                  placeholder="Mục tiêu hoặc nội dung chính của đợt phát hành"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="text-xs"
                />
              </div>

              {createError && (
                <div className="p-2.5 rounded bg-destructive/10 text-destructive text-xs border border-destructive/20">
                  {createError}
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={creating}
                className="bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
              >
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Tạo phiên bản
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
