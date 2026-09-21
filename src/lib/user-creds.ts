import { safeDecrypt } from "@/lib/crypto";
import type { JiraAuth } from "@/lib/jira/client";

export type UserWithCreds = {
  jiraUsername?: string | null;
  jiraUserEnc?: string | null;
  jiraTokenEnc?: string | null;
  jiraAuth?: string | null;
  bitbucketUserEnc?: string | null;
  bitbucketTokenEnc?: string | null;
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

/**
 * Build the Jira auth to use for a given user: their own token if they set one,
 * otherwise null (caller falls back to the shared team token).
 */
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

/** Build Bitbucket Basic creds for a user, or null to use the shared env token. */
export function userBitbucketCreds(
  user: UserWithCreds | null | undefined
): BitbucketCreds | null {
  if (!user) return null;
  const token = safeDecrypt(user.bitbucketTokenEnc);
  if (!token) return null;
  return { user: safeDecrypt(user.bitbucketUserEnc) ?? "", token };
}
