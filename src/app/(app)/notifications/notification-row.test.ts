import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { NotificationRow } from "./notification-row";
import type { Notification } from "@/hooks/use-notifications";

const sampleNotification: Notification = {
  id: "notif-1",
  type: "issue_comment",
  title: "Bình luận mới trên DEV-123",
  body: "Nội dung thông báo thử nghiệm rất dài để kiểm tra chức năng xem thêm trong danh sách thông báo của người dùng khi nhấn vô xem thông báo.",
  link: "/issue/DEV-123",
  sourceLink: "https://jira.example.com/browse/DEV-123",
  sourceType: "jira",
  read: false,
  readAt: null,
  createdAt: new Date().toISOString(),
};

describe("NotificationRow", () => {
  it("renders unread notification with 'Mới' badge and action links", () => {
    const html = renderToString(
      React.createElement(NotificationRow, {
        notification: sampleNotification,
        isSelected: false,
        isExpanded: false,
        onCardClick: vi.fn(),
        onToggleSelect: vi.fn(),
        onToggleRead: vi.fn(),
        onDeleteSingle: vi.fn(),
        onToggleExpand: vi.fn(),
        onMarkRead: vi.fn(),
      })
    );

    expect(html).toContain("Bình luận mới trên DEV-123");
    expect(html).toContain("Mới");
    expect(html).toContain("Mở trên web");
    expect(html).toContain("Mở trên Jira");
    expect(html).toContain("Đã đọc");
  });

  it("renders read notification without 'Mới' badge and with 'Chưa đọc' toggle", () => {
    const html = renderToString(
      React.createElement(NotificationRow, {
        notification: { ...sampleNotification, read: true },
        isSelected: false,
        isExpanded: false,
        onCardClick: vi.fn(),
        onToggleSelect: vi.fn(),
        onToggleRead: vi.fn(),
        onDeleteSingle: vi.fn(),
        onToggleExpand: vi.fn(),
        onMarkRead: vi.fn(),
      })
    );

    expect(html).not.toContain(">Mới<");
    expect(html).toContain("Chưa đọc");
  });

  it("renders 'Xem thêm' button for long body content", () => {
    const longBody = "A".repeat(150);
    const html = renderToString(
      React.createElement(NotificationRow, {
        notification: { ...sampleNotification, body: longBody },
        isSelected: false,
        isExpanded: false,
        onCardClick: vi.fn(),
        onToggleSelect: vi.fn(),
        onToggleRead: vi.fn(),
        onDeleteSingle: vi.fn(),
        onToggleExpand: vi.fn(),
        onMarkRead: vi.fn(),
      })
    );

    expect(html).toContain("Xem thêm");
  });
});
