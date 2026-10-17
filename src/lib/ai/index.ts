import type { LLMProvider } from "./provider";
import { OpenAIProvider } from "./openai";

/**
 * The active LLM provider: an OpenAI-compatible API (OpenAI, Azure, vLLM, litellm…).
 *
 * Consumers import `aiProvider` from this module.
 */
export function createProvider(): LLMProvider {
  return new OpenAIProvider();
}

export const aiProvider: LLMProvider = createProvider();

export type { LLMProvider } from "./provider";
export {
  AI_PROMPT_VERSION,
  AiUnavailableError,
  AiProviderError,
  isAiUnavailable,
  sanitizeAiErrorMessage,
} from "./provider";
