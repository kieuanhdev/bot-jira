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

  it("matches names that differ in spaces, underscores or URL encoding", () => {
    const list = [{ id: "7", filename: "Screenshot_from_2026-10-09.png" }];
    expect(pickAttachment(list, "Screenshot from 2026-10-09.png")?.id).toBe("7");
    expect(pickAttachment(list, "Screenshot%20from%202026-10-09.png")?.id).toBe("7");
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

describe("attachments by id, listing and download", () => {
  const BASE = "https://jira.example.test";
  const files = [
    { id: "10", filename: "shot.png", mimeType: "image/png", size: 4, created: "2026-03-01T00:00:00.000+0700", author: { displayName: "An" } },
    { id: "11", filename: "báo cáo.pdf", mimeType: "application/pdf", size: 8, created: "2026-04-01T00:00:00.000+0700" },
  ];

  async function setup(fetchImpl: (u: string) => Promise<Response> = async () => new Response("x")) {
    vi.resetModules();
    vi.doMock("@/lib/session", () => ({ getSession: async () => ({ user: { id: "u1" } }) }));
    vi.doMock("@/lib/prisma", () => ({ prisma: { user: { findUnique: async () => ({}) } } }));
    vi.doMock("@/lib/user-creds", () => ({ userJiraAuth: () => ({ user: "u", token: "t", authMode: "Bearer" }) }));
    vi.doMock("@/lib/env", () => ({ env: { jiraBaseUrl: BASE } }));
    vi.doMock("@/lib/rate-limit", () => ({ checkAuthRateLimit: () => true }));
    vi.doMock("@/lib/jira/client", () => ({
      getSystemJiraAuth: async () => null,
      jiraWith: () => ({ getIssue: async () => ({ fields: { attachment: files } }) }),
    }));
    vi.stubGlobal("fetch", async (u: string) => fetchImpl(String(u)));
    return import("./attachment-route-service");
  }
  const get = (qs: string) => new Request(`http://app/api/jira/attachment?${qs}`);

  it("lists files newest first with an image flag", async () => {
    const { handleAttachmentListRequest } = await setup();
    const body = await (await handleAttachmentListRequest("abc-1")).json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(["11", "10"]);
    expect(body.items[0]).toMatchObject({ filename: "báo cáo.pdf", isImage: false });
    expect(body.items[1]).toMatchObject({ isImage: true, author: "An" });
  });

  it("rejects an invalid issue key when listing", async () => {
    const { handleAttachmentListRequest } = await setup();
    expect((await handleAttachmentListRequest("nope")).status).toBe(400);
  });

  it("serves an image inline by id", async () => {
    const { handleAttachmentRequest } = await setup(
      async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })
    );
    const res = await handleAttachmentRequest(get("key=ABC-1&id=10"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("refuses to show a non-image inline", async () => {
    const { handleAttachmentRequest } = await setup();
    expect((await handleAttachmentRequest(get("key=ABC-1&id=11"))).status).toBe(404);
  });

  it("serves any file as a download with a safe filename", async () => {
    const { handleAttachmentRequest } = await setup(
      async () => new Response("pdfbytes", { headers: { "content-type": "application/pdf" } })
    );
    const res = await handleAttachmentRequest(get("key=ABC-1&id=11&download=1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment;");
    expect(disposition).toContain("filename*=UTF-8''b%C3%A1o%20c%C3%A1o.pdf");
  });

  it("treats a login page returned for a download as a failure", async () => {
    const { handleAttachmentRequest } = await setup(
      async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })
    );
    expect((await handleAttachmentRequest(get("key=ABC-1&id=11&download=1"))).status).toBe(502);
  });

  it("does not serve an id that is not on this issue", async () => {
    const { handleAttachmentRequest } = await setup();
    expect((await handleAttachmentRequest(get("key=ABC-1&id=999&download=1"))).status).toBe(404);
  });
});
