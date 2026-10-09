import { pointScale } from "@/lib/env";
import {
  buildScorePrompt,
  buildReleaseCheckPrompt,
  AI_PROMPT_VERSION,
  type AiScoreInput,
  type AiScoreOutput,
  type AiReleaseCheckOutput,
} from "./prompts";
import {
  AiUnavailableError,
  AiProviderError,
  isAiUnavailable,
} from "./errors";
import { sanitizeAiErrorMessage } from "./sanitizer";
import {
  extractOpenAiContent,
  extractOllamaContent,
  extractJsonObject,
  parseAiScore,
  parseReleaseCheck,
  withJsonRetry,
} from "./response-parser";

export type { AiScoreInput, AiScoreOutput, AiReleaseCheckOutput } from "./prompts";
export {
  AI_PROMPT_VERSION,
  AiUnavailableError,
  AiProviderError,
  isAiUnavailable,
  sanitizeAiErrorMessage,
  extractOpenAiContent,
  extractOllamaContent,
  extractJsonObject,
  parseAiScore,
  parseReleaseCheck,
  withJsonRetry,
  buildScorePrompt,
  buildReleaseCheckPrompt,
  pointScale,
};

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
