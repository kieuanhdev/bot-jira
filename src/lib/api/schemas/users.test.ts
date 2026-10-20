import { describe, expect, it } from "vitest";
import { UserRoleBodySchema } from "./users";

describe("UserRoleBodySchema", () => {
  it("accepts a string role", () => {
    expect(UserRoleBodySchema.safeParse({ role: "lead" }).success).toBe(true);
  });

  it("rejects a non-string role", () => {
    expect(UserRoleBodySchema.safeParse({ role: 1 }).success).toBe(false);
  });
});
