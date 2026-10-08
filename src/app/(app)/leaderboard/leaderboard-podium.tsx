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
          <Sparkles className="h-4 w-4 text-amber-500" aria-hidden="true" />
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
                  className="h-16 w-16 ring-4 ring-slate-300 dark:ring-slate-600 shadow-md text-xl"
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-6.5 items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 px-2.5 text-[11px] font-bold text-slate-800 dark:text-slate-200 shadow-sm whitespace-nowrap">
                  <Zap className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 shrink-0" aria-hidden="true" />
                  <span>TIÊN TÔN #2</span>
                </div>
              </div>

              <div className="mt-2 text-center w-full">
                <div className="font-bold text-foreground text-sm truncate px-2">{top2.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">@{top2.jiraUsername}</div>
                <Badge variant="outline" className={cn("mt-1.5 text-[10px]", top2.tier.badgeClass)}>
                  {top2.tier.name}
                </Badge>
              </div>

              {/* Pedestal Box */}
              <div className="mt-4 w-full rounded-t-xl border border-b-0 border-slate-400/30 bg-gradient-to-t from-slate-400/20 to-slate-400/5 p-4 text-center">
                <div className="text-2xl font-black text-foreground tabular-nums">
                  {top2.completedPoints}
                </div>
                <div className="text-[11px] font-medium text-muted-foreground">Tu Vi Tích Lũy</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
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
              <Crown className="h-7 w-7 text-amber-500 animate-bounce mb-1" aria-hidden="true" />
              <JiraAvatar
                username={top1.jiraUsername}
                displayName={top1.displayName}
                size="xl"
                className="h-20 w-20 ring-4 ring-amber-300 dark:ring-amber-500/60 shadow-xl shadow-amber-500/25 text-2xl"
              />
              <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-7 items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-500 border border-amber-300 dark:border-amber-400 px-3 text-[11px] font-black text-slate-950 shadow-md whitespace-nowrap">
                <Crown className="h-3.5 w-3.5 text-slate-950 shrink-0" aria-hidden="true" />
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
            <div className="mt-4 w-full rounded-t-xl border border-b-0 border-amber-500/40 bg-gradient-to-t from-amber-500/25 via-amber-500/10 to-amber-500/5 p-5 text-center shadow-lg shadow-amber-500/10">
              <div className="text-3xl font-black text-amber-500 tabular-nums">
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
                className="mt-3 h-8 cursor-pointer border-amber-500/50 bg-amber-500/10 text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/20"
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
                  className="h-16 w-16 ring-4 ring-amber-300 dark:ring-amber-700/60 shadow-md text-xl"
                />
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-10 flex h-6.5 items-center gap-1 rounded-full bg-amber-700 dark:bg-amber-800 border border-amber-600 px-2.5 text-[11px] font-bold text-white shadow-sm whitespace-nowrap">
                  <Flame className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>CHÂN QUÂN #3</span>
                </div>
              </div>

              <div className="mt-2 text-center w-full">
                <div className="font-bold text-foreground text-sm truncate px-2">{top3.displayName}</div>
                <div className="text-xs text-muted-foreground truncate">@{top3.jiraUsername}</div>
                <Badge variant="outline" className={cn("mt-1.5 text-[10px]", top3.tier.badgeClass)}>
                  {top3.tier.name}
                </Badge>
              </div>

              {/* Pedestal Box */}
              <div className="mt-4 w-full rounded-t-xl border border-b-0 border-amber-700/30 bg-gradient-to-t from-amber-700/20 to-amber-700/5 p-4 text-center">
                <div className="text-2xl font-black text-foreground tabular-nums">
                  {top3.completedPoints}
                </div>
                <div className="text-[11px] font-medium text-muted-foreground">Tu Vi Tích Lũy</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
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
