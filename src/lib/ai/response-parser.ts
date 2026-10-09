import { pointScale } from "@/lib/env";
import { AiProviderError, AiUnavailableError } from "./errors";
import { sanitizeAiErrorMessage } from "./sanitizer";
import type { AiScoreOutput, AiReleaseCheckOutput } from "./prompts";

/**
 * Extract a JSON object substring from raw model output, stripping markdown fences.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim().replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Extract text content from an OpenAI chat completion JSON payload.
 */
export function extractOpenAiContent(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("OpenAI returned invalid response payload");
  }
  const payload = data as { choices?: { message?: { content?: unknown } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenAI returned empty response");
  }
  return content;
}

/**
 * Extract text response from an Ollama generate JSON payload.
 */
export function extractOllamaContent(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Ollama returned invalid response payload");
  }
  const payload = data as { response?: unknown };
  const response = payload.response;
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("Ollama returned empty response");
  }
  return response;
}

/**
 * Parse a possibly-messy LLM reply into a clean AiScoreOutput. Throws when unusable.
 */
export function parseAiScore(raw: string): AiScoreOutput {
  const obj = extractJsonObject(raw);
  if (!obj) throw new Error("AI did not return valid JSON");
  const scale = pointScale as number[];

  let points = Number(obj.suggestedPoints ?? obj.points);
  if (!Number.isFinite(points)) throw new Error("AI returned no valid points");
  if (!scale.includes(points)) {
    points = scale.reduce((a, b) =>
      Math.abs(b - points) < Math.abs(a - points) ? b : a
    );
  }

  const rawConfidence = Number(obj.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0.5;

  return {
    suggestedPoints: points,
    confidence,
    reasoning: String(obj.reasoning ?? ""),
    missingInformation: Array.isArray(obj.missingInformation)
      ? obj.missingInformation.map(String)
      : [],
    risks: Array.isArray(obj.risks) ? obj.risks.map(String) : [],
    similarTasks: Array.isArray(obj.similarTasks)
      ? obj.similarTasks.map(String).filter(Boolean)
      : [],
  };
}

/**
 * Parse an LLM advisory response into AiReleaseCheckOutput.
 */
export function parseReleaseCheck(raw: string, keys: string[]): AiReleaseCheckOutput {
  const obj = extractJsonObject(raw);
  if (!obj) return { ready: true, blockers: [] };
  const rawBlockers = Array.isArray(obj.blockers) ? obj.blockers : [];
  const keySet = new Set(keys);
  const blockers = (rawBlockers as { jiraKey?: string; reason?: string }[])
    .filter((b) => b && keySet.has(b.jiraKey ?? ""))
    .map((b) => ({ jiraKey: b.jiraKey!, reason: String(b.reason ?? "") }));
  return {
    ready: obj.ready === false ? false : blockers.length === 0,
    blockers,
  };
}

/**
 * Shared retry/parse helper used by concrete providers.
 * Catches transient failures and breaks early on non-retryable provider errors.
 */
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
      if (e instanceof AiProviderError && !e.retryable) {
        break;
      }
    }
  }

  if (lastErr instanceof AiUnavailableError || lastErr instanceof AiProviderError) {
    throw lastErr;
  }
  const rawMsg = lastErr instanceof Error ? lastErr.message : "AI call failed";
  throw new Error(sanitizeAiErrorMessage(rawMsg));
}
