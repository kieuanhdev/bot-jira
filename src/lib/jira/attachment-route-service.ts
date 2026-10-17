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
// Explicit downloads are streamed, so they can be much larger.
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

type JiraAttachment = {
  id?: string;
  filename?: string;
  mimeType?: string;
  content?: string;
  size?: number;
  created?: string;
  author?: { displayName?: string; name?: string };
};

/** What the Attachments panel shows for one file. */
export type AttachmentItem = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  created: string | null;
  author: string;
  isImage: boolean;
};

export function toAttachmentItem(a: JiraAttachment): AttachmentItem | null {
  if (!a.id || !a.filename) return null;
  return {
    id: a.id,
    filename: a.filename,
    mimeType: a.mimeType ?? "application/octet-stream",
    size: a.size ?? 0,
    created: a.created ?? null,
    author: a.author?.displayName || a.author?.name || "",
    isImage: isProxiableImage(a.mimeType),
  };
}

/** Lowercase, URL-decoded, with runs of spaces/underscores collapsed: Jira markup and
 * stored filenames disagree on those often enough to matter. */
function looseName(name: string): string {
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // Not URL-encoded: compare as is.
  }
  return decoded.trim().toLowerCase().replace(/[\s_]+/g, "_");
}

/** Latest attachment whose filename matches, trying progressively looser comparisons. */
export function pickAttachment(attachments: JiraAttachment[], name: string): JiraAttachment | null {
  const matchers = [
    (a: JiraAttachment) => a.filename === name,
    (a: JiraAttachment) => a.filename?.toLowerCase() === name.toLowerCase(),
    (a: JiraAttachment) => a.filename !== undefined && looseName(a.filename) === looseName(name),
  ];
  for (const matches of matchers) {
    const pool = attachments.filter(matches);
    if (pool.length > 0) {
      return [...pool].sort((x, y) => (y.created ?? "").localeCompare(x.created ?? ""))[0];
    }
  }
  return null;
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

/** Header-safe Content-Disposition for a download, with an ASCII fallback name. */
export function downloadDisposition(filename: string): string {
  const ascii = filename.replace(/[^\w.\- ]+/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type Resolved =
  | { ok: true; auth: JiraAuth; key: string; userId: string }
  | { ok: false; response: Response };

/** Session, rate limit, issue key and Jira auth: the preamble both handlers share. */
async function resolveRequest(rawKey: string): Promise<Resolved> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (!checkAuthRateLimit(`attachment:${session.user.id}`, 120, 60 * 1000)) {
    return { ok: false, response: NextResponse.json({ error: "rate_limited" }, { status: 429 }) };
  }
  const key = rawKey.trim().toUpperCase();
  if (!ISSUE_KEY_RE.test(key)) {
    return { ok: false, response: NextResponse.json({ error: "invalid_request" }, { status: 400 }) };
  }
  // Same policy as issue detail: the user's own token, else the system token.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user) || (await getSystemJiraAuth());
  if (!auth?.token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Jira authentication unavailable" }, { status: 401 }),
    };
  }
  return { ok: true, auth, key, userId: session.user.id };
}

async function loadAttachments(auth: JiraAuth, key: string): Promise<JiraAttachment[] | null> {
  try {
    const issue = await jiraWith(auth).getIssue(key, "attachment");
    return (issue.fields as { attachment?: JiraAttachment[] }).attachment ?? [];
  } catch (err) {
    logSwallowed("jira_attachment_lookup", err, { key });
    return null;
  }
}

/** Every file attached to the issue, newest first, for the Attachments panel. */
export async function handleAttachmentListRequest(rawKey: string) {
  const ctx = await resolveRequest(rawKey);
  if (!ctx.ok) return ctx.response;
  const list = await loadAttachments(ctx.auth, ctx.key);
  if (!list) return NextResponse.json({ error: "issue_unavailable" }, { status: 404 });
  const items = list
    .map(toAttachmentItem)
    .filter((item): item is AttachmentItem => item !== null)
    .sort((x, y) => (y.created ?? "").localeCompare(x.created ?? ""));
  return NextResponse.json({ items });
}

/**
 * Stream one file attached to a Jira issue without exposing Jira auth. Picked by
 * `id`, or by `name` for wiki markup like `!image-1.png|thumbnail!`. Images are
 * served inline; `download=1` serves any file as an attachment.
 */
export async function handleAttachmentRequest(req: Request) {
  const url = new URL(req.url);
  const ctx = await resolveRequest(url.searchParams.get("key") ?? "");
  if (!ctx.ok) return ctx.response;
  const { auth, key } = ctx;

  const id = url.searchParams.get("id")?.trim() ?? "";
  const name = url.searchParams.get("name")?.trim() ?? "";
  const download = url.searchParams.get("download") === "1";
  if ((!id && !name) || id.length > 32 || name.length > 255) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const base = env.jiraBaseUrl.replace(/\/$/, "");
  const list = await loadAttachments(auth, key);
  if (!list) return NextResponse.json({ error: "issue_unavailable" }, { status: 404 });
  // The id must belong to this issue's own list, so it cannot reach other issues' files.
  const attachment = id ? (list.find((a) => a.id === id) ?? null) : pickAttachment(list, name);

  if (!attachment?.id || !attachment.filename || (!download && !isProxiableImage(attachment.mimeType))) {
    return NextResponse.json({ error: "attachment_not_found" }, { status: 404 });
  }
  const limit = download ? MAX_DOWNLOAD_BYTES : MAX_ATTACHMENT_BYTES;
  if ((attachment.size ?? 0) > limit) {
    return NextResponse.json({ error: "attachment_too_large" }, { status: 413 });
  }

  const etag = `"att-${attachment.id}${download ? "-dl" : ""}"`;
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

  const expectsHtml = (attachment.mimeType ?? "").toLowerCase().includes("html");
  for (const target of candidates) {
    try {
      const res = await fetch(target, {
        headers: { Authorization: authHeaderValue(auth), Accept: download ? "*/*" : "image/*" },
        signal: AbortSignal.timeout(download ? 60000 : 15000),
      });
      // Never accept a response that ended up off the Jira origin.
      if (!res.ok || !isJiraOrigin(res.url || target, base)) {
        logger.warn({ message: "Jira attachment download failed", key, status: res.status, target: new URL(target).pathname });
        continue;
      }
      const contentType = (res.headers.get("content-type") ?? attachment.mimeType ?? "").split(";")[0].trim();
      // A login or error page arrives as 200 HTML where a real file was expected.
      const wrongKind = download
        ? contentType.toLowerCase() === "text/html" && !expectsHtml
        : !isProxiableImage(contentType);
      if (wrongKind) {
        logger.warn({ message: "Jira attachment was not the expected file", key, contentType, target: new URL(target).pathname });
        continue;
      }
      if (download) {
        const length = Number(res.headers.get("content-length") ?? 0);
        if (length > MAX_DOWNLOAD_BYTES) return NextResponse.json({ error: "attachment_too_large" }, { status: 413 });
        return new Response(res.body, {
          status: 200,
          headers: {
            ...cacheHeaders,
            "Content-Type": "application/octet-stream",
            "Content-Disposition": downloadDisposition(attachment.filename),
            "X-Content-Type-Options": "nosniff",
            ...(length > 0 ? { "Content-Length": String(length) } : {}),
          },
        });
      }
      const data = await res.arrayBuffer();
      if (data.byteLength > MAX_ATTACHMENT_BYTES) {
        return NextResponse.json({ error: "attachment_too_large" }, { status: 413 });
      }
      return new Response(data, {
        status: 200,
        headers: { ...cacheHeaders, "Content-Type": contentType, "X-Content-Type-Options": "nosniff" },
      });
    } catch (err) {
      logSwallowed("jira_attachment_fetch", err, { key });
    }
  }
  return NextResponse.json({ error: "attachment_fetch_failed" }, { status: 502 });
}
