"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  RefreshCw,
  Radio,
  Eye,
  Zap,
  Globe,
  ExternalLink,
  Laptop,
} from "lucide-react";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/shared/page-header";
import { MetricGrid } from "@/components/shared/metric-grid";
import { MetricCard } from "@/components/shared/metric-card";
import { SearchField } from "@/components/shared/search-field";
import { PaginationFooter } from "@/components/shared/pagination-footer";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/async-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { timeAgo, formatDateTime, cn } from "@/lib/utils";

interface UserActivityItem {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  eventType: string;
  action: string;
  description: string | null;
  path: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface ActivityUserOption {
  id: string;
  displayName: string;
  email: string | null;
  jiraUsername: string | null;
}

interface ActivityApiResponse {
  metrics: {
    onlineCount: number;
    activeUsersToday: number;
    totalViewsToday: number;
    totalActionsToday: number;
  };
  items: UserActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  users: ActivityUserOption[];
}

export function AdminActivityClient() {
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedEventType, setSelectedEventType] = useState<string>("all");
  const [selectedRange, setSelectedRange] = useState<"today" | "7d" | "30d" | "all">("today");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const queryParams = {
    userId: selectedUser !== "all" ? selectedUser : undefined,
    eventType: selectedEventType !== "all" ? selectedEventType : undefined,
    range: selectedRange,
    q: searchQuery.trim() || undefined,
    page,
    limit: 25,
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: adminKeys.activity(queryParams),
    queryFn: () => {
      const sp = new URLSearchParams();
      if (queryParams.userId) sp.set("userId", queryParams.userId);
      if (queryParams.eventType) sp.set("eventType", queryParams.eventType);
      if (queryParams.range) sp.set("range", queryParams.range);
      if (queryParams.q) sp.set("q", queryParams.q);
      sp.set("page", String(queryParams.page));
      sp.set("limit", String(queryParams.limit));
      return api<ActivityApiResponse>(`/api/admin/activity?${sp.toString()}`);
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const metrics = data?.metrics ?? {
    onlineCount: 0,
    activeUsersToday: 0,
    totalViewsToday: 0,
    totalActionsToday: 0,
  };

  const items = data?.items ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: 25, total: 0, totalPages: 1 };
  const users = data?.users ?? [];

  const handleFilterUserChange = (u: string) => {
    setSelectedUser(u);
    setPage(1);
  };

  const handleFilterTypeChange = (t: string) => {
    setSelectedEventType(t);
    setPage(1);
  };

  const handleFilterRangeChange = (r: "today" | "7d" | "30d" | "all") => {
    setSelectedRange(r);
    setPage(1);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setPage(1);
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case "page_view":
        return (
          <Badge variant="info" className="font-medium">
            <Eye className="h-3 w-3" aria-hidden="true" />
            Xem trang
          </Badge>
        );
      case "action":
        return (
          <Badge variant="warning" className="font-medium">
            <Zap className="h-3 w-3" aria-hidden="true" />
            Thao tác
          </Badge>
        );
      case "auth":
        return (
          <Badge variant="success" className="font-medium">
            <Radio className="h-3 w-3" aria-hidden="true" />
            Đăng nhập
          </Badge>
        );
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Users}
        title="Truy cập & Hoạt động người dùng"
        description="Theo dõi chi tiết lượt vào ra, xem trang và thao tác thực tế của thành viên trên hệ thống."
        actions={
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              <span>Ghi nhận thời gian thực</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer gap-1.5"
              disabled={isFetching}
              onClick={() => refetch()}
            >
              <RefreshCw
                className={cn("h-4 w-4", isFetching && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              Làm mới
            </Button>
          </div>
        }
      />

      {/* 4 Metric Cards */}
      <MetricGrid columns={4}>
        <MetricCard
          label="Đang online (15m qua)"
          value={metrics.onlineCount}
          description="Người dùng có hoạt động gần nhất"
          icon={Radio}
          tone="success"
          loading={isLoading}
        />
        <MetricCard
          label="Thành viên trong ngày"
          value={metrics.activeUsersToday}
          description="Số tài khoản riêng biệt truy cập"
          icon={Users}
          tone="primary"
          loading={isLoading}
        />
        <MetricCard
          label="Tổng lượt xem trang hôm nay"
          value={metrics.totalViewsToday}
          description="Lượt mở và chuyển hướng URL"
          icon={Eye}
          tone="info"
          loading={isLoading}
        />
        <MetricCard
          label="Thao tác dữ liệu hôm nay"
          value={metrics.totalActionsToday}
          description="Đổi trạng thái, tạo task, tương tác"
          icon={Zap}
          tone="warning"
          loading={isLoading}
        />
      </MetricGrid>

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Member Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Thành viên:</span>
            <select
              value={selectedUser}
              onChange={(e) => handleFilterUserChange(e.target.value)}
              aria-label="Lọc theo thành viên"
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-3 py-1 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả thành viên</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.email || u.jiraUsername || u.id}
                </option>
              ))}
            </select>
          </div>

          {/* Event Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Sự kiện:</span>
            <select
              value={selectedEventType}
              onChange={(e) => handleFilterTypeChange(e.target.value)}
              aria-label="Lọc theo loại sự kiện"
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-3 py-1 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">Tất cả sự kiện</option>
              <option value="page_view">👁️ Xem trang (Page View)</option>
              <option value="action">⚡ Thao tác (Action)</option>
              <option value="auth">🔑 Đăng nhập (Auth)</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Thời gian:</span>
            <select
              value={selectedRange}
              onChange={(e) => handleFilterRangeChange(e.target.value as any)}
              aria-label="Lọc theo thời gian"
              className="h-9 cursor-pointer rounded-lg border border-input bg-background px-3 py-1 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày gần đây</option>
              <option value="30d">30 ngày gần đây</option>
              <option value="all">Tất cả</option>
            </select>
          </div>
        </div>

        {/* Search Field */}
        <div className="w-full sm:w-64">
          <SearchField
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Tìm theo trang, nội dung..."
            ariaLabel="Tìm kiếm trong nhật ký hoạt động"
          />
        </div>
      </div>

      {/* Main Activity Table */}
      {error ? (
        <ErrorState
          title="Không thể tải nhật ký hoạt động"
          message={getErrorMessage(error)}
          onRetry={() => refetch()}
        />
      ) : items.length === 0 && !isLoading ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            icon={Globe}
            title="Chưa có dữ liệu hoạt động"
            hint="Các lượt xem trang và thao tác của người dùng sẽ hiển thị ở đây ngay khi có truy cập."
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-1 shadow-xs">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-36 text-xs font-semibold">Thời gian</TableHead>
                  <TableHead className="w-48 text-xs font-semibold">Người dùng</TableHead>
                  <TableHead className="w-32 text-xs font-semibold">Loại</TableHead>
                  <TableHead className="text-xs font-semibold">Chi tiết hoạt động</TableHead>
                  <TableHead className="w-56 text-xs font-semibold">Đường dẫn (URL)</TableHead>
                  <TableHead className="w-36 text-xs font-semibold">Thiết bị</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id} className="transition-colors hover:bg-muted/30">
                    {/* Time */}
                    <TableCell className="py-2.5 text-xs">
                      <div className="flex flex-col" title={formatDateTime(row.createdAt)}>
                        <span className="font-medium text-foreground">{timeAgo(row.createdAt)}</span>
                        <span className="text-2xs text-muted-foreground tabular-nums">
                          {formatDateTime(row.createdAt)}
                        </span>
                      </div>
                    </TableCell>

                    {/* User */}
                    <TableCell className="py-2.5 text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {row.userName || "Khách"}
                        </span>
                        <span className="text-2xs text-muted-foreground truncate max-w-[180px]">
                          {row.userEmail || "—"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Event Type Badge */}
                    <TableCell className="py-2.5 text-xs">
                      {getEventBadge(row.eventType)}
                    </TableCell>

                    {/* Description / Action */}
                    <TableCell className="py-2.5 text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground line-clamp-1">
                          {row.description || row.action}
                        </span>
                        <span className="font-mono text-2xs text-muted-foreground">
                          {row.action}
                        </span>
                      </div>
                    </TableCell>

                    {/* Path */}
                    <TableCell className="py-2.5 text-xs">
                      <div className="flex items-center gap-1.5 font-mono text-2xs text-muted-foreground">
                        <span className="truncate max-w-[200px]" title={row.path}>
                          {row.path}
                        </span>
                        {row.path.startsWith("/") && (
                          <a
                            href={row.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex cursor-pointer text-muted-foreground hover:text-primary transition-colors"
                            title="Mở trang trong tab mới"
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </TableCell>

                    {/* Device / OS */}
                    <TableCell className="py-2.5 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Laptop className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                        <span className="truncate text-2xs" title={row.userAgent || "Không rõ"}>
                          {row.userAgent || "Không rõ"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="px-4 pb-3">
            <PaginationFooter
              page={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              itemLabel="lượt hoạt động"
              onPageChange={(p) => setPage(p)}
              disabled={isFetching}
            />
          </div>
        </div>
      )}
    </div>
  );
}
