"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { api } from "@/lib/api-client";
import { useIssues, fetchIssuesPage, type IssueItem } from "@/hooks/use-issues";
import { issuesKeys, boardKeys, bulkKeys, meKeys, staleKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { SegmentedControl } from "@/components/shared/segmented-control";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import {
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleX,
  Loader2,
  Eye,
  ArrowRight,
  ArrowLeft,
  History,
  ListChecks,
  Search,
  RefreshCw,
  X,
  PackageOpen,
  ExternalLink,
  Clock,
  Edit3,
  ListPlus,
  Sparkles,
  Filter,
} from "lucide-react";
import { parseJiraDuration, formatJiraDuration } from "@/lib/worklogs/schema";
import {
  ACTION_LABELS,
  CATEGORY_TEXT,
  SKIP_LABELS,
  type BulkFieldValues,
  type BulkAction,
  type Preview,
  type BulkVersionOption,
  type ProjectFieldOption,
  type OpListItem,
  type PreviewBucket,
} from "./lib/bulk-types";
import {
  previewBucket,
  stateVariant,
  warningVariant,
  categoryOf,
  statusDot,
  formatTime,
  labelList,
  formatSecondsToJira,
} from "./lib/bulk-utils";
import { AssigneeInput } from "./bulk-assignee-input";
import { OperationDetail } from "./bulk-operation-detail";

function fieldRow(label: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, key: string) {
  const b = before?.[key];
  const a = after?.[key];
  const changed = JSON.stringify(b) !== JSON.stringify(a) && a !== undefined;
  if (!changed && (a === undefined || a === null) && (b === undefined || b === null)) {
    return null;
  }

  let bText: string;
  let aText: string;

  if (key === "estimateSeconds") {
    bText = typeof b === "number" ? formatSecondsToJira(b) : (b ? String(b) : "—");
    aText = typeof a === "number" ? formatSecondsToJira(a) : (a ? String(a) : "—");
  } else if (key === "labels" || key === "fixVersions") {
    bText = labelList(b);
    aText = Array.isArray(a) && a.length === 0 && Array.isArray(b) && b.length > 0
      ? "(Xóa tất cả)"
      : labelList(a);
  } else if (key === "assignee") {
    bText = b ? `@${String(b)}` : "Chưa giao";
    aText = a === null ? "(Bỏ gán)" : (a ? `@${String(a)}` : "Chưa giao");
  } else if (key === "dueDate") {
    bText = b ? String(b) : "—";
    aText = a === null ? "(Xóa ngày)" : (a ? String(a) : "—");
  } else if (key === "points") {
    bText = b != null ? `${b}pt` : "—";
    aText = a === null ? "(Xóa điểm)" : (a != null ? `${a}pt` : "—");
  } else {
    bText = b == null ? "—" : String(b);
    aText = a == null ? "—" : String(a);
  }

  return (
    <div key={key} className={cn("flex items-center gap-2 rounded px-2 py-0.5 text-xs transition-colors", changed && "bg-primary/5")}>
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("truncate", changed && "text-muted-foreground line-through")}>{bText}</span>
      {changed && (
        <>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate font-medium text-foreground">{aText}</span>
          <Badge variant="success" className="ml-auto text-[10px] px-1.5 py-0">Thay đổi</Badge>
        </>
      )}
    </div>
  );
}

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
      api<{ assignees: string[]; labels: string[]; priorities: string[] }>(
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
  useEffect(() => {
    if (filterProject) return; // already selected by user
    const preferred = prefs?.projects ?? [];
    const available = prefs?.available ?? [];
    const projectKeys = projectOptions.map((p) => p.key);
    // Pick the first preferred project that actually exists in the project list
    const pick =
      preferred.find((k) => projectKeys.includes(k)) ??
      available.find((k) => projectKeys.includes(k)) ??
      projectKeys[0] ??
      "";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pick) {
      setFilterProject(pick);
      setExtraIssues([]);
    }
  }, [prefs, projectOptions, filterProject]);

  // Selection mode and task filters
  const [selectionMode, setSelectionMode] = useState<"pick" | "filter">("pick");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [taskSearch, setTaskSearch] = useState("");

  // Tasks belonging ONLY to the selected project
  const projectIssues = useMemo(
    () => (filterProject ? issues.filter((issue) => issue.projectKey === filterProject) : []),
    [filterProject, issues]
  );
  const availableAssignees = useMemo(() => {
    if (filtersData?.assignees && filtersData.assignees.length > 0) return filtersData.assignees;
    return Array.from(new Set(projectIssues.map((issue) => issue.assigneeJira).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
  }, [filtersData?.assignees, projectIssues]);

  const labelOptions = useMemo(() => {
    if (filtersData?.labels && filtersData.labels.length > 0) return filtersData.labels;
    return Array.from(new Set(projectIssues.flatMap((issue) => issue.labels))).sort((a, b) => a.localeCompare(b));
  }, [filtersData?.labels, projectIssues]);

  const priorityOptions = useMemo(() => {
    if (filtersData?.priorities && filtersData.priorities.length > 0) return filtersData.priorities;
    const values = Array.from(new Set(projectIssues.map((issue) => issue.priority).filter(Boolean)));
    return (values.length > 0 ? values : ["Low", "Medium", "High", "Highest", "Blocker"]).sort((a, b) => a.localeCompare(b));
  }, [filtersData?.priorities, projectIssues]);

  // Selected task keys
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialKeys));

  // Sync selected and project when keys change in URL (e.g. navigating from standardization)
  useEffect(() => {
    if (initialKeys.length > 0) {
      setSelected(new Set(initialKeys));
      const proj = searchParams?.get("project")?.trim().toUpperCase() || initialKeys[0]?.split("-")[0];
      if (proj && proj !== filterProject) {
        setFilterProject(proj);
        setExtraIssues([]);
      }
    }
  }, [initialKeys, searchParams, filterProject]);

  // Enabled fields toggle
  const [enabledFields, setEnabledFields] = useState<Set<string>>(() => new Set(initialFields));
  useEffect(() => {
    if (initialFields.length > 0) {
      setEnabledFields(new Set(initialFields));
    }
  }, [initialFields]);

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

  // Operation Kind: "update-fields" | "log-work"
  const [operationKind, setOperationKind] = useState<"update-fields" | "log-work">(() =>
    searchParams?.get("action") === "log-work" ? "log-work" : "update-fields"
  );
  useEffect(() => {
    const act = searchParams?.get("action");
    if (act === "log-work") setOperationKind("log-work");
    else if (act) setOperationKind("update-fields");
  }, [searchParams]);

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
    setFilterStatus("");
    setFilterAssignee("");
    setTaskSearch("");
    setFilterOnlySelected(false);
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
  }

  const statusOptions = useMemo(
    () => Array.from(new Set(projectIssues.map((issue) => issue.status).filter(Boolean))).sort(),
    [projectIssues]
  );

  // Guarantee placeholder for any initial keys if not already present in the loaded issues list
  const displayProjectIssues = useMemo(() => {
    if (!filterProject) return [];
    const existing = new Set(projectIssues.map((i) => i.jiraKey));
    const placeholders: IssueItem[] = initialKeys
      .filter((k) => !existing.has(k) && k.startsWith(filterProject + "-"))
      .map((k) => ({
        jiraKey: k,
        projectKey: filterProject,
        summary: `Task ${k} (Đang chuẩn hóa)`,
        description: "",
        status: "To Do",
        statusCategory: "To Do",
        statusChangedAt: null,
        assigneeJira: null,
        labels: [],
        fixVersionIds: [],
        fixVersionNames: [],
        priority: "Medium",
        points: null,
        type: "Task",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
        aiScore: null,
        aiDecision: null,
      }));
    return [...placeholders, ...projectIssues];
  }, [filterProject, initialKeys, projectIssues]);

  const filteredIssues = useMemo(() => {
    if (!filterProject) return [];
    const query = taskSearch.trim().toLowerCase();
    const myUsername = session?.user?.jiraUsername?.toLowerCase();

    let list = displayProjectIssues
      .filter((issue) => (filterStatus ? issue.status === filterStatus : true))
      .filter((issue) => {
        if (!filterAssignee || filterAssignee === "ALL") return true;
        if (filterAssignee === "UNASSIGNED") return !issue.assigneeJira;
        if (filterAssignee === "ME") {
          if (!myUsername) return true;
          const a = (issue.assigneeJira ?? "").toLowerCase();
          return a === myUsername || a === myUsername.replace(/_mb$/, "") || `${a}_mb` === myUsername;
        }
        return issue.assigneeJira === filterAssignee;
      })
      .filter((issue) =>
        query ? issue.jiraKey.toLowerCase().includes(query) || issue.summary.toLowerCase().includes(query) : true
      );

    if (filterOnlySelected) {
      list = list.filter((issue) => selected.has(issue.jiraKey));
    }

    // Prioritize tasks being standardized (from initialKeys) to the top in their specified order
    if (initialKeyIndexMap.size > 0) {
      list = [...list].sort((a, b) => {
        const aIndex = initialKeyIndexMap.get(a.jiraKey);
        const bIndex = initialKeyIndexMap.get(b.jiraKey);
        if (aIndex !== undefined && bIndex !== undefined) {
          return aIndex - bIndex;
        }
        if (aIndex !== undefined) return -1;
        if (bIndex !== undefined) return 1;
        return 0;
      });
    }

    return list;
  }, [
    filterProject,
    displayProjectIssues,
    filterStatus,
    filterAssignee,
    taskSearch,
    session?.user?.jiraUsername,
    filterOnlySelected,
    selected,
    initialKeyIndexMap,
  ]);

  const allSelected = filteredIssues.length > 0 && filteredIssues.every((i) => selected.has(i.jiraKey));

  const effectiveKeys: string[] =
    selectionMode === "filter"
      ? filteredIssues.map((i) => i.jiraKey)
      : Array.from(selected);

  const effectiveCount = effectiveKeys.length;

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

  const isEstimateValid = !estimate.trim() || /^(?=.*\d)(?:\d+[wdhm]\s*)+$/i.test(estimate.trim());
  const isWorklogDurationValid = Boolean(worklogDuration.trim() && parseJiraDuration(worklogDuration.trim()));

  function buildAction(): BulkAction | null {
    if (!filterProject) return null;

    if (operationKind === "log-work") {
      if (!worklogDuration.trim() || !isWorklogDurationValid) return null;
      return {
        kind: "log-work",
        value: {
          timeSpent: worklogDuration.trim(),
          ...(worklogStarted ? { started: worklogStarted } : {}),
          ...(worklogComment.trim() ? { comment: worklogComment.trim() } : {}),
        },
      };
    }

    const value: BulkFieldValues = {};

    if (enabledFields.has("assignee")) {
      if (!clearAssignee && !assignee.trim()) return null;
      value.assignee = clearAssignee ? null : assignee.trim();
    }
    if (enabledFields.has("labels")) {
      if (clearLabels) {
        value.labels = [];
      } else {
        const parsed = label.split(",").map((item) => item.trim()).filter(Boolean);
        value.labels = parsed;
      }
    }
    if (enabledFields.has("priority")) {
      if (!priority) return null;
      value.priority = priority;
    }
    if (enabledFields.has("issueType")) {
      if (!issueType) return null;
      value.issueType = issueType;
    }
    if (enabledFields.has("points")) {
      if (clearPoints) {
        value.points = null;
      } else {
        if (!points) return null;
        value.points = Number(points);
      }
    }
    if (enabledFields.has("estimate")) {
      if (!estimate.trim() || !isEstimateValid) return null;
      value.estimate = estimate.trim();
    }
    if (enabledFields.has("dueDate")) {
      if (!clearDueDate && !dueDate) return null;
      value.dueDate = clearDueDate ? null : dueDate;
    }
    if (enabledFields.has("fixVersions")) {
      if (clearFixVersions) {
        value.fixVersions = [];
      } else {
        value.fixVersions = fixVersions;
      }
    }

    return Object.keys(value).length > 0 ? { kind: "update-fields", value } : null;
  }

  function toggleField(field: string) {
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

  async function doPreview() {
    const action = buildAction();
    if (!action || effectiveCount === 0 || !filterProject) return;
    setPreviewing(true);
    setPreview(null);
    setActiveOp(null);
    setPreviewError(null);
    try {
      const r = await api<Preview>("/api/issues/bulk", {
        method: "POST",
        body: { keys: effectiveKeys, action },
      });
      setPreview(r);
      setPreviewBasis(JSON.stringify({ action, keys: [...effectiveKeys].sort() }));
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
          keys: preview.items.map((i) => i.jiraKey),
          action: buildAction(),
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

  const currentBasis = JSON.stringify({ action: buildAction(), keys: [...effectiveKeys].sort() });
  const previewOutdated = preview != null && previewBasis !== currentBasis;

  const previewCounts = preview?.items.reduce<Record<PreviewBucket, number>>(
    (counts, item) => {
      counts[previewBucket(item)] += 1;
      return counts;
    },
    { changes: 0, unchanged: 0, warnings: 0, blocked: 0 }
  ) ?? { changes: 0, unchanged: 0, warnings: 0, blocked: 0 };

  const visiblePreviewItems = preview?.items.filter((item) => previewBucket(item) === previewView) ?? [];
  const isLogWorkOp = buildAction()?.kind === "log-work" || preview?.type === "log-work";
  const confirmLabel = preview
    ? isLogWorkOp
      ? `Ghi worklog ${preview.actionable} task`
      : `Cập nhật ${preview.actionable} task`
    : "Xác nhận thay đổi";

  const activeFilterCount = [filterStatus, filterAssignee, taskSearch].filter(Boolean).length;

  function resetTaskFilters() {
    setFilterStatus("");
    setFilterAssignee("");
    setTaskSearch("");
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      {/* Top Navigation Switcher */}
      <div className="flex border-b border-border">
        <Link
          href="/bulk"
          className="flex items-center gap-2 border-b-2 border-primary px-4 py-2.5 text-xs font-semibold text-primary cursor-pointer transition-colors"
        >
          <Edit3 className="h-4 w-4" aria-hidden="true" />
          Cập nhật task hàng loạt
        </Link>
        <Link
          href="/bulk/create"
          className="flex items-center gap-2 border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
        >
          <ListPlus className="h-4 w-4" aria-hidden="true" />
          Tạo task mới hàng loạt
        </Link>
      </div>

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
      <ol aria-label="Tiến trình thao tác hàng loạt" className="grid grid-cols-3 overflow-hidden rounded-lg border bg-card">
        {[
          { number: 1, label: "Chọn dự án & task", active: true, done: Boolean(filterProject) && effectiveCount > 0 },
          { number: 2, label: "Chọn trường cần sửa", active: Boolean(filterProject) && effectiveCount > 0, done: Boolean(buildAction()) },
          { number: 3, label: "Xem trước & Chạy", active: Boolean(preview), done: false },
        ].map((step) => (
          <li
            key={step.number}
            className={cn(
              "flex min-w-0 items-center gap-2 border-r px-3 py-3 text-xs last:border-r-0 sm:px-4 sm:text-sm",
              step.active && "bg-primary/5",
              !step.active && "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                step.done
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : step.active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted"
              )}
            >
              {step.done ? <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" /> : step.number}
            </span>
            <span className="truncate font-medium">{step.label}</span>
          </li>
        ))}
      </ol>

      {/* Standardization Banner */}
      {returnTo === "standardization" && initialKeys.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3.5 text-xs text-primary shadow-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div>
              <p className="font-semibold text-foreground">
                Đang chuẩn hóa {initialKeys.length} task từ danh sách chuẩn hóa
              </p>
              <p className="text-muted-foreground mt-0.5">
                Các task này đã được chọn sẵn và đưa lên đầu danh sách để bạn dễ quan sát và thực hiện thao tác.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="cursor-pointer gap-1.5 shrink-0 self-start sm:self-auto text-xs bg-background">
            <Link href="/stale?view=my-work&tab=standardization">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Quay lại chuẩn hóa
            </Link>
          </Button>
        </div>
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
          <div className="flex flex-col gap-3 border-b bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 sm:max-w-xs w-full">
              <label htmlFor="project-scope-select" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                Dự án mục tiêu <span className="text-destructive">*</span>
              </label>
              <Select value={filterProject} onValueChange={handleProjectChange}>
                <SelectTrigger id="project-scope-select" aria-label="Chọn dự án bắt buộc" className="font-medium bg-background">
                  <SelectValue placeholder="— Chọn một dự án —" />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((p) => (
                    <SelectItem key={p.key} value={p.key}>
                      <span className="font-semibold">{p.key}</span>
                      <span className="ml-2 text-xs text-muted-foreground">({p.openCount} task mở)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {filterProject ? (
              <div className="flex items-center gap-2">
                <Badge variant="info" className="px-3 py-1">
                  Dự án: {filterProject} · {projectIssues.length} task trong bộ nhớ
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Vui lòng chọn dự án để tải danh sách task
              </p>
            )}
          </div>

          {!filterProject ? (
            <div className="flex flex-col items-center p-12 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <ListChecks className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-base font-semibold">Chưa chọn dự án</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Hãy chọn một dự án ở trên. Mọi thao tác chỉnh sửa hàng loạt và cấu hình trường sẽ được giới hạn riêng cho dự án đó.
              </p>
            </div>
          ) : (
            <>
              {/* Task filters */}
              <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
                <SegmentedControl
                  aria-label="Chế độ chọn"
                  tone="neutral"
                  value={selectionMode}
                  onChange={setSelectionMode}
                  items={[
                    { value: "pick", label: "Chọn từng task" },
                    { value: "filter", label: "Tất cả khớp bộ lọc" },
                  ]}
                />
                <SearchField
                  value={taskSearch}
                  onChange={setTaskSearch}
                  placeholder={`Tìm kiếm trong ${filterProject}…`}
                  ariaLabel="Tìm kiếm task"
                  className="w-full sm:max-w-xs"
                />
              </div>

              <FilterBar
                activeCount={activeFilterCount}
                onReset={resetTaskFilters}
                className="border-b p-3"
              >
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Trạng thái</span>
                    <Select value={filterStatus || "ALL"} onValueChange={(value) => setFilterStatus(value === "ALL" ? "" : value)}>
                      <SelectTrigger aria-label="Lọc theo trạng thái"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                        {statusOptions.map((itemStatus) => <SelectItem key={itemStatus} value={itemStatus}>{itemStatus}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Người phụ trách</span>
                    <Select value={filterAssignee || "ALL"} onValueChange={(value) => setFilterAssignee(value === "ALL" ? "" : value)}>
                      <SelectTrigger aria-label="Lọc theo người phụ trách"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Tất cả người phụ trách</SelectItem>
                        {session?.user?.jiraUsername && (
                          <SelectItem value="ME">Của tôi (@{session.user.jiraUsername})</SelectItem>
                        )}
                        <SelectItem value="UNASSIGNED">Chưa giao (Unassigned)</SelectItem>
                        {availableAssignees.map((a) => (
                          <SelectItem key={a} value={a}>{a}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="pt-1 text-[11px] text-muted-foreground sm:col-span-2">
                    Có {filteredIssues.length} task khớp bộ lọc trong dự án {filterProject}.
                  </p>
                </div>
              </FilterBar>

              {selectionMode === "pick" && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 bg-muted/10">
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                      Chọn tất cả task đang hiển thị
                    </label>
                    {selected.size > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilterOnlySelected(!filterOnlySelected)}
                        className={cn(
                          "cursor-pointer inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors border",
                          filterOnlySelected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground hover:text-foreground border-border"
                        )}
                      >
                        <Filter className="h-3 w-3" aria-hidden />
                        {filterOnlySelected ? "Đang lọc: Chỉ hiện đã chọn" : "Chỉ hiện đã chọn"}
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    Đã chọn {selected.size} / {filteredIssues.length}
                  </span>
                </div>
              )}

              {/* Task table / list */}
              <div className="max-h-80 overflow-auto">
                {isIssuesLoading && (
                  <div className="flex flex-col gap-2 p-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 flex-1" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                  </div>
                )}
                {filteredIssues.map((i) => {
                  const cat = categoryOf(i.status, i.statusCategory);
                  const dot = statusDot(i.status, cat);
                  const isChecked = selectionMode === "filter" || selected.has(i.jiraKey);
                  const isStandardizing = initialKeysSet.has(i.jiraKey);
                  return (
                    <label
                      key={i.jiraKey}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border-b border-l-[3px] px-3 py-2 text-sm last:border-b-0 hover:bg-accent/50",
                        cat === "new" && "border-l-sky-500/60",
                        cat === "indeterminate" && "border-l-primary/60",
                        cat === "done" && "border-l-emerald-500/60",
                        isChecked && "bg-accent/40",
                        isStandardizing && "bg-primary/5 dark:bg-primary/10"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={selectionMode === "filter"}
                        onCheckedChange={() => toggle(i.jiraKey)}
                        aria-label={`Chọn ${i.jiraKey}`}
                      />
                      {jiraBaseUrl ? (
                        <a
                          href={`${jiraBaseUrl}/browse/${i.jiraKey}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="group/link inline-flex w-24 shrink-0 items-center gap-1 font-mono text-xs text-primary hover:underline"
                          title={`Mở ${i.jiraKey} trên Jira`}
                        >
                          {i.jiraKey}
                          <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
                        </a>
                      ) : (
                        <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{i.jiraKey}</span>
                      )}
                      {isStandardizing && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] py-0 px-1.5 h-4 shrink-0 font-medium bg-primary/15 text-primary border-primary/20"
                        >
                          Chuẩn hóa
                        </Badge>
                      )}
                      <span className="min-w-0 flex-1 truncate">{i.summary}</span>
                      <span
                        className="hidden sm:inline-flex shrink-0 items-center rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground max-w-[130px] truncate"
                        title={i.assigneeJira ? `Người phụ trách: @${i.assigneeJira}` : "Chưa giao"}
                      >
                        {i.assigneeJira ? `@${i.assigneeJira}` : "Chưa giao"}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
                        <span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />
                        <span className={CATEGORY_TEXT[cat]}>{i.status}</span>
                      </span>
                      {i.points != null && (
                        <span className="inline-flex h-4 shrink-0 items-center rounded-full bg-secondary px-1.5 font-mono text-[10px] font-semibold tabular-nums text-secondary-foreground">
                          {i.points}pt
                        </span>
                      )}
                    </label>
                  );
                })}
                {!isIssuesLoading && filteredIssues.length === 0 && (
                  <div className="flex flex-col items-center p-10 text-center">
                    <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                      <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium">Không tìm thấy task phù hợp</p>
                    <p className="mt-1 text-xs text-muted-foreground">Xóa từ khóa tìm kiếm hoặc chọn bộ lọc trạng thái/người phụ trách khác.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t bg-muted/30 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    Hiển thị {filteredIssues.length} task (đã tải {issues.length}/{totalServerIssues} của dự án {filterProject})
                  </span>
                  {issues.length < totalServerIssues && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="h-6 text-[11px] px-2 py-0 cursor-pointer"
                    >
                      {isLoadingMore ? (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          Đang tải...
                        </>
                      ) : (
                        `Tải thêm (${totalServerIssues - issues.length} task còn lại)`
                      )}
                    </Button>
                  )}
                </div>
                <span className="font-semibold text-primary">Tổng số task sẽ cập nhật: {effectiveCount}</span>
              </div>
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
              {operationKind === "log-work" ? "Thiết lập Ghi Worklog" : "Chọn các trường cần sửa"}
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
                : `Bật một hoặc nhiều trường có sẵn của dự án ${filterProject}, nhập giá trị mới rồi xem trước trên ${effectiveCount} task đã chọn.`
              : "Vui lòng chọn dự án ở Bước 1 trước khi cấu hình thao tác."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-4 pb-4 sm:px-5 sm:pb-5">
          {filterProject && (
            <div className="flex items-center gap-2 border-b pb-3">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Chế độ:</span>
              <Button
                type="button"
                size="sm"
                variant={operationKind === "update-fields" ? "default" : "outline"}
                onClick={() => {
                  setOperationKind("update-fields");
                  resetPreview();
                }}
                className="text-xs h-7 cursor-pointer"
              >
                Cập nhật trường
              </Button>
              <Button
                type="button"
                size="sm"
                variant={operationKind === "log-work" ? "default" : "outline"}
                onClick={() => {
                  setOperationKind("log-work");
                  resetPreview();
                }}
                className="gap-1.5 text-xs h-7 cursor-pointer"
              >
                <Clock className="h-3.5 w-3.5" />
                Ghi Worklog
              </Button>
            </div>
          )}

          {!filterProject ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-muted-foreground">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                <ListChecks className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Chưa có dự án nào được chọn</p>
                <p className="text-xs text-muted-foreground">Chọn dự án ở Bước 1 để tải cấu hình các trường có thể chỉnh sửa.</p>
              </div>
            </div>
          ) : operationKind === "log-work" ? (
            <div className="flex flex-col gap-4 rounded-lg border bg-card/60 p-4">
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-3 text-xs text-teal-800 dark:text-teal-200">
                <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Chế độ Ghi Worklog hàng loạt
                </div>
                <div>
                  Mỗi task đã chọn ({effectiveCount} task) sẽ được cộng thêm thời lượng này vào thời gian đã ghi trên Jira.
                  {isWorklogDurationValid && (
                    <div className="mt-1 font-semibold text-teal-900 dark:text-teal-100">
                      Tổng thời gian dự kiến ghi nhận: {effectiveCount} × {worklogDuration} ={" "}
                      {formatJiraDuration(effectiveCount * (parseJiraDuration(worklogDuration) ?? 0))}
                    </div>
                  )}
                </div>
                <div className="mt-1 text-muted-foreground text-[11px]">
                  * Không thay đổi Remaining Estimate (adjustEstimate = leave).
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Thời lượng mỗi task <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="Ví dụ: 30m, 2h, 1d 4h..."
                    value={worklogDuration}
                    onChange={(e) => {
                      setWorklogDuration(e.target.value);
                      resetPreview();
                    }}
                    className={cn(
                      "h-9 text-sm font-mono",
                      worklogDuration.trim() && !isWorklogDurationValid && "border-destructive focus-visible:ring-destructive"
                    )}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Cú pháp Jira: <strong>m</strong> (phút), <strong>h</strong> (giờ), <strong>d</strong> (ngày = 8h), <strong>w</strong> (tuần = 5d).
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Thời điểm bắt đầu <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={worklogStarted}
                    onChange={(e) => {
                      setWorklogStarted(e.target.value);
                      resetPreview();
                    }}
                    className="h-9 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Thời điểm ghi nhận theo giờ địa phương.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">Ghi chú (Tùy chọn)</span>
                  <span className={cn("text-[11px]", worklogComment.length > 4000 ? "text-destructive font-semibold" : "text-muted-foreground")}>
                    {worklogComment.length} / 4000
                  </span>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Mô tả công việc chung cho các task này..."
                  value={worklogComment}
                  onChange={(e) => {
                    setWorklogComment(e.target.value);
                    resetPreview();
                  }}
                  className="text-sm resize-y"
                />
              </div>
            </div>
          ) : fieldsLoading ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3, 4, 5, 6].map((idx) => (
                <Skeleton key={idx} className="h-11 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { id: "assignee", label: "Người phụ trách" },
                { id: "labels", label: "Nhãn" },
                { id: "priority", label: "Độ ưu tiên" },
                { id: "issueType", label: "Type" },
                { id: "points", label: "Story/Task Points" },
                { id: "estimate", label: "Original Estimate" },
                { id: "dueDate", label: "Due date" },
                { id: "fixVersions", label: "Fix Versions" },
              ].map(({ id, label }) => {
                const isAvailable = availableFieldMap.get(id)?.available ?? true;
                const isEnabled = enabledFields.has(id);
                return (
                  <label
                    key={id}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                      !isAvailable && "opacity-60 cursor-not-allowed bg-muted/20 border-dashed",
                      isAvailable && isEnabled && "border-primary bg-primary/10 text-primary font-medium",
                      isAvailable && !isEnabled && "hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={isEnabled}
                        disabled={!isAvailable}
                        onCheckedChange={() => isAvailable && toggleField(id)}
                      />
                      <span>{label}</span>
                    </div>
                    {!isAvailable && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                        Không khả dụng
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {filterProject && enabledFields.size > 0 && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border bg-card/60 p-4 sm:grid-cols-2">
              {enabledFields.has("assignee") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Người phụ trách (Jira username)</span>
                    <span className="text-[10px] text-muted-foreground">Tự động gợi ý từ dự án</span>
                  </div>
                  <AssigneeInput
                    value={assignee}
                    onChange={(v) => {
                      setAssignee(v);
                      resetPreview();
                    }}
                    options={availableAssignees}
                    disabled={clearAssignee}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
                    <Checkbox
                      checked={clearAssignee}
                      onCheckedChange={(value) => {
                        setClearAssignee(value === true);
                        resetPreview();
                      }}
                    />
                    Bỏ gán người phụ trách (Unassigned)
                  </label>
                </div>
              )}

              {enabledFields.has("labels") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Nhãn (Labels)</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearLabels}
                        onCheckedChange={(v) => {
                          setClearLabels(v === true);
                          resetPreview();
                        }}
                      />
                      Xóa tất cả nhãn
                    </label>
                  </div>
                  <Input
                    value={label}
                    disabled={clearLabels}
                    onChange={(e) => {
                      setLabel(e.target.value);
                      resetPreview();
                    }}
                    placeholder="release-1.4.2, frontend (cách nhau bằng dấu phẩy)"
                  />
                  {!clearLabels && labelOptions.length > 0 && (
                    <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-md border bg-muted/20 p-2">
                      {labelOptions.map((option) => {
                        const selectedLabels = label.split(",").map((item) => item.trim()).filter(Boolean);
                        const checked = selectedLabels.includes(option);
                        return (
                          <label key={option} className="flex cursor-pointer items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 text-xs hover:bg-muted">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                const next = nextChecked === true
                                  ? Array.from(new Set([...selectedLabels, option]))
                                  : selectedLabels.filter((item) => item !== option);
                                setLabel(next.join(", "));
                                resetPreview();
                              }}
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {enabledFields.has("priority") && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Độ ưu tiên (Priority)</span>
                  <Select
                    value={priority}
                    onValueChange={(v) => {
                      setPriority(v === "ALL" ? "" : v);
                      resetPreview();
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Chọn độ ưu tiên" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">— Chưa chọn —</SelectItem>
                      {priorityOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {enabledFields.has("issueType") && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Type</span>
                  <Select value={issueType} onValueChange={(value) => { setIssueType(value === "NONE" ? "" : value); resetPreview(); }}>
                    <SelectTrigger><SelectValue placeholder="Chọn Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Chưa chọn —</SelectItem>
                      {(availableFieldMap.get("issueType")?.options ?? []).map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {enabledFields.has("points") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Story Points / Task Points</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearPoints}
                        onCheckedChange={(v) => {
                          setClearPoints(v === true);
                          resetPreview();
                        }}
                      />
                      Bỏ / Xóa điểm
                    </label>
                  </div>
                  <Select
                    value={points}
                    disabled={clearPoints}
                    onValueChange={(v) => {
                      setPoints(v === "NONE" ? "" : v);
                      resetPreview();
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Chọn số điểm" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Chưa chọn —</SelectItem>
                      {[0, 1, 2, 3, 5, 8, 13, 21].map((p) => <SelectItem key={p} value={String(p)}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {enabledFields.has("estimate") && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-foreground">Original Estimate</span>
                  <Input
                    value={estimate}
                    onChange={(e) => {
                      setEstimate(e.target.value);
                      resetPreview();
                    }}
                    placeholder="Ví dụ: 2h, 1d 4h, 30m"
                    className={cn(!isEstimateValid && "border-destructive focus-visible:ring-destructive")}
                  />
                  {!isEstimateValid ? (
                    <span className="text-[11px] text-destructive font-medium">Định dạng không hợp lệ. Ví dụ hợp lệ: 30m, 2h, 1d 4h.</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Hỗ trợ các đơn vị thời gian Jira: w (tuần), d (ngày), h (giờ), m (phút).</span>
                  )}
                </div>
              )}

              {enabledFields.has("dueDate") && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Due date (Hạn hoàn thành)</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearDueDate}
                        onCheckedChange={(v) => {
                          setClearDueDate(v === true);
                          resetPreview();
                        }}
                      />
                      Xóa Due date hiện tại
                    </label>
                  </div>
                  <Input
                    type="date"
                    value={dueDate}
                    disabled={clearDueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      resetPreview();
                    }}
                  />
                </div>
              )}

              {enabledFields.has("fixVersions") && (
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Fix Versions ({filterProject})</span>
                    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                      <Checkbox
                        checked={clearFixVersions}
                        onCheckedChange={(v) => {
                          setClearFixVersions(v === true);
                          resetPreview();
                        }}
                      />
                      Xóa tất cả Fix Versions
                    </label>
                  </div>
                  {clearFixVersions ? (
                    <p className="text-xs text-muted-foreground italic">Tất cả Fix Versions trên các task đã chọn sẽ bị xóa.</p>
                  ) : versionsLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : versionOptions.length > 0 ? (
                    <>
                      <div className="grid max-h-48 gap-2 overflow-y-auto rounded-md border bg-muted/20 p-2 sm:grid-cols-2 md:grid-cols-3">
                        {versionOptions.map((version) => (
                          <label key={version.name} className="flex cursor-pointer items-center gap-2 rounded-md bg-background px-2.5 py-1.5 text-sm hover:bg-muted/50 border">
                            <Checkbox
                              checked={fixVersions.includes(version.name)}
                              onCheckedChange={(checked) => {
                                setFixVersions((current) => checked === true
                                  ? Array.from(new Set([...current, version.name]))
                                  : current.filter((name) => name !== version.name));
                                resetPreview();
                              }}
                            />
                            <span className="truncate">{version.name}</span>
                          </label>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Có thể chọn một hoặc nhiều version. Danh sách được lấy từ dự án {filterProject}.
                      </span>
                    </>
                  ) : (
                    <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <PackageOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">Chưa có Fix Version trên Jira cho dự án {filterProject}</p>
                        <p className="text-xs text-muted-foreground">Tạo version trên Jira cho project đã chọn rồi tải lại trang.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center pt-2">
            <Button
              onClick={doPreview}
              disabled={previewing || effectiveCount === 0 || !filterProject || !buildAction()}
            >
              {previewing ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              Xem trước {effectiveCount > 0 ? `${effectiveCount} ` : ""}thay đổi
            </Button>
            {previewError && (
              <FeedbackBanner tone="destructive">{previewError}</FeedbackBanner>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 3 — Preview + Confirm */}
      {preview && (
        <Card className="overflow-hidden">
          <CardHeader className="border-b p-4 sm:p-5">
            <CardTitle className="text-base">
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">3</span>
                Xem trước & Chạy
              </span>
            </CardTitle>
            <CardDescription>
              {preview.actionable} trên tổng số {preview.total} task sẽ được thay đổi
              {preview.skipped > 0 ? `, ${preview.skipped} task bị bỏ qua` : ""}. Không có thay đổi nào được thực hiện cho đến khi bạn xác nhận.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
            {previewOutdated && (
              <FeedbackBanner
                tone="warning"
                action={<Button size="sm" variant="outline" onClick={doPreview}>Làm mới xem trước</Button>}
              >
                Danh sách chọn hoặc thao tác đã thay đổi sau khi tạo bản xem trước này.
              </FeedbackBanner>
            )}

            {isLogWorkOp && (
              <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 p-4 text-xs text-teal-800 dark:text-teal-200">
                <div className="font-semibold text-sm mb-1 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                  Ghi nhận thời gian hàng loạt
                </div>
                <div>
                  Mỗi task sẽ được cộng <strong>{worklogDuration}</strong>; tổng thời gian dự kiến ghi là{" "}
                  <strong>
                    {preview.actionable} × {worklogDuration} ={" "}
                    {formatJiraDuration(preview.actionable * (parseJiraDuration(worklogDuration) ?? 0))}
                  </strong>{" "}
                  trên {preview.actionable} task.
                </div>
                <div className="mt-1 text-muted-foreground text-[11px]">
                  * Remaining Estimate của các task được giữ nguyên (adjustEstimate = leave).
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {([
                ["changes", "Sẽ thay đổi", previewCounts.changes, CheckCircle2, "text-emerald-700 dark:text-emerald-400"],
                ["unchanged", "Không đổi", previewCounts.unchanged, CircleDashed, "text-muted-foreground"],
                ["warnings", "Cảnh báo", previewCounts.warnings, CircleAlert, "text-amber-700 dark:text-amber-400"],
                ["blocked", "Bị chặn", previewCounts.blocked, CircleX, "text-red-700 dark:text-red-400"],
              ] as const).map(([bucket, label, count, Icon, color]) => (
                <button
                  key={bucket}
                  type="button"
                  aria-pressed={previewView === bucket}
                  onClick={() => setPreviewView(bucket)}
                  className={cn(
                    "cursor-pointer rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    previewView === bucket && "border-primary bg-primary/5 shadow-sm"
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground font-medium">{label}</span>
                    <Icon className={cn("h-4 w-4", color)} aria-hidden="true" />
                  </span>
                  <span className="mt-1 block text-xl font-semibold">{count}</span>
                </button>
              ))}
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {visiblePreviewItems.map((item) => (
                <div key={item.jiraKey} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center gap-2">
                    {jiraBaseUrl ? (
                      <a
                        href={`${jiraBaseUrl}/browse/${item.jiraKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/link inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
                        title={`Mở ${item.jiraKey} trên Jira`}
                      >
                        {item.jiraKey}
                        <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover/link:opacity-100" aria-hidden />
                      </a>
                    ) : (
                      <span className="font-mono text-xs font-semibold">{item.jiraKey}</span>
                    )}
                    {item.warning && (
                      <Badge variant={warningVariant(item.warning)}>{item.warning.replace("_", " ")}</Badge>
                    )}
                    {item.skipReason && (
                      <Badge variant="secondary">{SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}</Badge>
                    )}
                    {item.targetField && (
                      <Badge variant="outline" title={item.targetVersionId ? `${item.targetField.id}: ${item.targetVersionId}` : item.targetField.id}>
                        {item.targetField.name}
                      </Badge>
                    )}
                  </div>
                  {item.skipReason ? (
                    <p className="text-xs text-muted-foreground">
                      Sẽ bỏ qua: {SKIP_LABELS[item.skipReason] ?? item.skipReason.replace("_", " ")}.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1 border-t pt-2 mt-1">
                      {fieldRow("Người phụ trách", item.before, item.after, "assignee")}
                      {fieldRow("Độ ưu tiên", item.before, item.after, "priority")}
                      {fieldRow("Type", item.before, item.after, "issueType")}
                      {fieldRow("Story/Task Points", item.before, item.after, "points")}
                      {fieldRow("Original Estimate", item.before, item.after, "estimateSeconds")}
                      {fieldRow("Due date", item.before, item.after, "dueDate")}
                      {fieldRow("Nhãn (Labels)", item.before, item.after, "labels")}
                      {fieldRow("Fix Versions", item.before, item.after, "fixVersions")}
                      {Boolean(item.after.worklog) ? (
                        <div className="flex items-center justify-between text-xs py-0.5 border-t mt-0.5">
                          <span className="text-muted-foreground font-medium">Ghi Worklog:</span>
                          <span className="font-semibold text-primary font-mono">
                            +{String((item.after.worklog as { timeSpent?: string })?.timeSpent ?? "")}
                            {(item.after.worklog as { comment?: string })?.comment
                              ? ` ("${(item.after.worklog as { comment?: string }).comment}")`
                              : ""}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
              {visiblePreviewItems.length === 0 && (
                <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
                  <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <p className="font-medium">Không có task nào trong nhóm này</p>
                  <p className="mt-1 text-sm text-muted-foreground">Chọn một thẻ tóm tắt khác để xem các task tương ứng.</p>
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={confirming || preview.actionable === 0 || previewOutdated}
              >
                {confirming ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}
                {confirmLabel}
              </Button>
              <Button variant="ghost" onClick={doCancelPreview}>
                <X className="h-4 w-4" aria-hidden="true" /> Hủy xem trước
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Operations History */}
      <Card>
        <CardHeader className="p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            Lịch sử thao tác
          </CardTitle>
          <CardDescription>Các thao tác hàng loạt gần đây và kết quả chi tiết từng task.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
          {activeOp && <OperationDetail id={activeOp} jiraBaseUrl={jiraBaseUrl} />}
          {!opsLoaded ? (
            <div className="space-y-2">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-16 w-full" />)}</div>
          ) : ops.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
              <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                <History className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="font-medium">Chưa có thao tác hàng loạt nào</p>
              <p className="mt-1 text-sm text-muted-foreground">Các thao tác đã hoàn thành hoặc đang chạy sẽ xuất hiện tại đây.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {ops.map((op) => (
                <li key={op.id} className={cn("rounded-lg border p-3 transition-colors", activeOp === op.id && "border-primary bg-primary/[0.03]")}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setActiveOp(op.id)}
                      className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant={stateVariant(op.state)}>{op.state.replace("_", " ")}</Badge>
                        <span className="font-medium">{ACTION_LABELS[op.type] ?? op.type}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">#{op.id.slice(0, 8)}</span>
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {op.succeeded}/{op.total} thành công · {op.failed} thất bại · {formatTime(op.completedAt ?? op.createdAt)}
                      </span>
                    </button>
                    {["completed", "partially_failed", "failed"].includes(op.state) && op.failed > 0 && (
                      <Button size="sm" variant="outline" onClick={() => doRetry(op.id)}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Thử lại
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        className="sm:max-w-lg"
        icon={isLogWorkOp ? Clock : CheckCheck}
        title={isLogWorkOp ? "Xác nhận ghi Worklog hàng loạt" : "Xác nhận cập nhật nhiều trường"}
        description={
          isLogWorkOp
            ? `Bạn sắp ghi ${worklogDuration} cho mỗi task. Tổng cộng ${formatJiraDuration(
                (preview?.actionable ?? 0) * (parseJiraDuration(worklogDuration) ?? 0)
              )} sẽ được ghi lên ${preview?.actionable ?? 0} task thuộc dự án ${filterProject}.`
            : `Bạn sắp cập nhật các trường đã chọn cho ${preview?.actionable ?? 0} task thuộc dự án ${filterProject}.`
        }
        onConfirm={() => {
          setConfirmOpen(false);
          void doConfirm();
        }}
        confirmLabel={confirmLabel}
        cancelLabel="Quay lại"
        pending={confirming}
        disabled={(preview?.actionable ?? 0) === 0}
      >
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Lưu ý trước khi thực thi</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {isLogWorkOp ? (
              <>
                <li>Mỗi task sẽ được tạo một worklog mới với danh tính Jira của bạn.</li>
                <li>Remaining Estimate sẽ được giữ nguyên (adjustEstimate = leave).</li>
                <li>Nếu một task gặp lỗi, các task còn lại vẫn tiếp tục được thực hiện.</li>
                <li>Dữ liệu chuẩn hóa và thời gian đã ghi sẽ tự động được làm mới khi hoàn tất.</li>
              </>
            ) : (
              <>
                <li>Hệ thống sẽ cập nhật từng task trên Jira và cập nhật lại cache.</li>
                <li>Nếu một task gặp lỗi, các task còn lại vẫn tiếp tục được thực hiện.</li>
                <li>Bạn có thể theo dõi tiến trình trực tiếp bên dưới.</li>
              </>
            )}
          </ul>
        </div>
      </ConfirmDialog>
    </div>
  );
}
