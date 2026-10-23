import { NextResponse } from "next/server";
import { z } from "zod";
import { readJsonBody } from "@/lib/api/json-body";
import { finishAnalysis } from "@/lib/sentry/analysis-store";
import { parseAnalysisResult } from "@/lib/sentry/analysis";
import { rejectUnlessRunner } from "@/lib/sentry/runner-auth";

const BodySchema = z.union([
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.string().max(2000) }),
]);

/** The runner reports the outcome of a claimed analysis. */
export async function POST(req: Request, { params }: { params: Promise<{ analysisId: string }> }) {
  const denied = rejectUnlessRunner(req);
  if (denied) return denied;

  const body = await readJsonBody(req, BodySchema, { maxBytes: 128 * 1024 });
  if (!body.ok) return body.response;
  const { analysisId } = await params;

  let outcome: Parameters<typeof finishAnalysis>[1];
  if (body.data.ok) {
    try {
      outcome = { ok: true, result: parseAnalysisResult(body.data.result) };
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  } else {
    outcome = { ok: false, error: body.data.error };
  }

  const saved = await finishAnalysis(analysisId, outcome);
  if (!saved) return NextResponse.json({ error: "Không có phân tích đang chạy với id này" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
