// OPS-03 — Vietnamese labels for the in-app freshness banner.
//
// Worker job cursors are keyed by scope (see `recordRun` in src/lib/queue/boss.ts).
// Most scopes are a bare job name, but the per-project Jira sync records
// `poll-jira-project:<PROJECTKEY>`, so a failing Jira sync can be reported as a
// project rather than as an opaque background job.

/** Vietnamese labels for worker job scopes (see `JOB_NAMES` in src/lib/queue/job-names.ts). */
const JOB_LABELS: Record<string, string> = {
  "poll-jira-dispatch": "Điều phối đồng bộ Jira",
  "poll-jira-project": "Đồng bộ dự án Jira",
  "poll-jira": "Đồng bộ Jira",
  "poll-watched-issues": "Theo dõi issue",
  "refresh-board-membership": "Làm mới thành viên board",
  "check-branches": "Kiểm tra nhánh Git",
  "sync-dev-status": "Đồng bộ trạng thái dev",
  "parse-comment-branches": "Phân tích nhánh trong bình luận",
  "poll-pr-comments": "Đồng bộ bình luận PR",
  "ai-score": "Chấm điểm AI",
  "sentry-import": "Nhập dữ liệu Sentry",
  "stale-detect": "Phát hiện task ì ạch",
  "bulk-op": "Thao tác hàng loạt",
  "process-webhook": "Xử lý webhook",
  "deliver-notifications": "Gửi thông báo",
  "health-alert": "Cảnh báo sức khỏe hệ thống",
  "capture-project-report-snapshots": "Chụp số liệu báo cáo",
  "detect-people-fields": "Dò trường nhân sự",
};

/** Job scopes whose suffix after ":" is a Jira project key. */
const PROJECT_SCOPED_JOBS = new Set(["poll-jira-project", "poll-jira"]);

export type FailureNames = {
  /** Project keys, from the Jira cursors plus any project-scoped failing job. */
  projects: string[];
  /** Vietnamese labels for the remaining, non-project-scoped jobs. */
  jobs: string[];
};

/**
 * Split failing projects/jobs into what the banner shows: project keys first,
 * then labelled jobs. A `poll-jira-project:EPM` failure counts as project EPM.
 */
export function splitFailureNames(
  failingProjects: string[],
  failingJobs: string[]
): FailureNames {
  const projects = [...failingProjects];
  const jobs: string[] = [];

  for (const scope of failingJobs) {
    const sep = scope.indexOf(":");
    const base = sep === -1 ? scope : scope.slice(0, sep);
    const suffix = sep === -1 ? "" : scope.slice(sep + 1).trim();

    if (suffix && PROJECT_SCOPED_JOBS.has(base)) {
      const key = suffix.toUpperCase();
      if (!projects.some((p) => p.toUpperCase() === key)) projects.push(key);
      continue;
    }
    const label = JOB_LABELS[base] ?? base;
    const text = suffix ? `${label} (${suffix})` : label;
    if (!jobs.includes(text)) jobs.push(text);
  }

  return { projects, jobs };
}

const MAX_NAMES = 3;

/** Short inline list ("A, B, C +2"); callers put the full list in a `title`. */
export function nameList(items: string[]): string {
  if (items.length <= MAX_NAMES) return items.join(", ");
  return `${items.slice(0, MAX_NAMES).join(", ")} +${items.length - MAX_NAMES}`;
}
