import { describe, expect, it } from "vitest";
import {
  HEALTH_CONFIG,
  HEALTH_THEME,
  PORTFOLIO_HEALTH_CONFIG,
  getHealthConfig,
  getHealthTheme,
} from "./health-style";

describe("health-style", () => {
  it("provides HEALTH_CONFIG with expected variants and icons", () => {
    expect(HEALTH_CONFIG.at_risk.variant).toBe("danger");
    expect(HEALTH_CONFIG.attention.variant).toBe("warning");
    expect(HEALTH_CONFIG.healthy.variant).toBe("success");
    expect(HEALTH_CONFIG.completed.variant).toBe("info");
    expect(HEALTH_CONFIG.unknown.variant).toBe("secondary");

    // Table labels
    expect(HEALTH_CONFIG.healthy.label).toBe("Ổn định");
    expect(HEALTH_CONFIG.completed.label).toBe("Hoàn thành");
  });

  it("provides HEALTH_THEME with borders, backgrounds, and summary labels", () => {
    expect(HEALTH_THEME.at_risk.cardBorder).toContain("border-red-500");
    expect(HEALTH_THEME.healthy.label).toBe("Đúng tiến độ");
    expect(HEALTH_THEME.completed.label).toBe("Hoàn thành");
    expect(HEALTH_THEME.unknown.label).toBe("Chưa đủ dữ liệu");
  });

  it("provides PORTFOLIO_HEALTH_CONFIG with ring styles and portfolio labels", () => {
    expect(PORTFOLIO_HEALTH_CONFIG.at_risk.ring).toBe("ring-2 ring-red-500");
    expect(PORTFOLIO_HEALTH_CONFIG.attention.ring).toBe("ring-2 ring-amber-500");
    expect(PORTFOLIO_HEALTH_CONFIG.healthy.ring).toBe("ring-2 ring-emerald-500");
    expect(PORTFOLIO_HEALTH_CONFIG.completed.ring).toBe("ring-2 ring-teal-500");
    expect(PORTFOLIO_HEALTH_CONFIG.completed.label).toBe("Đã hoàn thành");
  });

  it("getHealthTheme falls back to unknown when status is missing or invalid", () => {
    expect(getHealthTheme(null)).toBe(HEALTH_THEME.unknown);
    expect(getHealthTheme(undefined)).toBe(HEALTH_THEME.unknown);
    expect(getHealthTheme("healthy")).toBe(HEALTH_THEME.healthy);
  });

  it("getHealthConfig falls back to unknown when status is missing or invalid", () => {
    expect(getHealthConfig(null)).toBe(HEALTH_CONFIG.unknown);
    expect(getHealthConfig(undefined)).toBe(HEALTH_CONFIG.unknown);
    expect(getHealthConfig("at_risk")).toBe(HEALTH_CONFIG.at_risk);
  });
});
