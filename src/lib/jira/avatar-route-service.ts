import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userJiraAuth } from "@/lib/user-creds";
import { getSystemJiraAuth, type JiraAuth } from "@/lib/jira/client";
import { env } from "@/lib/env";

// Cache in-memory: 60 minutes for avatar images
const AVATAR_CACHE_TTL_MS = 60 * 60 * 1000;
// Cache in-memory: 60 minutes for resolved avatar URLs
const USER_URLS_CACHE_TTL_MS = 60 * 60 * 1000;

type CachedAvatar = {
  data: Buffer;
  contentType: string;
  expiresAt: number;
};

const avatarCache = new Map<string, CachedAvatar>();
const userAvatarUrlCache = new Map<string, { urls: Record<string, string>; expiresAt: number }>();
const inFlightUserLookups = new Map<string, Promise<Record<string, string> | null>>();
const inFlightImageFetches = new Map<string, Promise<{ data: Buffer; contentType: string } | null>>();

// Periodic cleanup every 10 minutes to prevent memory leak
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of avatarCache.entries()) {
      if (value.expiresAt <= now) {
        avatarCache.delete(key);
      }
    }
    for (const [key, value] of userAvatarUrlCache.entries()) {
      if (value.expiresAt <= now) {
        userAvatarUrlCache.delete(key);
      }
    }
  }, 10 * 60 * 1000);
  if (timer.unref) timer.unref();
}

function selectAvatarUrl(urls: Record<string, string>, size: string): string | null {
  const normSize = size.toLowerCase();
  let preferredKey = "24x24";
  if (normSize === "xsmall" || normSize === "xs") {
    preferredKey = "16x16";
  } else if (normSize === "small" || normSize === "sm") {
    preferredKey = "24x24";
  } else if (normSize === "medium" || normSize === "md") {
    preferredKey = "32x32";
  } else if (normSize === "large" || normSize === "lg" || normSize === "xl") {
    preferredKey = "48x48";
  }

  return (
    urls[preferredKey] ||
    urls["24x24"] ||
    urls["32x32"] ||
    urls["48x48"] ||
    urls["16x16"] ||
    Object.values(urls)[0] ||
    null
  );
}

function isBlankGravatar(urls?: Record<string, string> | null): boolean {
  if (!urls) return false;
  return Object.values(urls).some((u) => u.includes("gravatar.com") && u.includes("d=mm"));
}

async function lookupUserAvatarUrls(
  username: string,
  authHeaderValue: string,
  base: string
): Promise<Record<string, string> | null> {
  const normUser = username.toLowerCase();

  // 1. Memory cache
  const cached = userAvatarUrlCache.get(normUser);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.urls;
  }

  // 2. In-flight promise deduplication
  if (inFlightUserLookups.has(normUser)) {
    return inFlightUserLookups.get(normUser)!;
  }

  const lookupPromise = (async () => {
    try {
      // 3. Try to find in IssueCache database first (ultra fast)
      try {
        const issue = await prisma.issueCache.findFirst({
          where: {
            OR: [
              { assigneeJira: { equals: username, mode: "insensitive" } },
              { reporterJira: { equals: username, mode: "insensitive" } },
              { approverJira: { equals: username, mode: "insensitive" } },
              { testerJira: { equals: username, mode: "insensitive" } },
            ],
          },
          select: { raw: true },
        });

        if (issue?.raw && typeof issue.raw === "object") {
          const raw = issue.raw as Record<string, unknown>;
          const candidates = [raw.assignee, raw.reporter];
          for (const cand of candidates) {
            if (cand && typeof cand === "object") {
              const u = cand as { name?: string; avatarUrls?: Record<string, string> };
              if (
                u.name &&
                u.name.toLowerCase() === normUser &&
                u.avatarUrls &&
                typeof u.avatarUrls === "object" &&
                Object.keys(u.avatarUrls).length > 0 &&
                !isBlankGravatar(u.avatarUrls)
              ) {
                userAvatarUrlCache.set(normUser, {
                  urls: u.avatarUrls,
                  expiresAt: Date.now() + USER_URLS_CACHE_TTL_MS,
                });
                return u.avatarUrls;
              }
            }
          }
        }
      } catch {
        // DB error or not connected yet, continue to Jira API
      }

      // 4. Query Jira REST API /rest/api/2/user?username=...
      const res = await fetch(`${base}/rest/api/2/user?username=${encodeURIComponent(username)}`, {
        headers: {
          Authorization: authHeaderValue,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });

      let foundUrls: Record<string, string> | null = null;
      if (res.ok) {
        const data = (await res.json()) as { avatarUrls?: Record<string, string> };
        if (data?.avatarUrls && typeof data.avatarUrls === "object" && Object.keys(data.avatarUrls).length > 0) {
          foundUrls = data.avatarUrls;
        }
      }

      // If user has a blank generic Gravatar (e.g. chunglh with d=mm), check alias (e.g. chunglhb)
      if (!foundUrls || isBlankGravatar(foundUrls)) {
        const altUsername = normUser.endsWith("b") ? normUser.slice(0, -1) : `${normUser}b`;
        try {
          const altRes = await fetch(`${base}/rest/api/2/user?username=${encodeURIComponent(altUsername)}`, {
            headers: { Authorization: authHeaderValue, Accept: "application/json" },
            signal: AbortSignal.timeout(5000),
          });
          if (altRes.ok) {
            const altData = (await altRes.json()) as { avatarUrls?: Record<string, string> };
            if (altData?.avatarUrls && !isBlankGravatar(altData.avatarUrls)) {
              foundUrls = altData.avatarUrls;
            }
          }
        } catch {
          // ignore alias lookup error
        }
      }

      if (foundUrls) {
        userAvatarUrlCache.set(normUser, {
          urls: foundUrls,
          expiresAt: Date.now() + USER_URLS_CACHE_TTL_MS,
        });
        return foundUrls;
      }
    } catch {
      // Ignore lookup error, will fall back
    }
    return null;
  })();

  inFlightUserLookups.set(normUser, lookupPromise);
  try {
    return await lookupPromise;
  } finally {
    inFlightUserLookups.delete(normUser);
  }
}

