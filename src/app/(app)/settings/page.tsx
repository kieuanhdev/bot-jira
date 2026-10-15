import { prisma } from "@/lib/prisma";
import { getSession, isAdmin } from "@/lib/session";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await getSession();
  const admin = isAdmin(session);
  const users = admin
    ? await prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, displayName: true, jiraUsername: true, role: true, createdAt: true },
      })
    : [];
  return <SettingsClient users={users} isAdmin={admin} />;
}
