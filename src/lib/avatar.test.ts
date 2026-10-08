import { describe, expect, it } from "vitest";
import { AVATAR_PALETTE, avatarClass, initials } from "./avatar";

describe("avatar helpers", () => {
  it("returns the semantic fallback class when no identifier exists", () => {
    expect(avatarClass(null)).toBe("bg-muted text-muted-foreground");
    expect(avatarClass(undefined)).toBe("bg-muted text-muted-foreground");
    expect(avatarClass("")).toBe("bg-muted text-muted-foreground");
  });

  it("maps an identifier to a stable palette class", () => {
    expect(avatarClass("alice")).toBe(
      "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
    );
    expect(avatarClass("Bob Developer")).toBe(
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
    );
    expect(AVATAR_PALETTE).toContain(avatarClass("john.doe"));
  });

  it("builds initials from common Jira display-name separators", () => {
    expect(initials("Jane Doe")).toBe("JD");
    expect(initials("john.doe")).toBe("JD");
    expect(initials("user_name-extra")).toBe("UE");
  });

  it("keeps the existing empty and single-part fallbacks", () => {
    expect(initials(null)).toBe("?");
    expect(initials("alice")).toBe("AL");
    expect(initials("   ")).toBe(" ");
  });
});
