import { Suspense } from "react";
import { BulkClient } from "./bulk-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Bulk edit" };

export default function BulkPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-5">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <BulkClient />
    </Suspense>
  );
}

