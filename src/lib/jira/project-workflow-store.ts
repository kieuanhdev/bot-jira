import { prisma } from "@/lib/prisma";
import { projectColumns } from "@/lib/env";

export type CategoryKey = "new" | "indeterminate" | "done" | "unknown";

export type ProjectWorkflowColumn = {
  id: string;
  name: string;
  statusIds: string[];
  statuses: Array<{ id: string; name: string }>;
  category: string;
  isDone: boolean;
};

export type ProjectWorkflowConfig = {
  projectKey: string;
  source: "project_workflow" | "issue_cache_fallback" | "default";
  fetchedAt: string;
  columns: ProjectWorkflowColumn[];
  statusCategoryMap: Record<string, string>;
};

export function normalizeWorkflowCategory(raw?: string): CategoryKey {
  const k = (raw ?? "").trim().toLowerCase();
  if (k === "done") return "done";
  if (k === "indeterminate" || k === "in_progress" || k === "inprogress") return "indeterminate";
  if (k === "new" || k === "todo" || k === "to_do") return "new";
  return "unknown";
}

export function inferCategoryFromLabel(label: string): CategoryKey {
  const l = (label || "").toLowerCase().trim();
  if (/(^|\s)(done|closed|resolved|complete|completed|released|deploy(?:ed)?|finish(?:ed)?)\b/.test(l) || l === "done") {
    return "done";
  }
  if (/(progress|doing|working|active|review|qa|test)/.test(l)) {
    return "indeterminate";
  }
  if (/(backlog|plan|todo|to do|open|ready|selected)/.test(l)) {
    return "new";
  }
  return "unknown";
}

export function getWorkflowRank(name: string, category: string): number {
  const n = (name || "").toLowerCase().trim();
  const cat = normalizeWorkflowCategory(category);

  if (cat === "new") {
    if (n.includes("backlog")) return 10;
    if (n.includes("plan")) return 11;
    if (n.includes("pending")) return 12;
    if (n.includes("select")) return 20;
    if (n.includes("to do") || n.includes("todo") || n.includes("open")) return 21;
    if (n.includes("reopen")) return 22;
    return 25;
  }
  if (cat === "indeterminate") {
    if (n.includes("progress") || n.includes("doing") || n.includes("active")) return 30;
    if (n.includes("review")) return 35;
    if (n.includes("deploy") || n.includes("waiting for deploy")) return 40;
    if (n.includes("test") || n.includes("qa")) return 50;
    return 32;
  }
  if (cat === "done") {
    if (n.includes("done") || n.includes("resolved") || n.includes("complete")) return 60;
    if (n.includes("deploy") || n.includes("release")) return 65;
    if (n.includes("closed")) return 68;
    if (n.includes("reject")) return 70;
    return 62;
  }
  return 100;
}

export function getCategoryPriority(category: string): number {
  const cat = normalizeWorkflowCategory(category);
  switch (cat) {
    case "new":
      return 1;
    case "indeterminate":
      return 2;
    case "done":
      return 3;
    case "unknown":
    default:
      return 4;
  }
}

/**
 * Upsert workflow snapshot for a project atomically.
 * Preserves existing snapshot on empty status list or failure.
 */
export async function upsertProjectWorkflowSnapshot(
  projectKey: string,
  statuses: Array<{ id: string; name: string; category?: string }>,
  lastErrorCode?: string | null
): Promise<{ snapshotId: string; statusCount: number }> {
  const cleanKey = projectKey.trim().toUpperCase();
  const now = new Date();

  // Deduplicate input statuses by ID
  const uniqueStatuses: Array<{ id: string; name: string; category: string }> = [];
  const seenIds = new Set<string>();

  for (const s of statuses) {
    const sId = (s.id || "").trim();
    const sName = (s.name || "").trim();
    if (!sId || !sName || seenIds.has(sId)) continue;
    seenIds.add(sId);

    let cat = normalizeWorkflowCategory(s.category);
    if (cat === "unknown") {
      cat = inferCategoryFromLabel(sName);
    }
    uniqueStatuses.push({
      id: sId,
      name: sName,
      category: cat,
    });
  }

  return await prisma.$transaction(async (tx) => {
    const existing = await tx.jiraProjectWorkflowSnapshot.findUnique({
      where: { projectKey: cleanKey },
      select: { id: true },
    });

    let snapshotId: string;
    if (existing) {
      snapshotId = existing.id;
      await tx.jiraProjectWorkflowSnapshot.update({
        where: { id: snapshotId },
        data: {
          fetchedAt: now,
          lastErrorCode: lastErrorCode ?? null,
          lastErrorAt: lastErrorCode ? now : null,
        },
      });
    } else {
      const created = await tx.jiraProjectWorkflowSnapshot.create({
        data: {
          projectKey: cleanKey,
          fetchedAt: now,
          lastErrorCode: lastErrorCode ?? null,
          lastErrorAt: lastErrorCode ? now : null,
        },
        select: { id: true },
      });
      snapshotId = created.id;
    }

    if (uniqueStatuses.length > 0) {
      // Replace status rows with updated display order
      await tx.jiraProjectWorkflowStatus.deleteMany({
        where: { snapshotId },
      });

      await tx.jiraProjectWorkflowStatus.createMany({
        data: uniqueStatuses.map((s, idx) => ({
          snapshotId,
          statusId: s.id,
          name: s.name,
          category: s.category,
          displayOrder: idx + 1,
        })),
      });
    }

    return { snapshotId, statusCount: uniqueStatuses.length };
  });
}

