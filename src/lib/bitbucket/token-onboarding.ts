import { bitbucketRepoList } from "@/lib/env";
import {
  discoverBitbucketRepos,
  getAllBitbucketCreds,
  listReposForCred,
  type BbCreds,
} from "./client";

export type BitbucketOnboarding = {
  /** Repos the new token can read. */
  readable: number;
  /** Readable by this token but by no other stored account before. */
  newRepos: string[];
};

/**
 * Called when someone saves a Bitbucket token. Checks what the token can read,
 * works out which repos no other stored account could read, and refreshes the
 * shared repo list so the next branch scan picks them up immediately.
 */
export async function onboardBitbucketToken(cred: BbCreds): Promise<BitbucketOnboarding> {
  const mine = await listReposForCred(cred);

  const seenByOthers = new Set<string>(bitbucketRepoList.map((r) => r.toLowerCase()));
  for (const other of await getAllBitbucketCreds()) {
    if (other.user === cred.user) continue;
    for (const repo of await listReposForCred(other)) seenByOthers.add(repo.toLowerCase());
  }

  const newRepos = mine.filter((r) => !seenByOthers.has(r.toLowerCase()));
  await discoverBitbucketRepos(true);
  return { readable: mine.length, newRepos };
}
