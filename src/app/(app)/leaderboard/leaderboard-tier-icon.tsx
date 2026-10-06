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
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 ring-2 ring-amber-500/40 font-bold text-sm shadow-sm shadow-amber-500/20">
        <Crown className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200 ring-2 ring-slate-400/50 font-bold text-sm">
        <Zap className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 dark:bg-amber-800/30 text-amber-700 dark:text-amber-300 ring-2 ring-amber-600/40 font-bold text-sm">
        <Flame className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground font-semibold text-xs border border-border">
      {rank}
    </div>
  );
}