async function fetchImageWithDedup(
  targetUrl: string,
  authHeaderValue: string,
  base: string
): Promise<{ data: Buffer; contentType: string } | null> {
  const inFlight = inFlightImageFetches.get(targetUrl);
  if (inFlight) return inFlight;

  const fetchPromise = (async () => {
    let fetchUrl = targetUrl;
    if (!fetchUrl.startsWith("http://") && !fetchUrl.startsWith("https://")) {
      fetchUrl = `${base}${fetchUrl.startsWith("/") ? "" : "/"}${fetchUrl}`;
    }

    const isInternalJira = fetchUrl.startsWith(base);
    const headers: Record<string, string> = {
      Accept: "image/*, */*",
    };
    if (isInternalJira) {
      headers["Authorization"] = authHeaderValue;
    }

    try {
      const res = await fetch(fetchUrl, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) return null;

      const contentType = res.headers.get("content-type") || "image/png";
      if (contentType.includes("text/html") || contentType.includes("application/json")) {
        return null;
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return { data: buffer, contentType };
    } catch {
      return null;
    }
  })();

  inFlightImageFetches.set(targetUrl, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightImageFetches.delete(targetUrl);
  }
}

export async function handleAvatarRequest(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim();
  const rawAvatarUrl = url.searchParams.get("url")?.trim();
  const size = url.searchParams.get("size")?.toLowerCase() || "small";

  if (!username && !rawAvatarUrl) {
    return NextResponse.json({ error: "Missing username or url parameter" }, { status: 400 });
  }

  // Determine cache key
  const cacheKey = rawAvatarUrl ? `url:${rawAvatarUrl}` : `user:${username?.toLowerCase()}:${size}`;
  const cached = avatarCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const cleanContentType = (cached.contentType.split(";")[0] || "image/png").trim();
    const etag = `"${createHash("md5").update(cached.data).digest("hex")}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      });
    }

    return new Response(new Uint8Array(cached.data), {
      status: 200,
      headers: {
        "Content-Type": cleanContentType,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        ETag: etag,
      },
    });
  }

  // Resolve auth: current user's Jira token first, then system Jira auth fallback
  let auth: JiraAuth | null = null;
  const session = await getSession();
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true, jiraUsername: true },
    });
    auth = userJiraAuth(user);
  }

  if (!auth) {
    auth = await getSystemJiraAuth();
  }

  if (!auth || !auth.token) {
    return NextResponse.json({ error: "Jira authentication unavailable" }, { status: 401 });
  }

  const authHeaderValue =
    auth.authMode === "basic"
      ? `Basic ${Buffer.from(`${auth.user}:${auth.token}`).toString("base64")}`
      : `Bearer ${auth.token}`;

  const base = env.jiraBaseUrl.replace(/\/$/, "");

  let targetUrl: string | null = null;

  if (rawAvatarUrl) {
    targetUrl = rawAvatarUrl;
  } else if (username) {
    // 1. Resolve actual avatarUrls dictionary (from memory / IssueCache / Jira /rest/api/2/user)
    const avatarUrls = await lookupUserAvatarUrls(username, authHeaderValue, base);
    if (avatarUrls) {
      targetUrl = selectAvatarUrl(avatarUrls, size);
    }

    // 2. Fallback to Jira's direct endpoint if not resolved
    if (!targetUrl) {
      targetUrl = `${base}/secure/useravatar?size=${encodeURIComponent(size)}&ownerId=${encodeURIComponent(username)}`;
    }
  }

  if (!targetUrl) {
    return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
  }

  const imgResult = await fetchImageWithDedup(targetUrl, authHeaderValue, base);

  if (!imgResult) {
    // If failed and targetUrl was resolved from user avatarUrls, try fallback to direct endpoint
    if (username && !rawAvatarUrl) {
      const fallbackUrl = `${base}/secure/useravatar?size=${encodeURIComponent(size)}&ownerId=${encodeURIComponent(username)}`;
      if (fallbackUrl !== targetUrl) {
        const fallbackResult = await fetchImageWithDedup(fallbackUrl, authHeaderValue, base);
        if (fallbackResult) {
          avatarCache.set(cacheKey, {
            data: fallbackResult.data,
            contentType: fallbackResult.contentType,
            expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
          });
          const cleanContentType = (fallbackResult.contentType.split(";")[0] || "image/png").trim();
          const etag = `"${createHash("md5").update(fallbackResult.data).digest("hex")}"`;
          return new Response(new Uint8Array(fallbackResult.data), {
            status: 200,
            headers: {
              "Content-Type": cleanContentType,
              "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
              ETag: etag,
            },
          });
        }
      }
    }

    return NextResponse.json({ error: "Avatar not found on Jira" }, { status: 404 });
  }

  avatarCache.set(cacheKey, {
    data: imgResult.data,
    contentType: imgResult.contentType,
    expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
  });

  const cleanContentType = (imgResult.contentType.split(";")[0] || "image/png").trim();
  const etag = `"${createHash("md5").update(imgResult.data).digest("hex")}"`;

  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  return new Response(new Uint8Array(imgResult.data), {
    status: 200,
    headers: {
      "Content-Type": cleanContentType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ETag: etag,
    },
  });
}
