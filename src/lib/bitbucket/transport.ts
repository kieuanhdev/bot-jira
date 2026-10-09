import { env } from "@/lib/env";
import type { BbCreds, Paged } from "./types";

export async function getSystemBitbucketCreds(): Promise<BbCreds | null> {
  const all = await getAllBitbucketCreds();
  return all[0] ?? null;
}

export async function getAllBitbucketCreds(): Promise<BbCreds[]> {
  const list: BbCreds[] = [];
  if (env.bitbucketToken && env.bitbucketUser) {
    list.push({
      user: env.bitbucketUser,
      token: env.bitbucketToken,
    });
  }
  try {
    const { prisma } = await import("@/lib/prisma");
    const { safeDecrypt } = await import("@/lib/crypto");
    const users = await prisma.user.findMany({
      where: { bitbucketTokenEnc: { not: null } },
      orderBy: [{ role: "asc" }, { updatedAt: "desc" }],
      select: { bitbucketUserEnc: true, bitbucketTokenEnc: true },
    });
    for (const user of users) {
      if (user.bitbucketTokenEnc) {
        const token = safeDecrypt(user.bitbucketTokenEnc);
        const username = safeDecrypt(user.bitbucketUserEnc);
        if (token && username && !list.some((c) => c.user === username)) {
          list.push({ user: username, token });
        }
      }
    }
  } catch {
    // DB not available
  }
  return list;
}

export const repoCredCache = new Map<string, BbCreds>();

export function clearRepoCredCache(): void {
  repoCredCache.clear();
}

/** Check if an error from Bitbucket indicates unauthorized / forbidden access. */
export function isBitbucketPermissionError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("-> 401") ||
    msg.includes("-> 403") ||
    msg.includes("AuthorisationException") ||
    msg.includes("not permitted to access this resource") ||
    msg.includes("Authentication failed")
  );
}

export async function request<T>(
  repo: string,
  path: string,
  init: { method?: string; body?: string } = {},
  creds?: BbCreds
): Promise<T> {
  const base = env.bitbucketBaseUrl.replace(/\/$/, "");

  let candidateCreds: BbCreds[] = [];
  if (creds) {
    candidateCreds = [creds];
  } else {
    const cached = repoCredCache.get(repo);
    const all = await getAllBitbucketCreds();
    if (cached) {
      candidateCreds = [cached, ...all.filter((c) => c.user !== cached.user)];
    } else {
      candidateCreds = all;
    }
  }

  if (candidateCreds.length === 0) {
    throw new Error("Chưa cấu hình tài khoản Bitbucket trong hệ thống hoặc thiết lập người dùng");
  }

  let lastError: Error | null = null;
  for (let i = 0; i < candidateCreds.length; i++) {
    const currentCred = candidateCreds[i];
    const basic = Buffer.from(`${currentCred.user}:${currentCred.token}`).toString("base64");
    const url = `${base}/rest/api/1.0/projects/${encodeURIComponent(
      repo.split("/")[0] ?? repo
    )}/repos/${encodeURIComponent(repo.split("/")[1] ?? repo)}/${path}`;

    try {
      const res = await fetch(url, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${basic}`,
        },
        ...(init.body !== undefined ? { body: init.body } : {}),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`Bitbucket ${path} -> ${res.status}: ${text.slice(0, 300)}`);
        if (isBitbucketPermissionError(err) && i < candidateCreds.length - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }

      if (!creds) {
        repoCredCache.set(repo, currentCred);
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      if (isBitbucketPermissionError(e) && i < candidateCreds.length - 1) {
        lastError = e as Error;
        continue;
      }
      throw e;
    }
  }

  throw lastError ?? new Error("Chưa cấu hình tài khoản Bitbucket có quyền truy cập repo này");
}

export async function fetchPaged<T>(
  repo: string,
  basePath: string,
  creds?: BbCreds,
  maxPages = 500
): Promise<T[]> {
  const pageSize = 100;
  const out: T[] = [];
  let start = 0;
  for (let page = 0; page < maxPages; page++) {
    const res = await request<Paged<T>>(
      repo,
      `${basePath}${basePath.includes("?") ? "&" : "?"}start=${start}&limit=${pageSize}`,
      {},
      creds
    );
    out.push(...res.values);
    if (res.isLastPage || res.values.length < pageSize) break;
    start += pageSize;
  }
  return out;
}

export type BitbucketTransport = {
  request: typeof request;
  fetchPaged: typeof fetchPaged;
};

export const defaultTransport: BitbucketTransport = {
  request,
  fetchPaged,
};
