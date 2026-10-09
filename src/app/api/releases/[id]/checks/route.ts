import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { findReleaseById, getReleaseCheckHistory } from "@/lib/releases/repository";

/** Clamp a raw query param into a positive page size (1..100, default 20). */
function pageSize(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "20", 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 100)) : 20;
}

/** Clamp a raw query param into a non-negative offset (default 0). */
function pageOffset(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * GET /api/releases/[id]/checks
 *
 * Returns the release check history (newest first), each check carrying its
 * per-gate results. Supports `?limit=` and `?offset=` pagination.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  const release = await findReleaseById(id);
  if (!release) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const limit = pageSize(url.searchParams.get("limit"));
  const offset = pageOffset(url.searchParams.get("offset"));

  const data = await getReleaseCheckHistory(id, { limit, offset });

  return NextResponse.json(data);
}
