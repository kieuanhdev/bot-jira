import { describe, expect, it } from "vitest";
import { resolveTheme, THEME_TOGGLE_ENABLED, THEME_STORAGE_KEY } from "./theme";

describe("theme infrastructure", () => {
  it("keeps THEME_TOGGLE_ENABLED false in phase 1", () => {
    expect(THEME_TOGGLE_ENABLED).toBe(false);
  });

  it("uses standard 'theme' storage key", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
  });

  describe("resolveTheme", () => {
    it("resolves 'light' preference to 'light' regardless of system setting", () => {
      expect(resolveTheme("light", true)).toBe("light");
      expect(resolveTheme("light", false)).toBe("light");
    });

    it("resolves 'dark' preference to 'dark' regardless of system setting", () => {
      expect(resolveTheme("dark", true)).toBe("dark");
      expect(resolveTheme("dark", false)).toBe("dark");
    });

    it("resolves 'system' preference based on systemDark flag", () => {
      expect(resolveTheme("system", true)).toBe("dark");
      expect(resolveTheme("system", false)).toBe("light");
    });
  });
});
