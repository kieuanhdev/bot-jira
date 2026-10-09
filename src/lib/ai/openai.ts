import { env, hasOpenAiConfig } from "@/lib/env";
import type { LLMProvider } from "./provider";
import {
  buildScorePrompt,
  buildReleaseCheckPrompt,
  parseAiScore,
  parseReleaseCheck,
  withJsonRetry,
  extractOpenAiContent,
  AiUnavailableError,
  AiProviderError,
  type AiScoreInput,
  type AiReleaseCheckOutput,
} from "./provider";

/**
 * OpenAI-compatible LLMProvider. Works with OpenAI, Azure OpenAI (with
 * OPENAI_BASE_URL), and any OpenAI-compatible proxy (vLLM, LM Studio,
 * litellm, etc.). Calls /chat/completions in non-stream mode.
 *
 * estimate() throws AiUnavailableError on failure (M7): no fake estimates are
 * fabricated. releaseCheck() throws on failure so callers can mark the gate
 * `unknown`.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = `openai:${env.openaiModel}`;

  async generate(prompt: string, timeoutMs = 25_000): Promise<string> {
    if (!hasOpenAiConfig()) {
      throw new AiProviderError("OpenAI not configured", {
        provider: this.name,
        retryable: false,
      });
    }

    const url = `${env.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: env.openaiModel,
          stream: false,
          temperature: 0.2,
          max_tokens: 1536,
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new AiProviderError(`OpenAI request failed: ${rawMsg}`, {
        provider: this.name,
        retryable: true,
        cause: err,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      throw new AiProviderError(`OpenAI ${res.status}: ${text.slice(0, 200)}`, {
        provider: this.name,
        status: res.status,
        retryable: isRetryable,
      });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      throw new AiProviderError("OpenAI returned invalid JSON", {
        provider: this.name,
        retryable: true,
        cause: err,
      });
    }

    return extractOpenAiContent(data);
  }

  async estimate(input: AiScoreInput) {
    try {
      // Limit to 2 retries × 25s = max ~50s, safely under Cloudflare's 100s timeout.
      return await withJsonRetry(
        () => this.generate(buildScorePrompt(input)),
        parseAiScore,
        2
      );
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : "AI estimate failed";
      throw new AiUnavailableError(rawMsg, { provider: this.name, cause: e });
    }
  }

  async releaseCheck(
    release: { version: string },
    tasks: {
      jiraKey: string;
      summary: string;
      description: string;
      priority?: string;
      status?: string;
    }[]
  ): Promise<AiReleaseCheckOutput> {
    const keys = tasks.map((t) => t.jiraKey);
    return withJsonRetry(
      () => this.generate(buildReleaseCheckPrompt(release, tasks)),
      (raw) => parseReleaseCheck(raw, keys),
      3
    );
  }
}
