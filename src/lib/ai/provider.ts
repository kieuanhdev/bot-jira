import { defaultPoint, pointScale } from "@/lib/env";
import {
  buildScorePrompt,
  buildReleaseCheckPrompt,
  parseAiScore,
  parseReleaseCheck,
  type AiScoreInput,
  type AiScoreOutput,
  type AiReleaseCheckOutput,
} from "./prompts";

export type { AiScoreInput, AiScoreOutput, AiReleaseCheckOutput } from "./prompts";

export interface LLMProvider {
  readonly name: string;
  /** Estimate story points for a single task. Must resolve (use fallback on failure). */
  score(input: AiScoreInput): Promise<AiScoreOutput>;
  /**
   * Advisory AI check on a release. Resolves on success; throws on failure
   * so callers can distinguish "AI unavailable" from "AI found no blocker".
   */
  releaseCheck(
    release: { version: string },
    tasks: {
      jiraKey: string;
      summary: string;
      description: string;
      priority?: string;
      status?: string;
    }[]
  ): Promise<AiReleaseCheckOutput>;
}

/** Shared retry/parse helper used by concrete providers. */
export async function withJsonRetry<T>(
  fn: () => Promise<string>,
  parse: (raw: string) => T,
  attempts = 3
): Promise<T> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await fn();
      return parse(raw);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("AI call failed");
}

function fallbackScore(input: AiScoreInput): AiScoreOutput {
  return {
    points: defaultPoint,
    reasoning: `Fallback estimate (AI unavailable or returned invalid JSON). Key: ${input.key}.`,
    risks: ["Estimate is a default, not an AI result"],
  };
}

export { buildScorePrompt, buildReleaseCheckPrompt, parseAiScore, parseReleaseCheck, fallbackScore, pointScale, defaultPoint };
