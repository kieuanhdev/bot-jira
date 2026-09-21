import { describe, it, expect } from "vitest";
import { parseCommand, extractKeys } from "./parser";

describe("extractKeys", () => {
  it("finds single key", () => {
    expect(extractKeys("MOVE PROJ-123 TO In Progress")).toEqual(["PROJ-123"]);
  });
  it("finds multiple keys", () => {
    expect(extractKeys("MOVE PROJ-1, PROJ-2, APP-99 TO Done")).toEqual(["PROJ-1", "PROJ-2", "APP-99"]);
  });
  it("dedupes", () => {
    expect(extractKeys("PROJ-1 PROJ-1")).toEqual(["PROJ-1"]);
  });
  it("returns none for prose", () => {
    expect(extractKeys("hello world")).toEqual([]);
  });
});

describe("parseCommand", () => {
  it("parses MOVE ... TO", () => {
    const r = parseCommand("MOVE PROJ-123 TO In Progress");
    expect(r.ok).toBe(true);
    expect(r.keys).toEqual(["PROJ-123"]);
    expect(r.status).toBe("In Progress");
  });

  it("parses DONE", () => {
    const r = parseCommand("DONE PROJ-124");
    expect(r.ok).toBe(true);
    expect(r.keys).toEqual(["PROJ-124"]);
    expect(r.status).toBe("Done");
  });

  it("parses CLOSE", () => {
    const r = parseCommand("CLOSE PROJ-125");
    expect(r.status).toBe("Closed");
  });

  it("parses REOPEN", () => {
    const r = parseCommand("REOPEN PROJ-126");
    expect(r.status).toBe("To Do");
  });

  it("parses SET ... TO", () => {
    const r = parseCommand("SET APP-1 TO Backlog");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("Backlog");
  });

  it("parses multi-key MOVE", () => {
    const r = parseCommand("MOVE PROJ-1, PROJ-2 TO Done");
    expect(r.keys).toEqual(["PROJ-1", "PROJ-2"]);
    expect(r.status).toBe("Done");
  });

  it("parses KEY -> status", () => {
    const r = parseCommand("PROJ-10 -> In Review");
    expect(r.ok).toBe(true);
    expect(r.keys).toEqual(["PROJ-10"]);
    expect(r.status).toBe("In Review");
  });

  it("rejects empty", () => {
    const r = parseCommand("   ");
    expect(r.ok).toBe(false);
  });

  it("rejects unrecognized with reason", () => {
    const r = parseCommand("please fix everything");
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it("MOVE without a key fails", () => {
    const r = parseCommand("MOVE to Done");
    expect(r.ok).toBe(false);
  });
});
