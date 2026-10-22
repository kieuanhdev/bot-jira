import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

export type ActivityEventType = "page_view" | "action" | "auth";

export interface RecordActivityInput {
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  eventType: ActivityEventType;
  action: string;
  description?: string | null;
  path: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface ActivityFilterOptions {
  userId?: string;
  eventType?: string;
  range?: "today" | "7d" | "30d" | "all";
  q?: string;
  page?: number;
  limit?: number;
}

export interface ActivityMetrics {
  onlineCount: number;
  activeUsersToday: number;
  totalViewsToday: number;
  totalActionsToday: number;
}

/**
 * Lightweight User-Agent parser to avoid pulling heavy external dependencies.
 * Returns human-friendly string like "Chrome · Windows", "Safari · macOS", "iOS · Safari".
 */
export function parseUserAgent(ua?: string | null): string {
  if (!ua) return "Không rõ";

  let browser = "Khác";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/curl|Postman|bot/i.test(ua)) browser = "Bot/Script";

  let os = "";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Macintosh|Mac OS X/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}

/**
 * Clean path to avoid logging tokens or sensitive query parameters.
 */
export function sanitizePath(rawPath: string): string {
  if (!rawPath) return "/";
  try {
    const url = new URL(rawPath, "http://localhost");
    const safeSearchParams = new URLSearchParams();
    for (const [key, val] of url.searchParams.entries()) {
      if (/token|secret|password|key|auth/i.test(key)) {
        safeSearchParams.set(key, "[redacted]");
      } else {
        safeSearchParams.set(key, val);
      }
    }
    const query = safeSearchParams.toString();
    return query ? `${url.pathname}?${query}` : url.pathname;
  } catch {
    return rawPath.slice(0, 255);
  }
}

/**
 * Asynchronously records user activity.
 * Always fail-safe: failures are logged but never throw.
 */
export async function recordActivity(input: RecordActivityInput): Promise<string | null> {
  if (!prisma.userActivity) {
    logger.warn({ message: "prisma.userActivity is not available on current client" });
    return null;
  }
  try {
    const safePath = sanitizePath(input.path);
    const row = await prisma.userActivity.create({
      data: {
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        userEmail: input.userEmail ?? null,
        eventType: input.eventType,
        action: input.action.slice(0, 64),
        description: input.description ? input.description.slice(0, 255) : null,
        path: safePath.slice(0, 500),
        userAgent: input.userAgent ? parseUserAgent(input.userAgent) : null,
        ipAddress: input.ipAddress ? input.ipAddress.slice(0, 45) : null,
        metadata: input.metadata ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    logger.warn({
      message: "recordActivity write failed",
      error: (err as Error).message,
      path: input.path,
    });
    return null;
  }
}

/**
 * Returns summary metrics for the admin activity dashboard.
 */
export async function getActivityMetrics(): Promise<ActivityMetrics> {
  if (!prisma.userActivity) {
    logger.warn({ message: "prisma.userActivity is not available on current client" });
    return {
      onlineCount: 0,
      activeUsersToday: 0,
      totalViewsToday: 0,
      totalActionsToday: 0,
    };
  }

  try {
    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. Online count: unique users with activity in last 15 minutes
    const recentActivities = await prisma.userActivity.findMany({
      where: { createdAt: { gte: fifteenMinutesAgo } },
      select: { userId: true, userEmail: true, ipAddress: true },
    });

    const onlineUserKeys = new Set<string>();
    for (const act of recentActivities) {
      const key = act.userId || act.userEmail || act.ipAddress || "unknown";
      onlineUserKeys.add(key);
    }

    // 2. Active users today: distinct users with activity since start of today
    const todayActivities = await prisma.userActivity.findMany({
      where: { createdAt: { gte: startOfToday } },
      select: { userId: true, userEmail: true },
    });

    const activeTodayKeys = new Set<string>();
    for (const act of todayActivities) {
      const key = act.userId || act.userEmail;
      if (key) activeTodayKeys.add(key);
    }

    // 3. Total page views today
    const totalViewsToday = await prisma.userActivity.count({
      where: {
        createdAt: { gte: startOfToday },
        eventType: "page_view",
      },
    });

    // 4. Total actions today
    const totalActionsToday = await prisma.userActivity.count({
      where: {
        createdAt: { gte: startOfToday },
        eventType: "action",
      },
    });

    return {
      onlineCount: onlineUserKeys.size,
      activeUsersToday: activeTodayKeys.size,
      totalViewsToday,
      totalActionsToday,
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2021" || e?.message?.includes("does not exist")) {
      logger.warn({ message: "UserActivity table does not exist in the current database yet." });
      return {
        onlineCount: 0,
        activeUsersToday: 0,
        totalViewsToday: 0,
        totalActionsToday: 0,
      };
    }
    throw err;
  }
}

/**
 * Queries user activities with filtering and pagination.
 */
export async function listUserActivities(options: ActivityFilterOptions = {}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 25));
  const skip = (page - 1) * limit;

  if (!prisma.userActivity) {
    logger.warn({ message: "prisma.userActivity is not available on current client" });
    return {
      items: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 1,
      },
    };
  }

  const where: Prisma.UserActivityWhereInput = {};

  if (options.userId && options.userId !== "all") {
    where.userId = options.userId;
  }

  if (options.eventType && options.eventType !== "all") {
    where.eventType = options.eventType;
  }

  if (options.range && options.range !== "all") {
    const now = new Date();
    if (options.range === "today") {
      where.createdAt = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
    } else if (options.range === "7d") {
      where.createdAt = { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
    } else if (options.range === "30d") {
      where.createdAt = { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
    }
  }

  if (options.q && options.q.trim()) {
    const query = options.q.trim();
    where.OR = [
      { description: { contains: query, mode: "insensitive" } },
      { path: { contains: query, mode: "insensitive" } },
      { userName: { contains: query, mode: "insensitive" } },
      { userEmail: { contains: query, mode: "insensitive" } },
    ];
  }

  try {
    const [total, items] = await Promise.all([
      prisma.userActivity.count({ where }),
      prisma.userActivity.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return {
      items: items.map((i) => ({
        ...i,
        createdAt: i.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2021" || e?.message?.includes("does not exist")) {
      logger.warn({ message: "UserActivity table does not exist in the current database yet." });
      return {
        items: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 1,
        },
      };
    }
    throw err;
  }
}
