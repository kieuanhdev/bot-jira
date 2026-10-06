"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useIssues, fetchIssuesPage, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, bulkKeys, meKeys, staleKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/page-header";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { type IssueFilters, DEFAULT_BULK_FILTERS } from "@/lib/issues/issue-filters";
import { Loader2, Eye, ListChecks } from "lucide-react";
import { parseJiraDuration } from "@/lib/worklogs/schema";
import {
  type BulkAction,
  type Preview,
  type BulkVersionOption,
  type ProjectFieldOption,
  type OpListItem,
  type PreviewBucket,
} from "./lib/bulk-types";
import { previewBucket } from "./lib/bulk-utils";
import { BulkConfirmDialog } from "./bulk-confirm-dialog";
import {
  BulkConfigureEmptyState,
  BulkFieldInputs,
  BulkFieldPicker,
  BulkOperationModeSwitch,
  BulkTransitionForm,
  BulkWorklogForm,
} from "./bulk-configure-step";
import { BulkHistoryCard } from "./bulk-history-card";
import { BulkProgressSteps, BulkTopNav, StandardizationBanner } from "./bulk-header-parts";
import { BulkPreviewCard } from "./bulk-preview-step";
import {
  BulkNoProjectState,
  BulkProjectSelector,
  BulkTaskFilters,
  BulkTaskList,
  BulkTaskListFooter,
  BulkTaskListToolbar,
} from "./bulk-select-step";
import {
  buildBulkAction,
  buildPreviewRequestBody,
  countPreviewBuckets,
  deriveAssigneeOptions,
  deriveEpicOptions,
  deriveLabelOptions,
  derivePriorityOptions,
  deriveProjectStatuses,
  deriveStatusOptions,
  filterAndSortIssues,
  getConfirmLabel,
  isValidEstimate,
  withPlaceholderIssues,
  type BulkFiltersResponse,
  type OperationKind,
} from "./lib/bulk-logic";

