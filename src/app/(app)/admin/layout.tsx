import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession, isAdmin } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { adminKeys } from "@/lib/query-keys";
import { listAdminProjectSync } from "@/lib/admin/project-sync";
import { logSwallowed } from "@/lib/logger";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

/** Admin console: server-gated so non-admins never receive the pages. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/board");

  const queryClient = getServerQueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: adminKeys.projects,
      queryFn: async () => ({
        items: await listAdminProjectSync(),
        generatedAt: new Date().toISOString(),
      }),
    });
  } catch (err) {
    logSwallowed("admin.layout.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex flex-col gap-4">
        <AdminNav />
        {children}
      </div>
    </HydrationBoundary>
  );
}
