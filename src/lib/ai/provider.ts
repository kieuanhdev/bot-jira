import { pointScale } from "@/lib/env";
import {
  buildScorePrompt,
  buildReleaseCheckPrompt,
  parseAiScore,
  parseReleaseCheck,
  AI_PROMPT_VERSION,
  type AiScoreInput,
  type AiScoreOutput,
  type AiReleaseCheckOutput,
} from "./prompts";

export type { AiScoreInput, AiScoreOutput, AiReleaseCheckOutput } from "./prompts";
export { AI_PROMPT_VERSION };

export class AiUnavailableError extends Error {
  constructor(message = "AI estimate unavailable") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export interface LLMProvider {
  readonly name: string;
  /**
   * Estimate story points for a single task (M7).
   * Throws AiUnavailableError when the model cannot produce a valid estimate
   * (network error, bad JSON after retries, ...). Callers must surface this as
   * "unavailable" and must NOT write any fallback value to Jira or treat it as
   * a real AI result (M7-03 / DoD: no fake estimates persisted as real ones).
   */
  estimate(input: AiScoreInput): Promise<AiScoreOutput>;
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

export { buildScorePrompt, buildReleaseCheckPrompt, parseAiScore, parseReleaseCheck, pointScale };
