"use client";

import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldAlert, ShieldCheck, Save, Search, Check } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { User } from "./lib/settings-model";

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
  const [selectedLeaderIds, setSelectedLeaderIds] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const { data: projectsData, isLoading: isProjectsLoading } = useQuery({
    queryKey: ["settings", "projects"],
    queryFn: () => api<{ items: Array<{ key: string; name: string }> }>("/api/projects"),
  });

  const effectiveProject = selectedProject || projectsData?.items[0]?.key || "";
  const queryKey = ["projects", effectiveProject, "members"];

  const { data: membersData, isLoading: isMembersLoading } = useQuery({
    queryKey,
    enabled: Boolean(effectiveProject),
    queryFn: () =>
      api<ProjectMembersResponse>(`/api/projects/${encodeURIComponent(effectiveProject)}/members`),
  });

  // Keep local draft in sync with server data when project changes or query finishes
  useEffect(() => {
    if (membersData?.leaders) {
      setSelectedLeaderIds(membersData.leaders.map((u) => u.id));
      setIsDirty(false);
      setStatusMessage(null);
    }
  }, [membersData, effectiveProject]);

  const saveMutation = useMutation({
    mutationFn: (leaderUserIds: string[]) =>
      api(`/api/projects/${encodeURIComponent(effectiveProject)}/members`, {
        method: "PUT",
        body: { leaderUserIds },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setIsDirty(false);
      setStatusMessage("Đã cập nhật danh sách Leader thành công.");
      setTimeout(() => setStatusMessage(null), 4000);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Có lỗi xảy ra khi lưu.";
      setStatusMessage(`Lỗi: ${msg}`);
    },
  });

  const canManage = membersData?.canManage ?? isAdmin;

  const toggleLeader = (userId: string) => {
    if (!canManage) return;
    setSelectedLeaderIds((prev) => {
      const next = prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId];
      setIsDirty(true);
      return next;
    });
  };

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const q = searchQuery.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.jiraUsername && u.jiraUsername.toLowerCase().includes(q))
    );
  }, [users, searchQuery]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-teal-600 dark:text-teal-400" aria-hidden />
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
                  setIsDirty(false);
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
            className={`rounded-md p-3 text-xs ${
              statusMessage.startsWith("Lỗi")
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                : "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/30"
            }`}
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
                  className="flex items-center gap-1.5 py-1 px-2.5 text-xs border-teal-500/40 bg-teal-500/5 text-foreground"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" aria-hidden />
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
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-5 text-center">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <ShieldAlert className="h-5 w-5 text-amber-500" aria-hidden />
              </div>
              <p className="text-sm font-medium text-foreground">Chưa có Leader nào cho dự án này</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Cảnh báo merge sẽ bị bỏ qua cho đến khi có ít nhất một Leader được phân công.
              </p>
            </div>
          )}
        </div>

        {/* User Selection List */}
        {canManage ? (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phân quyền Leader ({selectedLeaderIds.length} đã chọn):
              </span>
              <div className="relative w-48 sm:w-60">
                <Search
                  className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  placeholder="Tìm thành viên…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2 space-y-1">
              {filteredUsers.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  Không tìm thấy người dùng phù hợp.
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isChecked = selectedLeaderIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleLeader(user.id)}
                      className={`flex items-center justify-between rounded p-2 text-xs transition-colors cursor-pointer select-none ${
                        isChecked
                          ? "bg-teal-500/10 dark:bg-teal-500/20 text-foreground"
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
                          <div className="text-[11px] text-muted-foreground">
                            {user.email || "Không có email"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {user.jiraUsername && (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            @{user.jiraUsername}
                          </span>
                        )}
                        {isChecked && (
                          <span className="flex items-center text-[11px] font-medium text-teal-600 dark:text-teal-400">
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
