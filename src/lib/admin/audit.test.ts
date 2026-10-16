import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAuditEntries } from "./audit";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    auditLog: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

describe("src/lib/admin/audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches audit logs with default limit and converts dates to ISO strings", async () => {
    const testDate = new Date("2026-10-16T08:30:00.000Z");
    prismaMock.auditLog.findMany.mockResolvedValueOnce([
      {
        id: "audit-1",
        createdAt: testDate,
        actorEmail: "admin@test.com",
        action: "project.sync_enable",
        target: "PROJ-1",
        source: "web",
      },
    ]);

    const result = await listAuditEntries();

    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: expect.any(Object),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("audit-1");
    expect(result.items[0].createdAt).toBe("2026-10-16T08:30:00.000Z");
  });

  it("clamps limit within [1, 100]", async () => {
    prismaMock.auditLog.findMany.mockResolvedValue([]);

    await listAuditEntries(200);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );

    await listAuditEntries(0);
    expect(prismaMock.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 1 })
    );
  });
});
