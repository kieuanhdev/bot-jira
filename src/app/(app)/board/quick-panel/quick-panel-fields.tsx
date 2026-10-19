import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink, GitBranch, Pencil, Plus, X } from "lucide-react";
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
import { PointStepGrid } from "@/components/point-step-grid";
import { PRIORITIES, toName } from "../lib/quick-panel-utils";

/** Shared look for an editable value: bordered chip + chevron so it reads as a control. */
const EDIT_TRIGGER =
  "flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 text-left text-sm font-medium transition-colors duration-150 hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function Chevron() {
  return <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

type PersonRole = "reporter" | "approver" | "tester";

/** Click-to-edit title: Enter saves, Escape cancels without closing the panel. */
function EditableSummary({ value, onSave }: { value: string; onSave: (summary: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set once an edit has finished, so the blur fired on unmount can't save again.
  const cancelled = useRef(false);

  const finish = (save: boolean) => {
    if (draft === null) return;
    const next = draft.trim();
    const skip = cancelled.current || !save;
    cancelled.current = true;
    setDraft(null);
    // Keep focus inside the panel so its focus trap and Escape keep working.
    requestAnimationFrame(() => triggerRef.current?.focus());
    if (!skip && next && next !== value) onSave(next);
  };

  if (draft !== null) {
    return (
      <Input
        autoFocus
        data-escape-local
        aria-label="Summary"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        className="h-auto py-1 text-base font-semibold"
      />
    );
  }

  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => {
        cancelled.current = false;
        setDraft(value);
      }}
      title="Nhấn để sửa tiêu đề"
      className="group/summary flex w-full cursor-pointer items-start gap-1.5 rounded-md text-left transition-colors duration-150 hover:bg-muted/60"
    >
      <h2 className="text-base font-semibold leading-snug">{value}</h2>
      <Pencil className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/summary:opacity-100" aria-hidden />
    </button>
  );
}

function PersonPicker({
  value,
  people,
  onChange,
}: {
  value?: string | null;
  people: string[];
  onChange: (name: string | null) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={EDIT_TRIGGER}>
          {value ? (
            <>
              <JiraAvatar username={value} size="sm" />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          <Chevron />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 max-h-64 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange(null)} className="text-xs">
          Bỏ trống
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {people.map((a) => (
          <DropdownMenuItem key={a} onClick={() => onChange(a)} className="text-xs">
            {a}
            {a === value && <span className="ml-auto text-primary">•</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DueDatePicker({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (date: string | null) => void;
}) {
  const current = value ? value.slice(0, 10) : "";
  const [draft, setDraft] = useState(current);
  // Commit once on "Lưu": a native date input changes on every typed segment.
  return (
    <DropdownMenu onOpenChange={(open) => open && setDraft(current)}>
      <DropdownMenuTrigger asChild>
        <button className={EDIT_TRIGGER}>
          <span className="truncate">{value ? new Date(value).toLocaleDateString("vi-VN") : "—"}</span>
          <Chevron />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48 p-2">
        <input
          type="date"
          aria-label="Due date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && draft && draft !== current) onChange(draft);
          }}
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
        />
        <div className="mt-1.5 flex gap-1.5">
          <DropdownMenuItem
            disabled={!draft || draft === current}
            onClick={() => onChange(draft)}
            className="h-8 flex-1 justify-center text-xs font-medium text-primary cursor-pointer"
          >
            Lưu
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!value}
            onClick={() => onChange(null)}
            className="h-8 flex-1 justify-center text-xs text-destructive cursor-pointer"
          >
            Xóa ngày
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface QuickPanelFieldsProps {
  summary: string;
  onSetSummary: (summary: string) => void;
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
  onSetPerson: (role: PersonRole, name: string | null) => void;
  dueDate?: string | null;
  onSetDueDate: (date: string | null) => void;
  timeSpentSeconds?: number | null;
  originalEstimateSeconds?: number | null;
  assignees: string[];
  meName?: string | null;
  onAssign: (assignee: string | null) => void;
  points?: number | null;
  aiPoints?: number | null;
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
  onSetSummary,
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
  onSetPerson,
  dueDate,
  onSetDueDate,
  timeSpentSeconds,
  originalEstimateSeconds,
  assignees,
  meName,
  onAssign,
  points,
  aiPoints,
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
      <EditableSummary value={summary} onSave={onSetSummary} />

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm xl:grid-cols-3">
        <Field label="Status">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={EDIT_TRIGGER}>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} />
                <span className="truncate">{status}</span>
                <Chevron />
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
              <button className={EDIT_TRIGGER}>
                <span className="truncate">{priority || "—"}</span>
                <Chevron />
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
              <button className={EDIT_TRIGGER}>
                {assigneeJira ? (
                  <>
                    <JiraAvatar username={assigneeJira} size="sm" />
                    <span className="truncate">{assigneeJira}</span>
                  </>
                ) : (
                  <span className="truncate text-muted-foreground">Unassigned</span>
                )}
                <Chevron />
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
              <button className={EDIT_TRIGGER}>
                <span className="truncate">{points != null ? `${points} pt` : "—"}</span>
                <Chevron />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <PointStepGrid value={points} aiPoints={aiPoints} onChange={onSetPoints} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onSetPoints(null)} className="text-xs text-destructive">
                Xóa điểm
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Field>

        {([
          ["Reporter", "reporter", reporterJira],
          ["Approver", "approver", approverJira],
          ["Tester", "tester", testerJira],
        ] as const).map(([label, role, value]) => (
          <Field key={role} label={label}>
            <PersonPicker value={value} people={assignees} onChange={(name) => onSetPerson(role, name)} />
          </Field>
        ))}
        <Field label="Due date">
          <DueDatePicker value={dueDate} onChange={onSetDueDate} />
        </Field>
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
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Phiên bản phát hành (Fix Versions)
          </span>
          {!showAddVersion && (
            <button
              onClick={() => setShowAddVersion(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm version
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {fixVersions.length === 0 && !showAddVersion && (
            <span className="text-xs italic text-muted-foreground">Chưa gắn phiên bản</span>
          )}
          {fixVersions.map((v) => (
            <Badge key={v} variant="info" className="gap-1">
              {v}
              <button
                onClick={() => onRemoveVersion(v)}
                className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
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
                  <SelectTrigger className="h-8 w-36 text-xs">
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
                  className="h-8 w-28 text-xs px-2"
                />
              )}
              {!projectVersions.length && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs cursor-pointer"
                  onClick={() => handleSaveVersion(newVersionInput)}
                >
                  Lưu
                </Button>
              )}
              <button
                onClick={() => setShowAddVersion(false)}
                className="cursor-pointer p-1 text-muted-foreground hover:text-foreground"
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
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Nhãn (Labels)
          </span>
          {!showAddLabel && (
            <button
              onClick={() => setShowAddLabel(true)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Thêm nhãn
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {labels.length === 0 && !showAddLabel && (
            <span className="text-xs italic text-muted-foreground">Không có nhãn</span>
          )}
          {labels.map((l) => (
            <Badge key={l} variant="outline" className="gap-1">
              {l}
              <button
                onClick={() => onRemoveLabel(l)}
                className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
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
                className="h-8 w-32 text-xs px-2"
              />
              <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs cursor-pointer" onClick={handleSaveLabel}>
                Lưu
              </Button>
              <button
                onClick={() => setShowAddLabel(false)}
                className="cursor-pointer p-1 text-muted-foreground hover:text-foreground"
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
          <span className="text-xs uppercase tracking-wide text-muted-foreground font-semibold block mb-1.5">
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
                      className="shrink-0 rounded bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground"
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
