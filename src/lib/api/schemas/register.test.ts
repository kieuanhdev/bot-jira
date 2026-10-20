import { describe, expect, it } from "vitest";
import { RegisterBodySchema } from "./register";

describe("RegisterBodySchema", () => {
  it("accepts string fields", () => {
    const body = { displayName: "A", email: "a@b.com", password: "password123" };
    expect(RegisterBodySchema.safeParse(body).data).toEqual(body);
  });

  it("rejects non-string fields", () => {
    expect(RegisterBodySchema.safeParse({ email: ["a@b.com"] }).success).toBe(false);
  });
});
