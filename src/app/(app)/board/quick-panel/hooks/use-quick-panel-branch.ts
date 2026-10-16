"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useFlashMessage } from "@/hooks/use-flash-message";
import type { QuickPanelActionMessage } from "../quick-panel-actions";

export function useQuickPanelBranch(jiraKey: string) {
  const [creatingBranch, setCreatingBranch] = useState(false);
  const { message: branchMsg, show: setBranchMsg } = useFlashMessage<QuickPanelActionMessage>(4000);

  async function handleCreateBranch(refetchBranches: () => Promise<unknown>) {
    setCreatingBranch(true);
    setBranchMsg(null);
    try {
      const res = await api<{ ok: boolean; branch?: string; error?: string }>(
        `/api/issues/${jiraKey}/branches`,
        { method: "POST", body: {} }
      );
      await refetchBranches();
      setBranchMsg({ type: "success", text: `Đã tạo nhánh: ${res.branch}` });
    } catch (e) {
      setBranchMsg({ type: "error", text: `Lỗi: ${(e as Error).message}` });
    } finally {
      setCreatingBranch(false);
    }
  }

  return {
    creatingBranch,
    branchMsg,
    handleCreateBranch,
  };
}
