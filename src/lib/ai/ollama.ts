import { env, hasOllamaConfig } from "@/lib/env";
import type { LLMProvider } from "./provider";
import {
  buildScorePrompt,
  buildReleaseCheckPrompt,
  parseAiScore,
  parseReleaseCheck,
  withJsonRetry,
  fallbackScore,
  type AiScoreInput,
} from "./provider";

/**
 * Ollama-backed LLMProvider. Calls /api/generate in non-stream mode.
 *
 * score() resolves to a fallback on failure so the UI never breaks.
 * releaseCheck() throws on failure so callers can mark the gate `unknown`.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = `ollama:${env.ollamaModel}`;

  private async generate(prompt: string): Promise<string> {
    if (!hasOllamaConfig()) throw new Error("Ollama not configured");
    const res = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.ollamaModel,
        prompt,
        stream: false,
        options: { temperature: 0.2, num_predict: 512 },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as { response?: string };
    if (!data.response) throw new Error("Ollama returned empty response");
    return data.response;
  }

  async score(input: AiScoreInput) {
    try {
      return await withJsonRetry(
        () => this.generate(buildScorePrompt(input)),
        parseAiScore,
        3
      );
    } catch {
      return fallbackScore(input);
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
  ) {
    const keys = tasks.map((t) => t.jiraKey);
    return withJsonRetry(
      () => this.generate(buildReleaseCheckPrompt(release, tasks)),
      (raw) => parseReleaseCheck(raw, keys),
      3
    );
  }
}
