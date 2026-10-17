import type { JiraCreateMetaIssueType } from "@/lib/jira/types";

/** How a new child attaches to its parent. `none` means Jira cannot nest further. */
export type ChildMode = "subtask" | "epic" | "none";

export type ChildTypeOption = { id: string; name: string };

export function childMode(parentType: { name?: string; subtask?: boolean } | null | undefined): ChildMode {
  if (parentType?.subtask) return "none";
  if (parentType?.name?.trim().toLowerCase() === "epic") return "epic";
  return "subtask";
}

/** Issue types a child may use: sub-task types under a task, regular types under an Epic. */
export function allowedChildTypes(
  mode: ChildMode,
  types: readonly JiraCreateMetaIssueType[]
): ChildTypeOption[] {
  if (mode === "none") return [];
  return types
    .filter((type) =>
      mode === "subtask" ? type.subtask : !type.subtask && type.name.trim().toLowerCase() !== "epic"
    )
    .map(({ id, name }) => ({ id, name }));
}
