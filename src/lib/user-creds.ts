import { safeDecrypt } from "@/lib/crypto";
import type { JiraAuth } from "@/lib/jira/client";
import { parseSentryMappings, type SentryMapping } from "@/lib/sentry/mapping";

export type UserWithCreds = {
  jiraUsername?: string | null;
  jiraUserEnc?: string | null;
  jiraTokenEnc?: string | null;
  jiraAuth?: string | null;
  bitbucketUserEnc?: string | null;
  bitbucketTokenEnc?: string | null;
  sentryOrg?: string | null;
  sentryMappings?: string | null;
  sentryTokenEnc?: string | null;
};

export function userJiraUsername(user: UserWithCreds | null | undefined): string | null {
  if (!user) return null;
  return user.jiraUsername || safeDecrypt(user.jiraUserEnc) || null;
}

/**
 * Jira usernames on this instance may use the mobile-account suffix `_mb`,
 * while email addresses and older app profiles omit it. Treat both forms as
 * the same identity for lookups, but keep the original Jira value for display.
 */
export function jiraUsernameAliases(value: string | null | undefined): string[] {
  const raw = value?.trim();
  if (!raw) return [];
  const username = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  const base = username.replace(/_mb$/i, "");
  return [...new Set([username, base, `${base}_mb`].flatMap((item) => [item, item.toLowerCase()]))];
}

/** Build Jira auth only from the credential stored on this user's account. */
export function userJiraAuth(user: UserWithCreds | null | undefined): JiraAuth | null {
  if (!user) return null;
  const token = safeDecrypt(user.jiraTokenEnc);
  if (!token) return null;
  const userStr = safeDecrypt(user.jiraUserEnc) ?? "";
  const mode: "Bearer" | "basic" =
    (user.jiraAuth ?? "Bearer").toLowerCase() === "basic" ? "basic" : "Bearer";
  return { user: userStr, token, authMode: mode };
}

export type BitbucketCreds = { user: string; token: string };

/** Build Bitbucket Basic creds only from this user's stored credential. */
export function userBitbucketCreds(
  user: UserWithCreds | null | undefined
): BitbucketCreds | null {
  if (!user) return null;
  const token = safeDecrypt(user.bitbucketTokenEnc);
  const username = safeDecrypt(user.bitbucketUserEnc);
  if (!token || !username) return null;
  return { user: username, token };
}

export type UserSentryCreds = {
  org: string;
  token: string;
  /** Sentry project slug -> Jira project key, as entered by the user. */
  mappings: SentryMapping[];
};

/** Build Sentry polling config only from this user's stored credential. */
export function userSentryCreds(user: UserWithCreds | null | undefined): UserSentryCreds | null {
  if (!user) return null;
  const token = safeDecrypt(user.sentryTokenEnc);
  const org = user.sentryOrg?.trim();
  if (!token || !org) return null;
  const mappings = parseSentryMappings(user.sentryMappings ?? "");
  if (mappings.length === 0) return null;
  return { org, token, mappings };
}
