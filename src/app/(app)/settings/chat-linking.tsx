"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, UserRound, Webhook } from "lucide-react";
import { api } from "@/lib/api-client";
import { chatKeys } from "@/lib/query-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DestinationType = "webhook" | "user_id";
type Integration = {
  destinationType: DestinationType;
  discordUserId: string | null;
  webhookConfigured: boolean;
  updatedAt: string;
};

export function ChatLinking() {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<DestinationType | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [enteredDiscordUserId, setEnteredDiscordUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery<{ integration: Integration | null }>({
    queryKey: chatKeys.identity,
    queryFn: () => api("/api/discord/integration"),
  });
  const integration = query.data?.integration ?? null;
  const destinationType = selectedType ?? integration?.destinationType ?? "webhook";
  const discordUserId = enteredDiscordUserId ?? integration?.discordUserId ?? "";

  const saveMutation = useMutation({
    mutationFn: () => api("/api/discord/integration", {
      method: "PUT",
      body: { destinationType, webhookUrl, discordUserId },
    }),
    onSuccess: async () => {
      setWebhookUrl("");
      setMessage("Đã lưu. Thông báo mới sẽ được gửi đến Discord riêng của bạn.");
      await queryClient.invalidateQueries({ queryKey: chatKeys.identity });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => api("/api/discord/integration", { method: "DELETE" }),
    onSuccess: async () => {
      setWebhookUrl("");
      setEnteredDiscordUserId("");
      setSelectedType("webhook");
      setMessage("Đã tắt thông báo Discord.");
      await queryClient.invalidateQueries({ queryKey: chatKeys.identity });
    },
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    saveMutation.mutate();
  }

  const error = saveMutation.error ?? removeMutation.error ?? query.error;
  const canSave = destinationType === "webhook" ? Boolean(webhookUrl.trim()) : Boolean(discordUserId.trim());

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
              Thông báo Discord cá nhân
            </CardTitle>
            <CardDescription>
              Nhận trực tiếp các thông báo hệ thống dành cho bạn qua webhook riêng hoặc tin nhắn Discord.
              Đích đến này không được dùng chung với người khác.
            </CardDescription>
          </div>
          {integration && <Badge variant="success">đang hoạt động</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-3" aria-label="Đang tải cấu hình Discord">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-28" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Tabs value={destinationType} onValueChange={(value) => {
              setSelectedType(value as DestinationType);
              setMessage(null);
            }}>
              <TabsList className="grid w-full grid-cols-2 sm:w-auto">
                <TabsTrigger value="webhook" className="cursor-pointer gap-2">
                  <Webhook className="h-4 w-4" aria-hidden="true" /> Webhook riêng
                </TabsTrigger>
                <TabsTrigger value="user_id" className="cursor-pointer gap-2">
                  <UserRound className="h-4 w-4" aria-hidden="true" /> Discord User ID
                </TabsTrigger>
              </TabsList>

              <TabsContent value="webhook" className="space-y-2 pt-2">
                <Label htmlFor="discord-webhook">Discord Webhook URL</Label>
                <Input
                  id="discord-webhook"
                  type="password"
                  value={webhookUrl}
                  onChange={(event) => setWebhookUrl(event.target.value)}
                  placeholder={integration?.destinationType === "webhook" ? "Nhập URL mới để thay thế webhook hiện tại" : "https://discord.com/api/webhooks/…"}
                  autoComplete="off"
                  required={destinationType === "webhook"}
                />
                <p className="text-xs text-muted-foreground">
                  Tạo webhook trong Discord tại Channel Settings → Integrations → Webhooks. URL được mã hóa trên máy chủ và không hiển thị lại.
                </p>
              </TabsContent>

              <TabsContent value="user_id" className="space-y-2 pt-2">
                <Label htmlFor="discord-user-id">Discord User ID</Label>
                <Input
                  id="discord-user-id"
                  inputMode="numeric"
                  pattern="[0-9]{15,22}"
                  value={discordUserId}
                  onChange={(event) => setEnteredDiscordUserId(event.target.value)}
                  placeholder="123456789012345678"
                  required={destinationType === "user_id"}
                />
                <p className="text-xs text-muted-foreground">
                  Bot phải cùng máy chủ với bạn và bạn phải cho phép tin nhắn trực tiếp. Bật Developer Mode trong Discord rồi chọn Copy User ID.
                </p>
              </TabsContent>
            </Tabs>

            {integration && (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                Đích hiện tại: {integration.destinationType === "webhook" ? "webhook riêng (đã ẩn)" : `Discord ID ${integration.discordUserId}`}
              </div>
            )}
            {message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
            {error && <p className="text-sm text-destructive">{String(error)}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="cursor-pointer" disabled={!canSave || saveMutation.isPending}>
                {saveMutation.isPending ? "Đang lưu…" : integration ? "Cập nhật Discord" : "Bật thông báo Discord"}
              </Button>
              {integration && (
                <Button
                  type="button"
                  variant="outline"
                  className="cursor-pointer"
                  onClick={() => removeMutation.mutate()}
                  disabled={removeMutation.isPending}
                >
                  {removeMutation.isPending ? "Đang tắt…" : "Tắt tích hợp"}
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
