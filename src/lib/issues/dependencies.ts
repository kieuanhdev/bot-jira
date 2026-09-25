import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { IssueCache } from "@prisma/client";

export type DependencyIssue = {
  key: string;
  depth: number;
  relation: "explicit" | "dependency";
  via?: string;
  rootKey?: string;
  issue?: IssueCache;
};

export type DependencyEdge = {
  root: string;
  dependency: string;
};

export type DependencyCycle = {
  path: string[];
};

export type DependencyGraph = {
  roots: string[];
  issues: DependencyIssue[];
  edges: DependencyEdge[];
  cycles: DependencyCycle[];
  truncated: boolean;
  missingKeys: string[];
};

export type ExpandDependenciesOptions = {
  rootKeys: string[];
  maxDepth?: number;
  maxIssues?: number;
  includeIssueDetails?: boolean;
};

/**
 * Expands Jira issue dependencies based on the `is blocked by` / `blocks` relationship.
 *
 * Semantic convention:
 * If Jira displays `A is blocked by B`:
 *   - A is the root/large task (inwardKey in IssueLinkCache)
 *   - B is the dependency/sub-task (outwardKey in IssueLinkCache)
 *   - The dependency flow is B -> A
 *
 * Traversal uses BFS starting from `rootKeys`. It detects cycles, enforces maxDepth
 * and maxIssues limits, and identifies any missing issues in `IssueCache`.
 */
export async function expandDependencies(
  options: ExpandDependenciesOptions
): Promise<DependencyGraph> {
  const rootKeys = Array.from(
    new Set(options.rootKeys.map((k) => k.trim().toUpperCase()).filter(Boolean))
  );

  const maxDepth = options.maxDepth ?? env.jiraDependencyMaxDepth;
  const maxIssues = options.maxIssues ?? env.jiraDependencyMaxIssues;

  const resultIssues: DependencyIssue[] = [];
  const edges: DependencyEdge[] = [];
  const cycles: DependencyCycle[] = [];
  let truncated = false;

  const issueMap = new Map<string, DependencyIssue>();
  const edgeSet = new Set<string>();

  // Initialize roots
  type QueueItem = {
    key: string;
    depth: number;
    via?: string;
    rootKey: string;
    path: string[];
  };

  let currentLevel: QueueItem[] = [];

  for (const root of rootKeys) {
    if (resultIssues.length >= maxIssues) {
      truncated = true;
      break;
    }
    const item: DependencyIssue = {
      key: root,
      depth: 0,
      relation: "explicit",
      rootKey: root,
    };
    resultIssues.push(item);
    issueMap.set(root, item);
    currentLevel.push({
      key: root,
      depth: 0,
      rootKey: root,
      path: [root],
    });
  }

  // BFS traversal level by level
  while (currentLevel.length > 0 && !truncated) {
    const parentKeys = Array.from(new Set(currentLevel.map((q) => q.key)));
    if (parentKeys.length === 0) break;

    // Batch query links where inwardKey IN parentKeys
    // Since outwardKey blocks inwardKey, outwardKey is the dependency of inwardKey
    const links = prisma.issueLinkCache
      ? await prisma.issueLinkCache.findMany({
          where: {
            inwardKey: { in: parentKeys },
            deletedAt: null,
          },
          select: {
            inwardKey: true,
            outwardKey: true,
          },
        })
      : [];

    const nextLevel: QueueItem[] = [];

    // Group links by parent (inwardKey)
    const linksByParent = new Map<string, string[]>();
    for (const link of links) {
      const parent = link.inwardKey.toUpperCase();
      const dep = link.outwardKey.toUpperCase();
      if (!linksByParent.has(parent)) {
        linksByParent.set(parent, []);
      }
      linksByParent.get(parent)!.push(dep);
    }

    for (const current of currentLevel) {
      const deps = linksByParent.get(current.key) ?? [];

      for (const depKey of deps) {
        // Record edge
        const edgeId = `${current.key}->${depKey}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({ root: current.key, dependency: depKey });
        }

        // Cycle check: has depKey appeared in this branch's ancestry?
        if (current.path.includes(depKey)) {
          const cyclePath = [...current.path, depKey];
          // Check if this cycle is already recorded
          const cycleKey = cyclePath.join("->");
          if (!cycles.some((c) => c.path.join("->") === cycleKey)) {
            cycles.push({ path: cyclePath });
          }
          // Do not expand cyclic node further
          continue;
        }

        // Depth check
        if (current.depth + 1 > maxDepth) {
          truncated = true;
          continue;
        }

        // Check if depKey is already known
        const existing = issueMap.get(depKey);
        if (!existing) {
          if (resultIssues.length >= maxIssues) {
            truncated = true;
            break;
          }

          const newIssue: DependencyIssue = {
            key: depKey,
            depth: current.depth + 1,
            relation: "dependency",
            via: current.key,
            rootKey: current.rootKey,
          };
          resultIssues.push(newIssue);
          issueMap.set(depKey, newIssue);

          nextLevel.push({
            key: depKey,
            depth: current.depth + 1,
            via: current.key,
            rootKey: current.rootKey,
            path: [...current.path, depKey],
          });
        }
      }

      if (truncated && resultIssues.length >= maxIssues) {
        break;
      }
    }

    currentLevel = nextLevel;
  }

  // Fetch issue cache details and identify missing keys
  const allKeys = resultIssues.map((i) => i.key);
  const cachedIssues =
    allKeys.length > 0 && prisma.issueCache
      ? await prisma.issueCache.findMany({
          where: { jiraKey: { in: allKeys }, deletedAt: null },
        })
      : [];

  const cachedMap = new Map<string, IssueCache>(
    cachedIssues.map((ci) => [ci.jiraKey, ci])
  );

  const missingKeys: string[] = [];
  for (const item of resultIssues) {
    const ci = cachedMap.get(item.key);
    if (ci) {
      item.issue = ci;
    } else {
      missingKeys.push(item.key);
    }
  }

  return {
    roots: rootKeys,
    issues: resultIssues,
    edges,
    cycles,
    truncated,
    missingKeys,
  };
}
