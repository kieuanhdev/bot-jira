import { env } from "@/lib/env";

export type SentryIssue = {
  id: number;
  shortId: string;
  title: string;
  permalinkUrl?: string;
  level?: string;
  status?: string;
  firstSeen?: string;
  latestEvent?: string;
  count?: number;
  userReportCount?: number;
  project?: { id?: number; slug?: string; name?: string };
};

async function request<T>(path: string): Promise<T> {
  const base = env.sentryBaseUrl.replace(/\/$/, "");
  const url = `${base}/api/0/projects/${encodeURIComponent(env.sentryOrg)}/${encodeURIComponent(env.sentryProject)}/${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.sentryToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sentry ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export const sentry = {
  /** List unresolved (new + ongoing) issues, newest first. */
  async listUnresolvedIssues(limit = 50): Promise<SentryIssue[]> {
    return request<SentryIssue[]>(
      `issues/?query=is%3Aunresolved&limit=${limit}&sort=-newest`
    );
  },

  async getIssue(issueId: number): Promise<SentryIssue & { body?: string }> {
    return request<SentryIssue & { body?: string }>(`issues/${issueId}/`);
  },
};
