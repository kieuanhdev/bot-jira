"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useIssues, fetchIssuesPage, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, bulkKeys, meKeys, staleKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { type IssueFilters, DEFAULT_BULK_FILTERS } from "@/lib/issues/issue-filters";
import { ListChecks } from "lucide-react";
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
import { BulkHistoryCard } from "./bulk-history-card";
import { BulkProgressSteps, BulkTopNav, StandardizationBanner } from "./bulk-header-parts";
import { BulkPreviewCard } from "./bulk-preview-step";
import { BulkSelectCard } from "./bulk-select-card";
import { BulkConfigureCard } from "./bulk-configure-card";
import { useBulkFieldState } from "./lib/use-bulk-field-state";
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

  // Form field state
  const fieldState = useBulkFieldState();

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
          fieldState.setters.setEstimate("");
        }
        if (unavailableIds.has("points")) {
          fieldState.setters.setPoints("");
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

  function resetPreview() {
    setPreview(null);
    setPreviewBasis(null);
  }

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
    fieldState.resetFields();
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

  const isEstimateValid = isValidEstimate(fieldState.values.estimate);
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
        clearAssignee: fieldState.values.clearAssignee,
        assignee: fieldState.values.assignee,
        clearLabels: fieldState.values.clearLabels,
        label: fieldState.values.label,
        priority: fieldState.values.priority,
        issueType: fieldState.values.issueType,
        clearPoints: fieldState.values.clearPoints,
        points: fieldState.values.points,
        availableFieldMap,
        estimate: fieldState.values.estimate,
        isEstimateValid,
        clearDueDate: fieldState.values.clearDueDate,
        dueDate: fieldState.values.dueDate,
        clearFixVersions: fieldState.values.clearFixVersions,
        fixVersions: fieldState.values.fixVersions,
        clearEpic: fieldState.values.clearEpic,
        epic: fieldState.values.epic,
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
      fieldState.values,
      availableFieldMap,
      isEstimateValid,
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
      <BulkSelectCard
        filterProject={filterProject}
        projectOptions={projectOptions}
        projectIssuesCount={projectIssues.length}
        onProjectChange={handleProjectChange}
        selectionMode={selectionMode}
        taskFilters={taskFilters}
        availableAssignees={availableAssignees}
        statusOptions={statusOptions}
        epicOptions={epicOptions}
        labelOptions={labelOptions}
        priorityOptions={priorityOptions}
        myName={session?.user?.jiraUsername}
        filteredIssues={filteredIssues}
        onSelectionModeChange={setSelectionMode}
        onTaskFiltersChange={setTaskFilters}
        allSelected={allSelected}
        selected={selected}
        filterOnlySelected={filterOnlySelected}
        sortOption={sortOption}
        onToggleAll={toggleAll}
        onFilterOnlySelectedChange={setFilterOnlySelected}
        onSortOptionChange={setSortOption}
        isIssuesLoading={isIssuesLoading}
        initialKeysSet={initialKeysSet}
        jiraBaseUrl={jiraBaseUrl}
        onToggle={toggle}
        loadedCount={issues.length}
        totalServerIssues={totalServerIssues}
        isLoadingMore={isLoadingMore}
        effectiveCount={effectiveCount}
        onLoadMore={handleLoadMore}
      />

      {/* Step 2 — Field selection & input */}
      <BulkConfigureCard
        filterProject={filterProject}
        operationKind={operationKind}
        effectiveCount={effectiveCount}
        onOperationKindChange={handleOperationKindChange}
        worklogDuration={worklogDuration}
        setWorklogDuration={setWorklogDuration}
        isWorklogDurationValid={isWorklogDurationValid}
        worklogStarted={worklogStarted}
        setWorklogStarted={setWorklogStarted}
        worklogComment={worklogComment}
        setWorklogComment={setWorklogComment}
        allProjectStatuses={allProjectStatuses}
        targetStatus={targetStatus}
        setTargetStatus={setTargetStatus}
        fieldsLoading={fieldsLoading}
        availableFieldMap={availableFieldMap}
        enabledFields={enabledFields}
        onToggleField={toggleField}
        values={fieldState.values}
        setters={fieldState.setters}
        availableAssignees={availableAssignees}
        labelOptions={labelOptions}
        priorityOptions={priorityOptions}
        versionOptions={versionOptions}
        versionsLoading={versionsLoading}
        isEstimateValid={isEstimateValid}
        resetPreview={resetPreview}
        onPreview={doPreview}
        previewing={previewing}
        selectionMode={selectionMode}
        selectedCount={selected.size}
        isActionReady={Boolean(buildAction())}
        previewError={previewError}
      />

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