/**
 * Reads local workflow metadata for a project, unioning with observed statuses in IssueCache.
 * Pure PostgreSQL query, zero Jira calls, zero pg-boss writes.
 */
export async function getProjectWorkflowConfig(projectKey: string): Promise<ProjectWorkflowConfig> {
  const cleanKey = projectKey.trim().toUpperCase();

  const [snapshot, observedIssues] = await Promise.all([
    prisma.jiraProjectWorkflowSnapshot.findUnique({
      where: { projectKey: cleanKey },
      include: {
        statuses: {
          orderBy: { displayOrder: "asc" },
        },
      },
    }),
    prisma.issueCache.findMany({
      where: {
        projectKey: cleanKey,
        deletedAt: null,
      },
      select: {
        statusId: true,
        status: true,
        statusCategory: true,
      },
      distinct: ["statusId", "status", "statusCategory"],
    }),
  ]);

  type IntermediateStatus = {
    id: string;
    name: string;
    category: string;
    fromSnapshot: boolean;
    displayOrder?: number;
  };

  const statusMap = new Map<string, IntermediateStatus>();

  if (snapshot && snapshot.statuses.length > 0) {
    for (const st of snapshot.statuses) {
      statusMap.set(st.statusId, {
        id: st.statusId,
        name: st.name,
        category: st.category,
        fromSnapshot: true,
        displayOrder: st.displayOrder,
      });
    }
  }

  // Merge observed issues from IssueCache
  for (const issue of observedIssues) {
    const rawId = (issue.statusId ?? "").trim();
    const rawName = (issue.status ?? "").trim();
    if (!rawName) continue;

    const id = rawId || rawName;
    if (!statusMap.has(id)) {
      // Also check if an existing status has identical name
      let matchedId: string | null = null;
      for (const [existingId, existingStatus] of statusMap.entries()) {
        if (existingStatus.name.toLowerCase() === rawName.toLowerCase()) {
          matchedId = existingId;
          break;
        }
      }

      if (matchedId) {
        // Alias statusId if needed
        const existing = statusMap.get(matchedId)!;
        if (rawId && existing.id !== rawId && !statusMap.has(rawId)) {
          // Keep existing primary id
        }
      } else {
        let cat = normalizeWorkflowCategory(issue.statusCategory);
        if (cat === "unknown") {
          cat = inferCategoryFromLabel(rawName);
        }
        statusMap.set(id, {
          id,
          name: rawName,
          category: cat,
          fromSnapshot: false,
        });
      }
    }
  }

  // If no snapshot and no issues, check if there is an admin override in JIRA_PROJECT_COLUMNS
  const adminCols = projectColumns[cleanKey];

  const allStatuses = Array.from(statusMap.values());

  // Sorting
  allStatuses.sort((a, b) => {
    // 1. Admin override in JIRA_PROJECT_COLUMNS
    if (adminCols && adminCols.length > 0) {
      const idxA = adminCols.findIndex((c) => c.toLowerCase() === a.name.toLowerCase());
      const idxB = adminCols.findIndex((c) => c.toLowerCase() === b.name.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
    }

    // 2. Both from snapshot displayOrder
    if (a.fromSnapshot && b.fromSnapshot && a.displayOrder !== undefined && b.displayOrder !== undefined) {
      return a.displayOrder - b.displayOrder;
    }

    // 3. Category group: new -> indeterminate -> done -> unknown
    const catPriorityA = getCategoryPriority(a.category);
    const catPriorityB = getCategoryPriority(b.category);
    if (catPriorityA !== catPriorityB) {
      return catPriorityA - catPriorityB;
    }

    // 4. Workflow rank inside category
    const rankA = getWorkflowRank(a.name, a.category);
    const rankB = getWorkflowRank(b.name, b.category);
    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // 5. Tie break: name then id
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    return a.id.localeCompare(b.id);
  });

  const columns: ProjectWorkflowColumn[] = allStatuses.map((st) => ({
    id: `status:${st.id}`,
    name: st.name,
    statusIds: [st.id],
    statuses: [{ id: st.id, name: st.name }],
    category: st.category,
    isDone: st.category === "done",
  }));

  const statusCategoryMap: Record<string, string> = {};
  for (const st of allStatuses) {
    statusCategoryMap[st.name] = st.category;
  }

  const source: ProjectWorkflowConfig["source"] =
    snapshot && snapshot.statuses.length > 0
      ? "project_workflow"
      : allStatuses.length > 0
        ? "issue_cache_fallback"
        : "default";

  return {
    projectKey: cleanKey,
    source,
    fetchedAt: snapshot?.fetchedAt ? snapshot.fetchedAt.toISOString() : new Date().toISOString(),
    columns,
    statusCategoryMap,
  };
}
