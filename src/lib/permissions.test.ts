import { describe, it, expect } from "vitest";
import { can, roleOf, isReleaseActor, ROLES } from "./permissions";

const session = (role?: string) => (role ? { user: { role } } : undefined);

describe("roleOf", () => {
  it("defaults to member for missing/unknown roles", () => {
    expect(roleOf(undefined)).toBe("member");
    expect(roleOf({})).toBe("member");
    expect(roleOf({ user: { role: "bogus" } })).toBe("member");
  });

  it("returns known roles", () => {
    expect(roleOf(session("admin"))).toBe("admin");
    expect(roleOf(session("lead"))).toBe("lead");
    expect(roleOf(session("release_manager"))).toBe("release_manager");
  });
});

describe("can — permission matrix (REL-01)", () => {
  it("any signed-in user can view releases", () => {
    expect(can(session("member"), "release.view")).toBe(true);
    expect(can(session("release_manager"), "release.view")).toBe(true);
    expect(can(session("admin"), "release.view")).toBe(true);
  });

  it("member can check, manage, approve and publish (single shared role)", () => {
    for (const perm of ["release.check", "release.manage", "release.approve", "release.publish"] as const) {
      expect(can(session("member"), perm)).toBe(true);
    }
  });

  it("release_manager can check, manage, approve and publish", () => {
    for (const perm of ["release.check", "release.manage", "release.approve", "release.publish"] as const) {
      expect(can(session("release_manager"), perm)).toBe(true);
    }
  });

  it("admin can everything, including admin actions", () => {
    for (const perm of ["release.check", "release.manage", "release.approve", "release.publish", "admin.users", "admin.integrations"] as const) {
      expect(can(session("admin"), perm)).toBe(true);
    }
  });

  it("release_manager cannot manage users or integrations", () => {
    expect(can(session("release_manager"), "admin.users")).toBe(false);
    expect(can(session("release_manager"), "admin.integrations")).toBe(false);
  });

  it("isReleaseActor is true only for release_manager/admin", () => {
    expect(isReleaseActor(session("member"))).toBe(false);
    expect(isReleaseActor(session("release_manager"))).toBe(true);
    expect(isReleaseActor(session("admin"))).toBe(true);
  });

  it("evaluates branch permissions per BR-005 matrix", () => {
    // member can do all branch actions
    expect(can(session("member"), "branch.view")).toBe(true);
    expect(can(session("member"), "branch.confirm")).toBe(true);
    expect(can(session("member"), "branch.manage")).toBe(true);
    expect(can(session("member"), "branch.sync")).toBe(true);

    // release_manager can do all branch actions
    expect(can(session("release_manager"), "branch.view")).toBe(true);
    expect(can(session("release_manager"), "branch.confirm")).toBe(true);
    expect(can(session("release_manager"), "branch.manage")).toBe(true);
    expect(can(session("release_manager"), "branch.sync")).toBe(true);

    // admin can do all branch actions
    expect(can(session("admin"), "branch.view")).toBe(true);
    expect(can(session("admin"), "branch.confirm")).toBe(true);
    expect(can(session("admin"), "branch.manage")).toBe(true);
    expect(can(session("admin"), "branch.sync")).toBe(true);
  });

  it("evaluates report permissions per RPT-103", () => {
    // any user can view and export reports
    expect(can(session("member"), "report.view")).toBe(true);
    expect(can(session("member"), "report.export")).toBe(true);
    expect(can(session("release_manager"), "report.view")).toBe(true);
    expect(can(session("release_manager"), "report.export")).toBe(true);
    expect(can(session("admin"), "report.view")).toBe(true);
    expect(can(session("admin"), "report.export")).toBe(true);

    // only admin can configure reports
    expect(can(session("member"), "report.configure")).toBe(false);
    expect(can(session("release_manager"), "report.configure")).toBe(false);
    expect(can(session("admin"), "report.configure")).toBe(true);
  });
});

describe("ROLES", () => {
  it("lists all valid roles for validation", () => {
    expect(ROLES).toEqual(["member", "lead", "release_manager", "admin"]);
  });
});

describe("board.team", () => {
  it("is open to every role", () => {
    expect(can(session("member"), "board.team")).toBe(true);
    expect(can(session("lead"), "board.team")).toBe(true);
    expect(can(session("release_manager"), "board.team")).toBe(true);
    expect(can(session("admin"), "board.team")).toBe(true);
    expect(can(session("lead"), "release.manage")).toBe(true);
  });
});
