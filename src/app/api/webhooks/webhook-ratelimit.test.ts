import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    ciWebhookSecret: "test-ci-secret",
    sentryWebhookSecret: "",
    jiraWebhookSecret: "",
    bitbucketWebhookSecret: "",
  },
}));

vi.mock("@/lib/env", () => envMock);

const ingestMock = vi.hoisted(() => ({
  ingestEvent: vi.fn().mockResolvedValue({ stored: true, eventId: "evt-1" }),
}));

vi.mock("@/lib/events/store", () => ingestMock);
vi.mock("@/lib/queue/boss", () => ({
  enqueueWebhookEvent: vi.fn().mockResolvedValue("job-1"),
}));

import { POST as ciWebhookPost } from "./ci/route";
import { _resetWebhookRateLimits } from "./_shared";
import crypto from "node:crypto";

describe("Webhook rate limiting and signature verification order", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetWebhookRateLimits();
    envMock.env.ciWebhookSecret = "test-ci-secret";
  });

  it("does not consume rate limit quota on unsigned / invalid signature requests", async () => {
    const unsignedBody = JSON.stringify({ runId: "123", status: "failed" });

    // Send 120 unsigned requests (well over the 100-per-window limit)
    for (let i = 0; i < 120; i++) {
      const req = new Request("http://localhost/api/webhooks/ci", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: unsignedBody,
      });

      const res = await ciWebhookPost(req);
      // Must be rejected as 401 (invalid signature), NOT 429
      expect(res.status).toBe(401);
    }

    // Now send 1 validly signed webhook request
    const validBody = JSON.stringify({ runId: "run-ok", status: "success", repo: "test/repo" });
    const hmac = crypto.createHmac("sha256", "test-ci-secret").update(validBody, "utf8").digest("hex");

    const signedReq = new Request("http://localhost/api/webhooks/ci", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": hmac,
      },
      body: validBody,
    });

    const res = await ciWebhookPost(signedReq);
    // Should NOT be rate limited (429) despite the 120 previous invalid requests!
    expect(res.status).toBe(200);
    expect(ingestMock.ingestEvent).toHaveBeenCalledTimes(1);
  });
});
