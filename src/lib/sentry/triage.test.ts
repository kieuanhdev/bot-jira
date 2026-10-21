import { describe, it, expect } from "vitest";
import { triageIssue, compareTriage } from "./triage";

describe("triageIssue", () => {
  it("flags telemetry and info-level issues as noise", () => {
    expect(triageIssue({ level: "info", title: "FaceChecking.summary: success" }).tier).toBe("noise");
    expect(triageIssue({ level: "info", title: "Something else" }).tier).toBe("noise");
    expect(triageIssue({ level: "error", title: "_Exception: Exception: test" }).tier).toBe("noise");
  });

  it("flags expected client-side failures even when fatal", () => {
    const t = triageIssue({ level: "fatal", title: "LocationServiceDisabledException: The location service on the device is disabled." });
    expect(t).toEqual({ tier: "noise", reason: expect.any(String) });
    expect(triageIssue({ level: "fatal", title: "DioException [bad response]: status code of 401" }).tier).toBe("noise");
  });

  it("keeps real crashes critical", () => {
    expect(triageIssue({ level: "fatal", title: "TypeError: Null check operator used on a null value" }).tier).toBe("critical");
    expect(triageIssue({ level: "fatal", title: "ApplicationNotResponding: ANR" }).tier).toBe("critical");
  });

  it("treats warnings as normal", () => {
    expect(triageIssue({ level: "warning", title: "Slow query" }).tier).toBe("normal");
  });
});

describe("compareTriage", () => {
  it("orders critical before noise, then by event count", () => {
    const a = { level: "info", title: "x", eventCount: 999 };
    const b = { level: "fatal", title: "y", eventCount: 1 };
    const c = { level: "fatal", title: "z", eventCount: 50 };
    expect([a, b, c].sort(compareTriage)).toEqual([c, b, a]);
  });

  it("pushes hot issues to the top within the same tier (critical)", () => {
    const normalCrit = { level: "fatal", title: "Fatal 1", eventCount: 100, hot: false };
    const hotCrit = { level: "fatal", title: "Fatal 2", eventCount: 60, hot: true };
    // Even though normalCrit has higher eventCount, hotCrit comes first
    expect([normalCrit, hotCrit].sort(compareTriage)).toEqual([hotCrit, normalCrit]);
  });

  it("pushes hot issues to the top within the same tier (normal)", () => {
    const normalWarn = { level: "warning", title: "Slow query", eventCount: 100, hot: false };
    const hotWarn = { level: "warning", title: "Network lag", eventCount: 60, isHot: true };
    expect([normalWarn, hotWarn].sort(compareTriage)).toEqual([hotWarn, normalWarn]);
  });

  it("does not elevate noise issues above critical/normal even if hot", () => {
    const hotNoise = { level: "info", title: "Telemetry burst", eventCount: 500, hot: true };
    const normalCrit = { level: "fatal", title: "Null check", eventCount: 10, hot: false };
    expect([hotNoise, normalCrit].sort(compareTriage)).toEqual([normalCrit, hotNoise]);
  });
});

