"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function UserActivityTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedRef = useRef<{ path: string; time: number }>({ path: "", time: 0 });

  useEffect(() => {
    if (!pathname) return;

    const queryString = searchParams?.toString();
    const fullPath = queryString ? `${pathname}?${queryString}` : pathname;
    const now = Date.now();

    // Throttle duplicate tracking for the exact same path within 10 seconds
    if (lastTrackedRef.current.path === fullPath && now - lastTrackedRef.current.time < 10_000) {
      return;
    }

    lastTrackedRef.current = { path: fullPath, time: now };

    const payload = JSON.stringify({
      path: fullPath,
      eventType: "page_view",
      action: "page.view",
      description: typeof document !== "undefined" && document.title ? document.title : `Truy cập ${fullPath}`,
    });

    try {
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/activity/track", blob);
      } else {
        fetch("/api/activity/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // Ignore background tracking failures
    }
  }, [pathname, searchParams]);

  return null;
}
