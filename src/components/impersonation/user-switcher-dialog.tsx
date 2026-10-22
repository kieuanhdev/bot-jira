"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Search,
  Check,
  UserCheck,
  Shield,
  Layers,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { adminKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export interface ImpersonateUserItem {
  id: string;
  displayName: string;
  email: string | null;
  jiraUsername: string | null;
  role: string;
  hasJiraLinked: boolean;
}

interface UserSwitcherDialogProps {
  currentUserId?: string;
  isImpersonating?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function UserSwitcherDialog({
  currentUserId,
  isImpersonating = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  trigger,
}: UserSwitcherDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen : setInternalOpen;

  const { data, isLoading } = useQuery<{ users: ImpersonateUserItem[] }>({
    queryKey: adminKeys.impersonateUsers,
    queryFn: async () => {
      const res = await fetch("/api/admin/impersonate/users");
      if (!res.ok) throw new Error("Không thể tải danh sách người dùng");
      return res.json();
    },
    enabled: open,
    staleTime: 60 * 1000,
  });

  const users = data?.users || [];

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const term = search.toLowerCase().trim();
    return users.filter(
      (u) =>
        u.displayName?.toLowerCase().includes(term) ||
        u.jiraUsername?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  }, [users, search]);

  const handleSelectUser = async (targetUser: ImpersonateUserItem) => {
    if (targetUser.id === currentUserId) return;
    try {
      setSwitchingId(targetUser.id);
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetUser.id }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        setSwitchingId(null);
      }
    } catch {
      setSwitchingId(null);
    }
  };

  const roleBadgeVariant = (role: string) => {
    switch (role) {
      case "admin":
        return "default";
      case "lead":
      case "release_manager":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            variant={isImpersonating ? "outline" : "ghost"}
            size="sm"
            className={cn(
              "h-8 px-2.5 text-xs font-medium cursor-pointer transition-colors gap-1.5",
              isImpersonating
                ? "border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
                : "text-muted-foreground hover:text-foreground"
            )}
            title="Đổi tài khoản người dùng để xem và kiểm tra bug"
          >
            {isImpersonating ? (
              <UserCheck className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
            ) : (
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {isImpersonating ? "Đang đóng vai" : "Đổi tài khoản"}
            </span>
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-md gap-3 p-5">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Chuyển đổi tài khoản (User Impersonation)
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Chọn một thành viên để xem giao diện, quyền hạn và dữ liệu đúng theo tài khoản của họ.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Ô tìm kiếm */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Tìm theo tên hiển thị, Jira username hoặc email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8.5 h-9 text-xs"
            autoFocus
          />
        </div>

        {/* Danh sách người dùng */}
        <div className="max-h-[320px] overflow-y-auto space-y-1 pr-1 -mr-1">
          {isLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-2">
                <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="text-xs font-medium text-foreground">Không tìm thấy thành viên</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Thử tìm với từ khóa hoặc tên khác
              </p>
            </div>
          ) : (
            filteredUsers.map((u) => {
              const isCurrent = u.id === currentUserId;
              const isSwitchingThis = switchingId === u.id;
              const initials = (u.displayName || "U")
                .split(" ")
                .filter(Boolean)
                .slice(-2)
                .map((n) => n[0])
                .join("")
                .toUpperCase();

              return (
                <div
                  key={u.id}
                  onClick={() => !isCurrent && !switchingId && handleSelectUser(u)}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-lg border transition-all text-xs",
                    isCurrent
                      ? "border-primary/40 bg-primary/5 cursor-default"
                      : "border-transparent hover:border-border hover:bg-muted/50 cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border">
                      {initials}
                    </div>

                    <div className="min-w-0 truncate">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-foreground truncate">
                          {u.displayName}
                        </span>
                        {isCurrent && (
                          <Badge variant="outline" className="text-2xs h-4 px-1 py-0 border-primary text-primary font-normal">
                            Đang xem
                          </Badge>
                        )}
                        <Badge variant={roleBadgeVariant(u.role)} className="text-2xs h-4 px-1 py-0 capitalize font-normal">
                          {u.role === "admin" ? (
                            <span className="flex items-center gap-0.5">
                              <Shield className="h-2.5 w-2.5" />
                              Admin
                            </span>
                          ) : u.role === "lead" ? (
                            <span className="flex items-center gap-0.5">
                              <Layers className="h-2.5 w-2.5" />
                              Lead
                            </span>
                          ) : (
                            u.role
                          )}
                        </Badge>
                      </div>

                      <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-2">
                        {u.jiraUsername && <span>@{u.jiraUsername}</span>}
                        {u.email && <span>{u.email}</span>}
                        {!u.hasJiraLinked && (
                          <span className="text-warning text-2xs">
                            (Chưa nối Jira)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 pl-2">
                    {isCurrent ? (
                      <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(switchingId)}
                        className="h-7 text-xs px-2 cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                      >
                        {isSwitchingThis ? "Đang chuyển..." : "Chuyển sang"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
            <span>Chỉ Admin mới có thể đổi tài khoản</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen?.(false)}
            className="h-6 text-xs px-2 cursor-pointer text-muted-foreground hover:text-foreground"
          >
            Đóng
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
