"use client";

import { useState } from "react";
import { api, getErrorMessage } from "@/lib/api-client";
import type { QuickPanelActionMessage } from "../quick-panel-actions";

interface UseQuickPanelLinkOptions {
  jiraKey: string;
  invalidate: () => Promise<void>;
  onSuccess: (message: QuickPanelActionMessage) => void;
  onResetActionMsg?: () => void;
}

export function useQuickPanelLink({
  jiraKey,
  invalidate,
  onSuccess,
  onResetActionMsg,
}: UseQuickPanelLinkOptions) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  function openLinkDialog() {
    setLinkError(null);
    onResetActionMsg?.();
    setLinkOpen(true);
  }

  async function handleLinkIssue(input: {
    typeName: string;
    direction: "inward" | "outward";
    targetKey: string;
  }) {
    setLinking(true);
    setLinkError(null);
    try {
      await api(`/api/issues/${jiraKey}/links`, { method: "POST", body: input });
      setLinkOpen(false);
      onSuccess({
        type: "success",
        text: `Đã liên kết ${jiraKey} với ${input.targetKey}.`,
        href: `/issue/${encodeURIComponent(input.targetKey)}`,
        linkLabel: `Mở ${input.targetKey}`,
      });
      await invalidate();
    } catch (e) {
      setLinkError(getErrorMessage(e, "Không tạo được liên kết."));
    } finally {
      setLinking(false);
    }
  }

  return {
    linkOpen,
    setLinkOpen,
    linking,
    linkError,
    openLinkDialog,
    handleLinkIssue,
  };
}
