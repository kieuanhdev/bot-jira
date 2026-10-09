import { env, bitbucketRepoList } from "@/lib/env";
import type { BbCreds, BitbucketRepoResponse, Paged } from "../types";
import { getAllBitbucketCreds, repoCredCache } from "../transport";

const DISCOVERY_TTL_MS = 30 * 60 * 1000;
let discoveryCache: { at: number; repos: string[] } | null = null;

export function clearDiscoveryCache(): void {
  discoveryCache = null;
}

/** Repos one account can read. Personal (`~user`) and archived repos are skipped. */
export async function listReposForCred(cred: BbCreds): Promise<string[]> {
  const base = env.bitbucketBaseUrl.replace(/\/$/, "");
  const basic = Buffer.from(`${cred.user}:${cred.token}`).toString("base64");
  const repos: string[] = [];
  try {
    let start = 0;
    for (let page = 0; page < 50; page++) {
      const res = await fetch(`${base}/rest/api/1.0/repos?limit=100&start=${start}`, {
        headers: { Accept: "application/json", Authorization: `Basic ${basic}` },
      });
      if (!res.ok) break; // this account is rejected; others may still work
      const body = (await res.json()) as Paged<BitbucketRepoResponse>;
      for (const r of body.values ?? []) {
        if (r.archived || r.project.key.startsWith("~")) continue;
        repos.push(`${r.project.key}/${r.slug}`);
      }
      if (body.isLastPage) break;
      start = (body as { nextPageStart?: number }).nextPageStart ?? start + 100;
    }
  } catch {
    // A network failure for one account must not stop discovery for the rest.
  }
  return repos;
}

/**
 * Repos readable by any stored Bitbucket account (system token + every user who
 * saved a token). Accounts are independent: one that cannot see a repo never
 * hides it from another that can.
 * Also primes the per-repo credential cache with an account that can read the repo.
 */
export async function discoverBitbucketRepos(force = false): Promise<string[]> {
  if (!force && discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.repos;
  }
  const found = new Map<string, BbCreds>();
  for (const cred of await getAllBitbucketCreds()) {
    for (const repo of await listReposForCred(cred)) {
      if (!found.has(repo)) found.set(repo, cred);
    }
  }

  for (const [repo, cred] of found) {
    if (!repoCredCache.has(repo)) repoCredCache.set(repo, cred);
  }
  const repos = Array.from(found.keys());
  discoveryCache = { at: Date.now(), repos };
  return repos;
}

export function createRepositoriesResource() {
  return {
    /**
     * Check a credential against the server itself (not a specific repo), so a
     * token without access to the first configured repo is still accepted.
     * Throws a "-> 401" error only when the username/token pair is rejected.
     */
    async verifyCreds(creds: BbCreds): Promise<void> {
      const base = env.bitbucketBaseUrl.replace(/\/$/, "");
      const basic = Buffer.from(`${creds.user}:${creds.token}`).toString("base64");
      const res = await fetch(`${base}/rest/api/1.0/projects?limit=1`, {
        headers: { Accept: "application/json", Authorization: `Basic ${basic}` },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Bitbucket projects -> ${res.status}: ${text.slice(0, 300)}`);
      }
    },

    repos(): string[] {
      return bitbucketRepoList;
    },

    /** Configured repos plus (unless disabled) every repo a stored account can read. */
    async allRepos(): Promise<string[]> {
      const configured = bitbucketRepoList;
      if (!env.bitbucketAutoDiscover) return configured;
      const discovered = await discoverBitbucketRepos().catch(() => [] as string[]);
      const seen = new Set(configured.map((r) => r.toLowerCase()));
      return [...configured, ...discovered.filter((r) => !seen.has(r.toLowerCase()))];
    },
  };
}
