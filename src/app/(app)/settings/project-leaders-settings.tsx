"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldAlert, ShieldCheck, Save, Check } from "lucide-react";
import { SearchField } from "@/components/shared/search-field";
import { EmptyState } from "@/components/shared/empty-state";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { boardKeys, projectsKeys, settingsKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import type { User } from "./lib/settings-model";

type LeaderCandidate = {
  id: string;
  displayName: string;
  email?: string | null;
  jiraUsername?: string | null;
};

type ProjectLeader = {
  id: string;
  displayName: string;
  email: string | null;
  jiraUsername: string | null;
  role: string;
};

type ProjectMembersResponse = {
  projectKey: string;
  leaders: ProjectLeader[];
  canManage: boolean;
};

export function ProjectLeadersSettings({
  users,
  isAdmin,
}: {
  users: User[];
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [draftState, setDraftState] = useState<{ project: string; ids: string[] } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: projectsData, isLoading: isProjectsLoading } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Array<{ key: string; name: string }> }>("/api/projects"),
  });

  const effectiveProject = selectedProject || projectsData?.items[0]?.key || "";
  const queryKey = projectsKeys.members(effectiveProject);

  const { data: membersData, isLoading: isMembersLoading } = useQuery({
    queryKey,
    enabled: Boolean(effectiveProject),
    queryFn: () =>
      api<ProjectMembersResponse>(`/api/projects/${encodeURIComponent(effectiveProject)}/members`),
  });

  const serverLeaderIds = useMemo(
    () => membersData?.leaders.map((u) => u.id) ?? [],
    [membersData?.leaders]
  );

  const selectedLeaderIds =
    draftState?.project === effectiveProject ? draftState.ids : serverLeaderIds;
  const isDirty = draftState?.project === effectiveProject;

  const saveMutation = useMutation({
    mutationFn: (leaderUserIds: string[]) =>
      api(`/api/projects/${encodeURIComponent(effectiveProject)}/members`, {
        method: "PUT",
        body: { leaderUserIds },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setDraftState(null);
      setStatusMessage("Đã cập nhật danh sách Leader thành công.");
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra khi lưu.";
      setStatusMessage(`Lỗi: ${msg}`);
    },
  });

  const canManage = membersData?.canManage ?? isAdmin;

  const { data: candidatesData } = useQuery({
    queryKey: settingsKeys.leaderCandidates,
    enabled: !isAdmin && canManage,
    queryFn: () =>
      api<{ users: LeaderCandidate[] }>("/api/projects/leader-candidates"),
  });

  const toggleLeader = (userId: string) => {
    if (!canManage) return;
    const current = selectedLeaderIds;
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    setDraftState({ project: effectiveProject, ids: next });
  };

  const filteredUsers = useMemo(() => {
    const candidateUsers: LeaderCandidate[] = isAdmin
      ? users
      : candidatesData?.users ?? [];
    if (!searchQuery.trim()) return candidateUsers;
    const q = searchQuery.toLowerCase().trim();
    return candidateUsers.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.jiraUsername && u.jiraUsername.toLowerCase().includes(q))
    );
  }, [isAdmin, users, candidatesData?.users, searchQuery]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle>Leader theo dự án</CardTitle>
        </div>
        <CardDescription>
          Chỉ định các Leader chịu trách nhiệm cho từng dự án. Khi PR được merge bởi người không phải Leader, hệ thống sẽ gửi cảnh báo tức thì cho các Leader của dự án đó.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Project Selector */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Dự án:</span>
            {isProjectsLoading ? (
              <Skeleton className="h-9 w-60" />
            ) : (
              <Select
                value={effectiveProject}
                onValueChange={(val) => {
                  setSelectedProject(val);
                  setDraftState(null);
                }}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Chọn dự án" />
                </SelectTrigger>
                <SelectContent>
                  {projectsData?.items.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.name} ({item.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {canManage && (
            <div className="flex items-center gap-2">
              <Button
                onClick={() => saveMutation.mutate(selectedLeaderIds)}
                disabled={!effectiveProject || saveMutation.isPending || !isDirty}
                size="sm"
                className="cursor-pointer"
              >
                <Save className="h-4 w-4" aria-hidden />
                {saveMutation.isPending ? "Đang lưu…" : "Lưu thay đổi"}
              </Button>
            </div>
          )}
        </div>

        {statusMessage && (
          <div
            className={cn(
              "rounded-md p-3 text-xs border",
              statusMessage.startsWith("Lỗi")
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-success/10 text-success border-success/30"
            )}
          >
            {statusMessage}
          </div>
        )}

        {/* Current Leaders Summary */}
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Leader hiện tại của {effectiveProject}:
          </span>
          {isMembersLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-3/4" />
            </div>
          ) : membersData?.leaders && membersData.leaders.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {membersData.leaders.map((leader) => (
                <Badge
                  key={leader.id}
                  variant="outline"
                  className="flex items-center gap-1.5 py-1 px-2.5 text-xs border-primary/30 bg-primary/5 text-foreground"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                  <span className="font-medium">{leader.displayName}</span>
                  {leader.jiraUsername && (
                    <span className="font-mono text-muted-foreground">
                      (@{leader.jiraUsername})
                    </span>
                  )}
                </Badge>
              ))}
            </div>
          ) : (
            <EmptyState
              size="compact"
              icon={ShieldAlert}
              title="Chưa có Leader nào cho dự án này"
              description="Cảnh báo merge sẽ bị bỏ qua cho đến khi có ít nhất một Leader được phân công."
              className="p-5"
            />
          )}
        </div>

        {/* User Selection List */}
        {canManage ? (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phân quyền Leader ({selectedLeaderIds.length} đã chọn):
              </span>
              <div className="w-48 sm:w-60">
                <SearchField
                  placeholder="Tìm thành viên…"
                  value={searchQuery}
                  onChange={setSearchQuery}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {filteredUsers.length === 0 ? (
                <EmptyState
                  size="compact"
                  title="Không tìm thấy người dùng"
                  description="Thử tìm kiếm với từ khóa khác."
                  className="py-4"
                />
              ) : (
                filteredUsers.map((user) => {
                  const isChecked = selectedLeaderIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleLeader(user.id)}
                      className={`flex items-center justify-between rounded p-2 text-xs transition-colors cursor-pointer select-none ${
                        isChecked
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleLeader(user.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer"
                        />
                        <div>
                          <div className="font-medium">{user.displayName}</div>
                          {user.email ? (
                            <div className="text-2xs text-muted-foreground">
                              {user.email}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.jiraUsername && (
                          <span className="font-mono text-2xs text-muted-foreground">
                            @{user.jiraUsername}
                          </span>
                        )}
                        {isChecked && (
                          <span className="flex items-center text-2xs font-medium text-primary">
                            <Check className="h-3 w-3 mr-0.5" aria-hidden />
                            Leader
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            Chỉ Quản trị viên (Admin) hoặc Leader hiện tại của dự án {effectiveProject} mới có quyền chỉ định thêm hoặc gỡ bỏ Leader.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
