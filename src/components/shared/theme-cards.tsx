"use client";

import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "@/lib/theme-client";
import { THEME_TOGGLE_ENABLED, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeOption {
  value: ThemePref;
  label: string;
  description: string;
  icon: typeof Sun;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: "light",
    label: "Sáng",
    description: "Nền sáng cổ điển, dễ đọc và độ tương phản cao cho môi trường ban ngày.",
    icon: Sun,
  },
  {
    value: "dark",
    label: "Tối",
    description: "Nền tối dịu mắt, giảm căng thẳng thị giác khi làm việc vào ban đêm.",
    icon: Moon,
  },
  {
    value: "system",
    label: "Theo hệ thống",
    description: "Tự động đồng bộ giao diện theo cài đặt hiển thị của thiết bị và hệ điều hành.",
    icon: Monitor,
  },
];

function LightPreview() {
  return (
    <div className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-[#f8fafc] p-2 shadow-2xs">
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex items-center gap-1.5 border-b border-black/10 pb-1.5">
          <div className="flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
          </div>
          <div className="h-2 w-16 rounded bg-black/10" />
        </div>
        <div className="flex flex-1 gap-2">
          <div className="flex w-6 flex-col gap-1 rounded bg-black/5 p-1">
            <div className="h-1.5 w-full rounded bg-primary/80" />
            <div className="h-1.5 w-full rounded bg-black/10" />
            <div className="h-1.5 w-full rounded bg-black/10" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-2 w-20 rounded bg-black/15" />
            <div className="flex gap-1.5">
              <div className="flex-1 rounded border border-black/10 bg-white p-1 shadow-2xs">
                <div className="h-1.5 w-12 rounded bg-black/10" />
                <div className="mt-1 h-1 w-8 rounded bg-black/5" />
              </div>
              <div className="flex-1 rounded border border-black/10 bg-white p-1 shadow-2xs">
                <div className="h-1.5 w-10 rounded bg-black/10" />
                <div className="mt-1 h-1 w-6 rounded bg-black/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DarkPreview() {
  return (
    <div className="relative h-24 w-full overflow-hidden rounded-md border border-border bg-[#090d16] p-2 shadow-2xs">
      <div className="flex h-full flex-col gap-1.5">
        <div className="flex items-center gap-1.5 border-b border-white/10 pb-1.5">
          <div className="flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          </div>
          <div className="h-2 w-16 rounded bg-white/10" />
        </div>
        <div className="flex flex-1 gap-2">
          <div className="flex w-6 flex-col gap-1 rounded bg-white/5 p-1">
            <div className="h-1.5 w-full rounded bg-primary" />
            <div className="h-1.5 w-full rounded bg-white/10" />
            <div className="h-1.5 w-full rounded bg-white/10" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-2 w-20 rounded bg-white/20" />
            <div className="flex gap-1.5">
              <div className="flex-1 rounded border border-white/10 bg-white/5 p-1 shadow-2xs">
                <div className="h-1.5 w-12 rounded bg-white/15" />
                <div className="mt-1 h-1 w-8 rounded bg-white/10" />
              </div>
              <div className="flex-1 rounded border border-white/10 bg-white/5 p-1 shadow-2xs">
                <div className="h-1.5 w-10 rounded bg-white/15" />
                <div className="mt-1 h-1 w-6 rounded bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SystemPreview() {
  return (
    <div className="relative flex h-24 w-full overflow-hidden rounded-md border border-border shadow-2xs">
      {/* Light side */}
      <div className="relative w-1/2 overflow-hidden border-r border-border bg-[#f8fafc] p-2">
        <div className="flex h-full flex-col gap-1.5">
          <div className="flex items-center gap-1 border-b border-black/10 pb-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-black/20" />
            <div className="h-2 w-8 rounded bg-black/10" />
          </div>
          <div className="flex flex-1 gap-1.5">
            <div className="w-5 rounded bg-black/5 p-0.5">
              <div className="h-1.5 w-full rounded bg-primary/80" />
            </div>
            <div className="flex-1 rounded border border-black/10 bg-white p-1">
              <div className="h-1.5 w-8 rounded bg-black/10" />
            </div>
          </div>
        </div>
      </div>
      {/* Dark side */}
      <div className="relative w-1/2 overflow-hidden bg-[#090d16] p-2">
        <div className="flex h-full flex-col gap-1.5">
          <div className="flex items-center gap-1 border-b border-white/10 pb-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
            <div className="h-2 w-8 rounded bg-white/10" />
          </div>
          <div className="flex flex-1 gap-1.5">
            <div className="w-5 rounded bg-white/5 p-0.5">
              <div className="h-1.5 w-full rounded bg-primary" />
            </div>
            <div className="flex-1 rounded border border-white/10 bg-white/5 p-1">
              <div className="h-1.5 w-8 rounded bg-white/15" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ThemeCards({ className }: { className?: string }) {
  const { theme, setTheme, mounted } = useTheme();

  if (!THEME_TOGGLE_ENABLED) {
    return null;
  }

  return (
    <div
      role="radiogroup"
      aria-label="Chọn chế độ hiển thị"
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-3", className)}
    >
      {THEME_OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isSelected = mounted && theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "group relative flex flex-col rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isSelected
                ? "border-primary bg-primary-soft/15 shadow-xs ring-1 ring-primary/30"
                : "border-border bg-card hover:border-primary/40 hover:bg-accent/30 hover:shadow-2xs"
            )}
          >
            {/* Visual preview mockup */}
            {opt.value === "light" && <LightPreview />}
            {opt.value === "dark" && <DarkPreview />}
            {opt.value === "system" && <SystemPreview />}

            {/* Header info */}
            <div className="mt-3.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground group-hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="font-semibold text-sm text-foreground">
                  {opt.label}
                </span>
              </div>

              {/* Radio Indicator */}
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background group-hover:border-primary/50"
                )}
                aria-hidden="true"
              >
                {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
              </span>
            </div>

            {/* Description */}
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {opt.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
