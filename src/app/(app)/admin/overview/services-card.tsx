"use client";

import { Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/shared/async-state";
import { ListSkeleton } from "@/components/shared/skeleton";
import { getErrorMessage } from "@/lib/api-client";
import { maskSecrets } from "@/lib/admin/mask-secrets";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { CopyButton } from "./error-sheet";

export type Ping = { ok: boolean; ms: number; error?: string; history?: number[] };

export type ServiceKey = "db" | "jira" | "bitbucket" | "sentry" | "openai" | "ollama";

export const SERVICE_LABEL: Record<ServiceKey, string> = {
  db: "Cơ sở dữ liệu",
  jira: "Jira",
  bitbucket: "Bitbucket",
  sentry: "Sentry",
  openai: "OpenAI",
  ollama: "Ollama",
};

export function serviceBadge(p: Ping) {
  if (p.error === "not configured") return <Badge variant="secondary">Chưa cấu hình</Badge>;
  if (!p.ok) return <Badge variant="danger">Lỗi</Badge>;
  if (p.ms < 1000) return <Badge variant="success">{p.ms} ms</Badge>;
  if (p.ms <= 3000) return <Badge variant="warning">{p.ms} ms (Chậm)</Badge>;
  return <Badge variant="danger">{p.ms} ms (Rất chậm)</Badge>;
}

export function serviceDotColor(p: Ping): string {
  if (p.error === "not configured") return "bg-muted-foreground/30";
  if (!p.ok) return "bg-rose-500";
  if (p.ms < 1000) return "bg-emerald-500";
  if (p.ms <= 3000) return "bg-amber-500";
  return "bg-rose-500";
}

export interface ServicesCardProps {
  services?: Record<ServiceKey, Ping>;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function ServicesCard({
  services,
  isLoading = false,
  error = null,
  onRetry,
}: ServicesCardProps) {
  return (
    <Card id="services">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Dịch vụ tích hợp
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <ListSkeleton rows={6} />
        ) : error ? (
          <ErrorState
            title="Không thể tải tình trạng dịch vụ"
            message={getErrorMessage(error)}
            onRetry={onRetry}
          />
        ) : services ? (
          <ul className="divide-y text-sm">
            {(Object.keys(SERVICE_LABEL) as ServiceKey[]).map((k) => {
              const ping = services[k];
              if (!ping) return null;
              const hasInlineError = !ping.ok && ping.error && ping.error !== "not configured";

              return (
                <li key={k} className="flex flex-col gap-1 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn("h-2 w-2 rounded-full", serviceDotColor(ping))}
                        aria-hidden="true"
                      />
                      <span className={cn(ping.error === "not configured" && "text-muted-foreground")}>
                        {SERVICE_LABEL[k]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {ping.history && ping.history.length >= 4 && (
                        <Sparkline
                          data={ping.history}
                          width={60}
                          height={18}
                          minPoints={4}
                          unit="ms"
                          tone={!ping.ok ? "rose" : ping.ms > 1000 ? "amber" : "emerald"}
                          ariaLabel={`Xu hướng độ trễ của ${SERVICE_LABEL[k]}`}
                        />
                      )}
                      {serviceBadge(ping)}
                    </div>
                  </div>
                  {hasInlineError && (
                    <div className="mt-1 flex items-start justify-between gap-2 rounded bg-destructive/10 p-2 text-xs text-destructive">
                      <p className="font-mono text-[11px] leading-relaxed">
                        {maskSecrets(ping.error)}
                      </p>
                      <CopyButton text={maskSecrets(ping.error)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
