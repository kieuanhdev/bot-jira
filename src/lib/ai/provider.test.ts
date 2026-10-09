import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "./openai";
import { OllamaProvider } from "./ollama";
import { createProvider } from "./index";
import { AiProviderError, AiUnavailableError, isAiUnavailable } from "./errors";
import { env } from "@/lib/env";

const mockFetch = vi.fn();
const originalFetch = globalThis.fetch;

describe("AI Providers & Boundary", () => {
  beforeEach(() => {
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("OpenAIProvider", () => {
    it("has expected provider name formatted with model", () => {
      const provider = new OpenAIProvider();
      expect(provider.name).toBe(`openai:${env.openaiModel}`);
    });

    it("successfully generates estimate from valid completion", async () => {
      const provider = new OpenAIProvider();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestedPoints: 5,
                  confidence: 0.85,
                  reasoning: "Medium complexity",
                  missingInformation: [],
                  risks: [],
                  similarTasks: [],
                }),
              },
            },
          ],
        }),
      });

      const res = await provider.estimate({
        key: "PROJ-10",
        summary: "Build authentication flow",
        description: "Standard OAuth",
      });

      expect(res.suggestedPoints).toBe(5);
      expect(res.confidence).toBe(0.85);
      expect(res.reasoning).toBe("Medium complexity");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("successfully runs releaseCheck with advisory blockers", async () => {
      const provider = new OpenAIProvider();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  ready: false,
                  blockers: [{ jiraKey: "PROJ-10", reason: "Critical defect" }],
                }),
              },
            },
          ],
        }),
      });

      const res = await provider.releaseCheck({ version: "1.2.0" }, [
        { jiraKey: "PROJ-10", summary: "Auth", description: "oauth" },
      ]);

      expect(res.ready).toBe(false);
      expect(res.blockers).toEqual([{ jiraKey: "PROJ-10", reason: "Critical defect" }]);
    });

    it("wraps unconfigured error into AiUnavailableError on estimate", async () => {
      const originalKey = env.openaiApiKey;
      try {
        (env as { openaiApiKey: string }).openaiApiKey = "";
        const provider = new OpenAIProvider();
        await expect(
          provider.estimate({ key: "PROJ-1", summary: "x", description: "y" })
        ).rejects.toThrow(AiUnavailableError);
      } finally {
        (env as { openaiApiKey: string }).openaiApiKey = originalKey;
      }
    });

    it("scrubs OpenAI API key from error message when upstream leaks it", async () => {
      const provider = new OpenAIProvider();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          "Unauthorized: invalid api key sk-1234567890abcdef1234567890 for project",
      });

      try {
        await provider.estimate({ key: "PROJ-1", summary: "x", description: "y" });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AiUnavailableError);
        const msg = (err as Error).message;
        expect(msg).not.toContain("sk-1234567890abcdef1234567890");
        expect(msg).toContain("sk-[REDACTED]");
      }
    });

    it("throws AiUnavailableError when response content is empty", async () => {
      const provider = new OpenAIProvider();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "" } }],
        }),
      });

      await expect(
        provider.estimate({ key: "PROJ-1", summary: "x", description: "y" })
      ).rejects.toThrow("OpenAI returned empty response");
    });

    it("throws AiUnavailableError on network failure after 2 retries", async () => {
      const provider = new OpenAIProvider();
      mockFetch.mockRejectedValue(new Error("Network timeout after 25s"));

      await expect(
        provider.estimate({ key: "PROJ-1", summary: "x", description: "y" })
      ).rejects.toThrow("OpenAI request failed: Network timeout after 25s");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("OllamaProvider", () => {
    it("has expected provider name formatted with model", () => {
      const provider = new OllamaProvider();
      expect(provider.name).toBe(`ollama:${env.ollamaModel}`);
    });

    it("successfully generates estimate from valid Ollama response", async () => {
      const provider = new OllamaProvider();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            suggestedPoints: 3,
            confidence: 0.9,
            reasoning: "Small bug fix",
            missingInformation: [],
            risks: [],
            similarTasks: [],
          }),
        }),
      });

      const res = await provider.estimate({
        key: "PROJ-20",
        summary: "Fix typo",
        description: "Simple text fix",
      });

      expect(res.suggestedPoints).toBe(3);
      expect(res.confidence).toBe(0.9);
      expect(res.reasoning).toBe("Small bug fix");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("successfully runs releaseCheck with Ollama", async () => {
      const provider = new OllamaProvider();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            ready: true,
            blockers: [],
          }),
        }),
      });

      const res = await provider.releaseCheck({ version: "2.0.0" }, [
        { jiraKey: "PROJ-20", summary: "Typo fix", description: "fix" },
      ]);

      expect(res.ready).toBe(true);
      expect(res.blockers).toEqual([]);
    });

    it("wraps unconfigured error into AiUnavailableError on estimate", async () => {
      const originalBase = env.ollamaBaseUrl;
      try {
        (env as { ollamaBaseUrl: string }).ollamaBaseUrl = "";
        const provider = new OllamaProvider();
        await expect(
          provider.estimate({ key: "PROJ-2", summary: "x", description: "y" })
        ).rejects.toThrow(AiUnavailableError);
      } finally {
        (env as { ollamaBaseUrl: string }).ollamaBaseUrl = originalBase;
      }
    });

    it("throws AiUnavailableError when Ollama returns empty response", async () => {
      const provider = new OllamaProvider();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ response: "" }),
      });

      await expect(
        provider.estimate({ key: "PROJ-2", summary: "x", description: "y" })
      ).rejects.toThrow("Ollama returned empty response");
    });

    it("throws AiUnavailableError on 500 error after 3 retries", async () => {
      const provider = new OllamaProvider();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal server crash",
      });

      await expect(
        provider.estimate({ key: "PROJ-2", summary: "x", description: "y" })
      ).rejects.toThrow("Ollama 500: Internal server crash");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("createProvider factory", () => {
    it("creates OllamaProvider when llmProvider is ollama", () => {
      const orig = env.llmProvider;
      try {
        (env as { llmProvider: string }).llmProvider = "ollama";
        const p = createProvider();
        expect(p).toBeInstanceOf(OllamaProvider);
      } finally {
        (env as { llmProvider: string }).llmProvider = orig;
      }
    });

    it("creates OpenAIProvider by default or when llmProvider is openai", () => {
      const orig = env.llmProvider;
      try {
        (env as { llmProvider: string }).llmProvider = "openai";
        const p1 = createProvider();
        expect(p1).toBeInstanceOf(OpenAIProvider);

        (env as { llmProvider: string }).llmProvider = "unknown-vendor";
        const p2 = createProvider();
        expect(p2).toBeInstanceOf(OpenAIProvider);
      } finally {
        (env as { llmProvider: string }).llmProvider = orig;
      }
    });
  });

  describe("isAiUnavailable helper", () => {
    it("returns true for AiUnavailableError instances", () => {
      expect(isAiUnavailable(new AiUnavailableError())).toBe(true);
      const namedErr = new Error("Custom");
      namedErr.name = "AiUnavailableError";
      expect(isAiUnavailable(namedErr)).toBe(true);
    });

    it("returns false for other errors", () => {
      expect(isAiUnavailable(new Error("Other error"))).toBe(false);
      expect(isAiUnavailable(new AiProviderError("Provider error"))).toBe(false);
      expect(isAiUnavailable(null)).toBe(false);
      expect(isAiUnavailable("string error")).toBe(false);
    });
  });
});
