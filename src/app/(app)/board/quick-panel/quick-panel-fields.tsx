import { useState, type ReactNode } from "react";
import { ExternalLink, GitBranch, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, timeAgo, formatDateTime, getBitbucketBranchUrl } from "@/lib/utils";
import { JiraAvatar } from "@/components/jira-avatar";
import { PRIORITIES, toName } from "../lib/quick-panel-utils";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium">{children}</dd>
    </div>
  );
}

interface QuickPanelFieldsProps {
  summary: string;
  status: string;
  dotClass: string;
  transitions: { id: string; to?: { name?: string } | string }[];
  onTransition: (transitionId: string) => void;
  priority?: string | null;
  onSetPriority: (priority: string) => void;
  assigneeJira?: string | null;
  reporterJira?: string | null;
  approverJira?: string | null;
  testerJira?: string | null;
  dueDate?: string | null;
  timeSpentSeconds?: number | null;
  originalEstimateSeconds?: number | null;
  assignees: string[];
  meName?: string | null;
  onAssign: (assignee: string | null) => void;
  points?: number | null;
  onSetPoints: (points: number | null) => void;
  type: string;
  updatedAt?: string | null;
  createdAt?: string | null;
  lastSyncedAt?: string | null;
  fixVersions: string[];
  projectVersions: { id: string; name: string }[];
  onAddVersion: (version: string) => void;
  onRemoveVersion: (version: string) => void;
  labels: string[];
  onAddLabel: (label: string) => void;
  onRemoveLabel: (label: string) => void;
  branches: { repo: string; branch: string; prUrl?: string | null }[];
  bitbucketBaseUrl: string;
}

