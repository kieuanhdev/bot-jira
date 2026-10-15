import { describe, it, expect } from "vitest";
import { STATE_BADGE } from "./project-sync-row";
import { type AdminSyncState } from "@/lib/admin/project-sync";

describe("STATE_BADGE", () => {
  it("defines badges for all AdminSyncState keys", () => {
    const states: AdminSyncState[] = ["ok", "running", "failed", "never", "disabled"];
    for (const s of states) {
      expect(STATE_BADGE[s]).toBeDefined();
      expect(STATE_BADGE[s].label).toBeTruthy();
      expect(["success", "warning", "danger", "info", "secondary"]).toContain(
        STATE_BADGE[s].variant
      );
    }
  });

  it("maps ok to success and failed to danger", () => {
    expect(STATE_BADGE.ok.variant).toBe("success");
    expect(STATE_BADGE.failed.variant).toBe("danger");
    expect(STATE_BADGE.disabled.variant).toBe("warning");
  });
});
