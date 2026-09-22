import { describe, it, expect } from "vitest";
import { parseChatCommand, extractKeys } from "./commands";

describe("extractKeys", () => {
  it("finds multiple keys", () => {
    expect(extractKeys("PROJ-1 PROJ-2 APP-99")).toEqual(["PROJ-1", "PROJ-2", "APP-99"]);
  });
  it("dedupes", () => {
    expect(extractKeys("PROJ-1 PROJ-1")).toEqual(["PROJ-1"]);
  });
  it("returns none for prose", () => {
    expect(extractKeys("hello world")).toEqual([]);
  });
});

describe("parseChatCommand — task", () => {
  it("parses /task with a key", () => {
    const r = parseChatCommand("/task PROJ-123");
    expect(r).toEqual({ kind: "task", keys: ["PROJ-123"] });
  });
  it("parses bare word task", () => {
    expect(parseChatCommand("task PROJ-123")).toEqual({ kind: "task", keys: ["PROJ-123"] });
  });
  it("parses multiple keys", () => {
    expect(parseChatCommand("/task PROJ-1 PROJ-2")).toEqual({ kind: "task", keys: ["PROJ-1", "PROJ-2"] });
  });
  it("rejects /task without a key", () => {
    const r = parseChatCommand("/task");
    expect(r.kind).toBe("unknown");
  });
});

describe("parseChatCommand — move", () => {
  it("parses /move with quoted status", () => {
    const r = parseChatCommand('/move PROJ-123 "In Progress"');
    expect(r).toEqual({ kind: "move", keys: ["PROJ-123"], status: "In Progress" });
  });
  it("parses MOVE ... TO form", () => {
    const r = parseChatCommand("MOVE PROJ-123 TO Done");
    expect(r).toEqual({ kind: "move", keys: ["PROJ-123"], status: "Done" });
  });
  it("parses multi-key move", () => {
    const r = parseChatCommand('/move PROJ-1, PROJ-2 "Done"');
    expect(r.kind).toBe("move");
    if (r.kind === "move") expect(r.keys).toEqual(["PROJ-1", "PROJ-2"]);
  });
  it("rejects /move without a key", () => {
    expect(parseChatCommand("/move").kind).toBe("unknown");
  });
});

describe("parseChatCommand — assign", () => {
  it("parses /assign me", () => {
    const r = parseChatCommand("/assign PROJ-123 me");
    expect(r).toEqual({ kind: "assign", keys: ["PROJ-123"], who: "me" });
  });
  it("parses /assign with a username", () => {
    expect(parseChatCommand("/assign PROJ-123 alice_mb")).toEqual({
      kind: "assign",
      keys: ["PROJ-123"],
      who: "alice_mb",
    });
  });
});

describe("parseChatCommand — watch/unwatch", () => {
  it("parses /watch", () => {
    expect(parseChatCommand("/watch PROJ-123")).toEqual({ kind: "watch", keys: ["PROJ-123"] });
  });
  it("parses /unwatch", () => {
    expect(parseChatCommand("/unwatch PROJ-123")).toEqual({ kind: "unwatch", keys: ["PROJ-123"] });
  });
});

describe("parseChatCommand — release", () => {
  it("parses /release version check", () => {
    expect(parseChatCommand("/release 1.4.2 check")).toEqual({ kind: "release", version: "1.4.2", action: "check" });
  });
  it("accepts status/ready synonyms", () => {
    expect(parseChatCommand("/release 1.4.2 ready")).toEqual({ kind: "release", version: "1.4.2", action: "check" });
  });
  it("rejects /release without an action", () => {
    expect(parseChatCommand("/release 1.4.2").kind).toBe("unknown");
  });
});

describe("parseChatCommand — stale", () => {
  it("parses bare /stale", () => {
    expect(parseChatCommand("/stale")).toEqual({ kind: "stale", scope: null });
  });
  it("parses /stale with scope", () => {
    expect(parseChatCommand("/stale myteam")).toEqual({ kind: "stale", scope: "myteam" });
  });
});

describe("parseChatCommand — link/unlink/help/confirm", () => {
  it("parses /link", () => expect(parseChatCommand("/link")).toEqual({ kind: "link" }));
  it("parses /unlink", () => expect(parseChatCommand("/unlink")).toEqual({ kind: "unlink" }));
  it("parses /help", () => expect(parseChatCommand("/help")).toEqual({ kind: "help" }));
  it("parses /confirm", () => expect(parseChatCommand("/confirm")).toEqual({ kind: "confirm" }));
  it("parses yes as confirm", () => expect(parseChatCommand("yes")).toEqual({ kind: "confirm" }));
});

describe("parseChatCommand — legacy + unknown", () => {
  it("parses legacy DONE", () => {
    expect(parseChatCommand("DONE PROJ-124")).toEqual({ kind: "move", keys: ["PROJ-124"], status: "Done" });
  });
  it("parses legacy KEY -> status", () => {
    expect(parseChatCommand("PROJ-10 -> In Review")).toEqual({ kind: "move", keys: ["PROJ-10"], status: "In Review" });
  });
  it("returns unknown for prose", () => {
    const r = parseChatCommand("please fix everything");
    expect(r.kind).toBe("unknown");
    expect((r as { hint?: string }).hint).toBeTruthy();
  });
  it("returns unknown for empty", () => {
    expect(parseChatCommand("   ").kind).toBe("unknown");
  });
});
