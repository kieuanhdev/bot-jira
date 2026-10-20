import { describe, expect, it } from "vitest";
import {
  JiraSyncBodySchema,
  ProjectKeyBodySchema,
  ProjectLeadersBodySchema,
  ProjectPeopleFieldsBodySchema,
} from "./projects";

describe("ProjectKeyBodySchema", () => {
  it("accepts a string key", () => {
    expect(ProjectKeyBodySchema.safeParse({ key: "EPM" }).success).toBe(true);
  });
  it("rejects a non-string key", () => {
    expect(ProjectKeyBodySchema.safeParse({ key: 7 }).success).toBe(false);
  });
});

describe("ProjectLeadersBodySchema", () => {
  it("accepts an array", () => {
    expect(ProjectLeadersBodySchema.safeParse({ leaderUserIds: ["u1", 2] }).success).toBe(true);
  });
  it("rejects a non-array", () => {
    expect(ProjectLeadersBodySchema.safeParse({ leaderUserIds: "u1" }).success).toBe(false);
  });
});

describe("ProjectPeopleFieldsBodySchema", () => {
  it("accepts string and null field ids", () => {
    expect(
      ProjectPeopleFieldsBodySchema.safeParse({ fields: { developer: "customfield_1", qa: null } }).success
    ).toBe(true);
  });
  it("rejects a non-string field id", () => {
    expect(ProjectPeopleFieldsBodySchema.safeParse({ fields: { developer: 5 } }).success).toBe(false);
  });
});

describe("JiraSyncBodySchema", () => {
  it("accepts projectKey and full", () => {
    expect(JiraSyncBodySchema.safeParse({ projectKey: "EPM", full: true }).success).toBe(true);
  });
  it("rejects a wrong-typed full", () => {
    expect(JiraSyncBodySchema.safeParse({ full: "yes" }).success).toBe(false);
  });
});
