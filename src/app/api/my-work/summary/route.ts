import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api/guards";
import { getMyWorkSummary } from "@/lib/my-work/service";

export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const data = await getMyWorkSummary(guard.session.user);
  return NextResponse.json(data);
}
