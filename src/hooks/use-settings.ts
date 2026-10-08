"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { settingsKeys, notifyKeys } from "@/lib/query-keys";
import type { Role } from "@/lib/permissions";

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) =>
      api(`/api/users/${id}/role`, { method: "PATCH", body: { role } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.users });
    },
  });
}

export type SaveCredentialsBody = {
  jiraUser: string | null;
  jiraToken: string | null;
  jiraAuth: "Bearer" | "basic";
  bitbucketUser: string | null;
  bitbucketToken: string | null;
};

export type SaveCredentialsResult = {
  ok: boolean;
  verify: {
    jira: { ok: boolean; detail?: string };
    bitbucket: { ok: boolean; detail?: string };
  };
  jiraLinked: boolean;
  bitbucketLinked: boolean;
  /** What a freshly saved token unlocked (repos/projects nobody could read before). */
  discovery?: {
    bitbucket?: { readable: number; newRepos: string[] };
    jira?: { readable: number; registered: string[] };
  };
};

export function useSaveCredentials() {
  return useMutation({
    mutationFn: (body: SaveCredentialsBody) =>
      api<SaveCredentialsResult>("/api/me/credentials", { method: "PUT", body }),
  });
}

export function useDisconnectCredential() {
  return useMutation({
    mutationFn: (service: "jira" | "bitbucket") =>
      api("/api/me/credentials", {
        method: "PUT",
        body: service === "jira" ? { disconnectJira: true } : { disconnectBitbucket: true },
      }),
  });
}

export type NotificationPreferences = {
  disabledTypes: string[];
  pushEnabled: boolean;
  pushDisabledTypes: string[];
  knownTypes: string[];
  hasSubscription: boolean;
  deliveryMode?: string;
  digestHour?: number;
};

export function useNotificationPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<NotificationPreferences>) =>
      api<NotificationPreferences>("/api/notify/preferences", { method: "PATCH", body }),
    onSuccess: (next) => {
      qc.setQueryData(notifyKeys.preferences, next);
    },
  });
}

type DiscordIntegrationBody = {
  destinationType: string;
  webhookUrl: string;
  discordUserId: string;
};

export function useSaveDiscordIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DiscordIntegrationBody) =>
      api("/api/discord/integration", { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "identity"] });
    },
  });
}

export function useRemoveDiscordIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/discord/integration", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chat", "identity"] });
    },
  });
}
