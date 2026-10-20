import { describe, expect, it } from "vitest";
import type { BulkCreateRowInput } from "@/lib/bulk/create-types";
import { filterBatchParentCandidates } from "./parent-options";

const candidates = [
  { clientRef: "r1", summary: "Login page" },
  { clientRef: "r2", summary: "Login API" },
  { clientRef: "r3", summary: "Billing" },
];

describe("filterBatchParentCandidates", () => {
  it("returns [] for a query shorter than 2 characters", () => {
    expect(filterBatchParentCandidates({ candidates, query: "" })).toEqual([]);
    expect(filterBatchParentCandidates({ candidates, query: " l " })).toEqual([]);
  });

  it("matches summary or clientRef case-insensitively", () => {
    expect(filterBatchParentCandidates({ candidates, query: "LOGIN" }).map((c) => c.clientRef)).toEqual(["r1", "r2"]);
    expect(filterBatchParentCandidates({ candidates, query: "r3" }).map((c) => c.clientRef)).toEqual(["r3"]);
  });

  it("limits the result to 10", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ clientRef: `item-${i}`, summary: "x" }));
    expect(filterBatchParentCandidates({ candidates: many, query: "item" })).toHaveLength(10);
  });

  it("excludes the current item and subtask-type items", () => {
    const batchItems = [
      { clientRef: "ref1", issueTypeId: "10" },
      { clientRef: "ref2", issueTypeId: "sub" },
      { clientRef: "ref3", issueTypeId: "10" },
    ] as unknown as BulkCreateRowInput[];
    const result = filterBatchParentCandidates({
      candidates: [
        { clientRef: "ref1", summary: "A" },
        { clientRef: "ref2", summary: "B" },
        { clientRef: "ref3", summary: "C" },
      ],
      batchItems,
      query: "ref",
      currentClientRef: "ref1",
      subtaskIssueTypeIds: new Set(["sub"]),
    });
    expect(result.map((c) => c.clientRef)).toEqual(["ref3"]);
  });
});
