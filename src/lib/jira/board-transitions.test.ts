import { describe, expect, it } from "vitest";
import { canTransitionToStatus, findTransitionToStatus } from "./board-transitions";

const mrInProgressTransitions = [
  { id: "11", name: "To Do", to: { name: "To do" } },
  { id: "21", name: "In Progress", to: { name: "In Progress" } },
  { id: "31", name: "Done", to: { name: "Done Test" } },
  { id: "51", name: "Backlog", to: { name: "Plan" } },
  { id: "71", name: "Waiting For Deploy", to: { name: "Waiting For Deploy" } },
  { id: "81", name: "Reject", to: { name: "Reject" } },
  { id: "121", name: "To Rejected", to: { name: "Rejected" } },
  { id: "61", name: "Pending", to: { name: "Pending" } },
  { id: "101", name: "To Deploy", to: { name: "Waiting For Deploy" } },
];

describe("MR board transitions", () => {
  it("keeps Jira global transitions available", () => {
    expect(canTransitionToStatus(mrInProgressTransitions, "To do")).toBe(true);
    expect(canTransitionToStatus(mrInProgressTransitions, "Done Test")).toBe(true);
    expect(canTransitionToStatus(mrInProgressTransitions, "Pending")).toBe(true);
  });

  it("allows Waiting For Deploy and prefers the directed To Deploy action", () => {
    expect(canTransitionToStatus(mrInProgressTransitions, " waiting for deploy ")).toBe(true);
    expect(findTransitionToStatus(mrInProgressTransitions, "Waiting For Deploy")?.id).toBe("101");
  });

  it("does not invent transitions absent from Jira", () => {
    expect(canTransitionToStatus(mrInProgressTransitions, "READY FOR TEST")).toBe(false);
    expect(canTransitionToStatus(mrInProgressTransitions, "Deploy")).toBe(false);
  });
});
