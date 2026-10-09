import { sanitizeAiErrorMessage } from "./sanitizer";

/**
 * Standard error thrown when an AI estimate or check cannot be produced.
 * All messages are sanitized to prevent credential leakage.
 */
export class AiUnavailableError extends Error {
  readonly provider?: string;

  constructor(
    message = "AI estimate unavailable",
    options?: { provider?: string; cause?: unknown }
  ) {
    super(sanitizeAiErrorMessage(message));
    this.name = "AiUnavailableError";
    this.provider = options?.provider;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Normalized provider-level error thrown when communication with the LLM API fails.
 * Captures HTTP status, provider name, and retryability flag.
 */
export class AiProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: {
      provider?: string;
      status?: number;
      retryable?: boolean;
      cause?: unknown;
    }
  ) {
    super(sanitizeAiErrorMessage(message));
    this.name = "AiProviderError";
    this.provider = options?.provider ?? "unknown";
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Helper to identify whether an error indicates AI unavailability.
 */
export function isAiUnavailable(error: unknown): boolean {
  if (error instanceof AiUnavailableError) return true;
  if (error instanceof Error && error.name === "AiUnavailableError") return true;
  return false;
}
