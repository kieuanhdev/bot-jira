import { aiProvider } from "@/lib/ai";
import type { LLMProvider } from "./provider";
import { AiUnavailableError } from "./errors";
import { extractJsonObject, withJsonRetry } from "./response-parser";

export type GenerateJsonOptions = {
  /** Total tries (provider call + parse). Default 2. */
  attempts?: number;
  /** Per-call provider timeout. Default 30s. */
  timeoutMs?: number;
  /** Override the provider (tests). Defaults to the app-wide `aiProvider`. */
  provider?: Pick<LLMProvider, "generate">;
};

/**
 * Ask the LLM for a JSON object and validate it with `parse`.
 *
 * - Markdown fences / surrounding prose are stripped via `extractJsonObject`.
 * - Bad JSON, a `parse` failure, or a retryable provider error (timeout, 429,
 *   5xx) consumes one attempt and retries.
 * - A non-retryable provider error (e.g. OpenAI not configured, 401) stops
 *   immediately.
 * - Any final failure surfaces as `AiUnavailableError` so callers can show
 *   "AI không phản hồi, thử lại" and keep the user's form data untouched.
 */
export async function generateJson<T>(
  prompt: string,
  parse: (obj: unknown) => T,
  opts: GenerateJsonOptions = {}
): Promise<T> {
  const { attempts = 2, timeoutMs = 30_000, provider = aiProvider } = opts;
  try {
    return await withJsonRetry(
      () => provider.generate(prompt, timeoutMs),
      (raw) => {
        const obj = extractJsonObject(raw);
        if (!obj) throw new Error("AI did not return valid JSON");
        return parse(obj);
      },
      attempts
    );
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    throw new AiUnavailableError(
      err instanceof Error ? `AI unavailable: ${err.message}` : "AI unavailable",
      { cause: err }
    );
  }
}
