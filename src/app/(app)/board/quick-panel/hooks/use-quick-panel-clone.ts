"use client";

import { useState } from "react";
import { api, getErrorMessage } from "@/lib/api-client";
import type { QuickPanelActionMessage } from "../quick-panel-actions";

interface UseQuickPanelCloneOptions {
  jiraKey: string;
  invalidate: () => Promise<void>;
  onResetActionMsg?: () => void;
}

export function useQuickPanelClone({
  jiraKey,
  invalidate,
  onResetActionMsg,
}: UseQuickPanelCloneOptions) {
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneMsg, setCloneMsg] = useState<QuickPanelActionMessage | null>(null);

  function openCloneDialog() {
    setCloneError(null);
    setCloneMsg(null);
    onResetActionMsg?.();
    setCloneOpen(true);
  }

  async function handleClone(cloneSummaryText: string) {
    setCloning(true);
    setCloneError(null);
    try {
      const res = await api<{
        key: string;
        relation?: string | null;
        linkError?: string | null;
      }>(`/api/issues/${jiraKey}/clone`, {
        method: "POST",
        body: { summary: cloneSummaryText },
      });
      setCloneOpen(false);
      setCloneMsg({
        type: res.linkError ? "error" : "success",
        text: res.linkError
          ? `Đã tạo ${res.key} nhưng chưa liên kết được với ${jiraKey}: ${res.linkError}`
          : `Đã clone thành ${res.key}${res.relation ? ` (${res.relation} ${jiraKey})` : ""}.`,
        href: `/issue/${encodeURIComponent(res.key)}`,
        linkLabel: `Mở ${res.key}`,
      });
      await invalidate();
    } catch (e) {
      setCloneError(getErrorMessage(e, "Không clone được task."));
    } finally {
      setCloning(false);
    }
  }

  return {
    cloneOpen,
    setCloneOpen,
    cloning,
    cloneError,
    cloneMsg,
    openCloneDialog,
    handleClone,
  };
}
