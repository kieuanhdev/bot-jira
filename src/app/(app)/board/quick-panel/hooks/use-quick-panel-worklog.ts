"use client";

import { useState } from "react";
import { safeRandomUUID } from "@/lib/utils";
import { getDefaultLogStartedAt, validateWorklog } from "@/lib/worklogs/schema";
import { getErrorMessage } from "@/lib/api-client";
import { useIssueWorklog } from "@/hooks/use-issue-detail";

interface UseQuickPanelWorklogOptions {
  jiraKey: string;
  onSuccess: (text: string) => void;
  invalidate: () => Promise<void>;
}

export function useQuickPanelWorklog({
  jiraKey,
  onSuccess,
  invalidate,
}: UseQuickPanelWorklogOptions) {
  const [logWorkOpen, setLogWorkOpen] = useState(false);
  const [logTimeSpent, setLogTimeSpent] = useState("");
  const [logStartedAt, setLogStartedAt] = useState(() => getDefaultLogStartedAt());
  const [logComment, setLogComment] = useState("");
  const [submittingWorklog, setSubmittingWorklog] = useState(false);
  const [worklogError, setWorklogError] = useState<string | null>(null);
  const [worklogIdempotencyKey, setWorklogIdempotencyKey] = useState(() => safeRandomUUID());

  const worklogMutation = useIssueWorklog(jiraKey);

  function openLogWorkDialog() {
    setWorklogError(null);
    setLogStartedAt(getDefaultLogStartedAt());
    setLogWorkOpen(true);
  }

  async function handleSubmitWorklog() {
    const validation = validateWorklog(logTimeSpent, logStartedAt);
    if (validation.error || !validation.startedDate) {
      setWorklogError(validation.error ?? "Thời lượng hoặc thời điểm không hợp lệ.");
      return;
    }
    setSubmittingWorklog(true);
    setWorklogError(null);
    try {
      await worklogMutation.mutateAsync({
        timeSpent: logTimeSpent.trim(),
        startedAt: validation.startedDate.toISOString(),
        comment: logComment.trim() || undefined,
        adjustEstimate: "leave",
        idempotencyKey: worklogIdempotencyKey,
      });
      setLogWorkOpen(false);
      setLogTimeSpent("");
      setLogComment("");
      setWorklogIdempotencyKey(safeRandomUUID());
      onSuccess(`Đã ghi ${logTimeSpent.trim()} lên Jira.`);
      await invalidate();
    } catch (e) {
      setWorklogError(getErrorMessage(e, "Có lỗi xảy ra khi ghi worklog lên Jira."));
    } finally {
      setSubmittingWorklog(false);
    }
  }

  return {
    logWorkOpen,
    setLogWorkOpen,
    logTimeSpent,
    setLogTimeSpent,
    logStartedAt,
    setLogStartedAt,
    logComment,
    setLogComment,
    submittingWorklog,
    worklogError,
    openLogWorkDialog,
    handleSubmitWorklog,
  };
}
