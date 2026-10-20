import { describe, expect, it } from "vitest";
import { notificationEventQueryKeys } from "./notification-events-keys";
import { notificationsKeys } from "@/lib/query-keys";

describe("notificationEventQueryKeys", () => {
  it("only invalidates notifications, never issues or branches", () => {
    expect(notificationEventQueryKeys()).toEqual([notificationsKeys.all]);
  });
});
