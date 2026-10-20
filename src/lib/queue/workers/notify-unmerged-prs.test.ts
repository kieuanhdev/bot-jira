import { describe, expect, it } from "vitest";
import { buildUnmergedPrMessage, localDateKey } from "./notify-unmerged-prs";

describe("notify-unmerged-prs", () => {
  it("uses the Vietnam calendar day for the dedupe key", () => {
    expect(localDateKey(new Date("2026-10-12T10:20:00Z"))).toBe("2026-10-12");
    expect(localDateKey(new Date("2026-10-12T18:00:00Z"))).toBe("2026-10-13");
  });

  it("falls back to UTC date when timezone is invalid in localDateKey", () => {
    expect(localDateKey(new Date("2026-10-12T18:00:00Z"), "Bad/Zone")).toBe("2026-10-12");
  });

  it("lists tasks with PR links and truncates long lists", () => {
    const tasks = Array.from({ length: 17 }, (_, i) => ({
      jiraKey: `ABC-${i + 1}`,
      summary: "Fix thing",
      prs: [{ id: i + 1, url: `https://bb/pr/${i + 1}` }],
    }));
    const msg = buildUnmergedPrMessage(tasks);
    expect(msg.title).toContain("17 task");
    expect(msg.body).toContain("[PR #1](https://bb/pr/1)");
    expect(msg.body).toContain("và 2 task khác");
    expect(msg.body).not.toContain("ABC-16");
  });
});
