import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseStaleQueryParams } from "@/lib/stale/params";
import { executeStaleQuery } from "@/lib/stale/query";
import type {
  StandardizationTask,
  StandardizationSummary,
  StaleApiResponse,
} from "@/lib/stale/types";

// Re-export contracts for consumer and test backwards compatibility
export type { StandardizationTask, StandardizationSummary, StaleApiResponse };

export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = parseStaleQueryParams(req.url);
  const data = await executeStaleQuery(session.user, params);

  return NextResponse.json(data);
}
