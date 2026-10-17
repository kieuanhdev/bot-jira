import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { pickAttachment, isProxiableImage } = await import("./attachment-route-service");

describe("pickAttachment", () => {
  it("prefers the newest exact filename match", () => {
    const picked = pickAttachment(
      [
        { id: "1", filename: "image.png", created: "2026-01-01T00:00:00.000+0700" },
        { id: "2", filename: "image.png", created: "2026-03-01T00:00:00.000+0700" },
        { id: "3", filename: "IMAGE.png", created: "2026-05-01T00:00:00.000+0700" },
      ],
      "image.png"
    );
    expect(picked?.id).toBe("2");
  });

  it("falls back to a case-insensitive match", () => {
    expect(pickAttachment([{ id: "9", filename: "Shot.PNG" }], "shot.png")?.id).toBe("9");
  });

  it("returns null when nothing matches", () => {
    expect(pickAttachment([{ id: "1", filename: "a.png" }], "b.png")).toBeNull();
  });
});

describe("isProxiableImage", () => {
  it("allows raster images and rejects svg and non-images", () => {
    expect(isProxiableImage("image/png")).toBe(true);
    expect(isProxiableImage("image/jpeg; charset=binary")).toBe(true);
    expect(isProxiableImage("image/svg+xml")).toBe(false);
    expect(isProxiableImage("application/pdf")).toBe(false);
    expect(isProxiableImage(undefined)).toBe(false);
  });
});

describe("handleAttachmentRequest", () => {
  const BASE = "https://jira.example.test";
  const png = new Uint8Array([137, 80, 78, 71]);

  async function run(fetchImpl: (url: string) => Promise<Response>, attachments: unknown[]) {
    vi.resetModules();
    vi.doMock("@/lib/session", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));
    vi.doMock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({}) } } }));
    vi.doMock("@/lib/user-creds", () => ({ userJiraAuth: () => ({ user: "u", token: "t", authMode: "Bearer" }) }));
    vi.doMock("@/lib/env", () => ({ env: { jiraBaseUrl: BASE } }));
    vi.doMock("@/lib/rate-limit", () => ({ checkAuthRateLimit: () => true }));
    vi.doMock("@/lib/jira/client", () => ({
      getSystemJiraAuth: async () => null,
      jiraWith: () => ({ getIssue: async () => ({ fields: { attachment: attachments } }) }),
    }));
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      urls.push(String(u));
      return fetchImpl(String(u));
    });
    const { handleAttachmentRequest } = await import("./attachment-route-service");
    const res = await handleAttachmentRequest(
      new Request(`http://app/api/jira/attachment?key=ABC-1&name=${encodeURIComponent("image 1.png")}`)
    );
    return { res, urls };
  }

  const att = [
    {
      id: "100",
      filename: "image 1.png",
      mimeType: "image/png",
      size: 4,
      content: "https://internal-name.example/secure/attachment/100/image%201.png",
    },
  ];
  const ok = () => new Response(png, { status: 200, headers: { "content-type": "image/png" } });

  it("streams the image from the configured Jira base URL", async () => {
    const { res, urls } = await run(async () => ok(), att);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(urls[0]).toBe(`${BASE}/secure/attachment/100/image%201.png`);
  });

  it("falls back to the content path when the first URL fails", async () => {
    const withPath = [{ ...att[0], content: "https://x.example/rest/api/2/attachment/content/100" }];
    const { res, urls } = await run(
      async (u) => (u.includes("/secure/attachment/") ? new Response("no", { status: 404 }) : ok()),
      withPath
    );
    expect(res.status).toBe(200);
    expect(urls[1]).toBe(`${BASE}/rest/api/2/attachment/content/100`);
  });

  it("returns 502 when a login page comes back instead of an image", async () => {
    const { res } = await run(
      async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
      att
    );
    expect(res.status).toBe(502);
  });

  it("returns 404 when the issue has no such attachment", async () => {
    const { res } = await run(async () => ok(), []);
    expect(res.status).toBe(404);
  });
});
