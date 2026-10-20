import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/api/json-body";
import { EstimateDecisionBodySchema } from "@/lib/api/schemas";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { userJiraAuth } from "@/lib/user-creds";
import { recordEstimateDecision } from "@/lib/ai/decision";

/**
 * M7-03 — Human review of an AI estimate. Body: { decision, points? }.
 * - accepted: write the AI's suggested points to Jira.
 * - edited:   write the user-provided `points` to Jira.
 * - rejected: write nothing to Jira.
 * The decision is always recorded (with final points) for metrics.
 */
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  const parsedBody = await readJsonBody(req, EstimateDecisionBodySchema);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  if (!body.decision) {
    return NextResponse.json(
      { error: "decision must be one of accepted | edited | rejected" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { jiraUserEnc: true, jiraTokenEnc: true, jiraAuth: true },
  });
  const auth = userJiraAuth(user);

  const result = await recordEstimateDecision({
    key,
    decision: body.decision,
    finalPoints: body.points,
    userId: session.user.id,
    auth,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
