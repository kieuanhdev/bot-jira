"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, RefreshCw } from "lucide-react";
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { SearchField } from "@/components/shared/search-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api-client";
import { issuesKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type IssueLinkType = { id: string; name: string; inward: string; outward: string };

const JIRA_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

/** One selectable phrase, e.g. "blocks" (outward) or "is blocked by" (inward). */
type LinkChoice = { value: string; label: string; typeName: string; direction: "inward" | "outward" };

type SearchHit = { jiraKey: string; summary: string; status: string };

interface LinkIssueDialogProps {
  jiraKey: string;
  open: boolean;
  linking: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: { typeName: string; direction: "inward" | "outward"; targetKey: string }) => void;
}

function choicesOf(types: IssueLinkType[]): LinkChoice[] {
  return types.flatMap((t) => [
    { value: `${t.id}:outward`, label: t.outward, typeName: t.name, direction: "outward" as const },
    { value: `${t.id}:inward`, label: t.inward, typeName: t.name, direction: "inward" as const },
  ]);
}

/** Jira-style "Link issue": pick the relation phrase, then the task it points at. */
export function LinkIssueDialog({
  jiraKey,
  open,
  linking,
  error,
  onOpenChange,
  onConfirm,
}: LinkIssueDialogProps) {
  const [choiceValue, setChoiceValue] = useState("");
  const [query, setQuery] = useState("");
  const [targetKey, setTargetKey] = useState("");

  const { data: typesData, isPending: typesLoading } = useQuery({
    queryKey: issuesKeys.linkTypes(jiraKey),
    queryFn: () => api<{ items: IssueLinkType[] }>(`/api/issues/${jiraKey}/links`),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const choices = useMemo(() => choicesOf(typesData?.items ?? []), [typesData]);

  // Derived, not synced: until the user picks one, the first relation Jira
  // offers is the selection.
  const selectedValue = choiceValue || choices[0]?.value || "";

  const trimmedQuery = query.trim();
  const { data: searchData, isFetching: searching } = useQuery({
    queryKey: issuesKeys.search(trimmedQuery),
    queryFn: () =>
      api<{ items: SearchHit[] }>(
        `/api/issues/search?q=${encodeURIComponent(trimmedQuery)}&limit=8`
      ),
    enabled: open && trimmedQuery.length >= 2,
    staleTime: 30_000,
  });

  const hits = (searchData?.items ?? []).filter((i) => i.jiraKey !== jiraKey);
  const choice = choices.find((c) => c.value === selectedValue);
  // A key typed in full is accepted even when the local cache has not synced it
  // yet; the server validates it and reports a 404 if Jira does not know it.
  const typedKey = JIRA_KEY_RE.test(trimmedQuery) ? trimmedQuery.toUpperCase() : "";
  const effectiveTarget = targetKey || typedKey;
  const invalid = !choice || !effectiveTarget || effectiveTarget === jiraKey;

  function submit() {
    if (invalid || linking || !choice) return;
    onConfirm({ typeName: choice.typeName, direction: choice.direction, targetKey: effectiveTarget });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !linking && onOpenChange(next)}>
      <DialogContent className="grid-cols-[minmax(0,1fr)] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
            Link issue {jiraKey}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Tạo issue link trên Jira giữa task này và một task khác.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-3 py-2">
          {error && (
            <FeedbackBanner tone="destructive" className="text-xs">
              <span className="min-w-0 break-words">{error}</span>
            </FeedbackBanner>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-type" className="text-xs">
              Link type
            </Label>
            {typesLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : choices.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Jira không trả về loại liên kết nào dùng được.
              </p>
            ) : (
              <select
                id="link-type"
                value={selectedValue}
                disabled={linking}
                onChange={(e) => setChoiceValue(e.target.value)}
                className="h-9 cursor-pointer rounded-md border border-input bg-background px-2 text-sm outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {jiraKey} {c.label}…
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="link-target" className="text-xs">
              Task liên kết
            </Label>
            <SearchField
              id="link-target"
              autoFocus
              disabled={linking}
              placeholder="Tìm theo mã hoặc tiêu đề (ví dụ: EPM-123)"
              value={query}
              onChange={(val) => {
                setQuery(val);
                setTargetKey("");
              }}
              className="text-sm"
            />

            {effectiveTarget && (
              <p className="text-[11px] text-muted-foreground">
                Sẽ liên kết với{" "}
                <span className="font-mono font-semibold text-foreground">{effectiveTarget}</span>
              </p>
            )}

            {targetKey ? null : trimmedQuery.length < 2 ? (
              <p className="text-[11px] text-muted-foreground">Nhập ít nhất 2 ký tự để tìm.</p>
            ) : searching ? (
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : hits.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Không tìm thấy task nào khớp trong dữ liệu đã đồng bộ.
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto rounded-md border">
                {hits.map((hit) => (
                  <li key={hit.jiraKey}>
                    <button
                      type="button"
                      disabled={linking}
                      onClick={() => {
                        setTargetKey(hit.jiraKey);
                        setQuery(hit.jiraKey);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors duration-150 hover:bg-accent",
                        hit.jiraKey === effectiveTarget && "bg-accent"
                      )}
                    >
                      <span className="shrink-0 font-mono font-semibold">{hit.jiraKey}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {hit.summary}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{hit.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            disabled={linking}
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Hủy
          </Button>
          <Button
            size="sm"
            disabled={linking || invalid}
            onClick={submit}
            className="cursor-pointer gap-1.5"
          >
            {linking ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {linking ? "Đang link…" : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
