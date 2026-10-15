import crypto from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const warnedMissingSecrets = new Set<string>();

/**
 * Reset warned missing secrets cache (used for test isolation).
 */
export function _resetWarnedMissingSecretsForTest(): void {
  warnedMissingSecrets.clear();
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sha256HmacHex(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

/**
 * Verify a webhook signature for a given source. Each source supports a
 * different scheme (documented inline). When the source has no secret
 * configured the endpoint treats the request as unauthenticated and rejects
 * it in production (fails closed). In non-production environments, it logs
 * a warning once and accepts the request.
 *
 * Returns true when the request is authentic.
 */
export function verifyWebhookSignature(
  source: "jira" | "sentry" | "bitbucket" | "ci",
  headers: Headers,
  rawBody: string
): boolean {
  const secret =
    source === "jira"
      ? env.jiraWebhookSecret
      : source === "sentry"
        ? env.sentryWebhookSecret
        : source === "bitbucket"
          ? env.bitbucketWebhookSecret
          : env.ciWebhookSecret;

  if (!secret) {
    const isProduction = (env.nodeEnv ?? process.env.NODE_ENV) === "production";
    if (isProduction) {
      return false;
    }

    if (!warnedMissingSecrets.has(source)) {
      warnedMissingSecrets.add(source);
      logger.warn({
        message: `webhook secret is not configured for source "${source}"; allowing request in non-production environment`,
        source,
      });
    }
    return true;
  }

  if (source === "ci") {
    // Generic CI: `X-Webhook-Signature` = HMAC-SHA256 hex of raw body.
    const sig = headers.get("x-webhook-signature")?.trim() ?? "";
    if (!sig) return false;
    return timingSafeEqualHex(sig, sha256HmacHex(secret, rawBody));
  }

  if (source === "sentry") {
    // Sentry (self-hosted / relay) uses `X-Sentry-Hook-Signature: sha256=<hex>`
    // computed over the raw request body.
    const header = headers.get("x-sentry-hook-signature")?.trim() ?? "";
    const idx = header.indexOf("sha256=");
    const sig = idx >= 0 ? header.slice(idx + "sha256=".length) : header;
    if (!sig) return false;
    return timingSafeEqualHex(sig, sha256HmacHex(secret, rawBody));
  }

  if (source === "bitbucket") {
    // Bitbucket Data Center sends `X-Hub-Signature: sha256=<hex>` (HMAC of the
    // raw body with the webhook secret) — same shape as GitHub.
    const header = headers.get("x-hub-signature")?.trim() ?? "";
    const idx = header.indexOf("sha256=");
    const sig = idx >= 0 ? header.slice(idx + "sha256=".length) : header;
    if (!sig) return false;
    return timingSafeEqualHex(sig, sha256HmacHex(secret, rawBody));
  }

  // Jira: we accept either a plain `X-Webhook-Signature: <hex>` (HMAC-SHA256 of
  // the raw body) or a `X-Atlassian-Token` shared secret header. The latter is
  // the convention Jira Server/DC uses when a webhook secret is configured.
  const token = headers.get("x-atlassian-token")?.trim() ?? "";
  if (token) return timingSafeEqualHex(token, secret);
  const sig = headers.get("x-webhook-signature")?.trim() ?? "";
  if (sig) return timingSafeEqualHex(sig, sha256HmacHex(secret, rawBody));
  return false;
}
