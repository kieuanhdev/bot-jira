import type { PrismaClient } from "@prisma/client";
import { env } from "@/lib/env";
import { jiraPointsFromFields } from "@/lib/jira/client";
import {
  DEFAULT_PEOPLE_FIELDS,
  getProjectPeopleFields,
  jiraIssueFieldsForProject,
  type ProjectPeopleFieldsMap,
} from "@/lib/jira/people-fields";
import type { JiraComment, JiraIssue } from "@/lib/jira/types";
import { getEpicLinkFieldIds } from "@/lib/issues/epic";
import {
  mapJiraCommentToCacheData,
  mapJiraIssueLinks,
  mapJiraIssueToCacheData,
} from "@/lib/issues/mapping";
import { notifyWatchersOfIssueChange } from "@/lib/issues/notify-watchers";
import {
  issueRepository,
  type NewComment,
} from "@/lib/issues/repository";

export type { NewComment } from "@/lib/issues/repository";
export { isPrismaUniqueConstraintError } from "@/lib/issues/repository";

export function issueCacheData(
  issue: JiraIssue,
  peopleFields: ProjectPeopleFieldsMap = {
    reporter: DEFAULT_PEOPLE_FIELDS.reporter,
    approver: DEFAULT_PEOPLE_FIELDS.approver,
    tester: DEFAULT_PEOPLE_FIELDS.tester,
  }
) {
  return mapJiraIssueToCacheData(issue, {
    peopleFields: {
      reporter: peopleFields.reporter,
      approver: peopleFields.approver ?? DEFAULT_PEOPLE_FIELDS.approver,
      tester: peopleFields.tester ?? DEFAULT_PEOPLE_FIELDS.tester,
    },
    points: jiraPointsFromFields(issue.fields),
    epicLinkFieldIds: getEpicLinkFieldIds(),
    syncedAt: new Date(),
  });
}

type IssueLinkClient = Pick<PrismaClient, "issueLinkCache">;

/** Compatibility entry point for callers that still provide raw Jira links. */
export function syncIssueLinks(
  issueKey: string,
  rawLinks?: JiraIssue["fields"]["issuelinks"],
  tx?: IssueLinkClient
): Promise<number> {
  if (!Array.isArray(rawLinks)) return Promise.resolve(0);
  const links = mapJiraIssueLinks(issueKey, rawLinks, {
    linkTypeName: env.jiraDependencyLinkType,
    inwardLabel: env.jiraDependencyInwardLabel,
  });
  return issueRepository.syncIssueLinks(issueKey, links, tx);
}

export async function upsertJiraIssue(
  issue: JiraIssue
): Promise<{ applied: boolean; data: ReturnType<typeof issueCacheData> }> {
  const projectKey = issue.fields.project?.key ?? issue.key.split("-")[0] ?? "";
  const peopleFields = projectKey
    ? await getProjectPeopleFields(projectKey).catch(() => undefined)
    : undefined;
  const data = issueCacheData(issue, peopleFields);
  const links = Array.isArray(issue.fields.issuelinks)
    ? mapJiraIssueLinks(issue.key, issue.fields.issuelinks, {
        linkTypeName: env.jiraDependencyLinkType,
        inwardLabel: env.jiraDependencyInwardLabel,
      })
    : undefined;

  return issueRepository.persistIssue({ jiraKey: issue.key, data, links });
}

type RefreshIssueCacheDependencies = {
  findIssueByKey: typeof issueRepository.findIssueByKey;
  issueFieldsForProject: typeof jiraIssueFieldsForProject;
  upsertIssue: typeof upsertJiraIssue;
  notifyIssueChange: typeof notifyWatchersOfIssueChange;
};

export function createIssueCacheRefreshService(deps: RefreshIssueCacheDependencies) {
  return async function refreshIssueCache(
    client: { getIssue: (key: string, fields?: string) => Promise<JiraIssue> },
    key: string,
    options: { authorName?: string | null; excludeUserId?: string | null } = {}
  ): Promise<boolean> {
    try {
      const previous = await deps.findIssueByKey(key);
      const fields = await deps.issueFieldsForProject(key.split("-")[0]);
      const { applied, data: current } = await deps.upsertIssue(
        await client.getIssue(key, fields)
      );
      if (applied) {
        await deps.notifyIssueChange(previous, { jiraKey: key, ...current }, options)
          .catch(() => null);
      }
      return applied;
    } catch {
      return false;
    }
  };
}

export const refreshJiraIssueCache = createIssueCacheRefreshService({
  findIssueByKey: issueRepository.findIssueByKey,
  issueFieldsForProject: jiraIssueFieldsForProject,
  upsertIssue: upsertJiraIssue,
  notifyIssueChange: notifyWatchersOfIssueChange,
});

function mappedComments(jiraKey: string, comments: JiraComment[]) {
  return comments.flatMap((comment) => {
    const mapped = mapJiraCommentToCacheData(jiraKey, comment);
    return mapped ? [mapped] : [];
  });
}

export async function upsertJiraComments(
  jiraKey: string,
  comments: JiraComment[]
): Promise<number> {
  const result = await issueRepository.persistComments(mappedComments(jiraKey, comments), {
    reconcileLegacy: true,
    collectNew: false,
  });
  return result.synced;
}

export async function upsertJiraCommentsWithNew(
  jiraKey: string,
  comments: JiraComment[]
): Promise<{ synced: number; newComments: NewComment[] }> {
  return issueRepository.persistComments(mappedComments(jiraKey, comments), {
    reconcileLegacy: false,
    collectNew: true,
  });
}
