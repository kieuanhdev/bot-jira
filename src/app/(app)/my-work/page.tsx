import { redirect } from "next/navigation";
import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getSession } from "@/lib/session";
import { getServerQueryClient } from "@/lib/query-server";
import { myWorkKeys } from "@/lib/query-keys";
import { getMyWorkSummary } from "@/lib/my-work/service";
import { logSwallowed } from "@/lib/logger";
import { MyWorkClient } from "./my-work-client";
import MyWorkLoading from "./loading";

export const metadata = {
  title: "Việc của tôi · Personal Cockpit",
  description: "Trung tâm quản lý công việc và đo lường hiệu suất cá nhân hóa.",
};

export default async function MyWorkPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const queryClient = getServerQueryClient();

  try {
    await queryClient.prefetchQuery({
      queryKey: myWorkKeys.summary(),
      queryFn: () => getMyWorkSummary(session.user),
    });
  } catch (err) {
    logSwallowed("my-work.prefetch", err);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<MyWorkLoading />}>
        <MyWorkClient />
      </Suspense>
    </HydrationBoundary>
  );
}
