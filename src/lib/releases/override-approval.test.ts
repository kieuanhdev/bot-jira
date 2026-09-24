import { describe, it, expect } from "vitest";
import { overrideIsActive, type GateOverrideRow } from "./gates";
import { manualApprovalGate } from "./gates/manual-approval";

const now = new Date("2026-09-23T00:00:00Z");

function ov(partial: Partial<GateOverrideRow>): GateOverrideRow {
  return {
    gate: "data_freshness",
    revokedAt: null,
    expiresAt: null,
    createdAt: now,
    ...partial,
  };
}

describe("overrideIsActive", () => {
  it("is active when present, not revoked, not expired", () => {
    expect(overrideIsActive(ov({}), now)).toBe(true);
  });

  it("is inactive when revoked", () => {
    expect(overrideIsActive(ov({ revokedAt: now }), now)).toBe(false);
  });

  it("is inactive when expired", () => {
    expect(overrideIsActive(ov({ expiresAt: new Date(now.getTime() - 1000) }), now)).toBe(false);
  });

  it("is never active for non_empty_release or ci", () => {
    expect(overrideIsActive(ov({ gate: "non_empty_release" }), now)).toBe(false);
    expect(overrideIsActive(ov({ gate: "ci" }), now)).toBe(false);
  });
});

describe("manualApprovalGate", () => {
  it("passes vacuously when no approvals are required", () => {
    expect(manualApprovalGate([], []).state).toBe("passed");
  });

  it("fails when a required approval is missing", () => {
    const g = manualApprovalGate(["qa", "release_manager"], [{ type: "qa", present: true }]);
    expect(g.state).toBe("failed");
    expect(g.blockers.some((b: { reason: string }) => b.reason.includes("release_manager"))).toBe(true);
  });

  it("passes when all required approvals are present", () => {
    const g = manualApprovalGate(["qa", "release_manager"], [
      { type: "qa", present: true },
      { type: "release_manager", present: true },
    ]);
    expect(g.state).toBe("passed");
  });
});
