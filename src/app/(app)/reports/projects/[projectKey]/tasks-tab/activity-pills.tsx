"use client";

import {
  Layers,
  CheckCircle2,
  FolderPlus,
  PlayCircle,
  MinusCircle,
  type LucideIcon,
} from "lucide-react";

export interface ActivityFilterConfig {
  id: string;
  label: string;
  icon?: LucideIcon;
  color?: string;
}

export const BASE_ACTIVITY_FILTERS: ActivityFilterConfig[] = [
  { id: "all", label: "Tất cả", icon: Layers, color: "text-muted-foreground" },
  { id: "completed", label: "Hoàn thành trong kỳ", icon: CheckCircle2, color: "text-emerald-500" },
  { id: "created", label: "Tạo mới trong kỳ", icon: FolderPlus, color: "text-sky-500" },
  { id: "current_open", label: "Đang mở", icon: PlayCircle, color: "text-teal-500" },
  { id: "unmoved", label: "Không đổi", icon: MinusCircle, color: "text-muted-foreground" },
];

export interface ActivityPillsProps {
  activity: string;
  isVersionScope: boolean;
  onActivityChange: (activityId: string) => void;
}

export function ActivityPills({
  activity,
  isVersionScope,
  onActivityChange,
}: ActivityPillsProps) {
  const filters = BASE_ACTIVITY_FILTERS.map((f) => {
    if (!isVersionScope) return f;
    if (f.id === "completed") return { ...f, label: "Đã hoàn thành" };
    if (f.id === "created") return { ...f, label: "Tất cả task version" };
    return f;
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5 pb-1">
      {filters.map((f) => {
        const Icon = f.icon;
        const isSelected = activity === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onActivityChange(f.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
              isSelected
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {Icon && (
              <Icon
                className={`h-3.5 w-3.5 ${
                  isSelected ? "text-primary-foreground" : f.color
                }`}
                aria-hidden="true"
              />
            )}
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
