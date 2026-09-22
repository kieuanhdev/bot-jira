"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type Identity = {
  id: string;
  provider: string;
  externalId: string;
  displayName: string | null;
};

export function ChatLinking() {
  const qc = useQueryClient();
  const [discordId, setDiscordId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState<"link" | "unlink" | null>(null);

  const { data, isLoading } = useQuery<{ identities: Identity[] }>({
    queryKey: ["chat", "identity"],
    queryFn: () => api<{ identities: Identity[] }>("/api/chat/identity"),
  });

  const linked = data?.identities?.find((i) => i.provider === "discord") ?? null;

  const linkMutation = useMutation({
    mutationFn: () =>
      api("/api/chat/identity/link", { method: "POST", body: { provider: "discord", externalId: discordId, displayName: displayName || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "identity"] });
      setDiscordId("");
      setDisplayName("");
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: () => api("/api/chat/identity/unlink", { method: "POST", body: { provider: "discord" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chat", "identity"] }),
  });

  function submitLink(e: React.FormEvent) {
    e.preventDefault();
    if (!discordId.trim()) return;
    setBusy("link");
    linkMutation.mutate(undefined, { onSettled: () => setBusy(null) });
  }

  function submitUnlink() {
    setBusy("unlink");
    unlinkMutation.mutate(undefined, { onSettled: () => setBusy(null) });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chat (Discord)</CardTitle>
        <CardDescription>
          Link your Discord account so you can receive alerts and run commands in
          the team channel. Commands run with your Jira permissions.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            {linked ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Discord linked</span>
                    <Badge variant="success">active</Badge>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">{linked.externalId}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={submitUnlink}
                  disabled={busy === "unlink"}
                >
                  {busy === "unlink" ? "Unlinking…" : "Unlink"}
                </Button>
              </div>
            ) : (
              <form onSubmit={submitLink} className="flex flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="discord-id">Discord user id</Label>
                    <Input
                      id="discord-id"
                      placeholder="123456789012345678"
                      value={discordId}
                      onChange={(e) => setDiscordId(e.target.value)}
                      required
                    />
                    <span className="text-xs text-muted-foreground">
                      In Discord: Settings → Advanced → Enable Developer Mode, then
                      right-click your profile → Copy ID.
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="discord-name">Display name (optional)</Label>
                    <Input
                      id="discord-name"
                      placeholder="Your name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={busy === "link" || !discordId.trim()}>
                    {busy === "link" ? "Linking…" : "Link account"}
                  </Button>
                  {linkMutation.isError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{String(linkMutation.error)}</p>
                  )}
                </div>
              </form>
            )}
            <p className="text-xs text-muted-foreground">
              In the team channel, use: <code className="font-mono">/task PROJ-123</code>,{" "}
              <code className="font-mono">/move PROJ-123 &quot;In Progress&quot;</code>,{" "}
              <code className="font-mono">/release 1.4.2 check</code>, or{" "}
              <code className="font-mono">/help</code>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
