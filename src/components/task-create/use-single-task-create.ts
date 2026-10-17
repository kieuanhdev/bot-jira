"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "@/lib/api-client";
import { adminKeys, bulkKeys, issuesTouchingProjects } from "@/lib/query-keys";
import type {
  BulkCreatePreviewResult,
  BulkCreateRowInput,
  BulkCreateSource,
} from "@/lib/bulk/create-types";
import {
  POLL_INTERVAL_MS,
  isTerminalOperationState,
  singleCreateReducer,
  type SingleCreateOperation,
  type SingleCreateOperationState,
  type SingleCreatePhase,
} from "./single-create-model";

export const DEFAULT_SINGLE_CREATE_ENDPOINT = "/api/bulk/create";

export type UseSingleTaskCreateOptions = {
  projectKey: string;
  source: BulkCreateSource;
  /**
   * Preview/confirm endpoint. Contract:
   * - default `/api/bulk/create`: preview body `{projectKey, items:[row], source}`;
   * - any other endpoint (e.g. `/api/admin/sentry-import/[id]/create`): preview body `{row}`
   *   (the route derives project/source itself);
   * - confirm body is `{confirm:true, operationId}` for both.
   * Both must answer preview with a `BulkCreatePreviewResult`.
   */
  endpoint?: string;
  onCreated?: (jiraKey: string) => void;
};

export type UseSingleTaskCreateResult = {
  phase: SingleCreatePhase;
  submit(row: BulkCreateRowInput): void;
  forceConfirm(): void;
  reset(): void;
};

const TICK_MS = 1_000;

function activeOpId(phase: SingleCreatePhase): string | null {
  return phase.kind === "creating" || phase.kind === "queued-slow" ? phase.operationId : null;
}

export function useSingleTaskCreate(opts: UseSingleTaskCreateOptions): UseSingleTaskCreateResult {
  const { projectKey, source, endpoint = DEFAULT_SINGLE_CREATE_ENDPOINT, onCreated } = opts;
  const queryClient = useQueryClient();
  const [phase, dispatch] = useReducer(singleCreateReducer, { kind: "idle" } as SingleCreatePhase);
  const [confirmedOpId, setConfirmedOpId] = useState<string | null>(null);
  // Bumped on reset so late responses from an abandoned attempt are dropped.
  const generationRef = useRef(0);
  const lastOpStateRef = useRef<SingleCreateOperationState | undefined>(undefined);

  const confirmMutation = useMutation({
    mutationFn: (vars: { operationId: string; generation: number }) =>
      api<{ operationId?: string }>(endpoint, {
        method: "POST",
        body: { confirm: true, operationId: vars.operationId },
      }),
    onSuccess: (_data, vars) => {
      if (vars.generation !== generationRef.current) return;
      setConfirmedOpId(vars.operationId);
    },
    onError: (error, vars) => {
      if (vars.generation !== generationRef.current) return;
      dispatch({ type: "confirm-error", message: getErrorMessage(error) });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (vars: { row: BulkCreateRowInput; generation: number }) =>
      api<BulkCreatePreviewResult>(endpoint, {
        method: "POST",
        body:
          endpoint === DEFAULT_SINGLE_CREATE_ENDPOINT
            ? { projectKey, items: [vars.row], source }
            : { row: vars.row },
      }),
    onSuccess: (result, vars) => {
      if (vars.generation !== generationRef.current) return;
      const event = { type: "preview-ok", result, now: Date.now() } as const;
      dispatch(event);
      // Auto-confirm only a clean preview; blocked/duplicate wait for the user.
      if (singleCreateReducer({ kind: "previewing" }, event).kind === "creating") {
        confirmMutation.mutate({ operationId: result.operationId, generation: vars.generation });
      }
    },
    onError: (error, vars) => {
      if (vars.generation !== generationRef.current) return;
      dispatch({ type: "preview-error", message: getErrorMessage(error) });
    },
  });

  const pollingOpId = activeOpId(phase);
  const pollEnabled = pollingOpId !== null && pollingOpId === confirmedOpId;

  useQuery({
    queryKey: bulkKeys.operation(pollingOpId ?? ""),
    queryFn: async () => {
      const data = await api<{ operation: SingleCreateOperation }>(`/api/bulk/operations/${pollingOpId}`);
      lastOpStateRef.current = data.operation.state;
      dispatch({ type: "poll", operation: data.operation });
      return data;
    },
    enabled: pollEnabled,
    refetchInterval: (query) =>
      isTerminalOperationState(query.state.data?.operation.state) ? false : POLL_INTERVAL_MS,
  });

  // Drive the slow-queue timeout while the op has not been picked up by the worker.
  useEffect(() => {
    if (phase.kind !== "creating") return;
    const timer = setInterval(() => {
      dispatch({ type: "tick", now: Date.now(), opState: lastOpStateRef.current });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [phase.kind]);

  const doneKey = phase.kind === "done" ? phase.jiraKey : null;
  const notifiedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!doneKey || notifiedKeyRef.current === doneKey) return;
    notifiedKeyRef.current = doneKey;
    void queryClient.invalidateQueries({ predicate: issuesTouchingProjects([projectKey]) });
    void queryClient.invalidateQueries({ queryKey: bulkKeys.operations });
    if (source.type === "sentry") {
      void queryClient.invalidateQueries({ queryKey: adminKeys.sentry });
    }
    onCreated?.(doneKey);
  }, [doneKey, projectKey, source.type, queryClient, onCreated]);

  const submit = useCallback(
    (row: BulkCreateRowInput) => {
      if (phase.kind === "previewing" || activeOpId(phase)) return;
      lastOpStateRef.current = undefined;
      dispatch({ type: "submit" });
      previewMutation.mutate({ row, generation: generationRef.current });
    },
    [phase, previewMutation]
  );

  const forceConfirm = useCallback(() => {
    if (phase.kind !== "duplicate") return;
    lastOpStateRef.current = undefined;
    dispatch({ type: "force-confirm", now: Date.now() });
    confirmMutation.mutate({ operationId: phase.operationId, generation: generationRef.current });
  }, [phase, confirmMutation]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    lastOpStateRef.current = undefined;
    notifiedKeyRef.current = null;
    setConfirmedOpId(null);
    dispatch({ type: "reset" });
  }, []);

  return { phase, submit, forceConfirm, reset };
}
