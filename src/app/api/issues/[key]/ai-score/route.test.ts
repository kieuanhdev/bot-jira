import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  issueFindUnique: vi.fn(),
  issueFindMany: vi.fn(),
  aiScoreUpsert: vi.fn(),
  estimate: vi.fn(),
  notifyAiEstimateReady: vi.fn(),
  loggerError: vi.fn(),
  hasLLMConfig: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    issueCache: {
      findUnique: mocks.issueFindUnique,
      findMany: mocks.issueFindMany,
    },
    aiScore: { upsert: mocks.aiScoreUpsert },
  },
}));
vi.mock("@/lib/env", () => ({
  hasLLMConfig: () => mocks.hasLLMConfig(),
  env: { llmProvider: "openai" },
}));
vi.mock("@/lib/ai", () => ({
  AI_PROMPT_VERSION: "1.0",
  aiProvider: {
    name: "openai",
    estimate: mocks.estimate,
  },
}));
vi.mock("@/lib/ai/notify", () => ({
  notifyAiEstimateReady: mocks.notifyAiEstimateReady,
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}));

import { POST } from "./route";
import { AiUnavailableError } from "@/lib/ai/provider";

describe("POST /api/issues/[key]/ai-score", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.hasLLMConfig.mockReturnValue(true);
    mocks.issueFindUnique.mockResolvedValue({
      jiraKey: "EPM-123",
      summary: "Test task",
      description: "Test description",
      type: "Task",
      priority: "Medium",
      labels: [],
      projectKey: "EPM",
    });
    mocks.issueFindMany.mockResolvedValue([]);
    mocks.estimate.mockResolvedValue({
      suggestedPoints: 3,
      confidence: 0.8,
      reasoning: "Simple task",
      risks: [],
      missingInformation: [],
      similarTasks: [],
    });
    mocks.aiScoreUpsert.mockResolvedValue({});
    mocks.notifyAiEstimateReady.mockResolvedValue(null);
  });

  it("returns 401 when session is missing", async () => {
    mocks.session.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/issues/EPM-123/ai-score", { method: "POST" }), {
      params: Promise.resolve({ key: "EPM-123" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when issue is not found", async () => {
    mocks.issueFindUnique.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/issues/EPM-123/ai-score", { method: "POST" }), {
      params: Promise.resolve({ key: "EPM-123" }),
    });
    expect(res.status).toBe(404);
  });

  it("calculates score and returns result on success", async () => {
    const res = await POST(new Request("http://localhost/api/issues/EPM-123/ai-score", { method: "POST" }), {
      params: Promise.resolve({ key: "EPM-123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestedPoints).toBe(3);
    expect(mocks.aiScoreUpsert).toHaveBeenCalled();
  });

  it("does not leak raw AiUnavailableError message and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_OPENAI_API_KEY_LEAK_SECRET";
    mocks.estimate.mockRejectedValueOnce(new AiUnavailableError(sentinel));

    const res = await POST(new Request("http://localhost/api/issues/EPM-123/ai-score", { method: "POST" }), {
      params: Promise.resolve({ key: "EPM-123" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("unavailable");
    expect(JSON.stringify(body)).not.toContain(sentinel);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(sentinel),
      })
    );
  });

  it("does not leak raw unexpected error on 500 and logs it (REF-010)", async () => {
    const sentinel = "UPSTREAM_INTERNAL_FATAL_LLM_CRASH_LEAK";
    mocks.estimate.mockRejectedValueOnce(new Error(sentinel));

    const res = await POST(new Request("http://localhost/api/issues/EPM-123/ai-score", { method: "POST" }), {
      params: Promise.resolve({ key: "EPM-123" }),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(JSON.stringify(body)).not.toContain(sentinel);
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining(sentinel),
      })
    );
  });
});
