import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getBulkOperationStatusText,
  getBulkOperationSeverity,
  formatBulkCompletionSummary,
  buildBulkNotificationPayload,
  getBulkCreateStatusText,
  getBulkCreateSeverity,
  buildBulkCreateNotificationPayload,
  notifyBulkOperationResult,
  notifyResult,
} from "./notification";

vi.mock("@/lib/notify", () => ({
  notifyUser: vi.fn().mockResolvedValue({ id: "notif-1" }),
}));

describe("Bulk Notification Policy & Formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBulkOperationStatusText", () => {
    it("maps terminal operation states to human readable labels", () => {
      expect(getBulkOperationStatusText("completed")).toBe("hoàn tất");
      expect(getBulkOperationStatusText("partially_failed")).toBe("thất bại một phần");
      expect(getBulkOperationStatusText("failed")).toBe("thất bại");
      expect(getBulkOperationStatusText("cancelled")).toBe("thất bại");
      expect(getBulkOperationStatusText("running")).toBe("thất bại");
    });
  });

  describe("getBulkOperationSeverity", () => {
    it("maps operation states to severity tokens", () => {
      expect(getBulkOperationSeverity("completed")).toBe("info");
      expect(getBulkOperationSeverity("partially_failed")).toBe("warning");
      expect(getBulkOperationSeverity("failed")).toBe("danger");
      expect(getBulkOperationSeverity("unknown")).toBe("danger");
    });
  });

  describe("formatBulkCompletionSummary", () => {
    it("formats summary text with succeeded, failed, and skipped tallies", () => {
      expect(formatBulkCompletionSummary(10, 0, 2)).toBe("10 thành công, 0 thất bại, 2 bỏ qua.");
      expect(formatBulkCompletionSummary(0, 5, 0)).toBe("0 thành công, 5 thất bại, 0 bỏ qua.");
      expect(formatBulkCompletionSummary(7, 3, 1)).toBe("7 thành công, 3 thất bại, 1 bỏ qua.");
    });
  });

  describe("buildBulkNotificationPayload", () => {
    it("builds correct payload for completed operation", () => {
      const payload = buildBulkNotificationPayload(
        { id: "op-101", type: "update-fields", requestedBy: "user-1" },
        "completed",
        { succeeded: 5, failed: 0, skipped: 1 }
      );

      expect(payload).toEqual({
        type: "system",
        title: "Thao tác hàng loạt update-fields hoàn tất",
        body: "5 thành công, 0 thất bại, 1 bỏ qua.",
        link: "/bulk?operation=op-101",
        severity: "info",
        eventKey: "bulk:op-101:completed",
      });
    });

    it("builds correct payload for partially_failed operation", () => {
      const payload = buildBulkNotificationPayload(
        { id: "op-102", type: "transition", requestedBy: "user-2" },
        "partially_failed",
        { succeeded: 8, failed: 2, skipped: 0 }
      );

      expect(payload).toEqual({
        type: "system",
        title: "Thao tác hàng loạt transition thất bại một phần",
        body: "8 thành công, 2 thất bại, 0 bỏ qua.",
        link: "/bulk?operation=op-102",
        severity: "warning",
        eventKey: "bulk:op-102:partially_failed",
      });
    });

    it("builds correct payload for failed operation", () => {
      const payload = buildBulkNotificationPayload(
        { id: "op-103", type: "create-branches", requestedBy: "user-3" },
        "failed",
        { succeeded: 0, failed: 4, skipped: 0 }
      );

      expect(payload).toEqual({
        type: "system",
        title: "Thao tác hàng loạt create-branches thất bại",
        body: "0 thành công, 4 thất bại, 0 bỏ qua.",
        link: "/bulk?operation=op-103",
        severity: "danger",
        eventKey: "bulk:op-103:failed",
      });
    });
  });

  describe("Bulk Create Notification formatting", () => {
    it("maps create operation states and severity", () => {
      expect(getBulkCreateStatusText("completed")).toBe("hoàn tất thành công");
      expect(getBulkCreateStatusText("partially_failed")).toBe("thất bại một phần");
      expect(getBulkCreateStatusText("failed")).toBe("thất bại");

      expect(getBulkCreateSeverity("completed")).toBe("success");
      expect(getBulkCreateSeverity("partially_failed")).toBe("warning");
      expect(getBulkCreateSeverity("failed")).toBe("danger");
    });

    it("builds payload for create operation", () => {
      const payload = buildBulkCreateNotificationPayload(
        { id: "create-1", requestedBy: "user-create" },
        "partially_failed",
        12,
        3
      );

      expect(payload).toEqual({
        type: "system",
        title: "Tạo task hàng loạt thất bại một phần",
        body: "12 task đã tạo thành công, 3 task lỗi.",
        link: "/bulk?operation=create-1",
        severity: "warning",
        eventKey: "bulk-create:create-1:partially_failed",
      });
    });
  });

  describe("notifyBulkOperationResult & notifyResult dispatcher", () => {
    it("dispatches notification with injected notifier", async () => {
      const customNotifier = vi.fn().mockResolvedValue(undefined);
      await notifyBulkOperationResult(
        { id: "op-201", type: "set-points", requestedBy: "user-abc" },
        "completed",
        4,
        0,
        1,
        customNotifier
      );

      expect(customNotifier).toHaveBeenCalledTimes(1);
      expect(customNotifier).toHaveBeenCalledWith("user-abc", {
        type: "system",
        title: "Thao tác hàng loạt set-points hoàn tất",
        body: "4 thành công, 0 thất bại, 1 bỏ qua.",
        link: "/bulk?operation=op-201",
        severity: "info",
        eventKey: "bulk:op-201:completed",
      });
    });

    it("silently swallows notifier errors to protect background caller", async () => {
      const failingNotifier = vi.fn().mockRejectedValue(new Error("Delivery timeout"));
      await expect(
        notifyBulkOperationResult(
          { id: "op-202", type: "transition", requestedBy: "user-xyz" },
          "failed",
          0,
          3,
          0,
          failingNotifier
        )
      ).resolves.toBeUndefined();
    });

    it("notifyResult compatibility alias dispatches identically", async () => {
      const customNotifier = vi.fn().mockResolvedValue(undefined);
      await notifyResult(
        { id: "op-203", type: "add-comment", requestedBy: "user-def" },
        "completed",
        2,
        0,
        0,
        customNotifier
      );

      expect(customNotifier).toHaveBeenCalledWith(
        "user-def",
        expect.objectContaining({
          title: "Thao tác hàng loạt add-comment hoàn tất",
          eventKey: "bulk:op-203:completed",
        })
      );
    });
  });
});
