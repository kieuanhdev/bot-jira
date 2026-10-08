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
import { FeedbackBanner } from "@/components/shared/feedback-banner";
import { Unplug } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { releasesKeys } from "@/lib/query-keys";
import { api, getErrorMessage } from "@/lib/api-client";
import { useSaveCredentials, useDisconnectCredential } from "@/hooks/use-settings";

type Status = { ok: boolean; detail?: string };
type Integrations = {
  jira: { linked: boolean; status: Status; verifiedAt: string | null };
  bitbucket: { linked: boolean; status: Status; verifiedAt: string | null };
  syncAvailable: { jira: boolean; bitbucket: boolean };
  bitbucketRepo: string | null;
  bitbucketRepoCount?: number;
};

export function MyIntegrations() {
  const queryClient = useQueryClient();
  const [data, setData] = useState<Integrations | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [jiraUser, setJiraUser] = useState("");
  const [jiraToken, setJiraToken] = useState("");
  const [jiraAuth, setJiraAuth] = useState<"Bearer" | "basic">("Bearer");
  const [bbUser, setBbUser] = useState("");
  const [bbToken, setBbToken] = useState("");
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [disconnecting, setDisconnecting] = useState<"jira" | "bitbucket" | null>(null);

  const saveMutation = useSaveCredentials();
  const disconnectMutation = useDisconnectCredential();

  function disconnect(service: "jira" | "bitbucket") {
    if (!confirm(`Ngắt kết nối ${service === "jira" ? "Jira" : "Bitbucket"}?`)) return;
    setDisconnecting(service);
    setSaveMsg(null);
    disconnectMutation.mutate(service, {
      onSuccess: () => {
        if (service === "jira") {
          queryClient.invalidateQueries({ queryKey: releasesKeys.permissionsAll() });
        }
        load();
        setSaveMsg({ ok: true, text: `Đã ngắt kết nối ${service === "jira" ? "Jira" : "Bitbucket"}.` });
      },
      onError: (err) => {
        setFormError(getErrorMessage(err, "Ngắt kết nối thất bại"));
      },
      onSettled: () => setDisconnecting(null),
    });
  }

  async function load() {
    try {
      const d = await api<Integrations>("/api/me/integrations");
      setData(d);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (bbToken && !bbUser.trim()) {
      setFormError("Username Bitbucket là bắt buộc khi cập nhật token.");
      return;
    }
    setFormError(null);
    setSaveMsg(null);
    const hadJiraToken = Boolean(jiraToken);
    saveMutation.mutate(
      {
        jiraUser: jiraToken ? jiraUser : null,
        jiraToken: jiraToken || null,
        jiraAuth,
        bitbucketUser: bbToken ? bbUser : null,
        bitbucketToken: bbToken || null,
      },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            setFormError("Lưu thất bại");
            return;
          }
          const j = result.verify.jira;
          const b = result.verify.bitbucket;
          const parts: string[] = [];
          parts.push(j.ok ? `Jira ✓ (${j.detail})` : `Jira ✗ ${j.detail ?? "chưa liên kết"}`);
          if (b.detail) parts.push(b.ok ? `Bitbucket ✓ (${b.detail})` : `Bitbucket ✗ ${b.detail}`);
          const found = result.discovery;
          if (found?.bitbucket) {
            const n = found.bitbucket.newRepos.length;
            parts.push(
              n > 0
                ? `Bitbucket mở khóa ${n} repo mới (đang đồng bộ): ${found.bitbucket.newRepos.slice(0, 5).join(", ")}${n > 5 ? "…" : ""}`
                : `Bitbucket đọc được ${found.bitbucket.readable} repo`
            );
          }
          if (found?.jira && found.jira.registered.length > 0) {
            parts.push(`Jira thêm dự án: ${found.jira.registered.join(", ")} (đang đồng bộ)`);
          }
          setSaveMsg({
            ok: j.ok && (!result.bitbucketLinked || b.ok),
            text: parts.join(" · "),
          });
          if (hadJiraToken) {
            queryClient.invalidateQueries({ queryKey: releasesKeys.permissionsAll() });
          }
          setJiraToken("");
          setBbToken("");
          load();
        },
        onError: (err) => {
          setFormError(getErrorMessage(err, "Lưu thất bại"));
        },
      }
    );
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
          {!data?.bitbucketRepo ? (
            <p className="text-xs text-muted-foreground">
              Bitbucket chưa được cấu hình trên máy chủ — token của bạn sẽ được lưu nhưng
              chưa thể xác minh cho đến khi quản trị viên cấu hình <code>BITBUCKET_BASE_URL</code> và kho lưu trữ.
            </p>
          ) : data.bitbucketRepoCount ? (
            <p className="text-xs text-muted-foreground">
              Hệ thống đang cấu hình đồng bộ <strong>{data.bitbucketRepoCount} repositories</strong>.
            </p>
          ) : null}
        </div>

        {formError && <FeedbackBanner tone="destructive">{formError}</FeedbackBanner>}
        {saveMsg && (
          <FeedbackBanner tone={saveMsg.ok ? "success" : "warning"}>{saveMsg.text}</FeedbackBanner>
        )}

        <Button type="submit" onClick={save} disabled={saveMutation.isPending} className="w-fit">
          {saveMutation.isPending ? "Đang lưu & xác minh…" : "Lưu & xác minh"}
        </Button>
      </CardContent>
    </Card>
  );
}
