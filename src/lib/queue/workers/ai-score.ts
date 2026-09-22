import { prisma } from "@/lib/prisma";
import { aiProvider, AI_PROMPT_VERSION } from "@/lib/ai";
import { AiUnavailableError } from "@/lib/ai/provider";
import { buildEstimateInput } from "@/lib/ai/estimation-input";
import { guard, hasLLMConfig, env } from "../guard";
import type { WorkerLog } from "../guard";

const BATCH = 5;

export async function runAiScore(): Promise<WorkerLog> {
  if (!env.aiAutoScore) return guard(true, "AI auto-score disabled (AI_AUTO_SCORE=false)");
  if (!hasLLMConfig()) return guard(hasLLMConfig(), `LLM provider "${env.llmProvider}" not configured`);

  // Issues that have no AI estimate yet and are not in Done.
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
      const input = await buildEstimateInput({
        key: issue.jiraKey,
        summary: issue.summary,
        description: issue.description,
        type: issue.type,
        priority: issue.priority,
        labels: issue.labels,
        projectKey: issue.projectKey,
      });
      const result = await aiProvider.estimate(input);
      await prisma.aiScore.upsert({
        where: { jiraKey: issue.jiraKey },
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
          jiraKey: issue.jiraKey,
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
      scored++;
    } catch (e) {
      // M7-03/DoD: AI failures must NOT be persisted as real estimates. Log
      // and skip so the next run can retry; nothing fake is written to Jira.
      if (e instanceof AiUnavailableError) {
        errors.push(`${issue.jiraKey}: ai-unavailable (${e.message})`);
      } else {
        errors.push(`${issue.jiraKey}: ${(e as Error).message}`);
      }
    }
  }
  return { ok: true, stats: { scored, candidates: candidates.length } as unknown as Record<string, number>, errors };
}
