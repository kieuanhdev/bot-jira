import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSession, isAdmin } from "@/lib/session";
import { PageContainer } from "@/components/shared/page-container";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

/** Admin console: server-gated so non-admins never receive the pages. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  if (!isAdmin(session)) redirect("/board");

  return (
    <PageContainer size="wide">
      <div className="flex flex-col gap-4">
        <AdminNav />
        {children}
      </div>
    </PageContainer>
  );
}
