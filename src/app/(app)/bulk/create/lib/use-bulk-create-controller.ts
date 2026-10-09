"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import {
  type BulkCreateRowInput,
  type BulkCreateFieldDefaults,
  type BulkCreatePreviewResult,
  type BulkCreateProjectMetadata,
} from "@/lib/bulk/create-types";
import { getStoredEditorMode, setStoredEditorMode } from "./editor-preferences";
import {
  createInitialRows,
  filterFilledItems,
  hasDraftContent,
  filterDiscardBlockedRows,
  sanitizeItemsForProjectChange,
} from "./bulk-create-controller-model";

export type Step = "input" | "preview" | "progress";

export function useBulkCreateController() {
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

  // Project change confirmation state
  const [pendingProjectKey, setPendingProjectKey] = useState<string | null>(null);
  const [confirmProjectDialogOpen, setConfirmProjectDialogOpen] = useState(false);

  // Query user available projects
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ items: Array<{ key: string; openCount?: number }> }>("/api/projects"),
    staleTime: 5 * 60 * 1000,
  });

  const availableProjects = useMemo(() => {
    const list = (projectsData?.items ?? []).map((p) => p.key);
    return list.length > 0 ? list : ["EPM", "CICM", "MR", "EDM", "EMA", "ETM", "MHRM", "ECM"];
  }, [projectsData?.items]);

  const projectKey = userSelectedProject || availableProjects[0] || "";
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

  // Restore draft on project change
  useEffect(() => {
    if (!projectKey || draftRestoredRef.current) return;
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
    if (step !== "input") return;
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
    queryKey: ["bulk-create-metadata", projectKey],
    queryFn: () => api<BulkCreateProjectMetadata>(`/api/bulk/create/metadata?project=${projectKey}`),
    enabled: Boolean(projectKey),
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
      localStorage.removeItem(draftKey);
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
      draftRestoredRef.current = false;
      setDraftAvailable(false);
    }
  }

  function applyProjectChange(newKey: string) {
    setUserSelectedProject(newKey);
    setDefaults({});
    setDraftAvailable(false);
    draftRestoredRef.current = false;
    setItems((prev) => sanitizeItemsForProjectChange(prev));
    setPreviewData(null);
    setActiveOperationId(null);
  }

  return {
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
