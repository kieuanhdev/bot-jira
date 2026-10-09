import { env, hasOllamaConfig } from "@/lib/env";
import type { LLMProvider } from "./provider";
import {
  buildScorePrompt,
  buildReleaseCheckPrompt,
  parseAiScore,
  parseReleaseCheck,
  withJsonRetry,
  extractOllamaContent,
  AiUnavailableError,
  AiProviderError,
  type AiScoreInput,
  type AiReleaseCheckOutput,
} from "./provider";

/**
 * Ollama-backed LLMProvider. Calls /api/generate in non-stream mode.
 *
 * estimate() throws AiUnavailableError on failure (M7): no fake estimates.
 * releaseCheck() throws on failure so callers can mark the gate `unknown`.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = `ollama:${env.ollamaModel}`;

  async generate(prompt: string, timeoutMs = 30_000): Promise<string> {
    if (!hasOllamaConfig()) {
      throw new AiProviderError("Ollama not configured", {
        provider: this.name,
        retryable: false,
      });
    }

    const url = `${env.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: env.ollamaModel,
          prompt,
          stream: false,
          options: { temperature: 0.2, num_predict: 512 },
        }),
      });
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new AiProviderError(`Ollama request failed: ${rawMsg}`, {
        provider: this.name,
        retryable: true,
        cause: err,
      });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      throw new AiProviderError(`Ollama ${res.status}: ${text.slice(0, 200)}`, {
        provider: this.name,
        status: res.status,
        retryable: isRetryable,
      });
    }

    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      throw new AiProviderError("Ollama returned invalid JSON", {
        provider: this.name,
        retryable: true,
        cause: err,
      });
    }

    return extractOllamaContent(data);
  }

  async estimate(input: AiScoreInput) {
    try {
      return await withJsonRetry(
        () => this.generate(buildScorePrompt(input)),
        parseAiScore,
        3
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
