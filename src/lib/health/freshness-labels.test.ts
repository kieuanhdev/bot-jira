import { describe, it, expect } from "vitest";
import { nameList, splitFailureNames } from "./freshness-labels";

describe("splitFailureNames", () => {
  it("reports a per-project Jira sync job as a project key", () => {
    const r = splitFailureNames([], ["poll-jira-project:EPM"]);
    expect(r.projects).toEqual(["EPM"]);
    expect(r.jobs).toEqual([]);
  });

  it("does not duplicate a project already flagged by its Jira cursor", () => {
    const r = splitFailureNames(["EPM"], ["poll-jira-project:epm"]);
    expect(r.projects).toEqual(["EPM"]);
  });

  it("labels global jobs in Vietnamese and keeps unknown scopes verbatim", () => {
    const r = splitFailureNames([], ["check-branches", "some-new-job"]);
    expect(r.jobs).toEqual(["Kiểm tra nhánh Git", "some-new-job"]);
    expect(r.projects).toEqual([]);
  });

  it("keeps projects and jobs separate when both fail", () => {
    const r = splitFailureNames(["CICM"], ["poll-jira-project:EPM", "deliver-notifications"]);
    expect(r.projects).toEqual(["CICM", "EPM"]);
    expect(r.jobs).toEqual(["Gửi thông báo"]);
  });
});

describe("nameList", () => {
  it("lists up to three names in full", () => {
    expect(nameList(["A", "B", "C"])).toBe("A, B, C");
  });

  it("truncates longer lists with a +N suffix", () => {
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B, C +2");
  });
});
