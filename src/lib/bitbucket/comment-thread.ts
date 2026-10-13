import type { BbPrActivity, BbPrComment, BbUser } from "./types";

/** Every comment in a thread tree, root first. Bitbucket nests replies arbitrarily deep. */
export function flattenCommentTree(root: BbPrComment): BbPrComment[] {
  const out: BbPrComment[] = [];
  const walk = (c: BbPrComment) => {
    out.push(c);
    for (const child of c.comments ?? []) walk(child);
  };
  walk(root);
  return out;
}

/**
 * Root comment of the thread containing `commentId`. A reply also shows up as
 * its own COMMENTED activity holding only its subtree, so the largest matching
 * tree is the real thread root.
 */
export function findThreadRoot(
  activities: BbPrActivity[],
  commentId: number
): BbPrComment | null {
  let best: { root: BbPrComment; size: number } | null = null;
  for (const act of activities) {
    if (!act.comment) continue;
    const tree = flattenCommentTree(act.comment);
    if (!tree.some((c) => c.id === commentId)) continue;
    if (!best || tree.length > best.size) best = { root: act.comment, size: tree.length };
  }
  return best?.root ?? null;
}

/** Distinct authors who wrote anywhere in a thread. */
export function threadAuthors(root: BbPrComment): BbUser[] {
  const seen = new Set<string>();
  const authors: BbUser[] = [];
  for (const c of flattenCommentTree(root)) {
    const key = (c.author?.name ?? c.author?.emailAddress ?? "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    authors.push(c.author);
  }
  return authors;
}
