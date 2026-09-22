import crypto from "node:crypto";
import { env } from "@/lib/env";

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
 * it — a webhook should never be accepted without a shared secret.
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

  if (!secret) return false;

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
