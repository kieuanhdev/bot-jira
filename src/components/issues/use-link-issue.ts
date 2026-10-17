"use client";

import { useState } from "react";
import { api, getErrorMessage } from "@/lib/api-client";

export type LinkIssueInput = {
  typeName: string;
  direction: "inward" | "outward";
  targetKey: string;
};

/** State for the "Link issue" dialog: open/close, the request, and its error. */
export function useLinkIssue({
  jiraKey,
  onLinked,
  onOpen,
}: {
  jiraKey: string;
  /** Runs after Jira accepted the link and the dialog closed. */
  onLinked: (input: LinkIssueInput) => void | Promise<void>;
  /** Runs when the dialog opens, e.g. to clear a stale banner. */
  onOpen?: () => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  function openLinkDialog() {
    setLinkError(null);
    onOpen?.();
    setLinkOpen(true);
  }

  async function handleLinkIssue(input: LinkIssueInput) {
    setLinking(true);
    setLinkError(null);
    try {
      await api(`/api/issues/${jiraKey}/links`, { method: "POST", body: input });
      setLinkOpen(false);
      await onLinked(input);
    } catch (e) {
      setLinkError(getErrorMessage(e, "Không tạo được liên kết."));
    } finally {
      setLinking(false);
    }
  }

  return { linkOpen, setLinkOpen, linking, linkError, openLinkDialog, handleLinkIssue };
}
