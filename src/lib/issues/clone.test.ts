import { describe, expect, it } from "vitest";
import {
  buildCloneFields,
  cloneSummary,
  createScreenFields,
  describeLinkTo,
  resolveCloneLinkType,
} from "./clone";
import type { JiraIssue } from "@/lib/jira/types";

function sourceIssue(fields: Record<string, unknown> = {}): JiraIssue {
  return {
    id: "1001",
    key: "EPM-10",
    self: "https://jira.example.com/rest/api/2/issue/1001",
    fields: {
      project: { key: "EPM", name: "EPM" },
      issuetype: { id: "10002", name: "Task" },
      summary: "Fix the login redirect",
      description: "h2. Steps\n* one",
      status: { name: "In Progress" },
      resolution: { id: "1", name: "Done" },
      priority: { id: "3", name: "Medium", iconUrl: "https://jira/icon.png" },
      labels: ["backend", "urgent"],
      components: [{ self: "https://jira/c/1", id: "10100", name: "API" }],
      fixVersions: [{ id: "10200", name: "1.4.0" }],
      assignee: { name: "alice", key: "alice", displayName: "Alice" },
      reporter: { name: "bob", displayName: "Bob" },
      duedate: "2026-11-01",
      timespent: 3600,
      ...fields,
    },
  } as JiraIssue;
}

const everyField = new Set([
  "description",
  "priority",
  "labels",
  "components",
  "fixVersions",
  "versions",
  "assignee",
  "duedate",
  "environment",
  "parent",
  "customfield_10300",
  "customfield_10100",
  "customfield_10006",
  "reporter",
]);

describe("cloneSummary", () => {
  it("prefixes the source summary like Jira does", () => {
    expect(cloneSummary("Fix the login redirect")).toBe("CLONE - Fix the login redirect");
  });

  it("does not stack the prefix on an already cloned summary", () => {
    expect(cloneSummary("CLONE - Fix the login redirect")).toBe("CLONE - Fix the login redirect");
  });
});

describe("buildCloneFields", () => {
  it("copies the fields the create screen accepts, as reference objects", () => {
    const clone = buildCloneFields(sourceIssue(), { allowedFieldIds: everyField });

    expect(clone.projectKey).toBe("EPM");
    expect(clone.issueTypeId).toBe("10002");
    expect(clone.summary).toBe("CLONE - Fix the login redirect");
    expect(clone.fields).toEqual({
      description: "h2. Steps\n* one",
      priority: { id: "3" },
      labels: ["backend", "urgent"],
      components: [{ id: "10100" }],
      fixVersions: [{ id: "10200" }],
      assignee: { name: "alice" },
      duedate: "2026-11-01",
    });
  });

  it("never copies status, resolution, reporter or time tracking", () => {
    const clone = buildCloneFields(sourceIssue(), {
      allowedFieldIds: everyField,
      extraFieldIds: ["reporter", "status", "timespent"],
    });

    for (const field of ["status", "resolution", "reporter", "timespent", "summary", "issuetype"]) {
      expect(clone.fields).not.toHaveProperty(field);
    }
  });

  it("copies people, epic link and story point custom fields passed in", () => {
    const clone = buildCloneFields(
      sourceIssue({
        customfield_10300: { name: "carol", displayName: "Carol" },
        customfield_10100: "EPM-1",
        customfield_10006: 5,
      }),
      {
        allowedFieldIds: everyField,
        extraFieldIds: ["customfield_10300", "customfield_10100", "customfield_10006"],
      }
    );

    expect(clone.fields.customfield_10300).toEqual({ name: "carol" });
    expect(clone.fields.customfield_10100).toBe("EPM-1");
    expect(clone.fields.customfield_10006).toBe(5);
  });

  it("copies a required create-screen field the caller never listed", () => {
    // An Epic cannot be created without its Epic Name.
    const clone = buildCloneFields(sourceIssue({ customfield_10104: "Checkout revamp" }), {
      allowedFieldIds: new Set(["description", "customfield_10104"]),
      requiredFieldIds: ["customfield_10104"],
    });

    expect(clone.fields.customfield_10104).toBe("Checkout revamp");
  });

  it("drops fields missing from the create screen and reports them", () => {
    const clone = buildCloneFields(sourceIssue(), {
      allowedFieldIds: new Set(["description", "labels"]),
    });

    expect(Object.keys(clone.fields).sort()).toEqual(["description", "labels"]);
    expect(clone.skipped).toContain("priority");
    expect(clone.skipped).toContain("assignee");
  });

  it("falls back to a narrow field set when create metadata is unavailable", () => {
    const clone = buildCloneFields(sourceIssue(), { allowedFieldIds: null });

    expect(Object.keys(clone.fields).sort()).toEqual([
      "description",
      "duedate",
      "labels",
      "priority",
    ]);
  });

  it("skips empty values and keeps the caller's summary", () => {
    const clone = buildCloneFields(
      sourceIssue({ description: "", labels: [], components: null }),
      { allowedFieldIds: everyField, summary: "  Bản sao thủ công  " }
    );

    expect(clone.summary).toBe("Bản sao thủ công");
    expect(clone.fields).not.toHaveProperty("description");
    expect(clone.fields).not.toHaveProperty("labels");
    expect(clone.fields).not.toHaveProperty("components");
  });

  it("copies the parent so a cloned subtask keeps its parent", () => {
    const clone = buildCloneFields(sourceIssue({ parent: { id: "900", key: "EPM-2" } }), {
      allowedFieldIds: everyField,
    });

    expect(clone.fields.parent).toEqual({ id: "900" });
  });
});

