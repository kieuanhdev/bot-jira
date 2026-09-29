"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Loader2, Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  step: "jira" | "projects";
  availableProjects: string[];
  initialProjects: string[];
};

export function SetupJiraClient({ step, availableProjects, initialProjects }: Props) {
  const router = useRouter();

  // Integration credentials
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [auth, setAuth] = useState<"Bearer" | "basic">("Bearer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step: projects
  const [selected, setSelected] = useState<Set<string>>(new Set(initialProjects));
  const [customProjects, setCustomProjects] = useState<string[]>([]);
  const [newKey, setNewKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [validateSuccess, setValidateSuccess] = useState<string | null>(null);
  const [savingProjects, setSavingProjects] = useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      setError("Vui lòng dán Jira API token của bạn.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraUser: username.trim() || null,
          jiraToken: token,
          jiraAuth: auth,
        }),
      });
      const result = (await res.json()) as {
        ok?: boolean;
        error?: string;
        verify?: { jira: { ok: boolean; detail?: string } };
      };
      if (!res.ok || !result.ok || !result.verify?.jira.ok) {
        setError(result.error ?? result.verify?.jira.detail ?? "Token Jira không hợp lệ");
        setBusy(false);
        return;
      }
      setBusy(false);
      router.refresh();
    } catch {
      setError("Lỗi kết nối mạng");
      setBusy(false);
    }
  }

  const allProjects = Array.from(new Set([...availableProjects, ...customProjects]));

  async function handleAddProject(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const key = newKey.trim().toUpperCase();
    if (!key) return;
    setValidating(true);
    setValidateError(null);
    setValidateSuccess(null);
    try {
      const res = await fetch("/api/projects/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; project?: { key: string; name: string } };
      if (!res.ok || !data.ok || !data.project) {
        setValidateError(data.error ?? "Dự án không tồn tại trên Jira.");
        return;
      }
      const verifiedKey = data.project.key;
      setCustomProjects((prev) => (prev.includes(verifiedKey) ? prev : [...prev, verifiedKey]));
      setSelected((prev) => new Set([...prev, verifiedKey]));
      setValidateSuccess(`Đã tìm thấy dự án: ${data.project.name} (${verifiedKey})`);
      setNewKey("");
    } catch {
      setValidateError("Lỗi kết nối khi kiểm tra dự án trên Jira.");
    } finally {
      setValidating(false);
    }
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function saveProjects() {
    setSavingProjects(true);
    setError(null);
    try {
      await fetch("/api/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projects: [...selected] }),
      });
      // Mark onboarding complete.
      await fetch("/api/me/onboard", { method: "POST", body: JSON.stringify({}) });
      router.replace("/board");
    } catch {
      setError("Không thể lưu danh sách dự án của bạn");
      setSavingProjects(false);
    }
  }

  if (step === "jira") {
    return (
      <form onSubmit={connect} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Username Jira (tuỳ chọn)</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@team"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Loại xác thực</Label>
          <Select value={auth} onValueChange={(v) => setAuth(v as "Bearer" | "basic")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Bearer">Bearer (Jira DC này)</SelectItem>
              <SelectItem value="basic">Basic (user + token)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Chưa rõ? Chọn <strong>Bearer</strong> — hệ thống sẽ tự động phát hiện khi lưu.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Jira API token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Dán Jira API token của bạn"
            autoComplete="off"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="cursor-pointer">
          {busy ? "Đang kết nối…" : "Kết nối Jira"}
        </Button>
      </form>
    );
  }

  // step === "projects"
  return (
    <div className="flex flex-col gap-4">
      {allProjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có dự án nào. Vui lòng nhập mã dự án bên dưới.</p>
      ) : (
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
          {allProjects.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-2.5">
                <Checkbox checked={selected.has(p)} onCheckedChange={() => toggle(p)} />
                <span className="font-medium">{p}</span>
              </div>
              {customProjects.includes(p) && (
                <span className="rounded bg-teal-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400">
                  Mới thêm
                </span>
              )}
            </label>
          ))}
        </div>
      )}

      {/* Input to enter custom project */}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <Label className="mb-1.5 block text-xs font-semibold text-foreground">
          Nhập dự án muốn có (chưa có trong danh sách)
        </Label>
        <div className="flex gap-2">
          <Input
            value={newKey}
            onChange={(e) => {
              setNewKey(e.target.value.toUpperCase());
              setValidateError(null);
              setValidateSuccess(null);
            }}
            placeholder="VD: PROJ, MOBILE..."
            className="h-9 font-mono text-xs uppercase"
            disabled={validating}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddProject();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={validating || !newKey.trim()}
            onClick={() => void handleAddProject()}
            className="h-9 shrink-0 cursor-pointer gap-1.5"
          >
            {validating ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Kiểm tra
          </Button>
        </div>
        {validateError && <p className="mt-2 text-xs font-medium text-destructive">{validateError}</p>}
        {validateSuccess && (
          <p className="mt-2 flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400">
            <Check className="h-3.5 w-3.5" />
            {validateSuccess}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? "Chưa chọn dự án nào — bảng công việc sẽ trống cho đến khi bạn chọn."
          : `Đã chọn ${selected.size} dự án.`}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={saveProjects} disabled={savingProjects} className="cursor-pointer">
        {savingProjects ? "Đang lưu…" : "Tiếp tục đến bảng công việc"}
      </Button>
    </div>
  );
}
