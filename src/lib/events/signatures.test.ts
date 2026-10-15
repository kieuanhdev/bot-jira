import { describe, expect, it, vi, beforeEach } from "vitest";
import crypto from "node:crypto";

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    nodeEnv: "test",
    jiraWebhookSecret: "jira-secret",
    sentryWebhookSecret: "sentry-secret",
    bitbucketWebhookSecret: "bb-secret",
    ciWebhookSecret: "ci-secret",
  },
}));

// Stub env before importing the module under test.
vi.mock("@/lib/env", () => ({
  env: mockEnv,
}));

import { logger } from "@/lib/logger";
import { verifyWebhookSignature, _resetWarnedMissingSecretsForTest } from "./signatures";

function hmacHex(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

describe("verifyWebhookSignature", () => {
  beforeEach(() => {
    mockEnv.nodeEnv = "test";
    mockEnv.jiraWebhookSecret = "jira-secret";
    mockEnv.sentryWebhookSecret = "sentry-secret";
    mockEnv.bitbucketWebhookSecret = "bb-secret";
    mockEnv.ciWebhookSecret = "ci-secret";
    _resetWarnedMissingSecretsForTest?.();
    vi.restoreAllMocks();
  });

  it("accepts a valid CI HMAC-SHA256 signature", () => {
    const body = '{"runId":"1"}';
    const headers = new Headers({
      "x-webhook-signature": hmacHex("ci-secret", body),
    });
    expect(verifyWebhookSignature("ci", headers, body)).toBe(true);
  });

  it("rejects a tampered CI body", () => {
    const body = '{"runId":"1"}';
    const tampered = '{"runId":"2"}';
    const headers = new Headers({
      "x-webhook-signature": hmacHex("ci-secret", body),
    });
    expect(verifyWebhookSignature("ci", headers, tampered)).toBe(false);
  });

  it("rejects a missing CI signature header", () => {
    const body = "{}";
    expect(verifyWebhookSignature("ci", new Headers(), body)).toBe(false);
  });

  it("accepts a valid Sentry X-Sentry-Hook-Signature", () => {
    const body = '{"action":"created"}';
    const headers = new Headers({
      "x-sentry-hook-signature": `sha256=${hmacHex("sentry-secret", body)}`,
    });
    expect(verifyWebhookSignature("sentry", headers, body)).toBe(true);
  });

  it("rejects a wrong Sentry signature", () => {
    const body = '{"action":"created"}';
    const headers = new Headers({
      "x-sentry-hook-signature": `sha256=${hmacHex("wrong", body)}`,
    });
    expect(verifyWebhookSignature("sentry", headers, body)).toBe(false);
  });

  it("accepts a valid Bitbucket X-Hub-Signature", () => {
    const body = '{"eventKey":"pr:merged"}';
    const headers = new Headers({
      "x-hub-signature": `sha256=${hmacHex("bb-secret", body)}`,
    });
    expect(verifyWebhookSignature("bitbucket", headers, body)).toBe(true);
  });

  it("rejects a wrong Bitbucket signature", () => {
    const body = '{"eventKey":"pr:merged"}';
    const headers = new Headers({
      "x-hub-signature": `sha256=${hmacHex("wrong", body)}`,
    });
    expect(verifyWebhookSignature("bitbucket", headers, body)).toBe(false);
  });

  it("accepts a valid Jira X-Atlassian-Token shared secret", () => {
    const body = "{}";
    const headers = new Headers({ "x-atlassian-token": "jira-secret" });
    expect(verifyWebhookSignature("jira", headers, body)).toBe(true);
  });

  it("accepts a valid Jira HMAC X-Webhook-Signature", () => {
    const body = '{"event":"jira:issue_updated"}';
    const headers = new Headers({
      "x-webhook-signature": hmacHex("jira-secret", body),
    });
    expect(verifyWebhookSignature("jira", headers, body)).toBe(true);
  });

  it("rejects a wrong Jira token", () => {
    const body = "{}";
    const headers = new Headers({ "x-atlassian-token": "wrong" });
    expect(verifyWebhookSignature("jira", headers, body)).toBe(false);
  });

  it("rejects a signature whose length differs (no timing-safe pass)", () => {
    const body = "{}";
    const headers = new Headers({ "x-webhook-signature": "short" });
    expect(verifyWebhookSignature("ci", headers, body)).toBe(false);
  });

  describe("when secret is missing", () => {
    it("rejects request in production environment", () => {
      mockEnv.nodeEnv = "production";
      mockEnv.jiraWebhookSecret = "";
      const body = '{"event":"jira:issue_updated"}';
      const headers = new Headers({ "x-atlassian-token": "any-token" });

      expect(verifyWebhookSignature("jira", headers, body)).toBe(false);
    });

    it("accepts request and logs a warning once in non-production environment", () => {
      mockEnv.nodeEnv = "development";
      mockEnv.jiraWebhookSecret = "";
      const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

      const body = '{"event":"jira:issue_updated"}';
      const headers = new Headers();

      // First call: returns true and logs warn
      expect(verifyWebhookSignature("jira", headers, body)).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "jira",
          message: expect.stringContaining("not configured"),
        })
      );

      // Second call for same source: returns true and does NOT log again
      expect(verifyWebhookSignature("jira", headers, body)).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);

      // Call for different source with missing secret: logs for that source
      mockEnv.bitbucketWebhookSecret = "";
      expect(verifyWebhookSignature("bitbucket", headers, body)).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          source: "bitbucket",
        })
      );
    });
  });
});
