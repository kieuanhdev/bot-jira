import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RealmGroup } from "./lib/leaderboard-utils";
import { TierIcon } from "./leaderboard-tier-icon";

interface LeaderboardRealmsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  realmGroups: RealmGroup[];
}

export function LeaderboardRealmsModal({
  open,
  onOpenChange,
  realmGroups,
}: LeaderboardRealmsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <DialogTitle className="text-lg font-bold">
              Sổ Cảnh Giới Tu Tiên Tông Môn
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Mỗi Story Point tích lũy thành Tu Vi. Các đại cảnh giới được phân chia rõ từng tầng cụ thể để đạo hữu nắm bắt lộ trình đột phá!
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 [scrollbar-width:thin]">
          {realmGroups.map((group) => (
            <div key={group.realm} className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-2.5">
              <div className="pb-2 border-b border-border/40 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TierIcon iconName={group.tiers[0].iconName} className="h-4 w-4 text-primary" />
                    <span className="font-bold text-sm text-foreground">{group.realm}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {group.tiers.length} giai đoạn / tầng
                  </Badge>
                </div>
                {group.tiers[0].realmSummary && (
                  <p className="text-xs text-muted-foreground leading-relaxed bg-muted/40 p-2.5 rounded-md border border-border/40 font-normal">
                    💡 {group.tiers[0].realmSummary}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                {group.tiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border/50 bg-background/50 hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={cn("text-xs font-bold gap-1", tier.badgeClass)}>
                          <TierIcon iconName={tier.iconName} className="h-3 w-3" />
                          <span>{tier.name}</span>
                        </Badge>
                        <span className="text-xs font-semibold text-foreground">
                          {tier.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 italic leading-relaxed">
                        &ldquo;{tier.realmDesc}&rdquo;
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="text-xs font-mono font-bold text-primary">
                        {tier.minPoints > 0 ? `≥ ${tier.minPoints} pts` : "0 pts"}
                      </span>
                      <div className="text-[10px] text-muted-foreground">Tu vi tối thiểu</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
