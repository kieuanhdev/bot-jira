export {
  isPrismaUniqueConstraintError,
  issueCacheData,
  refreshJiraIssueCache,
  syncIssueLinks,
  upsertJiraComments,
  upsertJiraCommentsWithNew,
  upsertJiraIssue,
} from "@/lib/issues/cache-service";
export type { NewComment } from "@/lib/issues/cache-service";
