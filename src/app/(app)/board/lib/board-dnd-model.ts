import type { IssueItem } from "@/hooks/use-issues";

export function issueKeyFromDragId(id: string): string {
  return id.replace(/^card:/, "");
}

export function resolveBoardDrop({
  activeId,
  overId,
  issueByKey,
  findColumnForIssue,
}: {
  activeId: string;
  overId: string | null;
  issueByKey: Map<string, IssueItem>;
  findColumnForIssue: (issue: IssueItem) => string;
}): { key: string; targetColumn: string } | null {
  if (!overId) return null;
  const key = issueKeyFromDragId(activeId);
  const issue = issueByKey.get(key);
  if (!issue || findColumnForIssue(issue) === overId) return null;
  return { key, targetColumn: overId };
}

export function equalStringSets(left: Set<string> | null, right: Set<string>): boolean {
  return Boolean(left && left.size === right.size && [...right].every((key) => left.has(key)));
}
