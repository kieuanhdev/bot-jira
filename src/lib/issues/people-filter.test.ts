import { describe, expect, it } from "vitest";
import { peopleFilterCondition } from "./people-filter";

describe("peopleFilterCondition", () => {
  it("resolves me with Jira aliases", () => {
    expect(peopleFilterCondition("approverJira", ["me"], "alice_mb")).toEqual({
      approverJira: { in: ["alice_mb", "alice"] },
    });
  });

  it("combines named users and unassigned", () => {
    expect(peopleFilterCondition("testerJira", ["bob", "unassigned"], "alice")).toEqual({
      OR: [{ testerJira: { in: ["bob", "bob_mb"] } }, { testerJira: null }],
    });
  });
});
