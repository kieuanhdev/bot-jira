"use client";

import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "@/lib/theme-client";
import { THEME_TOGGLE_ENABLED, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface ThemeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ThemeToggle({ className, compact = false }: ThemeToggleProps) {
  const { theme, setTheme, mounted } = useTheme();

  if (!THEME_TOGGLE_ENABLED) {
    return null;
  }

  const options: Array<{ value: ThemePref; label: string; icon: typeof Sun }> = [
    { value: "light", label: "Sáng", icon: Sun },
    { value: "dark", label: "Tối", icon: Moon },
    { value: "system", label: "Theo hệ thống", icon: Monitor },
  ];

  if (compact) {
    const currentOption = options.find((o) => o.value === theme) ?? options[2];
    const CurrentIcon = currentOption.icon;

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Giao diện: ${currentOption.label}`}
            title={`Giao diện: ${currentOption.label}`}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-md font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-foreground cursor-pointer",
              className
            )}
          >
            <CurrentIcon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="sr-only">Giao diện: {currentOption.label}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="end" className="w-40">
          <DropdownMenuLabel className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Giao diện
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = mounted && theme === opt.value;
            return (
              <DropdownMenuItem
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex items-center justify-between text-xs cursor-pointer",
                  isSelected && "font-semibold text-primary"
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

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
