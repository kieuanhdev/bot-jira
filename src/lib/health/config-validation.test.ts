import { describe, it, expect } from "vitest";
import { validateJiraSyncTiming, validateWorkerStartup } from "./config-validation";

describe("validateJiraSyncTiming", () => {
  it("passes with valid default configuration", () => {
    const result = validateJiraSyncTiming({});
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("passes with valid custom configuration", () => {
    const result = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "600",
      JIRA_HEARTBEAT_SECONDS: "60",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("fails when heartbeat is a decimal number", () => {
    const result = validateJiraSyncTiming({
      JIRA_HEARTBEAT_SECONDS: "45.5",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("JIRA_HEARTBEAT_SECONDS must be an integer");
  });

  it("fails when expire is a decimal number", () => {
    const result = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "300.2",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("JIRA_SYNC_EXPIRE_SECONDS must be an integer");
  });

  it("fails when heartbeat is greater than or equal to expiry", () => {
    const result = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "300",
      JIRA_HEARTBEAT_SECONDS: "300",
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("JIRA_HEARTBEAT_SECONDS must be strictly less than JIRA_SYNC_EXPIRE_SECONDS");

    const result2 = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "200",
      JIRA_HEARTBEAT_SECONDS: "250",
    });
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContain("JIRA_HEARTBEAT_SECONDS must be strictly less than JIRA_SYNC_EXPIRE_SECONDS");
  });

  it("fails when values are negative", () => {
    const resultNegativeHeartbeat = validateJiraSyncTiming({
      JIRA_HEARTBEAT_SECONDS: "-15",
    });
    expect(resultNegativeHeartbeat.valid).toBe(false);
    expect(resultNegativeHeartbeat.errors).toContain("JIRA_HEARTBEAT_SECONDS cannot be negative");

    const resultNegativeExpire = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "-300",
    });
    expect(resultNegativeExpire.valid).toBe(false);
    expect(resultNegativeExpire.errors).toContain("JIRA_SYNC_EXPIRE_SECONDS cannot be negative");
  });

  it("fails when values are below minimum thresholds", () => {
    const resultLowExpire = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "100",
    });
    expect(resultLowExpire.valid).toBe(false);
    expect(resultLowExpire.errors).toContain("JIRA_SYNC_EXPIRE_SECONDS must be at least 120 seconds");

    const resultLowHeartbeat = validateJiraSyncTiming({
      JIRA_HEARTBEAT_SECONDS: "5",
    });
    expect(resultLowHeartbeat.valid).toBe(false);
    expect(resultLowHeartbeat.errors).toContain("JIRA_HEARTBEAT_SECONDS must be at least 10 seconds");
  });

  it("warns when heartbeat is greater than expire / 3", () => {
    const result = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "150",
      JIRA_HEARTBEAT_SECONDS: "60",
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toContain("JIRA_HEARTBEAT_SECONDS is recommended to be <= JIRA_SYNC_EXPIRE_SECONDS / 3");
  });

  it("does not leak secret values in error messages", () => {
    const result = validateJiraSyncTiming({
      JIRA_SYNC_EXPIRE_SECONDS: "SECRET_VALUE_123",
      JIRA_HEARTBEAT_SECONDS: "SECRET_PASS_456",
    });
    expect(result.valid).toBe(false);
    for (const err of result.errors) {
      expect(err).not.toContain("SECRET_VALUE_123");
      expect(err).not.toContain("SECRET_PASS_456");
      expect(err).toMatch(/JIRA_SYNC_EXPIRE_SECONDS|JIRA_HEARTBEAT_SECONDS/);
    }
  });
});

describe("validateWorkerStartup", () => {
  it("includes timing errors in worker startup validation", () => {
    const errors = validateWorkerStartup({
      DATABASE_URL: "postgresql://localhost:5432/db",
      JIRA_HEARTBEAT_SECONDS: "999",
      JIRA_SYNC_EXPIRE_SECONDS: "120",
    });
    expect(errors).toContain("JIRA_HEARTBEAT_SECONDS must be strictly less than JIRA_SYNC_EXPIRE_SECONDS");
  });
});
