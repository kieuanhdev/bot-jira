import { prisma } from "@/lib/prisma";

export interface AuditEntryItem {
  id: string;
  createdAt: string;
  actorEmail: string | null;
  action: string;
  target: string | null;
  source: string | null;
}

export async function listAuditEntries(limit: number = 20): Promise<{ items: AuditEntryItem[] }> {
  const safeLimit = Math.max(1, Math.min(100, Number.isNaN(limit) ? 20 : limit));

  const items = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      createdAt: true,
      actorEmail: true,
      action: true,
      target: true,
      source: true,
    },
  });

  return {
    items: items.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
    })),
  };
}
