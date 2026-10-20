const MAX_ERROR_LENGTH = 500;

/**
 * Scrub credentials and sensitive tokens from AI provider error messages.
 * Prevents API keys, Bearer auth tokens, and webhook secrets from leaking into
 * logs, audit events, or database records.
 */
export function sanitizeAiErrorMessage(raw: string): string {
  if (!raw) return "";
  return redactSecrets(raw).slice(0, MAX_ERROR_LENGTH);
}

/**
 * Redact API keys, bearer tokens, URL credentials and webhook secrets from free
 * text without truncating it. Use on any user text before sending it to the LLM.
 */
export function redactSecrets(raw: string): string {
  if (!raw) return "";
  let sanitized = raw;

  // Redact OpenAI API keys (sk-..., sk-proj-..., etc.)
  sanitized = sanitized.replace(/\bsk-(?:proj-)?[A-Za-z0-9_\-\.]{15,}\b/g, "sk-[REDACTED]");

  // Redact Bot and Bearer tokens
  sanitized = sanitized.replace(/\b(Bot|Bearer)\s+[A-Za-z0-9._~+/-]{10,}/gi, "$1 [REDACTED_TOKEN]");

  // Redact URL credentials: http(s)://user:password@host
  sanitized = sanitized.replace(/(https?:\/\/)([^:\/\s]+):([^@\/\s]+)@/g, "$1$2:[REDACTED]@");

  // Redact Discord webhook token in URLs
  sanitized = sanitized.replace(
    /(https?:\/\/(?:[a-zA-Z0-9-]+\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)([A-Za-z0-9_-]+)/g,
    "$1[REDACTED_WEBHOOK_TOKEN]"
  );

  // Redact query parameter secrets: ?token=xxx or &key=xxx or ?auth=xxx
  sanitized = sanitized.replace(/([?&](?:token|secret|key|api[-_]?key|auth)=)[^&\s]+/gi, "$1[REDACTED]");

  // Redact header or param style api-key / secret / token / password assignments: api-key=xxx or token: "xxx" or password=xxx
  sanitized = sanitized.replace(
    /\b(api[-_]?key|secret|token|password)\s*[:=]\s*["']?(?!\[REDACTED)[^\s"';,]+["']?/gi,
    "$1=[REDACTED]"
  );

  return sanitized;
}
