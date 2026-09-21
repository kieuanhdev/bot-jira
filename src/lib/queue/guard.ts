import {
  env,
  hasJiraConfig,
  hasBitbucketConfig,
  hasSentryConfig,
  hasOllamaConfig,
  hasOpenAiConfig,
  hasLLMConfig,
} from "@/lib/env";

export type WorkerLog = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  stats?: Record<string, unknown>;
  errors?: string[];
};

/**
 * Each worker is gated on its required config so the dev server boots even
 * with an empty .env. Returns a no-op log when the service is not configured.
 */
export function guard(hasConfig: boolean, reason: string): WorkerLog {
  return { ok: true, skipped: !hasConfig, reason };
}

export {
  env,
  hasJiraConfig,
  hasBitbucketConfig,
  hasSentryConfig,
  hasOllamaConfig,
  hasOpenAiConfig,
  hasLLMConfig,
};
