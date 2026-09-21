import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

let initialized = false;
function ensurePush() {
  if (initialized) return true;
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  initialized = true;
  return true;
}

export async function sendPush(
  userId: string,
  payload: { title: string; body?: string; url?: string }
): Promise<void> {
  if (!ensurePush()) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pushSubscription: true },
  });
  if (!user?.pushSubscription) return;
  const sub = user.pushSubscription as unknown as webpush.PushSubscription;
  await webpush.sendNotification(sub, JSON.stringify(payload));
}
