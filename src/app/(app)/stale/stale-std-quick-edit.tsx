"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Layers, Loader2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { staleKeys } from "@/lib/query-keys";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VersionItem {
  id?: string;
  name: string;
  archived?: boolean;
  released?: boolean;
}

function useQuickPatch(jiraKey: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = async (body: Record<string, unknown>) => {
    setPending(true);
    setError(null);
    try {
      await api(`/api/issues/${encodeURIComponent(jiraKey)}`, { method: "PATCH", body });
      await queryClient.invalidateQueries({ queryKey: staleKeys.all });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cập nhật thất bại");
      return false;
    } finally {
      setPending(false);
    }
  };

  return { patch, pending, error };
}

/** Inline Story Points entry: type a number and press Enter (or the tick) to save to Jira. */
export function QuickPointsEditor({ jiraKey }: { jiraKey: string }) {
  const [value, setValue] = useState("");
  const { patch, pending, error } = useQuickPatch(jiraKey);
  const points = Number(value);
  const valid = value.trim() !== "" && Number.isFinite(points) && points > 0;

  const save = () => {
    if (valid && !pending) void patch({ points });
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="0.5"
          value={value}
          disabled={pending}
          data-quick-points={jiraKey}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              setValue("");
              e.currentTarget.blur();
            }
          }}
          placeholder="Points"
          aria-label={`Nhập story points cho ${jiraKey}`}
          className="h-7 w-20 rounded-md border border-input bg-transparent px-2 text-xs tabular-nums placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={save}
          disabled={!valid || pending}
          aria-label={`Lưu points cho ${jiraKey}`}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Check className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
      {error && (
        <p className="mt-1 max-w-40 text-[11px] leading-4 text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Inline Fix Version picker; versions load lazily the first time the menu opens. */
export function QuickFixVersionSelect({ jiraKey }: { jiraKey: string }) {
  const [open, setOpen] = useState(false);
  const { patch, pending, error } = useQuickPatch(jiraKey);
  const { data, isLoading } = useQuery({
    queryKey: ["issue-versions", jiraKey.split("-")[0]],
    queryFn: () => api<{ items: VersionItem[] }>(`/api/issues/${encodeURIComponent(jiraKey)}/versions`),
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const versions = (data?.items ?? []).filter((v) => !v.archived && !v.released);

  return (
    <div>
      <Select
        open={open}
        onOpenChange={setOpen}
        value=""
        disabled={pending}
        onValueChange={(name) => void patch({ addFixVersion: name })}
      >
        <SelectTrigger
          className="h-7 w-32 cursor-pointer gap-1 px-2 text-xs"
          aria-label={`Chọn Fix Version cho ${jiraKey}`}
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
          ) : (
            <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <SelectValue placeholder="Fix Version" />
        </SelectTrigger>
        <SelectContent>
          {isLoading && <div className="px-2 py-1.5 text-xs text-muted-foreground">Đang tải…</div>}
          {!isLoading && versions.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Không có phiên bản khả dụng</div>
          )}
          {versions.map((v) => (
            <SelectItem key={v.id ?? v.name} value={v.name}>
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p className="mt-1 max-w-40 text-[11px] leading-4 text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
