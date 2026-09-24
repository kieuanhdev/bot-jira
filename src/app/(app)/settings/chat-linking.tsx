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
        <CardTitle>Kênh chat (Discord)</CardTitle>
        <CardDescription>
          Liên kết tài khoản Discord để nhận cảnh báo và chạy lệnh trong
          kênh nhóm. Lệnh được thực thi với quyền hạn Jira của bạn.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : (
          <>
            {linked ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Đã liên kết Discord</span>
                    <Badge variant="success">hoạt động</Badge>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">{linked.externalId}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={submitUnlink}
                  disabled={busy === "unlink"}
                >
                  {busy === "unlink" ? "Đang huỷ liên kết…" : "Huỷ liên kết"}
                </Button>
              </div>
            ) : (
              <form onSubmit={submitLink} className="flex flex-col gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="discord-id">Discord User ID</Label>
                    <Input
                      id="discord-id"
                      placeholder="123456789012345678"
                      value={discordId}
                      onChange={(e) => setDiscordId(e.target.value)}
                      required
                    />
                    <span className="text-xs text-muted-foreground">
                      Trong Discord: Cài đặt → Nâng cao → Bật Chế độ nhà phát triển, sau đó
                      nhấp chuột phải vào hồ sơ → Sao chép ID người dùng.
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="discord-name">Tên hiển thị (tuỳ chọn)</Label>
                    <Input
                      id="discord-name"
                      placeholder="Tên của bạn"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={busy === "link" || !discordId.trim()}>
                    {busy === "link" ? "Đang liên kết…" : "Liên kết tài khoản"}
                  </Button>
                  {linkMutation.isError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{String(linkMutation.error)}</p>
                  )}
                </div>
              </form>
            )}
            <p className="text-xs text-muted-foreground">
              Trong kênh chat nhóm, bạn có thể gõ: <code className="font-mono">/task PROJ-123</code>,{" "}
              <code className="font-mono">/move PROJ-123 &quot;In Progress&quot;</code>,{" "}
              <code className="font-mono">/release 1.4.2 check</code>, hoặc{" "}
              <code className="font-mono">/help</code>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
