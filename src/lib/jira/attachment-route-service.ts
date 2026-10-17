import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { getSystemJiraAuth, jiraWith, type JiraAuth } from "@/lib/jira/client";
import { isJiraOrigin } from "@/lib/jira/avatar-route-service";
import { env } from "@/lib/env";
import { checkAuthRateLimit } from "@/lib/rate-limit";
import { logger, logSwallowed } from "@/lib/logger";

// Pasted screenshots are often a few MB; anything larger is not worth inlining.
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

type JiraAttachment = {
  id?: string;
  filename?: string;
  mimeType?: string;
  content?: string;
  size?: number;
  created?: string;
};

/** Latest attachment whose filename matches; Jira allows duplicate names. */
export function pickAttachment(attachments: JiraAttachment[], name: string): JiraAttachment | null {
  const exact = attachments.filter((a) => a.filename === name);
  const pool = exact.length > 0
    ? exact
    : attachments.filter((a) => a.filename?.toLowerCase() === name.toLowerCase());
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => (b.created ?? "").localeCompare(a.created ?? ""))[0];
}

/** SVG can carry script, so only raster images are proxied. */
export function isProxiableImage(mimeType: string | undefined): boolean {
  const type = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  return type.startsWith("image/") && type !== "image/svg+xml";
}

function authHeaderValue(auth: JiraAuth): string {
  return auth.authMode === "basic"
    ? `Basic ${Buffer.from(`${auth.user}:${auth.token}`).toString("base64")}`
    : `Bearer ${auth.token}`;
}

/**
 * Stream an image attached to a Jira issue, looked up by filename, so wiki
 * markup like `!image-1.png|thumbnail!` renders without exposing Jira auth.
 */
export async function handleAttachmentRequest(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!checkAuthRateLimit(`attachment:${session.user.id}`, 120, 60 * 1000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const url = new URL(req.url);
  const key = url.searchParams.get("key")?.trim().toUpperCase() ?? "";
  const name = url.searchParams.get("name")?.trim() ?? "";
  if (!ISSUE_KEY_RE.test(key) || !name || name.length > 255) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Same policy as issue detail: the user's own token, else the system token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user) || (await getSystemJiraAuth());
  if (!auth?.token) {
    return NextResponse.json({ error: "Jira authentication unavailable" }, { status: 401 });
  }

  const base = env.jiraBaseUrl.replace(/\/$/, "");
  let attachment: JiraAttachment | null = null;
  try {
    const issue = await jiraWith(auth).getIssue(key, "attachment");
    const list = (issue.fields as { attachment?: JiraAttachment[] }).attachment ?? [];
    attachment = pickAttachment(list, name);
  } catch (err) {
    logSwallowed("jira_attachment_lookup", err, { key });
    return NextResponse.json({ error: "issue_unavailable" }, { status: 404 });
  }

  if (!attachment?.id || !attachment.filename || !isProxiableImage(attachment.mimeType)) {
    return NextResponse.json({ error: "attachment_not_found" }, { status: 404 });
  }
  if ((attachment.size ?? 0) > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "attachment_too_large" }, { status: 413 });
  }

  const etag = `"att-${attachment.id}"`;
  const cacheHeaders = { ETag: etag, "Cache-Control": "private, max-age=3600" };
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }

  // Candidate download URLs, always on our own base URL: Jira's `content` host
  // follows its configured base URL and may differ from the address we reach it on.
  const candidates = [
    `${base}/secure/attachment/${encodeURIComponent(attachment.id)}/${encodeURIComponent(attachment.filename)}`,
  ];
  if (attachment.content) {
    try {
      const c = new URL(attachment.content);
      const viaContent = `${base}${c.pathname}${c.search}`;
      if (!candidates.includes(viaContent)) candidates.push(viaContent);
    } catch {
      // Malformed content URL: the constructed one is still tried.
    }
  }

  for (const target of candidates) {
    try {
      const res = await fetch(target, {
        headers: { Authorization: authHeaderValue(auth), Accept: "image/*" },
        signal: AbortSignal.timeout(15000),
      });
      // Never accept a response that ended up off the Jira origin.
      if (!res.ok || !isJiraOrigin(res.url || target, base)) {
        logger.warn({ message: "Jira attachment download failed", key, status: res.status, target: new URL(target).pathname });
        continue;
      }
      const contentType = (res.headers.get("content-type") ?? attachment.mimeType ?? "").split(";")[0].trim();
      if (!isProxiableImage(contentType)) {
        // Usually a login/error page returned with 200.
        logger.warn({ message: "Jira attachment was not an image", key, contentType, target: new URL(target).pathname });
        continue;
      }
      const data = await res.arrayBuffer();
      if (data.byteLength > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: "attachment_too_large" }, { status: 413 });
      }
      return new Response(data, {
        status: 200,
        headers: {
          ...cacheHeaders,
          "Content-Type": contentType,
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (err) {
      logSwallowed("jira_attachment_fetch", err, { key });
    }
  }
  return NextResponse.json({ error: "attachment_fetch_failed" }, { status: 502 });
}
