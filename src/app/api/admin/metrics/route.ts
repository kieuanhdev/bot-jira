import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAdminMetrics } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

export { getAdminMetrics };

/**
 * OBS-01 — Operational metrics (admin-only).
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.role) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const data = await getAdminMetrics();
  return NextResponse.json(data);
}
