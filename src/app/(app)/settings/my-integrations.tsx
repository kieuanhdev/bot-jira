"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Unplug } from "lucide-react";

type Status = { ok: boolean; detail?: string };
type Integrations = {
  jira: { linked: boolean; status: Status; verifiedAt: string | null };
  bitbucket: { linked: boolean; status: Status; verifiedAt: string | null };
  syncAvailable: { jira: boolean; bitbucket: boolean };
  bitbucketRepo: string | null;
};

type SaveResult = {
  ok: boolean;
  verify: {
    jira: { ok: boolean; detail?: string };
    bitbucket: { ok: boolean; detail?: string };
  };
  jiraLinked: boolean;
  bitbucketLinked: boolean;
};

export function MyIntegrations() {
  const [data, setData] = useState<Integrations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Empty token fields keep the user's currently stored credentials unchanged.
  const [jiraUser, setJiraUser] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraAuth, setJiraAuth] = useState<"Bearer" | "basic">("Bearer");
  const [bbUser, setBbUser] = useState("");
  const [bbToken, setBbToken] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState<"jira" | "bitbucket" | null>(null);

  async function disconnect(service: "jira" | "bitbucket") {
    if (!confirm(`Ngắt kết nối ${service === "jira" ? "Jira" : "Bitbucket"}?`)) return;
    setDisconnecting(service);
    setSaveMsg(null);
    try {
      await fetch("/api/me/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(service === "jira" ? { disconnectJira: true } : { disconnectBitbucket: true }),
      });
      await load();
      setSaveMsg({ ok: true, text: `Đã ngắt kết nối ${service === "jira" ? "Jira" : "Bitbucket"}.` });
    } finally {
      setDisconnecting(null);
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/me/integrations", { cache: "no-store" });
      if (res.ok) setData((await res.json()) as Integrations);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (bbToken && !bbUser.trim()) {
      setError("Username Bitbucket là bắt buộc khi cập nhật token.");
      return;
    }
    setError(null);
    setSaveMsg(null);
    setSaving(true);
    try {
      const res = await fetch("/api/me/credentials", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jiraUser: jiraToken ? jiraUser : null,
          jiraToken: jiraToken || null,
          jiraAuth,
          bitbucketUser: bbToken ? bbUser : null,
          bitbucketToken: bbToken || null,
        }),
      });
      const result = (await res.json()) as SaveResult & { error?: string };
      if (!res.ok || !result.ok) {
        setError(result.error ?? "Lưu thất bại");
        return;
      }
      const j = result.verify.jira;
      const b = result.verify.bitbucket;
      const parts: string[] = [];
      parts.push(j.ok ? `Jira ✓ (${j.detail})` : `Jira ✗ ${j.detail ?? "chưa liên kết"}`);
      if (b.detail) parts.push(b.ok ? `Bitbucket ✓` : `Bitbucket ✗ ${b.detail}`);
      setSaveMsg({
        ok: j.ok && (!result.bitbucketLinked || b.ok),
        text: parts.join(" · "),
      });
      // Clear token fields so the user doesn't re-send them next time.
      setJiraToken("");
      setBbToken("");
      await load();
    } catch {
      setError("Lỗi kết nối mạng");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tích hợp cá nhân</CardTitle>
        <CardDescription>
          <strong>Jira là bắt buộc</strong> để xem và thao tác trên bảng công việc. <strong>Bitbucket là tùy chọn</strong> khi
          bạn cần tạo hoặc liên kết nhánh/Pull Request. Token được mã hóa phía máy chủ (AES-256-GCM) và không chia sẻ với người khác.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {/* Jira */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Jira</Label>
            <div className="flex items-center gap-2">
              <Badge
                variant={data?.jira.linked ? "success" : "secondary"}
              >
                {data?.jira.linked
                  ? data.jira.status.ok
                    ? `đã liên kết · ${data.jira.status.detail}`
                    : "đã liên kết (chưa xác minh)"
                  : "chưa kết nối"}
              </Badge>
              {data?.jira.linked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => disconnect("jira")}
                  disabled={disconnecting === "jira"}
                >
                  <Unplug className="h-3.5 w-3.5" />
                  {disconnecting === "jira" ? "Đang ngắt kết nối…" : "Ngắt kết nối"}
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Username Jira (tuỳ chọn)</Label>
              <Input
                value={jiraUser}
                onChange={(e) => setJiraUser(e.target.value)}
                placeholder="you@team"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Loại xác thực</Label>
              <Select value={jiraAuth} onValueChange={(v) => setJiraAuth(v as "Bearer" | "basic")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bearer">Bearer (Jira DC này)</SelectItem>
                  <SelectItem value="basic">Basic (user + token)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Jira API token {jiraToken ? "(để trống để giữ nguyên)" : ""}
            </Label>
            <Input
              type="password"
              value={jiraToken}
              onChange={(e) => setJiraToken(e.target.value)}
              placeholder={jiraToken ? "•••• (giữ nguyên hiện tại)" : "Dán Jira API token của bạn"}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Bitbucket */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Bitbucket</Label>
            <div className="flex items-center gap-2">
              <Badge variant={data?.bitbucket.linked ? "success" : "secondary"}>
                {data?.bitbucket.linked
                  ? data.bitbucket.status.ok
                    ? `đã liên kết · ${data.bitbucket.status.detail}`
                    : "đã liên kết (chưa xác minh)"
                  : "chưa kết nối"}
              </Badge>
              {data?.bitbucket.linked && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => disconnect("bitbucket")}
                  disabled={disconnecting === "bitbucket"}
                >
                  <Unplug className="h-3.5 w-3.5" />
                  {disconnecting === "bitbucket" ? "Đang ngắt kết nối…" : "Ngắt kết nối"}
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Username Bitbucket (bắt buộc)</Label>
              <Input
                value={bbUser}
                onChange={(e) => setBbUser(e.target.value)}
                placeholder="you"
                autoComplete="off"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                Bitbucket API token
              </Label>
              <Input
                type="password"
                value={bbToken}
                onChange={(e) => setBbToken(e.target.value)}
                placeholder={bbToken ? "•••• (giữ nguyên hiện tại)" : "Dán Bitbucket token của bạn"}
                autoComplete="off"
              />
            </div>
          </div>
          {!data?.bitbucketRepo && (
            <p className="text-xs text-muted-foreground">
              Bitbucket chưa được cấu hình trên máy chủ — token của bạn sẽ được lưu nhưng
              chưa thể xác minh cho đến khi quản trị viên cấu hình <code>BITBUCKET_BASE_URL</code> và kho lưu trữ.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {saveMsg && (
          <p
            className={`text-sm ${saveMsg.ok ? "text-success" : "text-amber-600"}`}
          >
            {saveMsg.text}
          </p>
        )}

        <Button type="submit" onClick={save} disabled={saving} className="w-fit">
          {saving ? "Đang lưu & xác minh…" : "Lưu & xác minh"}
        </Button>
      </CardContent>
    </Card>
  );
}
