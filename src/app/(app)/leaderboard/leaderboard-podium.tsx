import { Crown, Flame, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { LeaderboardMember } from "@/lib/leaderboard/types";
import { JiraAvatar } from "@/components/jira-avatar";

interface LeaderboardPodiumProps {
  top1: LeaderboardMember | null;
  top2: LeaderboardMember | null;
  top3: LeaderboardMember | null;
  periodLabel?: string;
  isLoading: boolean;
  onSelectMember: (member: LeaderboardMember) => void;
}

export function LeaderboardPodium({
  top1,
  top2,
  top3,
  periodLabel,
  isLoading,
  onSelectMember,
}: LeaderboardPodiumProps) {
  if (isLoading) {
    return <Skeleton className="h-72 w-full rounded-xl" />;
  }

  if (!top1) {
    return null;
  }

  return (
    <Card className="border bg-gradient-to-b from-card via-card to-muted/30 shadow-xs overflow-hidden">
      <div className="p-5 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-warning" aria-hidden="true" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Bảng Phong Thần (Top 3 Tu Vi Đỉnh Phong)
          </h2>
        </div>
        <span className="text-xs text-muted-foreground">{periodLabel}</span>
      </div>

      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end max-w-4xl mx-auto pt-4 pb-2">
          {/* Rank 2 (Tiên Tôn) - Left Column on desktop */}
          {top2 ? (
            <div className="flex flex-col items-center order-2 md:order-1">
              <div className="relative mb-5 flex flex-col items-center">
                <JiraAvatar
                  username={top2.jiraUsername}
                  displayName={top2.displayName}
                  size="xl"
                  className="h-16 w-16 ring-4 ring-muted-foreground/30 shadow-md text-xl"
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-6.5 items-center gap-1 rounded-full bg-muted border border-border px-2.5 text-2xs font-bold text-foreground shadow-sm whitespace-nowrap">
                  <Zap className="h-3.5 w-3.5 text-info shrink-0" aria-hidden="true" />
                  <span>TIÊN TÔN #2</span>
                </div>
              </div>

              <div className="mt-2 text-center w-full">
                <div className="font-bold text-foreground text-sm truncate px-2">{top2.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">@{top2.jiraUsername}</div>
                <Badge variant="outline" className={cn("mt-1.5 text-2xs", top2.tier.badgeClass)}>
                  {top2.tier.name}
                </Badge>
              </div>

              {/* Pedestal Box */}
              <div className="mt-4 w-full rounded-t-xl border border-b-0 border-border bg-gradient-to-t from-muted/50 to-muted/10 p-4 text-center">
                <div className="text-3xl font-black text-foreground tabular-nums">
                  {top2.completedPoints}
                </div>
                <div className="text-2xs font-medium text-muted-foreground">Tu Vi Tích Lũy</div>
                <div className="mt-1 text-2xs text-muted-foreground">
                  {top2.completedTasks} nhiệm vụ hoàn thành
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectMember(top2)}
                  className="mt-2 h-7 cursor-pointer text-xs text-primary hover:text-primary hover:bg-primary/10"
                >
                  Chi tiết nhiệm vụ
                </Button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-col items-center order-2 md:order-1 text-muted-foreground text-xs italic">
              Chưa có Tiên Tôn #2
            </div>
          )}

          {/* Rank 1 (Đạo Tổ / Chí Tôn) - Elevated Center Column */}
          <div className="flex flex-col items-center order-1 md:order-2">
            <div className="relative mb-5 flex flex-col items-center">
              <Crown className="h-7 w-7 text-warning animate-bounce mb-1" aria-hidden="true" />
              <JiraAvatar
                username={top1.jiraUsername}
                displayName={top1.displayName}
                size="xl"
                className="h-20 w-20 ring-4 ring-warning/60 shadow-xl shadow-warning/25 text-2xl"
              />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-7 items-center gap-1.5 rounded-full bg-gradient-to-r from-warning/80 via-warning to-warning border border-warning/60 px-3 text-2xs font-black text-warning-foreground shadow-md whitespace-nowrap">
                <Crown className="h-3.5 w-3.5 text-warning-foreground shrink-0" aria-hidden="true" />
                <span>ĐẠO TỔ #1</span>
              </div>
            </div>

            <div className="mt-2 text-center w-full">
              <div className="font-extrabold text-foreground text-base truncate px-2">{top1.displayName}</div>
              <div className="text-xs text-muted-foreground truncate">@{top1.jiraUsername}</div>
              <Badge variant="outline" className={cn("mt-1.5 text-xs font-bold", top1.tier.badgeClass)}>
                <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />
                {top1.tier.name}
              </Badge>
            </div>

            {/* Pedestal Box (Tallest) */}
            <div className="mt-4 w-full rounded-t-xl border border-b-0 border-warning/40 bg-gradient-to-t from-warning/25 via-warning/10 to-warning/5 p-5 text-center shadow-lg shadow-warning/10">
              <div className="text-3xl font-black text-warning tabular-nums">
                {top1.completedPoints}
              </div>
              <div className="text-xs font-semibold text-foreground">Tu Vi Đỉnh Phong</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {top1.completedTasks} nhiệm vụ chốt • {top1.sharePercentage}% tu vi tông môn
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSelectMember(top1)}
                className="mt-3 h-8 cursor-pointer border-warning/50 bg-warning/10 text-xs font-bold text-warning hover:bg-warning/20"
              >
                Xem nhiệm vụ đóng góp
              </Button>
            </div>
          </div>

          {/* Rank 3 (Chân Quân) - Right Column */}
          {top3 ? (
            <div className="flex flex-col items-center order-3 md:order-3">
              <div className="relative mb-5 flex flex-col items-center">
                <JiraAvatar
                  username={top3.jiraUsername}
                  displayName={top3.displayName}
                  size="xl"
                  className="h-16 w-16 ring-4 ring-warning/40 shadow-md text-xl"
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-6.5 items-center gap-1 rounded-full bg-warning/15 border border-warning/40 px-2.5 text-2xs font-bold text-warning shadow-sm whitespace-nowrap">
                  <Flame className="h-3.5 w-3.5 text-warning shrink-0" aria-hidden="true" />
                  <span>CHÂN QUÂN #3</span>
                </div>
              </div>

              <div className="mt-2 text-center w-full">
                <div className="font-bold text-foreground text-sm truncate px-2">{top3.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">@{top3.jiraUsername}</div>
                <Badge variant="outline" className={cn("mt-1.5 text-2xs", top3.tier.badgeClass)}>
                  {top3.tier.name}
                </Badge>
              </div>

              {/* Pedestal Box */}
              <div className="mt-4 w-full rounded-t-xl border border-warning/20 bg-gradient-to-t from-warning/10 to-transparent p-4 text-center">
                <div className="text-3xl font-black text-foreground tabular-nums">
                  {top3.completedPoints}
                </div>
                <div className="text-2xs font-medium text-muted-foreground">Tu Vi Tích Lũy</div>
                <div className="mt-1 text-2xs text-muted-foreground">
                  {top3.completedTasks} nhiệm vụ hoàn thành
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectMember(top3)}
                  className="mt-2 h-7 cursor-pointer text-xs text-primary hover:text-primary hover:bg-primary/10"
                >
                  Chi tiết nhiệm vụ
                </Button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-col items-center order-3 md:order-3 text-muted-foreground text-xs italic">
              Chưa có Chân Quân #3
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
