import {
  Crown,
  Sparkles,
  Zap,
  Flame,
  Trophy,
  Shield,
  Medal,
  Star,
} from "lucide-react";
import type { LeaderboardTier } from "@/lib/leaderboard/types";

// Tier icon resolver
export function TierIcon({
  iconName,
  className,
}: {
  iconName: LeaderboardTier["iconName"];
  className?: string;
}) {
  switch (iconName) {
    case "Crown":
      return <Crown className={className} aria-hidden="true" />;
    case "Sparkles":
      return <Sparkles className={className} aria-hidden="true" />;
    case "Zap":
      return <Zap className={className} aria-hidden="true" />;
    case "Flame":
      return <Flame className={className} aria-hidden="true" />;
    case "Trophy":
      return <Trophy className={className} aria-hidden="true" />;
    case "Shield":
      return <Shield className={className} aria-hidden="true" />;
    case "Medal":
      return <Medal className={className} aria-hidden="true" />;
    case "Star":
    default:
      return <Star className={className} aria-hidden="true" />;
  }
}

// Rank Medal Component
export function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/20 text-warning ring-2 ring-warning/40 font-bold text-sm shadow-sm shadow-warning/20">
        <Crown className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground ring-2 ring-border font-bold text-sm">
        <Zap className="h-4 w-4 text-info" aria-hidden="true" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15 text-warning ring-2 ring-warning/40 font-bold text-sm">
        <Flame className="h-4 w-4 text-warning" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border">
      {rank}
    </div>
  );
}
