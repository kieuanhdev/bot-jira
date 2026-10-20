"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { replaceUrlState } from "@/lib/url-state";
import { ALL } from "../lib/stale-types";
import { TEAM_VIEW_ENABLED } from "../lib/stale-flags";
import {
  type StdMissingFilter,
  type StdSortMode,
  type StdStaleFilter,
} from "../lib/stale-utils";

const STD_MISSING_VALUES: StdMissingFilter[] = [
  "ALL",
  "ESTIMATION",
  "WORKLOG",
  "FIX_VERSION",
  "DUE_DATE",
];
const STD_STALE_VALUES: StdStaleFilter[] = ["ALL", "stale", "healthy"];
const STD_SORT_VALUES: StdSortMode[] = [
  "missing-desc",
  "stateAge-desc",
  "updated-desc",
  "key-asc",
];

function pickOne<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function useStaleUrlState() {
  const searchParams = useSearchParams();

  // Read URL query parameters directly from searchParams (no window.location.search)
  const urlView = searchParams.get("view");
  const viewMode: "team" | "my-work" = TEAM_VIEW_ENABLED && urlView === "team" ? "team" : "my-work";

  const urlTab = searchParams.get("tab");
  const activeTab: "stale" | "standardization" = urlTab === "stale" ? "stale" : "standardization";

  // Standardization filters
  const stdMissingFilter = pickOne(
    searchParams.get("miss"),
    STD_MISSING_VALUES,
    "ALL"
  );
  const stdProjectFilter = searchParams.get("proj") || ALL;
  const stdStatusFilter = searchParams.get("stdStatus") || ALL;
  const stdStaleFilter = pickOne(
    searchParams.get("sla"),
    STD_STALE_VALUES,
    "ALL"
  );
  const stdSort = pickOne(
    searchParams.get("sort"),
    STD_SORT_VALUES,
    "missing-desc"
  );
  const urlQ = searchParams.get("q") ?? "";

  // Scope filters (with fallback matching server prefetch default)
  const project = searchParams.get("project") || ALL;
  const defaultAssignee = viewMode === "team" ? ALL : "me";
  const assignee = searchParams.get("assignee") || defaultAssignee;
  const status = searchParams.get("status") || ALL;
  const reason = searchParams.get("reason") || ALL;
  const severity = searchParams.get("severity") || ALL;

  // Local immediate state for search input so user typing is not blocked
  const [stdSearch, setStdSearch] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);

  // Sync search input when URL changes externally (e.g. browser back/forward)
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    setStdSearch(urlQ);
  }

  // General URL updater: updates searchParams in place and replaces the URL without a navigation
  const updateUrl = useCallback(
    (updater: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      updater(params);
      const nextQuery = params.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery !== currentQuery) {
        replaceUrlState(nextQuery ? `/stale?${nextQuery}` : "/stale");
      }
    },
    [searchParams]
  );

  // Debounce search update to URL
  useEffect(() => {
    const trimmed = stdSearch.trim();
    if (trimmed === urlQ.trim()) return;

    const timer = setTimeout(() => {
      updateUrl((p) => {
        if (trimmed) p.set("q", trimmed);
        else p.delete("q");
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [stdSearch, urlQ, updateUrl]);

  // View mode & tab change handlers
  const setViewMode = useCallback(
    (mode: "my-work" | "team") => {
      updateUrl((p) => {
        if (mode === "team" && TEAM_VIEW_ENABLED) {
          p.set("view", "team");
          p.delete("tab");
          if (p.get("assignee") === "me") p.delete("assignee");
        } else {
          p.delete("view");
          p.set("tab", activeTab);
          if (p.get("assignee") === ALL) p.delete("assignee");
        }
      });
    },
    [updateUrl, activeTab]
  );

  const setActiveTab = useCallback(
    (tab: "standardization" | "stale") => {
      updateUrl((p) => {
        p.delete("view");
        if (tab === "stale") {
          p.set("tab", "stale");
        } else {
          p.delete("tab");
        }
      });
    },
    [updateUrl]
  );

  // Standardization filter setters
  const setStdMissingFilter = useCallback(
    (val: StdMissingFilter) => {
      updateUrl((p) => {
        if (val && val !== "ALL") p.set("miss", val);
        else p.delete("miss");
      });
    },
    [updateUrl]
  );

  const setStdProjectFilter = useCallback(
    (proj: string) => {
      updateUrl((p) => {
        if (proj && proj !== ALL) p.set("proj", proj);
        else p.delete("proj");
      });
    },
    [updateUrl]
  );

  const setStdStatusFilter = useCallback(
    (st: string) => {
      updateUrl((p) => {
        if (st && st !== ALL) p.set("stdStatus", st);
        else p.delete("stdStatus");
      });
    },
    [updateUrl]
  );

  const setStdStaleFilter = useCallback(
    (sla: StdStaleFilter) => {
      updateUrl((p) => {
        if (sla && sla !== "ALL") p.set("sla", sla);
        else p.delete("sla");
      });
    },
    [updateUrl]
  );

  const setStdSort = useCallback(
    (sort: StdSortMode) => {
      updateUrl((p) => {
        if (sort && sort !== "missing-desc") p.set("sort", sort);
        else p.delete("sort");
      });
    },
    [updateUrl]
  );

  const clearStdFilters = useCallback(() => {
    setStdSearch("");
    updateUrl((p) => {
      p.delete("miss");
      p.delete("proj");
      p.delete("stdStatus");
      p.delete("sla");
      p.delete("sort");
      p.delete("q");
    });
  }, [updateUrl]);

  // Scope filter setters (supports D15 URL persistence)
  const setProject = useCallback(
    (val: string) => {
      updateUrl((p) => {
        if (val && val !== ALL) p.set("project", val);
        else p.delete("project");
      });
    },
    [updateUrl]
  );

  const setAssignee = useCallback(
    (val: string) => {
      updateUrl((p) => {
        if (val === "me") {
          p.delete("view");
          p.delete("assignee");
        } else if (val === ALL && TEAM_VIEW_ENABLED) {
          p.set("view", "team");
          p.delete("tab");
          p.delete("assignee");
        } else {
          p.set("assignee", val);
        }
      });
    },
    [updateUrl]
  );

  const setStatus = useCallback(
    (val: string) => {
      updateUrl((p) => {
        if (val && val !== ALL) p.set("status", val);
        else p.delete("status");
      });
    },
    [updateUrl]
  );

  const setReason = useCallback(
    (val: string) => {
      updateUrl((p) => {
        if (val && val !== ALL) p.set("reason", val);
        else p.delete("reason");
      });
    },
    [updateUrl]
  );

  const setSeverity = useCallback(
    (val: string) => {
      updateUrl((p) => {
        if (val && val !== ALL) p.set("severity", val);
        else p.delete("severity");
      });
    },
    [updateUrl]
  );

  const clearScopeFilters = useCallback(() => {
    updateUrl((p) => {
      p.delete("project");
      p.delete("assignee");
      p.delete("status");
      p.delete("reason");
      p.delete("severity");
    });
  }, [updateUrl]);

  const hasStdFilters =
    stdMissingFilter !== "ALL" ||
    stdProjectFilter !== ALL ||
    stdStatusFilter !== ALL ||
    stdStaleFilter !== "ALL" ||
    stdSearch.trim().length > 0;

  const hasServerFilters = [project, assignee, status, reason, severity].some(
    (v) => v !== ALL && v !== "me"
  );

  return {
    viewMode,
    activeTab,
    setViewMode,
    setActiveTab,

    // Standardization filters
    stdMissingFilter,
    setStdMissingFilter,
    stdProjectFilter,
    setStdProjectFilter,
    stdStatusFilter,
    setStdStatusFilter,
    stdStaleFilter,
    setStdStaleFilter,
    stdSearch,
    setStdSearch,
    stdSort,
    setStdSort,
    hasStdFilters,
    clearStdFilters,

    // Scope filters
    project,
    setProject,
    assignee,
    setAssignee,
    status,
    setStatus,
    reason,
    setReason,
    severity,
    setSeverity,
    hasServerFilters,
    clearScopeFilters,
  };
}
