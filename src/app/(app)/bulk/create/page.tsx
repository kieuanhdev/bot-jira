import { Suspense } from "react";
import { BulkCreateClient } from "./bulk-create-client";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Tạo task hàng loạt" };

export default function BulkCreatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-5">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      }
    >
      <BulkCreateClient />
    </Suspense>
  );
}
