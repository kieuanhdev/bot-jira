import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession, isAdmin } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { adminKeys } from "@/lib/query-keys";
import { listAdminProjectSync } from "@/lib/admin/project-sync";
import { listSentryImports } from "@/lib/admin/sentry";
import { logSwallowed } from "@/lib/logger";
import { PageContainer } from "@/components/shared/page-container";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

/** Admin console: server-gated so non-admins never receive the pages. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/board");

  const queryClient = getServerQueryClient();

  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: adminKeys.projects,
        queryFn: async () => ({
          items: await listAdminProjectSync(),
          generatedAt: new Date().toISOString(),
        }),
      }),
      queryClient.prefetchQuery({
        queryKey: adminKeys.sentryList("review"),
        queryFn: () => listSentryImports("review"),
      }),
    ]);
  } catch (err) {
    logSwallowed("admin.layout.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageContainer size="wide">
        <div className="flex flex-col gap-4">
          <AdminNav />
          {children}
        </div>
      </PageContainer>
    </HydrationBoundary>
  );
}
