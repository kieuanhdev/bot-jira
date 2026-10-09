import { describe, it, expect, vi } from "vitest";
import {
  extractOpenAiContent,
  extractOllamaContent,
  extractJsonObject,
  parseAiScore,
  parseReleaseCheck,
  withJsonRetry,
} from "./response-parser";
import { AiProviderError, AiUnavailableError } from "./errors";

describe("extractOpenAiContent", () => {
  it("extracts content from valid OpenAI completion structure", () => {
    const payload = {
      choices: [{ message: { content: "  {\"suggestedPoints\": 3}  " } }],
    };
    expect(extractOpenAiContent(payload)).toBe("  {\"suggestedPoints\": 3}  ");
  });

  it("throws when choices is missing or empty", () => {
    expect(() => extractOpenAiContent({})).toThrow("OpenAI returned empty response");
    expect(() => extractOpenAiContent({ choices: [] })).toThrow("OpenAI returned empty response");
  });

  it("throws when content is empty or whitespace only", () => {
    expect(() => extractOpenAiContent({ choices: [{ message: { content: "   " } }] })).toThrow(
      "OpenAI returned empty response"
    );
    expect(() => extractOpenAiContent({ choices: [{ message: {} }] })).toThrow(
      "OpenAI returned empty response"
    );
  });

  it("throws when payload is null or not an object", () => {
    expect(() => extractOpenAiContent(null)).toThrow("OpenAI returned invalid response payload");
    expect(() => extractOpenAiContent("not an object")).toThrow(
      "OpenAI returned invalid response payload"
    );
  });
});

describe("extractOllamaContent", () => {
  it("extracts response from valid Ollama structure", () => {
    const payload = { response: "{\"ready\": true}" };
    expect(extractOllamaContent(payload)).toBe("{\"ready\": true}");
  });

  it("throws when response property is missing or empty", () => {
    expect(() => extractOllamaContent({})).toThrow("Ollama returned empty response");
    expect(() => extractOllamaContent({ response: "" })).toThrow("Ollama returned empty response");
    expect(() => extractOllamaContent({ response: "  \n  " })).toThrow("Ollama returned empty response");
  });

  it("throws when payload is null or not an object", () => {
    expect(() => extractOllamaContent(null)).toThrow("Ollama returned invalid response payload");
    expect(() => extractOllamaContent(123)).toThrow("Ollama returned invalid response payload");
  });
});

describe("withJsonRetry", () => {
  it("returns parsed result on first success", async () => {
    const fn = vi.fn().mockResolvedValue('{"suggestedPoints": 5, "confidence": 0.8}');
    const result = await withJsonRetry(fn, parseAiScore, 3);
    expect(result.suggestedPoints).toBe(5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on malformed JSON and succeeds on subsequent attempt", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce("malformed text not json")
      .mockResolvedValueOnce('{"suggestedPoints": 3, "confidence": 0.9}');
    const result = await withJsonRetry(fn, parseAiScore, 3);
    expect(result.suggestedPoints).toBe(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops retrying early when non-retryable AiProviderError occurs", async () => {
    const fn = vi.fn().mockRejectedValue(
      new AiProviderError("OpenAI 401: Unauthorized", {
        provider: "openai",
        status: 401,
        retryable: false,
      })
    );
    await expect(withJsonRetry(fn, parseAiScore, 3)).rejects.toThrow("OpenAI 401: Unauthorized");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on retryable AiProviderError until exhausted", async () => {
    const fn = vi.fn().mockRejectedValue(
      new AiProviderError("OpenAI 503: Service Unavailable", {
        provider: "openai",
        status: 503,
        retryable: true,
      })
    );
    await expect(withJsonRetry(fn, parseAiScore, 3)).rejects.toThrow(
      "OpenAI 503: Service Unavailable"
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("preserves AiUnavailableError if thrown", async () => {
    const fn = vi.fn().mockRejectedValue(new AiUnavailableError("Custom unavailable"));
    await expect(withJsonRetry(fn, parseAiScore, 2)).rejects.toThrow("Custom unavailable");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("sanitizes error message on exhausted generic error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Failed with secret key sk-1234567890abcdef1234567890"));
    await expect(withJsonRetry(fn, parseAiScore, 2)).rejects.toThrow("sk-[REDACTED]");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("extractJsonObject, parseAiScore, parseReleaseCheck integration", () => {
  it("extracts nested JSON and strips code fences", () => {
    const obj = extractJsonObject("```json\n{\"ok\": true, \"val\": 42}\n```");
    expect(obj).toEqual({ ok: true, val: 42 });
  });

  it("returns null for non-JSON strings", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });

  it("parseAiScore enforces scale and defaults", () => {
    const score = parseAiScore('{"suggestedPoints": 8, "reasoning": "heavy task"}');
    expect(score.suggestedPoints).toBe(8);
    expect(score.confidence).toBe(0.5);
    expect(score.reasoning).toBe("heavy task");
    expect(score.missingInformation).toEqual([]);
  });

  it("parseReleaseCheck filters invalid keys and defaults to ready on garbage", () => {
    expect(parseReleaseCheck("garbage text", ["TASK-1"])).toEqual({ ready: true, blockers: [] });
    const check = parseReleaseCheck(
      '{"ready": false, "blockers": [{"jiraKey": "TASK-1", "reason": "blocker 1"}, {"jiraKey": "OTHER-9", "reason": "ignored"}]}',
      ["TASK-1"]
    );
    expect(check.ready).toBe(false);
    expect(check.blockers).toEqual([{ jiraKey: "TASK-1", reason: "blocker 1" }]);
  });
});
