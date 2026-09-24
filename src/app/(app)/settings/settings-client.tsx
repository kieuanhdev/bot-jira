"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { settingsKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { timeAgo } from "@/lib/utils";
import { MyIntegrations } from "./my-integrations";
import { NotificationPreferences } from "./notification-preferences";
import { ChatLinking } from "./chat-linking";

type User = {
  id: string;
  email: string;
  displayName: string;
  jiraUsername: string | null;
  role: "member" | "admin";
  createdAt: string;
};

type Health = {
  status: string;
  env: {
    jiraConfigured: boolean;
    bitbucketConfigured: boolean;
    sentryConfigured: boolean;
    ollamaConfigured: boolean;
  };
  services: Record<string, { ok: boolean; ms: number; error?: string }>;
};

export function SettingsClient({ users, isAdmin }: { users: User[]; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(false);

  async function checkHealth() {
    setChecking(true);
    try {
      const h = await api<Health>("/api/health");
      setHealth(h);
    } finally {
      setChecking(false);
    }
  }

  async function setUserRole(id: string, role: "member" | "admin") {
    await api(`/api/users/${id}/role`, { method: "PATCH", body: { role } });
    qc.invalidateQueries({ queryKey: settingsKeys.users });
  }

  const serviceKeys = ["db", "jira", "bitbucket", "sentry", "openai", "ollama"] as const;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <MyIntegrations />
      <NotificationPreferences />
      <ChatLinking />
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Tình trạng dịch vụ</CardTitle>
            <CardDescription>
              Kiểm tra kết nối Postgres, Jira, Bitbucket, Sentry và Ollama. Khởi động tác vụ định kỳ.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Button onClick={checkHealth} disabled={checking}>
              {checking ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
            </Button>
            {health && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {serviceKeys.map((k) => {
                  const s = health.services[k];
                  return (
                    <div key={k} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{k}</span>
                        <Badge variant={s.ok ? "success" : "danger"}>
                          {s.ok ? "hoạt động" : "mất kết nối"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {s.ok ? `${s.ms}ms` : s.error}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Người dùng &amp; vai trò</CardTitle>
            <CardDescription>
              Phân vai trò thành viên/quản trị viên và gán username Jira để nhận thông báo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5">Người dùng</th>
                  <th>Jira</th>
                  <th>Vai trò</th>
                  <th>Ngày tham gia</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="font-medium">{u.displayName}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="font-mono text-xs">
                      {u.jiraUsername ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td>
                      <Select
                        value={u.role}
                        onValueChange={(v) => setUserRole(u.id, v as "member" | "admin")}
                      >
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">thành viên</SelectItem>
                          <SelectItem value="admin">quản trị viên</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="text-xs text-muted-foreground">{timeAgo(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {!isAdmin && (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Bạn cần quyền quản trị viên (admin) để quản lý người dùng.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
