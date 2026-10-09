const MAX_ERROR_LENGTH = 500;

/**
 * Scrub credentials and sensitive tokens from AI provider error messages.
 * Prevents API keys, Bearer auth tokens, and webhook secrets from leaking into
 * logs, audit events, or database records.
 */
export function sanitizeAiErrorMessage(raw: string): string {
  if (!raw) return "";
  let sanitized = raw;

  // Redact OpenAI API keys (sk-..., sk-proj-..., etc.)
  sanitized = sanitized.replace(/\bsk-(?:proj-)?[A-Za-z0-9_\-\.]{15,}\b/g, "sk-[REDACTED]");

  // Redact Bearer tokens
  sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9._~+/-]{10,}/gi, "Bearer [REDACTED_TOKEN]");

  // Redact URL credentials: http(s)://user:password@host
  sanitized = sanitized.replace(/(https?:\/\/)([^:\/\s]+):([^@\/\s]+)@/g, "$1$2:[REDACTED]@");

  // Redact header or param style api-key / secret / token assignments: api-key=xxx or api_key: "xxx"
  sanitized = sanitized.replace(/\b(api[-_]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/-]{10,}["']?/gi, "$1=[REDACTED]");

  // Redact query parameter secrets: ?token=xxx or &key=xxx
  sanitized = sanitized.replace(/([?&](?:token|secret|key|api[-_]?key)=)[^&\s]+/gi, "$1[REDACTED]");

  // Redact Discord webhook token in URLs
  sanitized = sanitized.replace(
    /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)([A-Za-z0-9_-]+)/g,
    "$1[REDACTED_WEBHOOK_TOKEN]"
  );

  return sanitized.slice(0, MAX_ERROR_LENGTH);
}
