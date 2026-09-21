import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { aiProvider } from "@/lib/ai";
import { hasLLMConfig, env } from "@/lib/env";

export async function POST(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { key } = await ctx.params;

  if (!hasLLMConfig()) {
    return NextResponse.json({ error: `LLM provider "${env.llmProvider}" not configured` }, { status: 400 });
  }

  const issue = await prisma.issueCache.findUnique({ where: { jiraKey: key } });
  if (!issue) return NextResponse.json({ error: "not found" }, { status: 404 });

  const result = await aiProvider.score({
    key: issue.jiraKey,
    summary: issue.summary,
    description: issue.description,
    type: issue.type,
    priority: issue.priority,
  });

  await prisma.aiScore.upsert({
    where: { jiraKey: key },
    update: {
      points: result.points,
      reasoning: result.reasoning,
      risks: result.risks,
      model: aiProvider.name,
      scoredAt: new Date(),
    },
    create: {
      jiraKey: key,
      points: result.points,
      reasoning: result.reasoning,
      risks: result.risks,
      model: aiProvider.name,
    },
  });

  return NextResponse.json({
    points: result.points,
    reasoning: result.reasoning,
    risks: result.risks,
    model: aiProvider.name,
  });
}
