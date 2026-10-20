import { describe, it, expect } from "vitest";
import { resolveCompletionDate, isDateInPeriod } from "./completion-date";

describe("resolveCompletionDate", () => {
  it("prioritizes customfield_10706 Done At when raw is a direct fields object", () => {
    const issue = {
      status: "Done Test",
      statusCategory: "done",
      statusChangedAt: new Date("2026-10-02T10:36:00.000Z"),
      raw: {
        customfield_10706: "2026-10-02T17:36:00.000+0700",
        resolutiondate: "2026-10-02T17:36:50.000+0700",
      },
    };

    const res = resolveCompletionDate(issue);
    expect(res.source).toBe("done_at_field");
    expect(res.confidence).toBe("high");
    expect(res.date?.toISOString()).toBe(new Date("2026-10-02T17:36:00.000+0700").toISOString());
  });

  it("prioritizes customfield_10706 Done At when raw has nested fields", () => {
    const issue = {
      status: "Done Test",
      statusCategory: "done",
      raw: {
        fields: {
          customfield_10706: "2026-10-02T17:36:00.000+0700",
          resolutiondate: "2026-10-02T17:36:50.000+0700",
        },
      },
    };

    const res = resolveCompletionDate(issue);
    expect(res.source).toBe("done_at_field");
    expect(res.confidence).toBe("high");
    expect(res.date?.toISOString()).toBe(new Date("2026-10-02T17:36:00.000+0700").toISOString());
  });

  it("resolves resolutiondate when customfield_10706 is not present", () => {
    const issue = {
      status: "Done Test",
      statusCategory: "done",
      raw: {
        resolutiondate: "2026-10-02T17:36:50.000+0700",
      },
    };

    const res = resolveCompletionDate(issue);
    expect(res.source).toBe("resolution_date");
    expect(res.confidence).toBe("high");
    expect(res.date?.toISOString()).toBe(new Date("2026-10-02T17:36:50.000+0700").toISOString());
  });

  it("falls back to transitionDoneDate when raw does not have completion dates", () => {
    const transitionDate = new Date("2026-10-01T08:00:00.000Z");
    const issue = {
      status: "Done",
      statusCategory: "done",
      transitionDoneDate: transitionDate,
      raw: {},
    };

    const res = resolveCompletionDate(issue);
    expect(res.source).toBe("transition_event");
    expect(res.confidence).toBe("high");
    expect(res.date).toBe(transitionDate);
  });

  it("falls back to statusChangedAt with low confidence when current status is Done", () => {
    const statusDate = new Date("2026-10-01T08:00:00.000Z");
    const issue = {
      status: "Done",
      statusCategory: "done",
      statusChangedAt: statusDate,
      raw: {},
    };

    const res = resolveCompletionDate(issue);
    expect(res.source).toBe("status_changed_at");
    expect(res.confidence).toBe("low");
    expect(res.date).toBe(statusDate);
  });

  it("returns none when status is not Done and no dates exist", () => {
    const issue = {
      status: "In Progress",
      statusCategory: "indeterminate",
      raw: {},
    };

    const res = resolveCompletionDate(issue);
    expect(res.source).toBe("none");
    expect(res.confidence).toBe("none");
    expect(res.date).toBeNull();
  });

  describe("isDateInPeriod", () => {
    it("falls back to UTC date when timezone is invalid", () => {
      // 2026-10-01 17:30 UTC is 2026-10-02 in Asia/Ho_Chi_Minh and 2026-10-01 in UTC
      const edgeDate = new Date("2026-10-01T17:30:00.000Z");
      expect(isDateInPeriod(edgeDate, "2026-10-01", "2026-10-01", "Bad/Zone")).toBe(true);
      expect(isDateInPeriod(edgeDate, "2026-10-02", "2026-10-02", "Bad/Zone")).toBe(false);
    });
  });
});

describe("resolveCompletionDate with completedAt column", () => {
  it("uses completedAt when raw is not loaded", () => {
    const completedAt = new Date("2026-10-05T03:00:00.000Z");
    const resolved = resolveCompletionDate({
      status: "Done",
      statusCategory: "done",
      statusChangedAt: new Date("2026-10-09T00:00:00.000Z"),
      completedAt,
    });
    expect(resolved.date).toEqual(completedAt);
    expect(resolved.confidence).toBe("high");
  });

  it("falls back to statusChangedAt when completedAt is null", () => {
    const changed = new Date("2026-10-09T00:00:00.000Z");
    const resolved = resolveCompletionDate({
      status: "Done",
      statusCategory: "done",
      statusChangedAt: changed,
      completedAt: null,
    });
    expect(resolved.source).toBe("status_changed_at");
    expect(resolved.date).toEqual(changed);
  });
});
