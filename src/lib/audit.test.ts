import { describe, it, expect, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { auditLog: { create: vi.fn().mockResolvedValue({ id: "a1" }) } },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { audit } from "./audit";

// Prisma casts JSON values to `Prisma.InputJsonValue`, which may wrap them as
// `{ toJSON(): ... }` (including nested objects/arrays). Unwrap recursively.
function unwrap(v: unknown): unknown {
  if (v && typeof v === "object" && "toJSON" in v) {
    return unwrap((v as { toJSON: () => unknown }).toJSON());
  }
  if (Array.isArray(v)) return v.map(unwrap);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = unwrap(val);
    return out;
  }
  return v;
}
type Call = { data: { before?: unknown; after?: unknown } };
// mock.calls accumulates across tests; read the most recent call.
function lastCall(): Call {
  const calls = prismaMock.auditLog.create.mock.calls;
  return calls[calls.length - 1][0] as Call;
}

describe("audit redaction", () => {
  it("redacts secret-looking fields by key", async () => {
    await audit({ action: "x", after: { jiraToken: "abc", name: "ok" } });
    expect(unwrap(lastCall().data.after)).toEqual({ jiraToken: "[redacted]", name: "ok" });
  });

  it("redacts long base64/hex values regardless of key", async () => {
    await audit({ action: "x", after: { value: "A".repeat(64) } });
    expect(unwrap(lastCall().data.after)).toEqual({ value: "[redacted]" });
  });

  it("stores long text fields as a prefix + hash", async () => {
    const body = "x".repeat(500);
    await audit({ action: "x", after: { description: body } });
    const after = unwrap(lastCall().data.after) as { description: { text: string; hash: string } };
    expect(after.description.text.length).toBe(160);
    expect(after.description.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("uses JsonNull (not JS null) for absent before/after", async () => {
    await audit({ action: "x" });
    const arg = lastCall();
    expect(arg.data.before).toBeDefined();
    expect(arg.data.after).toBeDefined();
  });

  it("does not throw when prisma fails (audit is best-effort)", async () => {
    prismaMock.auditLog.create.mockRejectedValueOnce(new Error("db down"));
    const id = await audit({ action: "y" });
    expect(id).toBeNull();
  });
});