export function BulkClient() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  const returnTo = searchParams?.get("returnTo");

  const initialKeys = useMemo(() => {
    const raw = searchParams?.get("keys");
    if (!raw) return [];
    return raw
      .split(",")
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
  }, [searchParams]);

  const initialKeysSet = useMemo(() => new Set(initialKeys), [initialKeys]);
  const initialKeyIndexMap = useMemo(
    () => new Map(initialKeys.map((k, idx) => [k, idx])),
    [initialKeys]
  );

  const initialFields = useMemo(() => {
    const raw = searchParams?.get("fields");
    if (!raw) return [];
    return raw
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  }, [searchParams]);

  const initialProjectFromUrl = useMemo(() => {
    const p = searchParams?.get("project");
    if (p) return p.trim().toUpperCase();
    if (initialKeys.length > 0) {
      return initialKeys[0].split("-")[0] ?? "";
    }
    return "";
  }, [searchParams, initialKeys]);

  // Project scope (MANDATORY)
  const [filterProject, setFilterProject] = useState(initialProjectFromUrl);
  const [extraIssues, setExtraIssues] = useState<IssueItem[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Load issues from cache directly scoped to the selected project
  const { data, isLoading, isFetching } = useIssues(
    {
      project: filterProject,
      includeDone: true,
      limit: 1000,
      assignee: "all",
    },
    { enabled: Boolean(filterProject) }
  );

  const issues: IssueItem[] = useMemo(() => {
    const baseItems = data && "items" in data ? data.items : [];
    if (extraIssues.length === 0) return baseItems;
    const seen = new Set(baseItems.map((i) => i.jiraKey));
    const uniqueExtra = extraIssues.filter((i) => !seen.has(i.jiraKey));
    return [...baseItems, ...uniqueExtra];
  }, [data, extraIssues]);

  const totalServerIssues = data && "total" in data ? data.total : issues.length;
  const isIssuesLoading = isLoading || (Boolean(filterProject) && isFetching && issues.length === 0);

  async function handleLoadMore() {
    if (!filterProject || isLoadingMore || issues.length >= totalServerIssues) return;
    setIsLoadingMore(true);
    try {
      const nextPage = await fetchIssuesPage(
        { project: filterProject, includeDone: true, assignee: "all" },
        issues.length,
        1000
      );
      if (nextPage && "items" in nextPage && Array.isArray(nextPage.items)) {
        setExtraIssues((prev) => [...prev, ...nextPage.items]);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Load distinct filter options for the project from server
  const { data: filtersData } = useQuery({
    queryKey: issuesKeys.filters(filterProject || "bulk"),
    queryFn: () =>
      api<BulkFiltersResponse>(
        `/api/issues/filters?project=${encodeURIComponent(filterProject)}`
      ),
    enabled: Boolean(filterProject),
    staleTime: 60_000,
    retry: 0,
  });

  // Jira base URL for deep links
  const { data: meStatus } = useQuery({
    queryKey: meKeys.status,
    queryFn: () => api<{ jiraName: string | null; jiraBaseUrl?: string }>("/api/me/status"),
    retry: 0,
  });
  const jiraBaseUrl = (meStatus?.jiraBaseUrl ?? "").replace(/\/$/, "");

  // Project list
  const { data: projectsData } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: { key: string; openCount: number }[] }>("/api/projects"),
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const projectOptions = useMemo(() => projectsData?.items ?? [], [projectsData?.items]);

  // User preferences (to pre-select the active project)
  const { data: prefs } = useQuery({
    queryKey: meKeys.prefs,
    queryFn: () => api<{ projects: string[]; available: string[] }>("/api/me/preferences"),
    retry: 0,
  });

  // Auto-select the first preferred project (or the first available project)
  if (!filterProject && (prefs || projectOptions.length > 0)) {
    const preferred = prefs?.projects ?? [];
    const available = prefs?.available ?? [];
    const projectKeys = projectOptions.map((p) => p.key);
    // Pick the first preferred project that actually exists in the project list
    const pick =
      preferred.find((k) => projectKeys.includes(k)) ??
      available.find((k) => projectKeys.includes(k)) ??
      projectKeys[0] ??
      "";
     
    if (pick) {
      setFilterProject(pick);
      setExtraIssues([]);
    }
  }

  // Selection mode and task filters
  const [selectionMode, setSelectionMode] = useState<"pick" | "filter">("pick");
  const [taskFilters, setTaskFilters] = useState<IssueFilters>(DEFAULT_BULK_FILTERS);

  // Tasks belonging ONLY to the selected project
  const projectIssues = useMemo(
    () => (filterProject ? issues.filter((issue) => issue.projectKey === filterProject) : []),
    [filterProject, issues]
  );
  const availableAssignees = useMemo(
    () => deriveAssigneeOptions(filtersData, projectIssues),
    [filtersData, projectIssues]
  );

  const labelOptions = useMemo(
    () => deriveLabelOptions(filtersData, projectIssues),
    [filtersData, projectIssues]
  );

  const priorityOptions = useMemo(
    () => derivePriorityOptions(filtersData, projectIssues),
    [filtersData, projectIssues]
  );

  const epicOptions = useMemo(
    () => deriveEpicOptions(filtersData, projectIssues, session?.user?.jiraUsername),
    [filtersData, projectIssues, session?.user?.jiraUsername]
  );

  // Selected task keys
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialKeys));
  const [prevInitialKeys, setPrevInitialKeys] = useState(initialKeys);
  if (initialKeys !== prevInitialKeys) {
    setPrevInitialKeys(initialKeys);
    if (initialKeys.length > 0) {
      setSelected(new Set(initialKeys));
      const proj = searchParams?.get("project")?.trim().toUpperCase() || initialKeys[0]?.split("-")[0];
      if (proj && proj !== filterProject) {
        setFilterProject(proj);
        setExtraIssues([]);
      }
    }
  }

  // Enabled fields toggle
  const [enabledFields, setEnabledFields] = useState<Set<string>>(() => new Set(initialFields));
  const [prevInitialFields, setPrevInitialFields] = useState(initialFields);
  if (initialFields !== prevInitialFields) {
    setPrevInitialFields(initialFields);
    if (initialFields.length > 0) {
      setEnabledFields(new Set(initialFields));
    }
  }

  // Field values
  const [assignee, setAssignee] = useState("");
  const [clearAssignee, setClearAssignee] = useState(false);
  const [label, setLabel] = useState("");
  const [clearLabels, setClearLabels] = useState(false);
  const [priority, setPriority] = useState("");
  const [issueType, setIssueType] = useState("");
  const [points, setPoints] = useState("");
  const [clearPoints, setClearPoints] = useState(false);
  const [estimate, setEstimate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [clearDueDate, setClearDueDate] = useState(false);
  const [fixVersions, setFixVersions] = useState<string[]>([]);
  const [clearFixVersions, setClearFixVersions] = useState(false);
  const [epic, setEpic] = useState("");
  const [clearEpic, setClearEpic] = useState(false);

  // Sorting option for tasks
  const [sortOption, setSortOption] = useState<
    "default" | "name-asc" | "name-desc" | "created-desc" | "created-asc" | "updated-desc"
  >("default");

  // Operation Kind: "update-fields" | "transition" | "log-work"
  const actionParam = searchParams?.get("action");
  const [operationKind, setOperationKind] = useState<"update-fields" | "transition" | "log-work">(() => {
    if (actionParam === "log-work") return "log-work";
    if (actionParam === "transition") return "transition";
    return "update-fields";
  });
  const [prevActionParam, setPrevActionParam] = useState(actionParam);
  if (actionParam !== prevActionParam) {
    setPrevActionParam(actionParam);
    if (actionParam === "log-work") setOperationKind("log-work");
    else if (actionParam === "transition") setOperationKind("transition");
    else if (actionParam) setOperationKind("update-fields");
  }

  // Target status for transition mode
  const [targetStatus, setTargetStatus] = useState("");

  const [worklogDuration, setWorklogDuration] = useState("");
  const [worklogStarted, setWorklogStarted] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [worklogComment, setWorklogComment] = useState("");

  // Preview & operation states
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewView, setPreviewView] = useState<PreviewBucket>("changes");
  const [previewBasis, setPreviewBasis] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Operations history
  const [ops, setOps] = useState<OpListItem[]>([]);
  const [opsLoaded, setOpsLoaded] = useState(false);

  function loadOps() {
    api<{ items: OpListItem[] }>("/api/bulk/operations?limit=20")
      .then((r) => setOps(r.items))
      .catch(() => null)
      .finally(() => setOpsLoaded(true));
  }

  useEffect(loadOps, []);

  // Fetch project editable fields metadata
  const { data: projectFieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: bulkKeys.fields(filterProject),
    queryFn: () =>
      api<{
        project: string;
        sampleKey: string | null;
        fields: ProjectFieldOption[];
        fallback: boolean;
      }>(`/api/bulk/fields?project=${encodeURIComponent(filterProject)}`),
    enabled: Boolean(filterProject),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const availableFieldMap = useMemo(() => {
    const map = new Map<string, ProjectFieldOption>();
    (projectFieldsData?.fields ?? []).forEach((f) => map.set(f.id, f));
    return map;
  }, [projectFieldsData?.fields]);

  // Automatically prune any fields that are not available for the active project
  const [prevProjectFields, setPrevProjectFields] = useState(projectFieldsData?.fields);
  if (projectFieldsData?.fields !== prevProjectFields) {
    setPrevProjectFields(projectFieldsData?.fields);
    if (projectFieldsData?.fields) {
      const unavailableIds: Set<string> = new Set(
        projectFieldsData.fields.filter((f) => !f.available).map((f) => String(f.id))
      );
      if (unavailableIds.size > 0) {
        setEnabledFields((prev) => {
          let changed = false;
          const next = new Set<string>();
          for (const id of prev) {
            if (unavailableIds.has(id)) {
              changed = true;
            } else {
              next.add(id);
            }
          }
          return changed ? next : prev;
        });

        if (unavailableIds.has("estimate")) {
          setEstimate("");
        }
        if (unavailableIds.has("points")) {
          setPoints("");
        }
      }
    }
  }

  // Fetch Fix Versions for the selected project
  const selectedProjects = filterProject ? [filterProject] : [];
  const isFixVersionAction = enabledFields.has("fixVersions");
  const { data: bulkVersions, isLoading: versionsLoading } = useQuery({
    queryKey: bulkKeys.versions(selectedProjects),
    queryFn: () =>
      api<{
        items: BulkVersionOption[];
        projects: string[];
        unavailableProjects: string[];
      }>(`/api/bulk/versions?projects=${encodeURIComponent(selectedProjects.join(","))}`),
    enabled: isFixVersionAction && selectedProjects.length > 0,
    staleTime: 60_000,
    retry: 1,
  });
  const versionOptions = bulkVersions?.items ?? [];

  const [filterOnlySelected, setFilterOnlySelected] = useState(false);

  // Reset when changing project
  function handleProjectChange(newProject: string) {
    setFilterProject(newProject);
    setExtraIssues([]);
    setSelected(new Set());
    setTaskFilters(DEFAULT_BULK_FILTERS);
    setFilterOnlySelected(false);
    setSortOption("default");
    setTargetStatus("");
    resetPreview();
    setEnabledFields(new Set());
    setAssignee("");
    setClearAssignee(false);
    setLabel("");
    setClearLabels(false);
    setPriority("");
    setIssueType("");
    setPoints("");
    setClearPoints(false);
    setEstimate("");
    setDueDate("");
    setClearDueDate(false);
    setFixVersions([]);
    setClearFixVersions(false);
    setEpic("");
    setClearEpic(false);
  }

  // Fetch workflow statuses for the selected project
  const { data: boardStatusesData } = useQuery({
    queryKey: ["board", "statuses", filterProject],
    queryFn: () =>
      api<{ items: { name: string; category: string }[] }>(
        `/api/board/statuses?project=${encodeURIComponent(filterProject)}`
      ),
    enabled: Boolean(filterProject),
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const allProjectStatuses = useMemo(
    () => deriveProjectStatuses(boardStatusesData?.items, filtersData?.statuses, projectIssues),
    [boardStatusesData?.items, filtersData, projectIssues]
  );

  const statusOptions = useMemo(
    () => deriveStatusOptions(allProjectStatuses, filtersData?.statuses, projectIssues),
    [allProjectStatuses, filtersData, projectIssues]
  );

  // Guarantee placeholder for any initial keys if not already present in the loaded issues list
  const displayProjectIssues = useMemo(
    () => withPlaceholderIssues(initialKeys, filterProject, projectIssues),
    [filterProject, initialKeys, projectIssues]
  );

  const filteredIssues = useMemo(
    () =>
      filterAndSortIssues(displayProjectIssues, {
        filterProject,
        taskFilters,
        jiraUsername: session?.user?.jiraUsername,
        filterOnlySelected,
        selected,
        sortOption,
        initialKeyIndexMap,
      }),
    [
      filterProject,
      displayProjectIssues,
      taskFilters,
      session?.user?.jiraUsername,
      filterOnlySelected,
      sortOption,
      selected,
      initialKeyIndexMap,
    ]
  );

  const allSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selected.has(i.jiraKey));

  const effectiveCount = selectionMode === "filter" ? filteredIssues.length : selected.size;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allSelected) filteredIssues.forEach((issue) => next.delete(issue.jiraKey));
      else filteredIssues.forEach((issue) => next.add(issue.jiraKey));
      return next;
    });
  }

  const isEstimateValid = isValidEstimate(estimate);
  const isWorklogDurationValid = Boolean(worklogDuration.trim() && parseJiraDuration(worklogDuration.trim()));

  const buildAction = useCallback(
    (): BulkAction | null =>
      buildBulkAction({
        filterProject,
        operationKind,
        targetStatus,
        worklogDuration,
        isWorklogDurationValid,
        worklogStarted,
        worklogComment,
        enabledFields,
        clearAssignee,
        assignee,
        clearLabels,
        label,
        priority,
        issueType,
        clearPoints,
        points,
        availableFieldMap,
        estimate,
        isEstimateValid,
        clearDueDate,
        dueDate,
        clearFixVersions,
        fixVersions,
        clearEpic,
        epic,
      }),
    [
    filterProject,
    operationKind,
    targetStatus,
    worklogDuration,
    isWorklogDurationValid,
    worklogStarted,
    worklogComment,
    enabledFields,
    clearAssignee,
    assignee,
    clearLabels,
    label,
    priority,
    issueType,
    clearPoints,
    points,
    availableFieldMap,
    estimate,
    isEstimateValid,
    clearDueDate,
    dueDate,
    clearFixVersions,
    fixVersions,
    clearEpic,
    epic,
    ]
  );

  function toggleField(field: string) {
    if (availableFieldMap.get(field)?.available === false) return;
    setEnabledFields((previous) => {
      const next = new Set(previous);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
    resetPreview();
  }

  function resetPreview() {
    setPreview(null);
    setPreviewBasis(null);
  }

  function handleOperationKindChange(kind: OperationKind) {
    setOperationKind(kind);
    resetPreview();
  }

  const currentBasis = useMemo(() => {
    const action = buildAction();
    if (selectionMode === "filter") {
      return JSON.stringify({
        action,
        mode: "filter",
        project: filterProject,
        filters: taskFilters,
      });
    }
    return JSON.stringify({
      action,
      mode: "keys",
      keys: Array.from(selected).sort(),
    });
  }, [selectionMode, filterProject, taskFilters, selected, buildAction]);

  const previewOutdated = preview != null && previewBasis !== currentBasis;

  async function doPreview() {
    const action = buildAction();
    if (!action || !filterProject) return;
    if (selectionMode === "pick" && selected.size === 0) return;
    setPreviewing(true);
    setPreview(null);
    setActiveOp(null);
    setPreviewError(null);
    try {
      const body = buildPreviewRequestBody({ selectionMode, filterProject, taskFilters, selected, action });
      const r = await api<Preview>("/api/issues/bulk", {
        method: "POST",
        body,
      });
      setPreview(r);
      setPreviewBasis(currentBasis);
      setPreviewView("changes");
    } catch (e) {
      setPreview(null);
      setPreviewError((e as Error).message);
    } finally {
      setPreviewing(false);
    }
  }

  async function doConfirm() {
    if (!preview) return;
    setConfirming(true);
    try {
      const r = await api<{ operationId: string; queued: boolean }>("/api/issues/bulk", {
        method: "POST",
        body: {
          confirm: true,
          operationId: preview.operationId,
        },
      });
      if (selectionMode === "pick") setSelected(new Set());
      setActiveOp(r.operationId);
      qc.invalidateQueries({ queryKey: issuesKeys.all });
      qc.invalidateQueries({ queryKey: staleKeys.all });
      loadOps();
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  async function doCancelPreview() {
    if (!preview) return;
    try {
      await api(`/api/bulk/operations/${preview.operationId}/cancel`, { method: "POST" });
    } catch {
      /* ignore */
    }
    resetPreview();
  }

  async function doRetry(id: string) {
    try {
      await api(`/api/bulk/operations/${id}/retry`, { method: "POST" });
      setActiveOp(id);
      loadOps();
    } catch (e) {
      setPreviewError((e as Error).message);
    }
  }

  const previewCounts = countPreviewBuckets(preview);

  const visiblePreviewItems = preview?.items.filter((item) => previewBucket(item) === previewView) ?? [];
  const isLogWorkOp = buildAction()?.kind === "log-work" || preview?.type === "log-work";
  const isTransitionOp = buildAction()?.kind === "transition" || preview?.type === "transition";
  const confirmLabel = getConfirmLabel({ preview, isLogWorkOp, isTransitionOp, targetStatus });


  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Top Navigation Switcher */}
      <BulkTopNav />

      <PageHeader
        eyebrow="Không gian làm việc Jira"
        icon={ListChecks}
        title="Thao tác hàng loạt theo dự án"
        description="Chọn dự án, lọc task, bật nhiều trường cần cập nhật và kiểm tra bản xem trước trước khi thực thi an toàn."
        actions={
          <>
            {filterProject && (
              <Badge variant="outline" className="px-3 py-1 font-mono text-xs">
                Dự án: {filterProject}
              </Badge>
            )}
            <Badge variant={effectiveCount > 0 ? "info" : "secondary"} className="w-fit px-3 py-1">
              {effectiveCount} task sẽ được cập nhật
            </Badge>
          </>
        }
      />

      {/* Progress Steps */}
      <BulkProgressSteps
        filterProject={filterProject}
        effectiveCount={effectiveCount}
        operationKind={operationKind}
        actionReady={Boolean(buildAction())}
        hasPreview={Boolean(preview)}
      />

      {/* Standardization Banner */}
      {returnTo === "standardization" && initialKeys.length > 0 && (
        <StandardizationBanner count={initialKeys.length} />
      )}

      {/* Step 1 — Project Scope & Task Selection */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">1</span>
            Chọn phạm vi dự án & danh sách task
          </CardTitle>
          <CardDescription>
            Bắt buộc chọn một dự án trước. Thao tác hàng loạt chỉ thực hiện trên các task thuộc cùng một dự án.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Project selector banner */}
          <BulkProjectSelector
            filterProject={filterProject}
            projectOptions={projectOptions}
            issueCount={projectIssues.length}
            onProjectChange={handleProjectChange}
          />

          {!filterProject ? (
            <BulkNoProjectState />
          ) : (
            <>
              {/* Task filters */}
              <BulkTaskFilters
                filterProject={filterProject}
                selectionMode={selectionMode}
                taskFilters={taskFilters}
                availableAssignees={availableAssignees}
                statusOptions={statusOptions}
                epicOptions={epicOptions}
                labelOptions={labelOptions}
                priorityOptions={priorityOptions}
                myName={session?.user?.jiraUsername}
                filteredCount={filteredIssues.length}
                onSelectionModeChange={setSelectionMode}
                onTaskFiltersChange={setTaskFilters}
              />

              <BulkTaskListToolbar
                selectionMode={selectionMode}
                allSelected={allSelected}
                selectedCount={selected.size}
                filteredCount={filteredIssues.length}
                filterOnlySelected={filterOnlySelected}
                sortOption={sortOption}
                onToggleAll={toggleAll}
                onFilterOnlySelectedChange={setFilterOnlySelected}
                onSortOptionChange={setSortOption}
              />

              {/* Task table / list */}
              <BulkTaskList
                isIssuesLoading={isIssuesLoading}
                filteredIssues={filteredIssues}
                selectionMode={selectionMode}
                selected={selected}
                initialKeysSet={initialKeysSet}
                jiraBaseUrl={jiraBaseUrl}
                onToggle={toggle}
              />
              <BulkTaskListFooter
                filterProject={filterProject}
                filteredCount={filteredIssues.length}
                loadedCount={issues.length}
                totalServerIssues={totalServerIssues}
                isLoadingMore={isLoadingMore}
                effectiveCount={effectiveCount}
                onLoadMore={handleLoadMore}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Field selection & input */}
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">2</span>
              {operationKind === "log-work"
                ? "Thiết lập Ghi Worklog"
                : operationKind === "transition"
                  ? "Chuyển trạng thái hàng loạt"
                  : "Chọn các trường cần sửa"}
            </span>
            {filterProject && (
              <Badge variant="outline" className="font-normal text-xs">
                Dự án: <span className="font-semibold ml-1">{filterProject}</span>
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {filterProject
              ? operationKind === "log-work"
                ? `Nhập thời lượng thực hiện để ghi nhận cộng dồn lên ${effectiveCount} task đã chọn.`
                : operationKind === "transition"
                  ? `Chọn trạng thái đích để chuyển đổi đồng loạt cho ${effectiveCount} task đã chọn trong dự án ${filterProject}.`
                  : `Bật một hoặc nhiều trường có sẵn của dự án ${filterProject}, nhập giá trị mới rồi xem trước trên ${effectiveCount} task đã chọn.`
              : "Vui lòng chọn dự án ở Bước 1 trước khi cấu hình thao tác."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
          {filterProject && (
            <BulkOperationModeSwitch operationKind={operationKind} onChange={handleOperationKindChange} />
          )}

          {!filterProject ? (
            <BulkConfigureEmptyState />
          ) : operationKind === "log-work" ? (
            <BulkWorklogForm
              effectiveCount={effectiveCount}
              worklogDuration={worklogDuration}
              setWorklogDuration={setWorklogDuration}
              isWorklogDurationValid={isWorklogDurationValid}
              worklogStarted={worklogStarted}
              setWorklogStarted={setWorklogStarted}
              worklogComment={worklogComment}
              setWorklogComment={setWorklogComment}
              resetPreview={resetPreview}
            />
          ) : operationKind === "transition" ? (
            <BulkTransitionForm
              effectiveCount={effectiveCount}
              filterProject={filterProject}
              allProjectStatuses={allProjectStatuses}
              targetStatus={targetStatus}
              setTargetStatus={setTargetStatus}
              resetPreview={resetPreview}
            />
          ) : fieldsLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                <Skeleton key={idx} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <BulkFieldPicker
              availableFieldMap={availableFieldMap}
              enabledFields={enabledFields}
              onToggleField={toggleField}
            />
          )}

          {filterProject && enabledFields.size > 0 && (
            <BulkFieldInputs
              filterProject={filterProject}
              enabledFields={enabledFields}
              values={{
                assignee,
                clearAssignee,
                label,
                clearLabels,
                priority,
                issueType,
                points,
                clearPoints,
                estimate,
                dueDate,
                clearDueDate,
                fixVersions,
                clearFixVersions,
                epic,
                clearEpic,
              }}
              setters={{
                setAssignee,
                setClearAssignee,
                setLabel,
                setClearLabels,
                setPriority,
                setIssueType,
                setPoints,
                setClearPoints,
                setEstimate,
                setDueDate,
                setClearDueDate,
                setFixVersions,
                setClearFixVersions,
                setEpic,
                setClearEpic,
              }}
              resetPreview={resetPreview}
              availableAssignees={availableAssignees}
              labelOptions={labelOptions}
              priorityOptions={priorityOptions}
              versionOptions={versionOptions}
              versionsLoading={versionsLoading}
              availableFieldMap={availableFieldMap}
              isEstimateValid={isEstimateValid}
            />
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2">
            <Button
              onClick={doPreview}
              disabled={
                previewing ||
                (selectionMode === "pick" && selected.size === 0) ||
                !filterProject ||
                !buildAction()
              }
            >
              {previewing ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {selectionMode === "filter"
                ? "Xem trước thay đổi bộ lọc"
                : `Xem trước ${selected.size > 0 ? `${selected.size} ` : ""}thay đổi`}
            </Button>
            {previewError && (
              <FeedbackBanner tone="destructive">{previewError}</FeedbackBanner>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — Preview + Confirm */}
      {preview && (
        <BulkPreviewCard
          preview={preview}
          previewOutdated={previewOutdated}
          isLogWorkOp={isLogWorkOp}
          isTransitionOp={isTransitionOp}
          worklogDuration={worklogDuration}
          targetStatus={targetStatus}
          previewCounts={previewCounts}
          previewView={previewView}
          visiblePreviewItems={visiblePreviewItems}
          jiraBaseUrl={jiraBaseUrl}
          confirming={confirming}
          confirmLabel={confirmLabel}
          onRefresh={doPreview}
          onChangeView={setPreviewView}
          onOpenConfirm={() => setConfirmOpen(true)}
          onCancel={doCancelPreview}
        />
      )}

      {/* Operations History */}
      <BulkHistoryCard
        activeOp={activeOp}
        jiraBaseUrl={jiraBaseUrl}
        opsLoaded={opsLoaded}
        ops={ops}
        onSelectOp={setActiveOp}
        onRetry={doRetry}
      />

      {/* Confirmation Dialog */}
      <BulkConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        isLogWorkOp={isLogWorkOp}
        worklogDuration={worklogDuration}
        preview={preview}
        filterProject={filterProject}
        confirmLabel={confirmLabel}
        confirming={confirming}
        onConfirm={() => {
          setConfirmOpen(false);
          void doConfirm();
        }}
      />
    </div>
  );
}
