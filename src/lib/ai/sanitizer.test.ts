import { describe, it, expect } from "vitest";
import { sanitizeAiErrorMessage } from "./sanitizer";

describe("sanitizeAiErrorMessage", () => {
  it("returns empty string when input is empty or null-like", () => {
    expect(sanitizeAiErrorMessage("")).toBe("");
  });

  it("leaves safe error messages untouched", () => {
    const msg = "AI did not return valid JSON";
    expect(sanitizeAiErrorMessage(msg)).toBe(msg);
  });

  it("redacts standard OpenAI API keys", () => {
    const raw = "Invalid API key: sk-abcdef12345678901234567890 for organization org-123";
    expect(sanitizeAiErrorMessage(raw)).toBe(
      "Invalid API key: sk-[REDACTED] for organization org-123"
    );
  });

  it("redacts project-scoped OpenAI API keys", () => {
    const raw = "Failed request with sk-proj-abcdef12345678901234567890";
    expect(sanitizeAiErrorMessage(raw)).toBe("Failed request with sk-[REDACTED]");
  });

  it("redacts Bearer authorization tokens", () => {
    const raw = "Request rejected for Authorization: Bearer abcdef1234567890xyz";
    expect(sanitizeAiErrorMessage(raw)).toBe(
      "Request rejected for Authorization: Bearer [REDACTED_TOKEN]"
    );
  });

  it("redacts credentials in URLs", () => {
    const raw = "Fetch failed to http://user:secretPass123@localhost:11434/api/generate";
    expect(sanitizeAiErrorMessage(raw)).toBe(
      "Fetch failed to http://user:[REDACTED]@localhost:11434/api/generate"
    );
  });

  it("redacts header / parameter style api-key assignments", () => {
    const raw = 'Error on api-key="my-secret-key-123456789" with token: abc123def456';
    expect(sanitizeAiErrorMessage(raw)).toBe(
      "Error on api-key=[REDACTED] with token=[REDACTED]"
    );
  });

  it("redacts query parameter keys and tokens in URLs", () => {
    const raw = "Failed URL https://api.openai.com/v1/chat?api_key=secretkey12345&token=tok56789";
    expect(sanitizeAiErrorMessage(raw)).toBe(
      "Failed URL https://api.openai.com/v1/chat?api_key=[REDACTED]&token=[REDACTED]"
    );
  });

  it("redacts Discord webhook tokens in URLs", () => {
    const raw = "POST failed: https://discord.com/api/webhooks/123456789/my_secret_token_12345";
    expect(sanitizeAiErrorMessage(raw)).toBe(
      "POST failed: https://discord.com/api/webhooks/123456789/[REDACTED_WEBHOOK_TOKEN]"
    );
  });

  it("truncates excessively long error messages to 500 characters", () => {
    const longMsg = "A".repeat(1000);
    const sanitized = sanitizeAiErrorMessage(longMsg);
    expect(sanitized.length).toBe(500);
    expect(sanitized).toBe("A".repeat(500));
  });
});
