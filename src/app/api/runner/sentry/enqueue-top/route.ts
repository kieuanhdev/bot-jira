import { NextResponse } from "next/server";
import { enqueueTopAnalyses } from "@/lib/sentry/analysis-store";
import { rejectUnlessRunner } from "@/lib/sentry/runner-auth";

const DEFAULT_LIMIT = 5;

function positive(v: string | null): number | undefined {
  const n = Number(v);
  return v !== null && Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The runner asks for the most frequent, still-happening unanalysed review errors to be
 * queued (`?limit=5&days=14&minEvents=100`). Idempotent: issues that already have a job are skipped.
 */
export async function POST(req: Request) {
  const denied = rejectUnlessRunner(req);
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  // `limit=0` is a valid "queue nothing" (a dry probe), unlike days/minEvents where 0 means unset.
  const rawLimit = q.get("limit");
  const limit = rawLimit !== null && Number.isFinite(Number(rawLimit)) && Number(rawLimit) >= 0 ? Number(rawLimit) : DEFAULT_LIMIT;
  return NextResponse.json(
    await enqueueTopAnalyses(limit, {
      activeDays: positive(q.get("days")),
      minEvents: positive(q.get("minEvents")),
    })
  );
}
