"use client";

import { useCallback, useState } from "react";

export function applyOptimisticStatus<T extends { jiraKey: string; status: string }>(
  issue: T,
  overrides: Map<string, string>
): T {
  const status = overrides.get(issue.jiraKey);
  return status === undefined ? issue : { ...issue, status };
}

export function useBoardOptimisticStatus() {
  const [optimistic, setOptimistic] = useState<Map<string, string>>(() => new Map());
  const setOptimisticStatus = useCallback((key: string, status: string | null) => {
    setOptimistic((previous) => {
      const next = new Map(previous);
      if (status === null) next.delete(key);
      else next.set(key, status);
      return next;
    });
  }, []);
  return { optimistic, setOptimisticStatus };
}
