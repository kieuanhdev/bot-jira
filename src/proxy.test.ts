import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  isSameOrigin,
  isMutatingApiRequest,
  proxy,
  SECURITY_HEADERS,
} from "./proxy";

describe("isSameOrigin", () => {
  it("returns true when origin host matches host exactly", () => {
    expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(isSameOrigin("https://example.com", "example.com")).toBe(true);
  });

  it("handles case insensitivity", () => {
    expect(isSameOrigin("https://EXAMPLE.COM", "example.com")).toBe(true);
    expect(isSameOrigin("https://example.com", "EXAMPLE.COM")).toBe(true);
  });

  it("returns true when cleanHost includes default http/https ports", () => {
    expect(isSameOrigin("http://example.com", "example.com:80")).toBe(true);
    expect(isSameOrigin("https://example.com", "example.com:443")).toBe(true);
  });

  it("supports comma-separated x-forwarded-host headers", () => {
    expect(isSameOrigin("https://example.com", "example.com, proxy.corp.local")).toBe(true);
  });

  it("returns false for null, undefined, or empty values", () => {
    expect(isSameOrigin(null, "localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3000", null)).toBe(false);
    expect(isSameOrigin(undefined, "localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3000", undefined)).toBe(false);
    expect(isSameOrigin("", "localhost:3000")).toBe(false);
    expect(isSameOrigin("http://localhost:3000", "")).toBe(false);
  });

  it("returns false for domain mismatches", () => {
    expect(isSameOrigin("https://evil.com", "example.com")).toBe(false);
  });

  it("returns false for subdomain mismatches", () => {
    expect(isSameOrigin("https://sub.example.com", "example.com")).toBe(false);
    expect(isSameOrigin("https://example.com", "sub.example.com")).toBe(false);
  });

  it("returns false for port mismatches", () => {
    expect(isSameOrigin("http://localhost:3001", "localhost:3000")).toBe(false);
    expect(isSameOrigin("https://example.com:8443", "example.com:443")).toBe(false);
  });

  it("returns false for malformed or opaque 'null' origins", () => {
    expect(isSameOrigin("null", "localhost:3000")).toBe(false);
    expect(isSameOrigin("not-a-url", "localhost:3000")).toBe(false);
  });
});

describe("isMutatingApiRequest", () => {
  it("returns true for mutating methods on non-excluded /api/* paths", () => {
    expect(isMutatingApiRequest("POST", "/api/issues")).toBe(true);
    expect(isMutatingApiRequest("PUT", "/api/users/1")).toBe(true);
    expect(isMutatingApiRequest("PATCH", "/api/users/1/role")).toBe(true);
    expect(isMutatingApiRequest("DELETE", "/api/issues/1")).toBe(true);
  });

  it("returns false for non-mutating methods", () => {
    expect(isMutatingApiRequest("GET", "/api/issues")).toBe(false);
    expect(isMutatingApiRequest("HEAD", "/api/issues")).toBe(false);
    expect(isMutatingApiRequest("OPTIONS", "/api/issues")).toBe(false);
  });

  it("returns false for non-api routes", () => {
    expect(isMutatingApiRequest("POST", "/board")).toBe(false);
    expect(isMutatingApiRequest("POST", "/login")).toBe(false);
  });

  it("returns false for excluded /api paths (webhooks, auth, chat)", () => {
    expect(isMutatingApiRequest("POST", "/api/webhooks/jira")).toBe(false);
    expect(isMutatingApiRequest("POST", "/api/webhooks/bitbucket")).toBe(false);
    expect(isMutatingApiRequest("POST", "/api/auth/signin")).toBe(false);
    expect(isMutatingApiRequest("POST", "/api/chat/identity/link")).toBe(false);
  });
});

describe("proxy", () => {
  it("attaches security headers to standard GET requests", async () => {
    const req = new NextRequest("http://localhost:3000/board");
    const res = await proxy(req);

    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Content-Security-Policy-Report-Only")).toBe(
      SECURITY_HEADERS["Content-Security-Policy-Report-Only"]
    );
  });

  it("allows mutating API requests when Origin matches Host", async () => {
    const req = new NextRequest("http://localhost:3000/api/register", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("allows mutating API requests when Origin matches x-forwarded-host", async () => {
    const req = new NextRequest("http://internal-host/api/register", {
      method: "POST",
      headers: {
        host: "internal-host",
        "x-forwarded-host": "jira.example.com",
        origin: "https://jira.example.com",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it("allows mutating API requests when Origin is absent (CLI / non-browser client)", async () => {
    const req = new NextRequest("http://localhost:3000/api/register", {
      method: "POST",
      headers: {
        host: "localhost:3000",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it("allows excluded mutating paths even with foreign Origin", async () => {
    const req = new NextRequest("http://localhost:3000/api/webhooks/jira", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://jira.atlassian.com",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(200);
  });

  it("returns 403 forbidden_origin with security headers when Origin does not match Host", async () => {
    const req = new NextRequest("http://localhost:3000/api/register", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "https://attacker.com",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: "forbidden_origin" });
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("returns 403 on port mismatch in Origin", async () => {
    const req = new NextRequest("http://localhost:3000/api/issues/1/comments", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3001",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "forbidden_origin" });
  });

  it("returns 403 on subdomain mismatch in Origin", async () => {
    const req = new NextRequest("https://example.com/api/users/1/role", {
      method: "PATCH",
      headers: {
        host: "example.com",
        origin: "https://sub.example.com",
      },
    });
    const res = await proxy(req);
    expect(res.status).toBe(403);
  });
});
