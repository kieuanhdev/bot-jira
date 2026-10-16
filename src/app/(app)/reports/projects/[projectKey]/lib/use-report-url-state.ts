"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReportPeriod, ReportUnit, ReportStatusGroup } from "@/lib/reports/types";
import { parsePeriodParams } from "@/app/(app)/reports/lib/parse-period-params";
import {
  type ReportStateParams,
  buildReportUrlSearchParams,
  shouldReplaceReportUrl,
} from "./report-url-state";

export function useReportUrlState() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pendingNavigationUrlRef = useRef<string | null>(null);

  // Parse state directly from URL searchParams
  const period = useMemo(() => parsePeriodParams(searchParams), [searchParams]);
  const versionId = searchParams.get("versionId") || "all";
  const unit = (searchParams.get("unit") as ReportUnit) || "auto";
  const activeTab = searchParams.get("tab") || "overview";
  const activeMember = searchParams.get("member") || null;
  const activeActivity = searchParams.get("activity") || "all";
  const activeStatusGroup = (searchParams.get("statusGroup") as ReportStatusGroup) || null;
  const activeAssignee = searchParams.get("assignee") || "all";
  const activeSearch = searchParams.get("search") || "";
  const activeOffset = parseInt(searchParams.get("offset") || "0", 10) || 0;

  // Local immediate state for search input to allow smooth typing without lagging
  const [tasksSearchInput, setTasksSearchInput] = useState(activeSearch);
  const [prevActiveSearch, setPrevActiveSearch] = useState(activeSearch);
  if (activeSearch !== prevActiveSearch) {
    setPrevActiveSearch(activeSearch);
    setTasksSearchInput(activeSearch);
  }

  // Base state object helper
  const currentState: ReportStateParams = useMemo(() => ({
    period,
    versionId,
    unit,
    activeTab,
    activeMember,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    activeSearch,
    activeOffset,
  }), [
    period,
    versionId,
    unit,
    activeTab,
    activeMember,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    activeSearch,
    activeOffset,
  ]);

  const navigate = useCallback(
    (
      nextState: typeof currentState,
      mode: "push" | "replace" = "replace"
    ) => {
      const params = buildReportUrlSearchParams(nextState);
      const nextQs = params.toString();
      const nextUrl = nextQs ? `${pathname}?${nextQs}` : pathname;
      const currentQs = searchParams.toString();
      const currentUrl = currentQs ? `${pathname}?${currentQs}` : pathname;

      if (pendingNavigationUrlRef.current === currentUrl) {
        pendingNavigationUrlRef.current = null;
      }

      if (mode === "push") {
        pendingNavigationUrlRef.current = nextUrl;
        router.push(nextUrl, { scroll: false });
      } else {
        if (shouldReplaceReportUrl(nextUrl, currentUrl, pendingNavigationUrlRef.current)) {
          router.replace(nextUrl, { scroll: false });
        }
      }
    },
    [pathname, router, searchParams]
  );

  const setPeriod = useCallback(
    (newPeriod: ReportPeriod) => {
      navigate({ ...currentState, period: newPeriod }, "replace");
    },
    [currentState, navigate]
  );

  const setVersionId = useCallback(
    (newVersionId: string) => {
      navigate({ ...currentState, versionId: newVersionId, activeOffset: 0 }, "replace");
    },
    [currentState, navigate]
  );

  const setUnit = useCallback(
    (newUnit: ReportUnit) => {
      navigate({ ...currentState, unit: newUnit }, "replace");
    },
    [currentState, navigate]
  );

  const handleTabChange = useCallback(
    (tabId: string) => {
      if (tabId === activeTab) return;
      const nextMember = tabId === "members" ? activeMember : null;
      navigate(
        {
          ...currentState,
          activeTab: tabId,
          activeMember: nextMember,
        },
        "push"
      );
    },
    [activeTab, activeMember, currentState, navigate]
  );

  const handleSelectMember = useCallback(
    (assignee: string | null) => {
      const nextState = {
        ...currentState,
        activeTab: "members",
        activeMember: assignee,
      };
      if (assignee) {
        navigate(nextState, "push");
      } else {
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          navigate(nextState, "push");
        }
      }
    },
    [currentState, navigate, router]
  );

  const handleBackFromMember = useCallback(() => {
    handleSelectMember(null);
  }, [handleSelectMember]);

  const handleDrillDownToTasks = useCallback(
    (filter: {
      activity?: string;
      statusGroup?: string;
      assignee?: string;
    }) => {
      const nextActivity = filter.activity !== undefined ? filter.activity : activeActivity;
      const nextStatusGroup =
        filter.statusGroup !== undefined
          ? (filter.statusGroup as ReportStatusGroup)
          : activeStatusGroup;
      const nextAssignee = filter.assignee !== undefined ? filter.assignee : activeAssignee;

      navigate(
        {
          ...currentState,
          activeTab: "tasks",
          activeMember: null,
          activeActivity: nextActivity,
          activeStatusGroup: nextStatusGroup,
          activeAssignee: nextAssignee,
          activeOffset: 0,
        },
        "push"
      );
    },
    [activeActivity, activeStatusGroup, activeAssignee, currentState, navigate]
  );

  const handleNavigateToOverview = useCallback(() => {
    navigate(
      {
        ...currentState,
        activeTab: "overview",
        activeMember: null,
        activeActivity: "all",
        activeStatusGroup: null,
        activeAssignee: "all",
        activeSearch: "",
        activeOffset: 0,
      },
      "push"
    );
  }, [currentState, navigate]);

  const handleNavigateBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      handleNavigateToOverview();
    }
  }, [handleNavigateToOverview, router]);

  // Tasks tab filter setters
  const setTasksActivity = useCallback(
    (activity: string) => {
      navigate({ ...currentState, activeActivity: activity, activeOffset: 0 }, "replace");
    },
    [currentState, navigate]
  );

  const setTasksStatusGroup = useCallback(
    (statusGroup: ReportStatusGroup | null | "all") => {
      const nextGroup = statusGroup === "all" ? null : statusGroup;
      navigate({ ...currentState, activeStatusGroup: nextGroup, activeOffset: 0 }, "replace");
    },
    [currentState, navigate]
  );

  const setTasksAssignee = useCallback(
    (assignee: string) => {
      navigate({ ...currentState, activeAssignee: assignee, activeOffset: 0 }, "replace");
    },
    [currentState, navigate]
  );

  const setTasksSearch = useCallback(
    (search: string) => {
      setTasksSearchInput(search);
      navigate({ ...currentState, activeSearch: search, activeOffset: 0 }, "replace");
    },
    [currentState, navigate]
  );

  const setTasksOffset = useCallback(
    (offset: number) => {
      navigate({ ...currentState, activeOffset: offset }, "replace");
    },
    [currentState, navigate]
  );

  const resetTasksFilters = useCallback(() => {
    setTasksSearchInput("");
    navigate(
      {
        ...currentState,
        activeActivity: "all",
        activeStatusGroup: null,
        activeAssignee: "all",
        activeSearch: "",
        activeOffset: 0,
      },
      "replace"
    );
  }, [currentState, navigate]);

  return {
    period,
    setPeriod,
    versionId,
    setVersionId,
    unit,
    setUnit,
    activeTab,
    activeMember,
    activeActivity,
    activeStatusGroup,
    activeAssignee,
    activeSearch,
    activeOffset,
    tasksSearchInput,
    setTasksSearchInput,
    handleTabChange,
    handleSelectMember,
    handleBackFromMember,
    handleDrillDownToTasks,
    handleNavigateToOverview,
    handleNavigateBack,
    setTasksActivity,
    setTasksStatusGroup,
    setTasksAssignee,
    setTasksSearch,
    setTasksOffset,
    resetTasksFilters,
  };
}
