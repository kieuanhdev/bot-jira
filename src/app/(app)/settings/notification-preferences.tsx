"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type Preferences = {
  disabledTypes: string[];
  deliveryMode: "instant" | "digest";
  digestHour: number;
  knownTypes: string[];
};

const TYPE_LABELS: Record<string, string> = {
  comment: "Comments on watched tasks",
  release: "Release ready / blocked",
  transition: "Task status changes",
  stale: "Stale task alerts",
  ai: "AI score updates",
  sentry: "Sentry blocking errors",
  ci: "CI build results",
  system: "System messages",
};

export function NotificationPreferences() {
  const qc = useQueryClient();
  const { data, isLoading, isFetching } = useQuery<Preferences>({
    queryKey: ["notify", "preferences"],
    queryFn: () => api<Preferences>("/api/notify/preferences"),
  });

  const mutation = useMutation({
    mutationFn: (body: { disabledTypes: string[]; deliveryMode: "instant" | "digest"; digestHour: number }) =>
      api<Preferences>("/api/notify/preferences", { method: "PATCH", body }),
    onSuccess: (next) => {
      qc.setQueryData(["notify", "preferences"], next);
    },
  });

  // Derive editable state directly from the query data (or a neutral default
  // while loading) instead of mirroring it into local state.
  const values = data ?? { disabledTypes: [] as string[], deliveryMode: "instant" as const, digestHour: 8 };
  const knownTypes = data?.knownTypes ?? Object.keys(TYPE_LABELS);

  function toggleType(t: string) {
    const disabledTypes = values.disabledTypes.includes(t)
      ? values.disabledTypes.filter((x) => x !== t)
      : [...values.disabledTypes, t];
    mutation.mutate({ disabledTypes, deliveryMode: values.deliveryMode, digestHour: values.digestHour });
  }

  function setMode(mode: "instant" | "digest") {
    mutation.mutate({ disabledTypes: values.disabledTypes, deliveryMode: mode, digestHour: values.digestHour });
  }

  function setHour(h: number) {
    mutation.mutate({ disabledTypes: values.disabledTypes, deliveryMode: values.deliveryMode, digestHour: h });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification preferences</CardTitle>
        <CardDescription>
          Choose which notifications you receive and how often they are delivered.
          Disabling a type stops both the in-app and push notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-2">
              {knownTypes.map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <Checkbox
                    checked={!values.disabledTypes.includes(t)}
                    onCheckedChange={() => toggleType(t)}
                    aria-label={TYPE_LABELS[t] ?? t}
                    disabled={isFetching || mutation.isPending}
                  />
                  <span>{TYPE_LABELS[t] ?? t}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm">Delivery</span>
                <Select
                  value={values.deliveryMode}
                  onValueChange={(v) => setMode(v as "instant" | "digest")}
                >
                  <SelectTrigger className="h-8 w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instant">Instant</SelectItem>
                    <SelectItem value="digest">Daily digest</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {values.deliveryMode === "digest" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm">At hour</span>
                  <Select value={String(values.digestHour)} onValueChange={(v) => setHour(Number(v))}>
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 24 }, (_, h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            {mutation.isError && (
              <p className="text-xs text-red-600 dark:text-red-400">Failed to save preferences.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
