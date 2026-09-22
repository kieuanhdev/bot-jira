import { env } from "@/lib/env";
import type { LLMProvider } from "./provider";
import { OllamaProvider } from "./ollama";
import { OpenAIProvider } from "./openai";

/**
 * The active LLM provider, chosen by the LLM_PROVIDER env var.
 *   - "openai"  (default) → OpenAI-compatible API (OpenAI, Azure, vLLM, litellm…)
 *   - "ollama"  → self-hosted Ollama
 *
 * Consumers import `aiProvider` from this module.
 */
export function createProvider(): LLMProvider {
  switch (env.llmProvider) {
    case "ollama":
      return new OllamaProvider();
    case "openai":
    default:
      return new OpenAIProvider();
  }
}

export const aiProvider: LLMProvider = createProvider();

export type { LLMProvider } from "./provider";
export { AI_PROMPT_VERSION } from "./prompts";
