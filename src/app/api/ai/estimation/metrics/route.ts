import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { estimateMetrics } from "@/lib/ai/metrics";

/** M7-04 — AI estimation metrics (accept rate, deviation, confidence by type). */
export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await estimateMetrics());
}
