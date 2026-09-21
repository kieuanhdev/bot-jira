"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  step: "token" | "projects";
  availableProjects: string[];
  initialProjects: string[];
};

export function SetupJiraClient({ step, availableProjects, initialProjects }: Props) {
  const router = useRouter();

  // Step: token
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [auth, setAuth] = useState<"Bearer" | "basic">("Bearer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step: projects
  const [selected, setSelected] = useState<Set<string>>(new Set(initialProjects));
  const [savingProjects, setSavingProjects] = useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      setError("Please paste your Jira API token.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraUser: username.trim() || null, jiraToken: token, jiraAuth: auth }),
      });
      const result = (await res.json()) as {
        ok?: boolean;
        error?: string;
        verify?: { jira: { ok: boolean; detail?: string } };
      };
      if (!res.ok || !result.ok) {
        setError(result.error ?? "Failed to save");
        setBusy(false);
        return;
      }
      // Success — go to the project selection step (server re-renders this page).
      router.refresh();
    } catch {
      setError("Network error");
      setBusy(false);
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
      setError("Could not save your projects");
      setSavingProjects(false);
    }
  }

  if (step === "token") {
    return (
      <form onSubmit={connect} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Jira username (optional)</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@team"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Auth type</Label>
          <Select value={auth} onValueChange={(v) => setAuth(v as "Bearer" | "basic")}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Bearer">Bearer (this Jira DC)</SelectItem>
              <SelectItem value="basic">Basic (user + token)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Not sure? Choose <strong>Bearer</strong> — the app auto-detects the working mode when you save.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Jira API token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste your Jira API token"
            autoComplete="off"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Connecting…" : "Connect Jira"}
        </Button>
      </form>
    );
  }

  // step === "projects"
  return (
    <div className="flex flex-col gap-4">
      {availableProjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects are configured on the server.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {availableProjects.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-accent"
            >
              <Checkbox checked={selected.has(p)} onCheckedChange={() => toggle(p)} />
              <span>{p}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {selected.size === 0
          ? "No projects selected — your board will stay empty until you pick some."
          : `${selected.size} project(s) selected.`}
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button onClick={saveProjects} disabled={savingProjects}>
        {savingProjects ? "Saving…" : "Continue to board"}
      </Button>
    </div>
  );
}
