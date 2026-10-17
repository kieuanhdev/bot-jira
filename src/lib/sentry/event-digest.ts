// Shrink a raw Sentry event to the few fields an LLM needs to summarize the
// error, with secrets and personal data removed. User/IP data, breadcrumbs,
// headers, cookies and frame variables are never copied.

import { sanitizeAiErrorMessage } from "@/lib/ai/sanitizer";
import type { SentryEvent } from "./client";

export type SentryEventDigest = {
  exceptionType?: string;
  exceptionValue?: string;
  culprit?: string;
  frames: { file: string; fn: string; line?: number }[];
  tags: Record<string, string>;
  requestUrl?: string;
};

const MAX_FRAMES = 10;
const MAX_EXCEPTION_VALUE = 1000;
const MAX_FIELD = 300;
const TAG_WHITELIST = new Set(["environment", "release", "browser", "os", "url", "transaction"]);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

type RawFrame = {
  filename?: unknown;
  absPath?: unknown;
  module?: unknown;
  function?: unknown;
  lineNo?: unknown;
  inApp?: unknown;
};
type RawException = { type?: unknown; value?: unknown; stacktrace?: { frames?: unknown } | null };

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/**
 * Redact emails and secrets before Sentry text reaches the LLM. The shared AI
 * sanitizer caps its input, so it is applied per line; a single line longer
 * than its cap is truncated.
 */
export function scrubSentryText(text: string, max: number): string {
  return text
    .replace(EMAIL_RE, "[email]")
    .split("\n")
    .map((line) => sanitizeAiErrorMessage(line))
    .join("\n")
    .slice(0, max)
    .trim();
}

function stripQuery(url: string): string {
  return url.split(/[?#]/, 1)[0];
}

function entryData(e: SentryEvent, type: string): unknown {
  return e.entries?.find((entry) => entry?.type === type)?.data;
}

function lastException(e: SentryEvent): RawException | undefined {
  const data = entryData(e, "exception") as { values?: unknown } | null | undefined;
  const values = Array.isArray(data?.values) ? (data.values as RawException[]) : [];
  return values.at(-1) ?? undefined;
}

function inAppFrames(exc: RawException | undefined): SentryEventDigest["frames"] {
  const raw = exc?.stacktrace?.frames;
  if (!Array.isArray(raw)) return [];
  return (raw as RawFrame[])
    .filter((f) => f && f.inApp === true)
    .reverse()
    .slice(0, MAX_FRAMES)
    .map((f) => {
      const file = str(f.filename) ?? str(f.absPath) ?? str(f.module) ?? "?";
      const frame: SentryEventDigest["frames"][number] = {
        file: scrubSentryText(file, MAX_FIELD),
        fn: scrubSentryText(str(f.function) ?? "?", MAX_FIELD),
      };
      if (typeof f.lineNo === "number") frame.line = f.lineNo;
      return frame;
    });
}

export function digestSentryEvent(e: SentryEvent): SentryEventDigest {
  const digest: SentryEventDigest = { frames: [], tags: {} };

  const exc = lastException(e);
  const type = str(exc?.type);
  if (type) digest.exceptionType = scrubSentryText(type, MAX_FIELD);
  const value = str(exc?.value) ?? str(e.message);
  if (value) digest.exceptionValue = scrubSentryText(value, MAX_EXCEPTION_VALUE);

  const culprit = str(e.culprit);
  if (culprit) digest.culprit = scrubSentryText(culprit, MAX_FIELD);

  digest.frames = inAppFrames(exc);

  for (const tag of Array.isArray(e.tags) ? e.tags : []) {
    if (!tag || !TAG_WHITELIST.has(tag.key)) continue;
    const v = str(tag.value);
    if (!v) continue;
    digest.tags[tag.key] = scrubSentryText(tag.key === "url" ? stripQuery(v) : v, MAX_FIELD);
  }

  const request = entryData(e, "request") as { url?: unknown } | null | undefined;
  const url = str(request?.url);
  if (url) digest.requestUrl = scrubSentryText(stripQuery(url), MAX_FIELD);

  return digest;
}
