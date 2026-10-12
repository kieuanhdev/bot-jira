import { extractEpicKey } from "@/lib/issues/epic";
import type { JiraFields, JiraIssueReference } from "@/lib/jira/types";

export type RelatedIssue = {
  jiraKey: string;
  summary: string;
  status: string;
  type: string;
};

export type LinkedIssue = RelatedIssue & {
  relation: string;
};

export type IssueRelationships = {
  epic: RelatedIssue | null;
  parent: RelatedIssue | null;
  children: RelatedIssue[];
  links: LinkedIssue[];
};

export type CachedRelatedIssue = RelatedIssue & { epicKey?: string | null };

function fromReference(reference: JiraIssueReference): RelatedIssue {
  return {
    jiraKey: reference.key,
    summary: reference.fields?.summary ?? "",
    status: reference.fields?.status?.name ?? "",
    type: reference.fields?.issuetype?.name ?? "",
  };
}

function mergeIssue(issue: RelatedIssue, cacheByKey: Map<string, CachedRelatedIssue>): RelatedIssue {
  const cached = cacheByKey.get(issue.jiraKey.toUpperCase());
  if (!cached) return issue;
  return {
    jiraKey: issue.jiraKey,
    summary: issue.summary || cached.summary,
    status: issue.status || cached.status,
    type: issue.type || cached.type,
  };
}

function uniqueIssues(issues: RelatedIssue[]): RelatedIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = issue.jiraKey.toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Build all task relationships from Jira's issue payload and the local read model. */
export function buildIssueRelationships(
  issueKey: string,
  fields: JiraFields | null | undefined,
  cachedIssues: CachedRelatedIssue[] = []
): IssueRelationships {
  const raw = fields ?? {};
  const currentKey = issueKey.toUpperCase();
  const cacheByKey = new Map(cachedIssues.map((issue) => [issue.jiraKey.toUpperCase(), issue]));
  const epicKey = extractEpicKey(raw);
  const rawParent = raw.parent;
  const parentIssue = rawParent ? fromReference(rawParent) : null;

  const epic = epicKey
    ? mergeIssue(
        parentIssue?.jiraKey.toUpperCase() === epicKey.toUpperCase()
          ? parentIssue
          : { jiraKey: epicKey, summary: "", status: "", type: "Epic" },
        cacheByKey
      )
    : null;

  const parent = parentIssue && parentIssue.jiraKey.toUpperCase() !== epicKey?.toUpperCase()
    ? mergeIssue(parentIssue, cacheByKey)
    : null;

  const jiraChildren = (raw.subtasks ?? []).map(fromReference);
  const cachedChildren = cachedIssues.filter(
    (candidate) => candidate.epicKey?.toUpperCase() === currentKey
  );
  const children = uniqueIssues([...jiraChildren, ...cachedChildren])
    .filter((child) => child.jiraKey.toUpperCase() !== currentKey)
    .map((child) => mergeIssue(child, cacheByKey));

  const links = (raw.issuelinks ?? []).flatMap((link): LinkedIssue[] => {
    const reference = link.inwardIssue ?? link.outwardIssue;
    if (!reference || reference.key.toUpperCase() === currentKey) return [];
    const related = mergeIssue(fromReference(reference), cacheByKey);
    return [{
      ...related,
      relation: link.inwardIssue ? link.type.inward : link.type.outward,
    }];
  });

  return {
    epic,
    parent,
    children,
    links: links.filter((link, index) =>
      links.findIndex(
        (candidate) =>
          candidate.jiraKey.toUpperCase() === link.jiraKey.toUpperCase() &&
          candidate.relation === link.relation
      ) === index
    ),
  };
}

export function relationshipKeys(issueKey: string, fields: JiraFields | null | undefined): string[] {
  const raw = fields ?? {};
  const keys = [
    extractEpicKey(raw),
    raw.parent?.key,
    ...(raw.subtasks ?? []).map((issue) => issue.key),
    ...(raw.issuelinks ?? []).flatMap((link) => [link.inwardIssue?.key, link.outwardIssue?.key]),
  ];
  const currentKey = issueKey.toUpperCase();
  return [...new Set(keys.filter((key): key is string => Boolean(key)).map((key) => key.toUpperCase()))]
    .filter((key) => key !== currentKey);
}
