"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { boardKeys, bulkKeys } from "@/lib/query-keys";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreatePreviewResult,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { readHandoff } from "@/lib/bulk/handoff";
import { getStoredEditorMode, setStoredEditorMode } from "./editor-preferences";
import {
  createInitialRows,
  filterFilledItems,
  hasDraftContent,
  filterDiscardBlockedRows,
  sanitizeItemsForProjectChange,
} from "./bulk-create-controller-model";

export type Step = "input" | "preview" | "progress";

export const HANDOFF_MISSING_MESSAGE = "Không tìm thấy danh sách sub-task, hãy thử lại";

export function useBulkCreateController() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlProject = searchParams.get("project")?.trim().toUpperCase() ?? "";
  const handoffId = searchParams.get("handoff");

  const [userSelectedProject, setUserSelectedProject] = useState<string>("");
  const [step, setStep] = useState<Step>("input");
  const [defaults, setDefaults] = useState<BulkCreateFieldDefaults>({});
  const [items, setItems] = useState<BulkCreateRowInput[]>(() => createInitialRows(3));
  const [source, setSource] = useState<{ type: "grid" | "paste" | "csv" | "excel"; fileName?: string | null }>({
    type: "grid",
  });
  const [previewData, setPreviewData] = useState<BulkCreatePreviewResult | null>(null);
  const [activeOperationId, setActiveOperationId] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const [focusField, setFocusField] = useState<string | null>(null);
  const [draftAvailable, setDraftAvailable] = useState(false);
  const [isEditorFullscreen, setIsEditorFullscreen] = useState(() => getStoredEditorMode() === "fullscreen");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftSavedTime, setDraftSavedTime] = useState<number | null>(null);
  const draftRestoredRef = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rows handed over via `?handoff=<id>` (AI sub-task split). While active, the
  // saved draft `bulk-create-draft:<project>` is left untouched: no restore
  // banner, no autosave, no removal on confirm. The ref is read by effects in
  // the same commit; the state drives rendering. Cleared on project change.
  const handoffModeRef = useRef(false);
  const handledHandoffRef = useRef<string | null>(null);
  const [handoffActive, setHandoffActive] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  // Project change confirmation state
  const [pendingProjectKey, setPendingProjectKey] = useState<string | null>(null);
  const [confirmProjectDialogOpen, setConfirmProjectDialogOpen] = useState(false);

  // Query user available projects
  const { data: projectsData, isLoading: isProjectsLoading } = useQuery({
    queryKey: boardKeys.projects,
    queryFn: () => api<{ items: Array<{ key: string; openCount?: number }> }>("/api/projects"),
    staleTime: 5 * 60 * 1000,
  });

  const availableProjects = useMemo(() => {
    return (projectsData?.items ?? []).map((p) => p.key);
  }, [projectsData?.items]);

  const projectKey =
    userSelectedProject ||
    (urlProject && availableProjects.includes(urlProject) ? urlProject : "") ||
    availableProjects[0] ||
    "";
  const draftKey = `bulk-create-draft:${projectKey}`;

  const saveDraft = useCallback((itemsToSave: BulkCreateRowInput[], defaultsToSave: BulkCreateFieldDefaults) => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    setIsSavingDraft(true);
    draftSaveTimer.current = setTimeout(() => {
      try {
        const hasContent = hasDraftContent(itemsToSave, defaultsToSave);
        if (hasContent) {
          const now = Date.now();
          localStorage.setItem(draftKey, JSON.stringify({ items: itemsToSave, defaults: defaultsToSave, savedAt: now }));
          setDraftSavedTime(now);
        } else {
          localStorage.removeItem(draftKey);
          setDraftSavedTime(null);
        }
      } catch {
        /* quota exceeded or unavailable */
      } finally {
        setIsSavingDraft(false);
      }
    }, 1000);
  }, [draftKey]);

  // Consume `?handoff=<id>` once (read-once storage; the ref also guards the
  // Strict Mode double effect run). Declared before the draft effects so they
  // already see `handoffModeRef` in the same commit.
  useEffect(() => {
    if (!handoffId || handledHandoffRef.current === handoffId) return;
    handledHandoffRef.current = handoffId;
    const handoff = readHandoff(handoffId);
    if (handoff) {
      handoffModeRef.current = true;
      draftRestoredRef.current = true;
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    }
    queueMicrotask(() => {
      if (handoff) {
        setUserSelectedProject(handoff.projectKey);
        setItems(handoff.items);
        setDefaults({});
        setStep("input");
        setPreviewData(null);
        setActiveOperationId(null);
        setDraftAvailable(false);
        setIsSavingDraft(false);
        setHandoffActive(true);
        setHandoffError(null);
      } else {
        setHandoffError(HANDOFF_MISSING_MESSAGE);
      }
    });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("handoff");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [handoffId, searchParams, router, pathname]);

  // Restore draft on project change
  useEffect(() => {
    if (!projectKey || draftRestoredRef.current || handoffModeRef.current) return;
    draftRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          const hasContent = parsed.items.some((i: { summary?: string }) => i.summary?.trim());
          if (hasContent) {
            queueMicrotask(() => setDraftAvailable(true));
            return;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }, [projectKey, draftKey]);

  // Auto-save draft on items/defaults change
  useEffect(() => {
    if (step !== "input" || handoffModeRef.current) return;
    if (draftRestoredRef.current) {
      saveDraft(items, defaults);
    }
  }, [items, defaults, step, saveDraft]);

  function handleRestoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) {
          setItems(parsed.items);
          if (parsed.defaults) setDefaults(parsed.defaults);
        }
      }
    } catch {
      /* ignore */
    }
    setDraftAvailable(false);
    draftRestoredRef.current = true;
  }

  function handleDiscardDraft() {
    localStorage.removeItem(draftKey);
    setDraftAvailable(false);
    draftRestoredRef.current = true;
  }

  function handleToggleFullscreen() {
    const next = !isEditorFullscreen;
    setIsEditorFullscreen(next);
    setStoredEditorMode(next ? "fullscreen" : "standard");
  }

  // Query metadata for selected project
  const {
    data: metadata,
    isLoading: metadataLoading,
    error: metadataError,
    refetch: refetchMetadata,
  } = useQuery({
    queryKey: bulkKeys.createMetadata(projectKey),
    queryFn: () => api<BulkCreateProjectMetadata>(`/api/bulk/create/metadata?project=${projectKey}`),
    enabled: Boolean(projectKey) && Boolean(projectsData),
    staleTime: 5 * 60 * 1000,
  });

  const previewMutation = useMutation({
    mutationFn: (overrideItems?: BulkCreateRowInput[]) =>
      api<BulkCreatePreviewResult>("/api/bulk/create", {
        method: "POST",
        body: {
          projectKey,
          defaults,
          items: filterFilledItems(overrideItems || items),
          metadataFingerprint: metadata?.fingerprint,
          source,
        },
      }),
    onSuccess: (data) => {
      setPreviewData(data);
      setStep("preview");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      api<{ operationId: string; queued: boolean }>("/api/bulk/create", {
        method: "POST",
        body: {
          confirm: true,
          operationId: previewData?.operationId,
        },
      }),
    onSuccess: (data) => {
      setActiveOperationId(data.operationId);
      setStep("progress");
      // Handoff rows were never saved as the draft; keep the user's draft.
      if (!handoffModeRef.current) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* unavailable */
        }
      }
    },
  });

  const filledCount = filterFilledItems(items).length;

  function handleResetAll() {
    setStep("input");
    setPreviewData(null);
    setActiveOperationId(null);
    setItems(createInitialRows(3));
    setDefaults({});
  }

  function handleDiscardBlockedRows() {
    if (!previewData) return;
    const remaining = filterDiscardBlockedRows(items, previewData.items);
    if (remaining.length === 3 && remaining[0].summary === "") {
      setItems(remaining);
      setPreviewData(null);
      setStep("input");
      return;
    }
    setItems(remaining);
    previewMutation.mutate(remaining);
  }

  function handleProjectSelect(newKey: string) {
    if (newKey === projectKey) return;
    const hasData = hasDraftContent(items, defaults);
    if (hasData) {
      setPendingProjectKey(newKey);
      setConfirmProjectDialogOpen(true);
    } else {
      setUserSelectedProject(newKey);
      exitHandoffMode();
      draftRestoredRef.current = false;
      setDraftAvailable(false);
    }
  }

  function exitHandoffMode() {
    handoffModeRef.current = false;
    setHandoffActive(false);
  }

  function applyProjectChange(newKey: string) {
    setUserSelectedProject(newKey);
    exitHandoffMode();
    setDefaults({});
    setDraftAvailable(false);
    draftRestoredRef.current = false;
    setItems((prev) => sanitizeItemsForProjectChange(prev));
    setPreviewData(null);
    setActiveOperationId(null);
  }

  return {
    isProjectsLoading,
    projectKey,
    availableProjects,
    step,
    setStep,
    items,
    setItems,
    defaults,
    setDefaults,
    source,
    setSource,
    previewData,
    setPreviewData,
    activeOperationId,
    setActiveOperationId,
    focusRow,
    setFocusRow,
    focusField,
    setFocusField,
    isEditorFullscreen,
    setIsEditorFullscreen,
    handleToggleFullscreen,
    draftAvailable,
    handleRestoreDraft,
    handleDiscardDraft,
    isSavingDraft,
    draftSavedTime,
    handoffActive,
    handoffError,
    dismissHandoffError: () => setHandoffError(null),
    metadata,
    metadataLoading,
    metadataError,
    refetchMetadata,
    previewMutation,
    confirmMutation,
    filledCount,
    handleResetAll,
    handleDiscardBlockedRows,
    handleProjectSelect,
    confirmProjectDialogOpen,
    setConfirmProjectDialogOpen,
    pendingProjectKey,
    setPendingProjectKey,
    applyProjectChange,
  };
}
