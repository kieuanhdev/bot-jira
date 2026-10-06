import { useState } from "react";
import type { ReportStatusGroup } from "@/lib/reports/types";
import { DEFAULT_PREFERENCES, STORAGE_PREFS_KEY, type ChartPreferences } from "./model";

/** User display preferences, persisted to localStorage. */
export function useStatusChartPreferences() {
  // Read from localStorage on first render; the chart only mounts after the report query resolves on the client.
  const [preferences, setPreferences] = useState<ChartPreferences>(() => {
    if (typeof window === "undefined") return DEFAULT_PREFERENCES;
    try {
      const stored = localStorage.getItem(STORAGE_PREFS_KEY);
      if (stored) {
        return {
          ...DEFAULT_PREFERENCES,
          ...JSON.parse(stored),
        };
      }
    } catch {
      // Ignore localStorage errors
    }
    return DEFAULT_PREFERENCES;
  });

  // Save preferences to localStorage
  const updatePreferences = (updater: (prev: ChartPreferences) => ChartPreferences) => {
    setPreferences((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors
      }
      return next;
    });
  };

  // Toggle hiding a specific status group from the chart
  const toggleGroupVisibility = (group: ReportStatusGroup) => {
    updatePreferences((prev) => {
      const isHidden = prev.hiddenGroups.includes(group);
      const nextHidden = isHidden
        ? prev.hiddenGroups.filter((g) => g !== group)
        : [...prev.hiddenGroups, group];
      return { ...prev, hiddenGroups: nextHidden };
    });
  };

  // Quick preset: show all
  const handleShowAllGroups = () => {
    updatePreferences((prev) => ({ ...prev, hiddenGroups: [] }));
  };

  // Quick preset: only open/in-progress work (hide Done)
  const handleOnlyOpenWork = () => {
    updatePreferences((prev) => ({
      ...prev,
      hiddenGroups: ["Done"],
    }));
  };

  return {
    preferences,
    updatePreferences,
    toggleGroupVisibility,
    handleShowAllGroups,
    handleOnlyOpenWork,
  };
}
