// Cheap triage of Sentry issues before spending an AI run: which ones can a
// code reading explain at all. Pure, no network, so it also runs at queue time.

type IssueText = { title: string | null; culprit: string | null };

const SYSTEM_TITLE = [
  /^ApplicationNotResponding\b/i, // ANR: thread dump of the OS, no app frame
  /^App Hanging\b/i, // main-thread stall: needs profiling, not a code reading
  /\bfinalize\(\) timed out\b/i, // Android finalizer watchdog
];
// Failures whose cause is outside the app's own code: the server, the network, Firebase rules,
// the device itself, or a condition the app already reports to the user.
const EXTERNAL_TITLE = [
  /^HTTPClientError\b/i,
  /^DioException\b/i,
  /^FirebaseException\b.*permission-denied/i,
  /^OSError\b.*No space left/i,
  /Install Error\(/i,
  /^LocationServiceDisabledException\b/i,
  /^Exception: test$/i,
  /^_Exception: Exception: test$/i,
];
const SYSTEM_CULPRIT = [/^(java|javax|android|androidx|dalvik|kotlin|libc|syscall)\b/i];

/** True when the issue is OS/runtime/backend-level noise that reading the app's code cannot explain. */
export function looksSystemLevel(issue: IssueText): boolean {
  const title = issue.title ?? "";
  const culprit = issue.culprit ?? "";
  return (
    SYSTEM_TITLE.some((r) => r.test(title)) ||
    EXTERNAL_TITLE.some((r) => r.test(title)) ||
    SYSTEM_CULPRIT.some((r) => r.test(culprit))
  );
}

/** Same error shown under several Sentry issues: equal normalised title + culprit. */
export function duplicateKey(issue: IssueText): string {
  const norm = (v: string | null) => (v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return `${norm(issue.title)}|${norm(issue.culprit)}`;
}

/**
 * One key per kind of error, ignoring the culprit: 8 repositories failing with the same
 * "Null is not a subtype of Map" share one cause, so one analysis covers them all.
 */
export function titleKey(issue: IssueText): string {
  return (issue.title ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
