"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { NotificationEvents } from "@/components/notification-events";

export function SessionHydrator({
  session,
  children,
}: {
  session: Session | null;
  children: ReactNode;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <NotificationEvents />
      {children}
    </SessionProvider>
  );
}
