import { describe, expect, it } from "vitest";
import { describeImageFailure } from "./wiki-content";

describe("describeImageFailure", () => {
  it("explains the failures the attachment proxy can report", () => {
    expect(describeImageFailure(404, "attachment_not_found")).toContain("không có file đính kèm");
    expect(describeImageFailure(404, "issue_unavailable")).toContain("token");
    expect(describeImageFailure(502, "attachment_fetch_failed")).toContain("quyền");
    expect(describeImageFailure(401, "unauthorized")).toContain("đăng nhập");
    expect(describeImageFailure(401, null)).toContain("token Jira");
  });

  it("falls back to the raw status for anything else", () => {
    expect(describeImageFailure(500, "boom")).toBe("Lỗi 500 (boom).");
  });
});
