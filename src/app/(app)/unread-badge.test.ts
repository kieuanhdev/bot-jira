import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { UnreadBadge } from "./unread-badge";

const mocks = vi.hoisted(() => ({
  unreadCount: vi.fn(),
}));

vi.mock("@/hooks/use-notifications", () => ({
  useUnreadCount: () => mocks.unreadCount(),
}));

describe("UnreadBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders null when unreadCount is 0", () => {
    mocks.unreadCount.mockReturnValue(0);
    const html = renderToString(React.createElement(UnreadBadge));
    expect(html).toBe("");
  });

  it("renders null when unreadCount is negative", () => {
    mocks.unreadCount.mockReturnValue(-1);
    const html = renderToString(React.createElement(UnreadBadge));
    expect(html).toBe("");
  });

  it("renders inline badge with exact count when unreadCount <= 99", () => {
    mocks.unreadCount.mockReturnValue(5);
    const html = renderToString(React.createElement(UnreadBadge, { variant: "inline" }));
    expect(html).toContain("5");
    expect(html).toContain("bg-destructive");
  });

  it("renders 99+ when unreadCount > 99", () => {
    mocks.unreadCount.mockReturnValue(120);
    const html = renderToString(React.createElement(UnreadBadge, { variant: "inline" }));
    expect(html).toContain("99+");
  });

  it("renders collapsed variant with border ring and positioning", () => {
    mocks.unreadCount.mockReturnValue(3);
    const html = renderToString(React.createElement(UnreadBadge, { variant: "collapsed" }));
    expect(html).toContain("3");
    expect(html).toContain("ring-card");
    expect(html).toContain("-top-1");
  });

  it("renders mobile-bell variant with mobile positioning", () => {
    mocks.unreadCount.mockReturnValue(8);
    const html = renderToString(React.createElement(UnreadBadge, { variant: "mobile-bell" }));
    expect(html).toContain("8");
    expect(html).toContain("top-1 right-1");
  });

  it("merges custom className", () => {
    mocks.unreadCount.mockReturnValue(2);
    const html = renderToString(
      React.createElement(UnreadBadge, { className: "custom-unread-class" })
    );
    expect(html).toContain("custom-unread-class");
  });
});
