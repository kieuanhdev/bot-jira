"use client";

import { useState } from "react";
import { api, getErrorMessage } from "@/lib/api-client";

interface UseQuickPanelDeleteOptions {
  jiraKey: string;
  invalidate: () => Promise<void>;
  onClose: () => void;
}

export function useQuickPanelDelete({
  jiraKey,
  invalidate,
  onClose,
}: UseQuickPanelDeleteOptions) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function openDeleteDialog() {
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api(`/api/issues/${jiraKey}`, { method: "DELETE" });
      setDeleteOpen(false);
      await invalidate();
      onClose();
    } catch (e) {
      setDeleteError(getErrorMessage(e, "Không xóa được task."));
    } finally {
      setDeleting(false);
    }
  }

  return {
    deleteOpen,
    setDeleteOpen,
    deleting,
    deleteError,
    openDeleteDialog,
    handleDelete,
  };
}
