import { env, hasOpenAiConfig } from "@/lib/env";
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
 * OpenAI-compatible LLMProvider. Works with OpenAI, Azure OpenAI (with
 * OPENAI_BASE_URL), and any OpenAI-compatible proxy (vLLM, LM Studio,
 * litellm, etc.). Calls /chat/completions in non-stream mode.
 *
 * score() resolves to a fallback on failure so the UI never breaks.
 * releaseCheck() throws on failure so callers can mark the gate `unknown`.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = `openai:${env.openaiModel}`;

  private async generate(prompt: string): Promise<string> {
    if (!hasOpenAiConfig()) throw new Error("OpenAI not configured");
    const url = `${env.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openaiModel,
        stream: false,
        temperature: 0.2,
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned empty response");
    return content;
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
