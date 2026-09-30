import { describe, expect, it } from "vitest";
import {
  evaluateStandardization,
  resolvePolicy,
  formatMissingSummary,
  POLICY_VERSION,
} from "./standardization";

describe("standardization evaluator", () => {
  it("satisfies ESTIMATION when points > 0 even without Original Estimate", () => {
    const res = evaluateStandardization({
      points: 3,
      originalEstimateSeconds: null,
      timeSpent: 3600,
      fixVersionNames: ["1.0.0"],
      dueDate: "2026-10-15",
      labels: ["flow-feature"],
    });

    expect(res.status).toBe("complete");
    expect(res.policyId).toBe("planned-work");
    expect(res.policyVersion).toBe(POLICY_VERSION);
    expect(res.satisfied).toContain("ESTIMATION");
    expect(res.missing).not.toContain("ESTIMATION");
  });

  it("satisfies ESTIMATION when originalEstimateSeconds > 0 even if points is null", () => {
    const res = evaluateStandardization({
      points: null,
      originalEstimateSeconds: 7200,
      timeSpent: 3600,
      fixVersionNames: ["1.0.0"],
      dueDate: "2026-10-15",
      labels: ["flow-feature"],
    });

    expect(res.status).toBe("complete");
    expect(res.satisfied).toContain("ESTIMATION");
    expect(res.missing).not.toContain("ESTIMATION");
  });

  it("marks ESTIMATION missing when both points and originalEstimateSeconds are 0 or null", () => {
    const res = evaluateStandardization({
      points: 0,
      originalEstimateSeconds: 0,
      timeSpent: 3600,
      fixVersionNames: ["1.0.0"],
      dueDate: "2026-10-15",
      labels: ["flow-feature"],
    });

    expect(res.status).toBe("incomplete");
    expect(res.missing).toContain("ESTIMATION");
    expect(res.satisfied).not.toContain("ESTIMATION");
  });

  it("does not require ESTIMATION for maintenance-work profile", () => {
    const res = evaluateStandardization({
      points: null,
      originalEstimateSeconds: null,
      timeSpent: 1800,
      fixVersionNames: ["Hotfix-1"],
      dueDate: "2026-10-01",
      labels: ["flow-bug"],
    });

    expect(res.policyId).toBe("maintenance-work");
    expect(res.required).not.toContain("ESTIMATION");
    expect(res.missing).toHaveLength(0);
    expect(res.status).toBe("complete");
  });

  it("requires ESTIMATION, WORKLOG, FIX_VERSION, DUE_DATE for default profile", () => {
    const res = evaluateStandardization({
      labels: [],
    });

    expect(res.policyId).toBe("default");
    expect(res.required).toEqual(["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"]);
    expect(res.missing).toEqual(["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"]);
    expect(res.status).toBe("incomplete");
  });

  it("marks WORKLOG missing when timeSpent is null or <= 0", () => {
    const nullRes = evaluateStandardization({
      points: 5,
      timeSpent: null,
      fixVersionNames: ["v1"],
      dueDate: "2026-10-10",
    });
    expect(nullRes.missing).toContain("WORKLOG");

    const zeroRes = evaluateStandardization({
      points: 5,
      timeSpent: 0,
      fixVersionNames: ["v1"],
      dueDate: "2026-10-10",
    });
    expect(zeroRes.missing).toContain("WORKLOG");

    const positiveRes = evaluateStandardization({
      points: 5,
      timeSpent: 60,
      fixVersionNames: ["v1"],
      dueDate: "2026-10-10",
    });
    expect(positiveRes.satisfied).toContain("WORKLOG");
  });

  it("evaluates FIX_VERSION correctly from ids or names", () => {
    const noVer = evaluateStandardization({ fixVersionNames: [], fixVersionIds: [] });
    expect(noVer.missing).toContain("FIX_VERSION");

    const withId = evaluateStandardization({
      points: 1,
      timeSpent: 10,
      dueDate: "2026-10-01",
      fixVersionIds: ["101"],
    });
    expect(withId.satisfied).toContain("FIX_VERSION");

    const withName = evaluateStandardization({
      points: 1,
      timeSpent: 10,
      dueDate: "2026-10-01",
      fixVersionNames: ["Release 2.0"],
    });
    expect(withName.satisfied).toContain("FIX_VERSION");
  });

  it("evaluates DUE_DATE correctly even if date is overdue", () => {
    const noDue = evaluateStandardization({ dueDate: null });
    expect(noDue.missing).toContain("DUE_DATE");

    const pastDue = evaluateStandardization({
      points: 1,
      timeSpent: 100,
      fixVersionNames: ["v1"],
      dueDate: "2020-01-01",
    });
    expect(pastDue.satisfied).toContain("DUE_DATE");

    const invalidDue = evaluateStandardization({
      dueDate: "not-a-valid-date",
    });
    expect(invalidDue.missing).toContain("DUE_DATE");
  });

  it("handles case-insensitive labels and precedence", () => {
    const upper = resolvePolicy(["FLOW-FEATURE"]);
    expect(upper.policyId).toBe("planned-work");
    expect(upper.warnings).toHaveLength(0);

    const defect = resolvePolicy(["Flow-Defect"]);
    expect(defect.policyId).toBe("maintenance-work");
    expect(defect.warnings).toHaveLength(0);

    const debt = resolvePolicy(["FLOW-DEBT"]);
    expect(debt.policyId).toBe("maintenance-work");
  });

  it("applies precedence and warns when multiple flow labels conflict", () => {
    const conflict = resolvePolicy(["flow-feature", "flow-bug"]);
    expect(conflict.policyId).toBe("planned-work");
    expect(conflict.warnings).toContain("AMBIGUOUS_POLICY_LABEL");

    const evalRes = evaluateStandardization({
      labels: ["FLOW-FEATURE", "FLOW-BUG"],
      points: 0,
      timeSpent: 10,
      fixVersionNames: ["v1"],
      dueDate: "2026-10-01",
    });
    expect(evalRes.policyId).toBe("planned-work");
    expect(evalRes.warnings).toContain("AMBIGUOUS_POLICY_LABEL");
    expect(evalRes.missing).toContain("ESTIMATION");
  });

  it("returns status unknown when isUnknown is set", () => {
    const res = evaluateStandardization({
      labels: ["flow-feature"],
      isUnknown: true,
    });

    expect(res.status).toBe("unknown");
    expect(res.unknown).toEqual(["ESTIMATION", "WORKLOG", "FIX_VERSION", "DUE_DATE"]);
    expect(res.missing).toHaveLength(0);
    expect(res.satisfied).toHaveLength(0);
  });

  it("formats Vietnamese missing summary accurately", () => {
    expect(formatMissingSummary([])).toBe("Đã đạt chuẩn");
    expect(formatMissingSummary(["WORKLOG", "FIX_VERSION", "DUE_DATE"])).toBe(
      "Thiếu 3 mục: Worklog, Fix Version, Due date"
    );
    expect(formatMissingSummary(["ESTIMATION"])).toBe(
      "Thiếu 1 mục: Estimate / Story point"
    );
  });
});
