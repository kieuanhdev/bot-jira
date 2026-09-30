import { Suspense } from "react";
import { StaleClient } from "./stale-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Phân tích task tồn đọng" };

export default function StalePage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 p-6">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-36 rounded-lg" />
            ))}
          </div>
        </div>
      }
    >
      <StaleClient />
    </Suspense>
  );
}

