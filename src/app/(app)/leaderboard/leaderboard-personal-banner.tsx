import { ArrowUpRight, Crown, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UserPerformance } from "@/lib/leaderboard/types";
import { TierIcon } from "./leaderboard-tier-icon";

interface LeaderboardPersonalBannerProps {
  myPerformance: UserPerformance;
  onViewMyTasks: () => void;
}

export function LeaderboardPersonalBanner({
  myPerformance,
  onViewMyTasks,
}: LeaderboardPersonalBannerProps) {
  return (
    <Card className="relative overflow-hidden border-2 border-primary/30 bg-gradient-to-r from-primary/5 via-card to-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Left: User status & rank */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-13 w-13 items-center justify-center rounded-full bg-primary/20 text-primary font-bold text-lg ring-2 ring-primary">
              {myPerformance.rank <= 3 ? (
                <Crown className="h-6 w-6 text-amber-500" aria-hidden="true" />
              ) : (
                `#${myPerformance.rank}`
              )}
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-card ring-1 ring-border">
              <TierIcon iconName={myPerformance.tier.iconName} className="h-3.5 w-3.5 text-primary" />
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-foreground">Tu vi của bạn</span>
              <Badge variant="outline" className={cn("text-xs font-semibold gap-1", myPerformance.tier.badgeClass)}>
                <TierIcon iconName={myPerformance.tier.iconName} className="h-3 w-3" />
                <span>Cảnh giới: {myPerformance.tier.name}</span>
              </Badge>
              <Badge variant="secondary" className="text-xs font-medium">
                Hạng #{myPerformance.rank} tông môn
              </Badge>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Tu vi tích lũy:{" "}
                <strong className="text-foreground text-sm font-bold text-primary">
                  {myPerformance.completedPoints} pts
                </strong>
              </span>
              {myPerformance.inProgressPoints > 0 && (
                <span>
                  • Đang bế quan:{" "}
                  <strong className="text-foreground font-semibold">{myPerformance.inProgressPoints} pts</strong>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center / Right: Progress to next rank & Tier */}
        <div className="flex flex-1 flex-col gap-2 max-w-md">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <span>Tiến độ đột phá {myPerformance.nextTier?.name ?? "Đỉnh Phong"}</span>
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {myPerformance.tierProgressPercent}%
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-primary to-teal-400 transition-all duration-500 ease-out"
              style={{ width: `${myPerformance.tierProgressPercent}%` }}
            />
          </div>

          {/* Motivational Cheer phrase */}
          <p className="text-xs font-medium text-muted-foreground leading-snug">
            {myPerformance.cheerMessage}
          </p>
        </div>

        {/* Right Action */}
        <div className="shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onViewMyTasks}
            className="cursor-pointer gap-2 border-primary/40 text-primary hover:bg-primary/10 text-xs font-semibold"
          >
            <span>Xem nhiệm vụ của tôi</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
