import { NextRequest, NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { ReportSnapshotBodySchema } from "@/lib/api/schemas";
import { getSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { captureProjectReportSnapshots } from "@/lib/reports/snapshot-service";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * RPT-403 — Admin endpoint to trigger daily project report snapshot capture manually.
 * Requires `report.configure` permission (admin).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!can(session, "report.configure")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsedBody = await readJsonBody(req, ReportSnapshotBodySchema, { allowEmpty: true });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  try {
    const result = await captureProjectReportSnapshots({
      projectKey: body.projectKey,
      targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
      timezone: body.timezone,
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    logger.error({ message: "Manual snapshot capture failed", error: (err as Error).message });
    return NextResponse.json(
      { error: "Snapshot capture failed" },
      { status: 500 }
    );
  }
}
