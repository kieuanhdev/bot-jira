import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { ImpersonationBanner } from "./impersonation-banner";

describe("ImpersonationBanner", () => {
  it("renders impersonated user and impersonator info correctly", () => {
    const props = {
      user: {
        id: "u1",
        name: "Nguyen Van A",
        jiraUsername: "vana",
        email: "vana@company.com",
      },
      impersonator: {
        id: "admin-1",
        name: "Admin Boss",
        email: "admin@company.com",
        role: "admin",
      },
      onOpenSwitcher: () => {},
    };

    const html = renderToString(React.createElement(ImpersonationBanner, props));
    expect(html).toContain("Nguyen Van A");
    expect(html).toContain("@vana");
    expect(html).toContain("Admin Boss");
    expect(html).toContain("Quay lại Admin");
    expect(html).toContain("Đổi người khác");
  });
});
