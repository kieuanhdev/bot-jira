"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/lib/theme-client";
import { THEME_TOGGLE_ENABLED, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme, mounted } = useTheme();

  if (!THEME_TOGGLE_ENABLED) {
    return null;
  }

  const options: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Sáng", icon: Sun },
    { value: "dark", label: "Tối", icon: Moon },
    { value: "system", label: "Theo hệ thống", icon: Monitor },
  ];

  return (
    <div
      role="group"
      aria-label="Chọn giao diện"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 text-muted-foreground",
        className
      )}
    >
      {options.map((opt) => {
        const Icon = opt.icon;
        const isActive = mounted && theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-label={opt.label}
            aria-pressed={isActive}
            title={opt.label}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer",
              isActive
                ? "bg-card text-foreground shadow-2xs font-medium"
                : "hover:text-foreground hover:bg-muted/60"
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
