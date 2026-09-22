import { describe, it, expect } from "vitest";
import {
  extractAcceptanceCriteria,
  extractDependencies,
  deriveImpact,
} from "./estimation-input";

describe("extractAcceptanceCriteria", () => {
  it("collects lines after an 'Acceptance criteria' header", () => {
    const d = `Do the thing.
* Acceptance criteria
- User can log in
- User sees the board
Some other section:
more text`;
    const ac = extractAcceptanceCriteria(d);
    expect(ac).toContain("User can log in");
    expect(ac).toContain("User sees the board");
    expect(ac).not.toContain("Do the thing.");
  });

  it("returns empty when there is no header", () => {
    expect(extractAcceptanceCriteria("just a description with - bullets")).toEqual([]);
  });

  it("returns empty for empty description", () => {
    expect(extractAcceptanceCriteria("")).toEqual([]);
  });
});

describe("extractDependencies", () => {
  it("finds issue keys in description and summary", () => {
    const d = "Depends on PROJ-12 and PROJ-34\nAlso blocks CICM-9";
    const deps = extractDependencies(d, "summary PROJ-5");
    expect(deps).toContain("PROJ-12");
    expect(deps).toContain("PROJ-34");
    expect(deps).toContain("CICM-9");
    expect(deps).toContain("PROJ-5");
  });

  it("dedupes and returns empty when none", () => {
    expect(extractDependencies("no keys here", "nothing")).toEqual([]);
  });
});

describe("deriveImpact", () => {
  it("derives flags from labels", () => {
    const i = deriveImpact(["backend", "mobile", "migration:db", "unit-test"], "", "");
    expect(i.backend).toBe(true);
    expect(i.mobile).toBe(true);
    expect(i.migration).toBe(true);
    expect(i.tests).toBe(true);
  });

  it("derives flags from text when labels are empty", () => {
    const i = deriveImpact([], "Build an API endpoint", "Add a database migration and tests");
    expect(i.backend).toBe(true);
    expect(i.migration).toBe(true);
    expect(i.tests).toBe(true);
    expect(i.mobile).toBe(false);
  });

  it("returns all false when nothing matches", () => {
    const i = deriveImpact([], "Do a thing", "just text");
    expect(i).toEqual({ backend: false, frontend: false, mobile: false, migration: false, tests: false });
  });
});
