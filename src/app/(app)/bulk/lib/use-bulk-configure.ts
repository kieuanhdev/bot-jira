"use client";

import { useCallback, useMemo, useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { bulkKeys } from "@/lib/query-keys";
import { parseJiraDuration } from "@/lib/worklogs/schema";
import type { IssueItem } from "@/hooks/use-issues";
import type { BulkAction, BulkVersionOption, ProjectFieldOption } from "./bulk-types";
import { useBulkFieldState } from "./use-bulk-field-state";
import {
  buildBulkAction,
  deriveProjectStatuses,
  deriveStatusOptions,
  isValidEstimate,
  pruneUnavailableFields,
  type BulkFiltersResponse,
  type OperationKind,
} from "./bulk-logic";

export interface UseBulkConfigureOptions {
  filterProject: string;
  projectIssues: IssueItem[];
  filtersData?: BulkFiltersResponse;
  searchParams?: ReadonlyURLSearchParams | null;
  onResetPreview?: () => void;
}

export function useBulkConfigure({
  filterProject,
  projectIssues,
  filtersData,
  searchParams,
  onResetPreview,
}: UseBulkConfigureOptions) {
  const initialFields = useMemo(() => {
    const raw = searchParams?.get("fields");
    if (!raw) return [];
    return raw
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);
  }, [searchParams]);

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

  // Operation Kind: "update-fields" | "transition" | "log-work"
  const actionParam = searchParams?.get("action");
  const [operationKind, setOperationKind] = useState<OperationKind>(() => {
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
    const { prunedFields, hasPrunedEstimate, hasPrunedPoints } = pruneUnavailableFields(
      enabledFields,
      projectFieldsData?.fields
    );
    if (prunedFields !== enabledFields) {
      setEnabledFields(prunedFields);
    }
    if (hasPrunedEstimate) {
      fieldState.setters.setEstimate("");
    }
    if (hasPrunedPoints) {
      fieldState.setters.setPoints("");
    }
  }

  // Fetch Fix Versions for the selected project
  const selectedProjects = useMemo(() => (filterProject ? [filterProject] : []), [filterProject]);
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
    onResetPreview?.();
  }

  function handleOperationKindChange(kind: OperationKind) {
    setOperationKind(kind);
    onResetPreview?.();
  }

  function resetConfigure() {
    setTargetStatus("");
    setEnabledFields(new Set());
    fieldState.resetFields();
  }

  return {
    operationKind,
    setOperationKind,
    handleOperationKindChange,
    targetStatus,
    setTargetStatus,
    worklogDuration,
    setWorklogDuration,
    isWorklogDurationValid,
    worklogStarted,
    setWorklogStarted,
    worklogComment,
    setWorklogComment,
    enabledFields,
    setEnabledFields,
    toggleField,
    fieldState,
    fieldsLoading,
    availableFieldMap,
    versionOptions,
    versionsLoading,
    allProjectStatuses,
    statusOptions,
    isEstimateValid,
    buildAction,
    resetConfigure,
  };
}
export type BulkConfigureController = ReturnType<typeof useBulkConfigure>;
