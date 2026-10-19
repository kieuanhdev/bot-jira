import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const POINT_STEPS = [1, 2, 3, 5, 8, 13, 21];

/**
 * Story-point picker grid. When `aiPoints` is set, that step carries a ✨ marker
 * and a hint row below tells the user the value is an AI suggestion (a value
 * outside the steps is shown as its own button so it can still be picked).
 */
export function PointStepGrid({
  value,
  aiPoints,
  onChange,
}: {
  value: number | null | undefined;
  aiPoints?: number | null;
  onChange: (points: number) => void;
}) {
  const steps =
    aiPoints != null && !POINT_STEPS.includes(aiPoints)
      ? [...POINT_STEPS, aiPoints].sort((a, b) => a - b)
      : POINT_STEPS;
  return (
    <>
      <div className="grid grid-cols-4 gap-1 p-1">
        {steps.map((p) => {
          const isAi = p === aiPoints;
          return (
            <Button
              key={p}
              variant={value === p ? "default" : "outline"}
              size="sm"
              className={cn("relative h-8 px-0 text-xs", isAi && value !== p && "border-primary/60 text-primary")}
              title={isAi ? "AI gợi ý điểm này" : undefined}
              onClick={() => onChange(p)}
            >
              {p}
              {isAi && <Sparkles className="absolute -right-0.5 -top-0.5 h-3 w-3 text-primary" aria-hidden="true" />}
            </Button>
          );
        })}
      </div>
      {aiPoints != null && (
        <div className="flex items-center gap-1 px-2 pb-1 text-2xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          AI gợi ý: <span className="font-semibold text-foreground">{aiPoints}</span>
        </div>
      )}
    </>
  );
}
