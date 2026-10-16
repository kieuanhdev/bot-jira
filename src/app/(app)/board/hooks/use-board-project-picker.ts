"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { boardKeys, meKeys, issuesKeys } from "@/lib/query-keys";
import { loadStoredProject } from "../lib/board-storage";
import type { Project } from "../lib/board-types";
import type { BoardStatusesResponse } from "../lib/board-columns";
import type { BoardBootstrap } from "@/lib/board/bootstrap";

export interface UseBoardProjectPickerOptions {
  allProjects: Project[];
  preferred: string[];
  availableKeys: string[];
  initialBootstrap?: BoardBootstrap;
  onSelectProject: (key: string) => void;
  setToast: (msg: string) => void;
}

export function useBoardProjectPicker({
  allProjects,
  preferred,
  availableKeys,
  initialBootstrap,
  onSelectProject,
  setToast,
}: UseBoardProjectPickerOptions) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const urlProject = searchParams?.get("project")?.trim().toUpperCase() || "";

  const [project, setProject] = useState<string>(() => {
    if (urlProject) return urlProject;
    if (initialBootstrap?.initialProject) return initialBootstrap.initialProject;
    return loadStoredProject() || "";
  });

  const [showPicker, setShowPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<string[] | null>(null);
  const [boardNewKey, setBoardNewKey] = useState("");
  const [boardValidating, setBoardValidating] = useState(false);
  const [boardValidateError, setBoardValidateError] = useState<string | null>(null);

  const savePrefs = useCallback(
    async (next: string[]) => {
      await api("/api/me/preferences", { method: "PUT", body: { projects: next } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: meKeys.prefs }),
        qc.invalidateQueries({ queryKey: boardKeys.projects }),
      ]);
      setProject((prev) => (next.length > 0 && (!prev || !next.includes(prev)) ? next[0] : prev));
    },
    [qc]
  );

  const effectivePreferred = useMemo(
    () => (preferred.length === 0 ? availableKeys : preferred),
    [preferred, availableKeys]
  );

  const selectedProject = effectivePreferred.includes(project)
    ? project
    : (effectivePreferred[0] ?? "");

  const countMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allProjects) m.set(p.key, p.openCount);
    return m;
  }, [allProjects]);

  const projectList = useMemo(
    () =>
      effectivePreferred
        .filter((k) => availableKeys.includes(k) || effectivePreferred.includes(k))
        .map((k) => ({
          key: k,
          openCount: countMap.get(k) ?? 0,
          syncDisabled: allProjects.find((p) => p.key === k)?.syncEnabled === false,
        })),
    [effectivePreferred, countMap, availableKeys, allProjects]
  );

  const pickerActive = pickerSelection ?? effectivePreferred;
  const pickerSet = new Set(pickerActive);

  function openPicker() {
    setPickerSelection(effectivePreferred);
    setBoardValidateError(null);
    setShowPicker(true);
  }

  function closePicker() {
    setShowPicker(false);
    setPickerSelection(null);
    setBoardValidateError(null);
  }

  function commitPicker() {
    if (pickerSelection) savePrefs(pickerSelection);
    closePicker();
  }

  function togglePicker(key: string) {
    setPickerSelection((prev) => {
      const base = prev ?? effectivePreferred;
      return base.includes(key) ? base.filter((k) => k !== key) : [...base, key];
    });
  }

  function handlePrefetchProject(key: string) {
    void qc.prefetchQuery({
      queryKey: boardKeys.statuses(key),
      queryFn: () => api<BoardStatusesResponse>(`/api/board/statuses?project=${key}`),
      staleTime: 5 * 60_000,
    });
    void qc.prefetchQuery({
      queryKey: issuesKeys.filters(key),
      queryFn: () => api(`/api/issues/filters?project=${key}`),
      staleTime: 5 * 60_000,
    });
  }

  async function handleAddProjectToBoard() {
    const key = boardNewKey.trim().toUpperCase();
    if (!key) return;
    setBoardValidating(true);
    setBoardValidateError(null);
    try {
      const res = await api<{
        ok: boolean;
        error?: string;
        created?: boolean;
        project?: { key: string; name: string };
        bootstrap?: { state: string };
      }>("/api/projects", { method: "POST", body: { key } });

      if (!res.ok || !res.project) {
        setBoardValidateError(res.error ?? "Dự án không tồn tại trên Jira.");
        return;
      }
      const verifiedKey = res.project.key;
      await Promise.all([
        qc.invalidateQueries({ queryKey: meKeys.prefs }),
        qc.invalidateQueries({ queryKey: boardKeys.projects }),
        qc.invalidateQueries({ queryKey: boardKeys.statusesPrefix(verifiedKey) }),
      ]);
      setBoardNewKey("");
      closePicker();
      onSelectProject(verifiedKey);
      setToast(
        res.bootstrap?.state === "sync_disabled"
          ? `Đã thêm dự án ${res.project.name} (${verifiedKey}). Quản trị viên đang tắt đồng bộ dự án này.`
          : `Đã thêm dự án ${res.project.name} (${verifiedKey}) và bắt đầu đồng bộ.`
      );
    } catch (err: unknown) {
      setBoardValidateError((err as Error).message || "Lỗi kiểm tra dự án trên Jira.");
    } finally {
      setBoardValidating(false);
    }
  }

  function handleBoardNewKeyChange(value: string) {
    setBoardNewKey(value.toUpperCase());
    setBoardValidateError(null);
  }

  return {
    project,
    setProject,
    selectedProject,
    effectivePreferred,
    projectList,
    showPicker,
    pickerActive,
    pickerSet,
    boardNewKey,
    boardValidating,
    boardValidateError,
    openPicker,
    closePicker,
    commitPicker,
    togglePicker,
    handlePrefetchProject,
    handleAddProjectToBoard,
    handleBoardNewKeyChange,
    countMap,
    setShowPicker,
    setPickerSelection,
  };
}
