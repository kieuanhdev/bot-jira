import { describe, it, expect } from "vitest";
import { resolveCompletionDate } from "./completion-date";

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
});
