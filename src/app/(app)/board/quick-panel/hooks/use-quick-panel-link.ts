"use client";

import { useLinkIssue } from "@/components/issues/use-link-issue";
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
  return useLinkIssue({
    jiraKey,
    onOpen: onResetActionMsg,
    onLinked: async ({ targetKey }) => {
      onSuccess({
        type: "success",
        text: `Đã liên kết ${jiraKey} với ${targetKey}.`,
        href: `/issue/${encodeURIComponent(targetKey)}`,
        linkLabel: `Mở ${targetKey}`,
      });
      await invalidate();
    },
  });
}
