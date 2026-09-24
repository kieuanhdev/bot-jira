import type { Blocker, GateResult } from "./types";

// REL-03 — manual_approval gate.
//
// When the release policy requires human sign-off, the release cannot be
// `ready` until the required approvals are present (and not revoked). The set
// of required approval types is passed in (e.g. ["qa", "release_manager"]).
// With an empty requirement list the gate passes vacuously so existing
// single-approver or no-approval flows are unchanged.
//
// This is a *mandatory* gate (it is not in the advisory set), so a missing
// approval yields `failed` => release `blocked`, which is the safe default.

export type ApprovalPresence = {
  type: string;
  /** At least one non-revoked approval of this type exists. */
  present: boolean;
};

export function manualApprovalGate(required: string[], present: ApprovalPresence[]): GateResult {
  if (required.length === 0) {
    return {
      gate: "manual_approval",
      state: "passed",
      summary: "No manual approval required",
      blockers: [],
    };
  }

  const have = new Map(present.map((p) => [p.type, p.present]));
  const missing: Blocker[] = required
    .filter((t) => !have.get(t))
    .map((t) => ({ source: "system", reason: `missing ${t} approval` }));

  if (missing.length > 0) {
    return {
      gate: "manual_approval",
      state: "failed",
      summary: `Missing approval(s): ${missing.map((b) => b.reason.replace("missing ", "")).join(", ")}`,
      blockers: missing,
    };
  }
  return {
    gate: "manual_approval",
    state: "passed",
    summary: `All required approvals present (${required.join(", ")})`,
    blockers: [],
  };
}
