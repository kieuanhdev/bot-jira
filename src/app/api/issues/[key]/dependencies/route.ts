import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { expandDependencies } from "@/lib/issues/dependencies";

export const dynamic = "force-dynamic";

/**
 * DEP-05 — Read dependency graph for an issue.
 * Supports ?depth=direct (depth 1) or ?depth=recursive (default).
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { key } = await ctx.params;
  const url = new URL(req.url);
  const depthParam = url.searchParams.get("depth") ?? "recursive";
  const maxDepth = depthParam === "direct" ? 1 : undefined;

  const graph = await expandDependencies({
    rootKeys: [key],
    maxDepth,
  });

  const issues = graph.issues.map((i) => ({
    key: i.key,
    depth: i.depth,
    relation: i.relation,
    via: i.via,
    rootKey: i.rootKey,
    summary: i.issue?.summary ?? "",
    status: i.issue?.status ?? "",
    statusCategory: i.issue?.statusCategory ?? "unknown",
    priority: i.issue?.priority ?? "",
    projectKey: i.issue?.projectKey ?? i.key.split("-")[0] ?? "",
    fixVersionIds: i.issue?.fixVersionIds ?? [],
    fixVersionNames: i.issue?.fixVersionNames ?? [],
    lastSyncedAt: i.issue?.lastSyncedAt ?? null,
  }));

  return NextResponse.json({
    roots: graph.roots,
    issues,
    edges: graph.edges,
    cycles: graph.cycles,
    truncated: graph.truncated,
    missingKeys: graph.missingKeys,
  });
}
