"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNotifications, useUnreadCount, useMarkNotifications } from "@/hooks/use-notifications";
import { timeAgo } from "@/lib/utils";

export function NotificationBell() {
  const unread = useUnreadCount();
  const { data } = useNotifications(20);
  const markRead = useMarkNotifications();
  const [open, setOpen] = useState(false);
  const items = data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
          {items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No notifications.</p>
          )}
          {items.map((n) => (
            <div key={n.id} className="rounded-md border p-3 text-sm hover:bg-accent/40">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                {!n.read && <Badge variant="info">new</Badge>}
              </div>
              {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                {n.link && (
                  <Link
                    href={n.link}
                    onClick={() => {
                      markRead([n.id]);
                      setOpen(false);
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    Open
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
