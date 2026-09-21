import { prisma } from "@/lib/prisma";
import { aiProvider } from "@/lib/ai";
import { guard, hasLLMConfig, env } from "../guard";
import type { WorkerLog } from "../guard";

const BATCH = 5;

export async function runAiScore(): Promise<WorkerLog> {
  if (!env.aiAutoScore) return guard(true, "AI auto-score disabled (AI_AUTO_SCORE=false)");
  if (!hasLLMConfig()) return guard(hasLLMConfig(), `LLM provider "${env.llmProvider}" not configured`);

  // Issues that have no AI score yet and are not in Done.
  const candidates = await prisma.issueCache.findMany({
    where: {
      aiScore: null,
      status: { not: "Done" },
    },
    orderBy: { updatedAt: "desc" },
    take: BATCH,
  });

  let scored = 0;
  const errors: string[] = [];
  for (const issue of candidates) {
    try {
      const result = await aiProvider.score({
        key: issue.jiraKey,
        summary: issue.summary,
        description: issue.description,
        type: issue.type,
        priority: issue.priority,
      });
      await prisma.aiScore.upsert({
        where: { jiraKey: issue.jiraKey },
        update: {
          points: result.points,
          reasoning: result.reasoning,
          risks: result.risks,
          model: aiProvider.name,
          scoredAt: new Date(),
        },
        create: {
          jiraKey: issue.jiraKey,
          points: result.points,
          reasoning: result.reasoning,
          risks: result.risks,
          model: aiProvider.name,
        },
      });
      scored++;
    } catch (e) {
      errors.push(`${issue.jiraKey}: ${(e as Error).message}`);
    }
  }
  return { ok: true, stats: { scored, candidates: candidates.length } as unknown as Record<string, number>, errors };
}