export function QuickPanelFields({
  summary,
  status,
  dotClass,
  transitions,
  onTransition,
  priority,
  onSetPriority,
  assigneeJira,
  reporterJira,
  approverJira,
  testerJira,
  dueDate,
  timeSpentSeconds,
  originalEstimateSeconds,
  assignees,
  meName,
  onAssign,
  points,
  onSetPoints,
  type,
  updatedAt,
  createdAt,
  lastSyncedAt,
  fixVersions,
  projectVersions,
  onAddVersion,
  onRemoveVersion,
  labels,
  onAddLabel,
  onRemoveLabel,
  branches,
  bitbucketBaseUrl,
}: QuickPanelFieldsProps) {
  const [showAddVersion, setShowAddVersion] = useState(false);
  const [newVersionInput, setNewVersionInput] = useState("");
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");

  const handleSaveVersion = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onAddVersion(trimmed);
    setNewVersionInput("");
    setShowAddVersion(false);
  };

  const handleSaveLabel = () => {
    const trimmed = newLabelInput.trim();
    if (!trimmed) return;
    onAddLabel(trimmed);
    setNewLabelInput("");
    setShowAddLabel(false);
  };

  return (
    <>
      <h2 className="text-base font-semibold leading-snug">{summary}</h2>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm xl:grid-cols-3">
        <Field label="Status">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 hover:underline text-left">
                <span className={cn("h-2 w-2 rounded-full inline-block mr-1", dotClass)} />
                {status}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {transitions.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => onTransition(t.id)}
                  className="text-xs"
                >
                  {toName(t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field label="Priority">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 hover:underline text-left">
                {priority || "—"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              {PRIORITIES.map((p) => (
                <DropdownMenuItem key={p} onClick={() => onSetPriority(p)} className="text-xs">
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field label="Assignee">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 hover:underline text-left">
                {assigneeJira ? (
                  <>
                    <JiraAvatar username={assigneeJira} size="sm" />
                    <span className="truncate">{assigneeJira}</span>
                  </>
                ) : (
                  "Unassigned"
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
              {meName && (
                <DropdownMenuItem
                  onClick={() => onAssign(meName)}
                  className="text-xs font-medium text-primary"
                >
                  Gán cho tôi ({meName})
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onAssign(null)} className="text-xs">
                Chưa gán
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {assignees.map((a) => (
                <DropdownMenuItem key={a} onClick={() => onAssign(a)} className="text-xs">
                  {a}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field label="Points">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="hover:underline text-left">
                {points != null ? `${points} pt` : "—"}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-36">
              <div className="grid grid-cols-4 gap-1 p-1">
                {[1, 2, 3, 5, 8, 13, 21].map((p) => (
                  <Button
                    key={p}
                    variant={points === p ? "default" : "outline"}
                    size="sm"
                    className="h-7 px-0 text-xs"
                    onClick={() => onSetPoints(p)}
                  >
                    {p}
                  </Button>
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSetPoints(null)} className="text-xs text-destructive">
                Xóa điểm
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        <Field label="Reporter">
          {reporterJira ? (
            <span className="flex items-center gap-1.5">
              <JiraAvatar username={reporterJira} size="xs" />
              <span className="truncate">{reporterJira}</span>
            </span>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Approver">
          {approverJira ? (
            <span className="flex items-center gap-1.5">
              <JiraAvatar username={approverJira} size="xs" />
              <span className="truncate">{approverJira}</span>
            </span>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Tester">
          {testerJira ? (
            <span className="flex items-center gap-1.5">
              <JiraAvatar username={testerJira} size="xs" />
              <span className="truncate">{testerJira}</span>
            </span>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Due date">{dueDate ? formatDateTime(dueDate) : "—"}</Field>
        <Field label="Đã làm / Ước tính">
          {timeSpentSeconds != null ? `${Math.round(timeSpentSeconds / 360) / 10}h` : "—"} / {originalEstimateSeconds != null ? `${Math.round(originalEstimateSeconds / 360) / 10}h` : "—"}
        </Field>

        <Field label="Type">{type}</Field>
        <Field label="Updated">{timeAgo(updatedAt)}</Field>
        <Field label="Created">{formatDateTime(createdAt)}</Field>
        <Field label="Last synced">{timeAgo(lastSyncedAt)}</Field>
      </div>

      {/* Fix Versions */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Phiên bản phát hành (Fix Versions)
          </span>
          {!showAddVersion && (
            <button
              onClick={() => setShowAddVersion(true)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Thêm version
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {fixVersions.length === 0 && !showAddVersion && (
            <span className="text-xs italic text-muted-foreground">Chưa gắn phiên bản</span>
          )}
          {fixVersions.map((v) => (
            <Badge key={v} variant="info" className="gap-1 text-[11px]">
              {v}
              <button
                onClick={() => onRemoveVersion(v)}
                className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                title={`Gỡ ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {showAddVersion && (
            <div className="flex items-center gap-1.5">
              {projectVersions.length > 0 ? (
                <Select onValueChange={(val) => handleSaveVersion(val)}>
                  <SelectTrigger className="h-6 w-32 text-xs">
                    <SelectValue placeholder="Chọn version…" />
                  </SelectTrigger>
                  <SelectContent>
                    {projectVersions.map((pv) => (
                      <SelectItem key={pv.id} value={pv.name} className="text-xs">
                        {pv.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  autoFocus
                  value={newVersionInput}
                  onChange={(e) => setNewVersionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveVersion(newVersionInput);
                    if (e.key === "Escape") setShowAddVersion(false);
                  }}
                  placeholder="1.0.0"
                  className="h-6 w-24 text-xs px-1.5"
                />
              )}
              {!projectVersions.length && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleSaveVersion(newVersionInput)}
                >
                  Lưu
                </Button>
              )}
              <button
                onClick={() => setShowAddVersion(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Labels */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Nhãn (Labels)
          </span>
          {!showAddLabel && (
            <button
              onClick={() => setShowAddLabel(true)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Thêm nhãn
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.length === 0 && !showAddLabel && (
            <span className="text-xs italic text-muted-foreground">Không có nhãn</span>
          )}
          {labels.map((l) => (
            <Badge key={l} variant="outline" className="gap-1 text-[11px]">
              {l}
              <button
                onClick={() => onRemoveLabel(l)}
                className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                title={`Xóa nhãn ${l}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {showAddLabel && (
            <div className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={newLabelInput}
                onChange={(e) => setNewLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveLabel();
                  if (e.key === "Escape") setShowAddLabel(false);
                }}
                placeholder="Tên nhãn…"
                className="h-6 w-28 text-xs px-1.5"
              />
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleSaveLabel}>
                Lưu
              </Button>
              <button
                onClick={() => setShowAddLabel(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Linked Branches */}
      {branches.length > 0 && (
        <div className="mt-4">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold block mb-1.5">
            Nhánh Bitbucket liên kết
          </span>
          <div className="flex flex-col gap-1.5">
            {branches.map((b) => {
              const branchUrl = getBitbucketBranchUrl(b.repo, b.branch, bitbucketBaseUrl, b.prUrl);
              return (
                <div
                  key={`${b.repo}-${b.branch}`}
                  className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs font-mono"
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
                    {/* Submodule-style projects reuse one branch name across many repos. */}
                    <span
                      className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
                      title={b.repo}
                    >
                      {b.repo.split("/").pop()}
                    </span>
                    {branchUrl ? (
                      <a
                        href={branchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-semibold text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
                        title={`Xem nhánh ${b.branch} trên Git`}
                      >
                        <span className="truncate">{b.branch}</span>
                        <ExternalLink className="h-3 w-3 opacity-60 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="truncate">{b.branch}</span>
                    )}
                  </div>
                  {b.prUrl && (
                    <a
                      href={b.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 shrink-0 ml-2 font-sans font-medium"
                      title="Xem Pull Request trên Git"
                    >
                      PR <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
