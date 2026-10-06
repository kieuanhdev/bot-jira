import {
  ChevronRight,
  Inbox,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import type { LeaderboardMember } from "@/lib/leaderboard/types";
import { getInitials } from "./lib/leaderboard-utils";
import { RankBadge, TierIcon } from "./leaderboard-tier-icon";

interface LeaderboardTableProps {
  filteredMembers: LeaderboardMember[];
  searchMember: string;
  onSearchMemberChange: (value: string) => void;
  sortBy: "completed" | "total" | "tasks";
  onSortByChange: (sortBy: "completed" | "total" | "tasks") => void;
  isLoading: boolean;
  onSelectMember: (member: LeaderboardMember) => void;
}

export function LeaderboardTable({
  filteredMembers,
  searchMember,
  onSearchMemberChange,
  sortBy,
  onSortByChange,
  isLoading,
  onSelectMember,
}: LeaderboardTableProps) {
  return (
    <Card className="border bg-card shadow-xs">
      <div className="p-4 sm:p-5 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-bold text-foreground">Bảng Tổng Sắp Tu Tiên Tông Môn</h2>
          <Badge variant="secondary" className="text-xs">
            {filteredMembers.length} đạo hữu
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search input */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              placeholder="Tìm đạo hữu..."
              value={searchMember}
              onChange={(e) => onSearchMemberChange(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="w-48">
            <Select value={sortBy} onValueChange={(val: "completed" | "total" | "tasks") => onSortByChange(val)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Sắp xếp theo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed" className="text-xs">
                  Tu vi đã chốt (Cao → Thấp)
                </SelectItem>
                <SelectItem value="total" className="text-xs">
                  Tổng tu vi (Đã chốt + Đang luyện)
                </SelectItem>
                <SelectItem value="tasks" className="text-xs">
                  Số nhiệm vụ hoàn thành
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : filteredMembers.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Không có dữ liệu"
            hint="Không tìm thấy thành viên nào có point trong khoảng thời gian hoặc dự án đã chọn."
            className="m-4"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-4 w-16 text-center">Hạng</th>
                  <th className="py-3 px-4">Đạo Hữu</th>
                  <th className="py-3 px-4">Cảnh Giới</th>
                  <th className="py-3 px-4 text-right">Tu Vi Đã Chốt</th>
                  <th className="py-3 px-4 text-right">Đang Bế Quan</th>
                  <th className="py-3 px-4 text-center">Nhiệm Vụ</th>
                  <th className="py-3 px-4 w-32 hidden sm:table-cell">Đóng Góp</th>
                  <th className="py-3 px-4 text-right w-24">Chi Tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {filteredMembers.map((member) => (
                  <tr
                    key={member.jiraUsername}
                    className={cn(
                      "transition-colors duration-150 hover:bg-muted/50",
                      member.isCurrentUser && "bg-primary/5 font-medium"
                    )}
                  >
                    {/* Rank */}
                    <td className="py-3.5 px-4 text-center align-middle">
                      <div className="flex items-center justify-center">
                        <RankBadge rank={member.rank} />
                      </div>
                    </td>

                    {/* Member Info */}
                    <td className="py-3.5 px-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-bold text-xs ring-1 ring-border text-foreground">
                          {getInitials(member.displayName)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-semibold text-foreground text-sm truncate">
                              {member.displayName}
                            </span>
                            {member.isCurrentUser && (
                              <Badge variant="default" className="text-[10px] py-0 px-1.5 h-4 bg-primary text-primary-foreground font-bold">
                                Bạn
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            @{member.jiraUsername}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Tier Badge */}
                    <td className="py-3.5 px-4 align-middle">
                      <Badge
                        variant="outline"
                        className={cn("text-xs font-semibold gap-1 py-0.5", member.tier.badgeClass)}
                      >
                        <TierIcon iconName={member.tier.iconName} className="h-3 w-3" />
                        <span>{member.tier.name}</span>
                      </Badge>
                    </td>

                    {/* Completed Points */}
                    <td className="py-3.5 px-4 text-right align-middle">
                      <span className="text-base font-bold text-primary tabular-nums">
                        {member.completedPoints}
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-1">pts</span>
                    </td>

                    {/* In Progress Points */}
                    <td className="py-3.5 px-4 text-right align-middle">
                      {member.inProgressPoints > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400 tabular-nums">
                          <Zap className="h-3 w-3" aria-hidden="true" />
                          {member.inProgressPoints} pts
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">0</span>
                      )}
                    </td>

                    {/* Completed Tasks Count */}
                    <td className="py-3.5 px-4 text-center align-middle">
                      <span className="inline-flex items-center justify-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                        {member.completedTasks}
                      </span>
                    </td>

                    {/* Share Progress Bar */}
                    <td className="py-3.5 px-4 align-middle hidden sm:table-cell">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                          <span>{member.sharePercentage}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, member.sharePercentage)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* View Action */}
                    <td className="py-3.5 px-4 text-right align-middle">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelectMember(member)}
                        className="h-8 cursor-pointer px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                        title="Xem danh sách task"
                      >
                        <span className="hidden sm:inline">Xem</span>
                        <ChevronRight className="h-4 w-4 ml-1" aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
