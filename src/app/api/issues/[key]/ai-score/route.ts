import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { aiProvider, AI_PROMPT_VERSION } from "@/lib/ai";
import { AiUnavailableError } from "@/lib/ai/provider";
import { buildEstimateInput } from "@/lib/ai/estimation-input";
import { hasLLMConfig, env } from "@/lib/env";

/**
 * M7 — Compute a fresh AI estimate for a task and persist it. The estimate is
 * saved for human review only; it is NOT written to Jira (that happens via the
 * decision endpoint after a human accepts it).
 *
 * When the model is unavailable this returns 503 `unavailable` — we never
 * fabricate a fallback estimate and persist it as a real result.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  if (!hasLLMConfig()) {
    return NextResponse.json({ error: `LLM provider "${env.llmProvider}" not configured` }, { status: 400 });
  }

  const issue = await prisma.issueCache.findUnique({ where: { jiraKey: key } });
  if (!issue) return NextResponse.json({ error: "not found" }, { status: 404 });

  let result;
  try {
    const input = await buildEstimateInput({
      key: issue.jiraKey,
      summary: issue.summary,
      description: issue.description,
      type: issue.type,
      priority: issue.priority,
      labels: issue.labels,
      projectKey: issue.projectKey,
    });
    result = await aiProvider.estimate(input);
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      return NextResponse.json(
        { error: "unavailable", message: `AI estimate unavailable: ${e.message}` },
        { status: 503 }
      );
    }
    throw e;
  }

  await prisma.aiScore.upsert({
    where: { jiraKey: key },
    update: {
      points: result.suggestedPoints,
      confidence: result.confidence,
      reasoning: result.reasoning,
      risks: result.risks,
      missingInformation: result.missingInformation,
      similarTasks: result.similarTasks,
      model: aiProvider.name,
      promptVersion: AI_PROMPT_VERSION,
      scoredAt: new Date(),
    },
    create: {
      jiraKey: key,
      points: result.suggestedPoints,
      confidence: result.confidence,
      reasoning: result.reasoning,
      risks: result.risks,
      missingInformation: result.missingInformation,
      similarTasks: result.similarTasks,
      model: aiProvider.name,
      promptVersion: AI_PROMPT_VERSION,
    },
  });

  return NextResponse.json({
    suggestedPoints: result.suggestedPoints,
    confidence: result.confidence,
    reasoning: result.reasoning,
    missingInformation: result.missingInformation,
    risks: result.risks,
    similarTasks: result.similarTasks,
    model: aiProvider.name,
  });
}
