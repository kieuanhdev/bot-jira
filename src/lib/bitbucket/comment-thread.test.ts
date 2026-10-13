import { describe, it, expect } from "vitest";
import { findThreadRoot, flattenCommentTree, threadAuthors } from "./comment-thread";
import type { BbPrActivity, BbPrComment } from "./types";

const reply2: BbPrComment = { id: 3, text: "fixed", author: { name: "ngocdv" } };
const reply1: BbPrComment = { id: 2, text: "why?", author: { name: "ngocdv" }, comments: [reply2] };
const root: BbPrComment = { id: 1, text: "check null", author: { name: "vunt_mb" }, comments: [reply1] };
const other: BbPrComment = { id: 9, text: "nit", author: { name: "hungtq_mb" } };

describe("comment-thread", () => {
  it("flattens nested replies at any depth", () => {
    expect(flattenCommentTree(root).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("finds the real root even when a reply has its own activity", () => {
    const activities: BbPrActivity[] = [
      { id: 10, action: "COMMENTED", comment: reply1 },
      { id: 11, action: "COMMENTED", comment: root },
      { id: 12, action: "COMMENTED", comment: other },
    ];
    expect(findThreadRoot(activities, 3)?.id).toBe(1);
    expect(findThreadRoot(activities, 9)?.id).toBe(9);
    expect(findThreadRoot(activities, 404)).toBeNull();
  });

  it("lists each thread author once", () => {
    expect(threadAuthors(root).map((u) => u.name)).toEqual(["vunt_mb", "ngocdv"]);
  });
});