describe("createScreenFields", () => {
  it("reads the map shape returned by createmeta", () => {
    const screen = createScreenFields({
      description: { required: false, name: "Description" },
      customfield_10104: { required: true, name: "Epic Name" },
    });

    expect(screen.allowed).toEqual(new Set(["description", "customfield_10104"]));
    expect(screen.required).toEqual(["customfield_10104"]);
  });

  it("reads the paged list shape, with the legacy key/id spellings", () => {
    const screen = createScreenFields([
      { required: false, name: "Description", fieldId: "description" },
      { required: false, name: "Labels", key: "labels" },
      { required: true, name: "Priority", id: "priority" },
    ]);

    expect(screen.allowed).toEqual(new Set(["description", "labels", "priority"]));
    expect(screen.required).toEqual(["priority"]);
  });

  it("returns no constraint when Jira sends nothing usable", () => {
    expect(createScreenFields([])).toEqual({ allowed: null, required: [] });
    expect(createScreenFields(undefined)).toEqual({ allowed: null, required: [] });
  });
});

describe("resolveCloneLinkType", () => {
  const cloners = { id: "10000", name: "Cloners", inward: "is cloned by", outward: "clones" };
  const relates = { id: "10001", name: "Relates", inward: "relates to", outward: "relates to" };

  it("prefers the Cloners link type", () => {
    expect(resolveCloneLinkType([relates, cloners])).toBe(cloners);
  });

  it("matches a renamed type by its outward description", () => {
    const renamed = { id: "10002", name: "Sao chép", inward: "is cloned by", outward: "clones" };
    expect(resolveCloneLinkType([relates, renamed])).toBe(renamed);
  });

  it("falls back to Relates, then to nothing", () => {
    expect(resolveCloneLinkType([relates])).toBe(relates);
    expect(resolveCloneLinkType([])).toBeNull();
  });
});

describe("describeLinkTo", () => {
  const type = { id: "10000", name: "Cloners", inward: "is cloned by", outward: "clones" };

  it("reads the outward wording when the other issue is the outward end", () => {
    expect(describeLinkTo([{ id: "1", type, outwardIssue: { key: "EPM-10" } }], "epm-10")).toBe(
      "clones"
    );
  });

  it("reads the inward wording when the other issue is the inward end", () => {
    expect(describeLinkTo([{ id: "1", type, inwardIssue: { key: "EPM-10" } }], "EPM-10")).toBe(
      "is cloned by"
    );
  });

  it("returns null when the issues are not linked", () => {
    expect(describeLinkTo([{ id: "1", type, outwardIssue: { key: "EPM-99" } }], "EPM-10")).toBeNull();
    expect(describeLinkTo(undefined, "EPM-10")).toBeNull();
  });
});
