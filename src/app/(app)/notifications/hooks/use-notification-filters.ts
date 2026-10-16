"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type NotificationTab = "all" | "unread" | "read";
export type NotificationSeverity = "all" | "attention" | "info";

export interface UseNotificationFiltersReturn {
  tab: NotificationTab;
  setTab: (tab: NotificationTab) => void;
  selectedType: string;
  setSelectedType: (type: string) => void;
  severityFilter: NotificationSeverity;
  setSeverityFilter: (severity: NotificationSeverity | ((prev: NotificationSeverity) => NotificationSeverity)) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  unreadOnly: boolean;
  typeFilter: string | undefined;
}

export function useNotificationFilters(): UseNotificationFiltersReturn {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read raw values from URL
  const rawTab = searchParams.get("tab");
  const tab: NotificationTab = rawTab === "unread" || rawTab === "read" ? rawTab : "all";

  const rawType = searchParams.get("type");
  const selectedType = rawType && rawType.trim() ? rawType : "all";

  const rawSeverity = searchParams.get("severity");
  const severityFilter: NotificationSeverity =
    rawSeverity === "attention" || rawSeverity === "info" ? rawSeverity : "all";

  const urlQ = searchParams.get("q") ?? "";

  // Local immediate state for search query to keep typing responsive
  const [searchQuery, setSearchQuery] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);

  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setSearchQuery(urlQ);
  }

  const updateUrl = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const currentQuery = searchParams.toString();
      const nextParams = new URLSearchParams(currentQuery);
      updater(nextParams);
      const nextQuery = nextParams.toString();

      if (nextQuery !== currentQuery) {
        router.replace(nextQuery ? `/notifications?${nextQuery}` : "/notifications", {
          scroll: false,
        });
      }
    },
    [router, searchParams]
  );

  // Debounce search query syncing to URL
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === urlQ.trim()) return;

    const timer = setTimeout(() => {
      updateUrl((p) => {
        if (trimmed) {
          p.set("q", trimmed);
        } else {
          p.delete("q");
        }
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, urlQ, updateUrl]);

  const setTab = useCallback(
    (nextTab: NotificationTab) => {
      updateUrl((p) => {
        if (nextTab === "all") {
          p.delete("tab");
        } else {
          p.set("tab", nextTab);
        }
      });
    },
    [updateUrl]
  );

  const setSelectedType = useCallback(
    (nextType: string) => {
      updateUrl((p) => {
        if (!nextType || nextType === "all") {
          p.delete("type");
        } else {
          p.set("type", nextType);
        }
      });
    },
    [updateUrl]
  );

  const setSeverityFilter = useCallback(
    (action: NotificationSeverity | ((prev: NotificationSeverity) => NotificationSeverity)) => {
      const nextSeverity = typeof action === "function" ? action(severityFilter) : action;
      updateUrl((p) => {
        if (!nextSeverity || nextSeverity === "all") {
          p.delete("severity");
        } else {
          p.set("severity", nextSeverity);
        }
      });
    },
    [updateUrl, severityFilter]
  );

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    updateUrl((p) => {
      p.delete("tab");
      p.delete("type");
      p.delete("severity");
      p.delete("q");
    });
  }, [updateUrl]);

  const hasActiveFilters =
    selectedType !== "all" || severityFilter !== "all" || searchQuery.trim().length > 0;

  const unreadOnly = tab === "unread";
  const typeFilter = selectedType === "all" ? undefined : selectedType;

  return {
    tab,
    setTab,
    selectedType,
    setSelectedType,
    severityFilter,
    setSeverityFilter,
    searchQuery,
    setSearchQuery,
    hasActiveFilters,
    resetFilters,
    unreadOnly,
    typeFilter,
  };
}
