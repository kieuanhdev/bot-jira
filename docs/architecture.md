# Team Task Web — Architecture Decisions

> Status: Accepted
>
> Decision date: 2026-09-19
>
> Last implementation review: 2026-10-09 (Clean Code batch 9.3)
>
> Scope: M0-01
>
> Owner role: Team Task Web administrator (`ADMIN_EMAIL`)
>
> Next review: Before production rollout, after browser/manual QA is available

Release workflow, gate, severity, role và stale SLA được quy định tại
[`release-policy.md`](release-policy.md).

## 1. Purpose

This document records the architectural decisions that guide Team Task Web.
It describes the target architecture and explicitly calls out the current
transitional state where the implementation has not reached that target yet.

The application is an operational layer above Jira. It is not a replacement
system of record for Jira data.

## 2. Decision summary

| ID | Decision | Status |
|---|---|---|
| ADR-001 | Jira remains the issue source of truth; PostgreSQL is the shared read model | Accepted |
| ADR-002 | Service accounts read/sync; user-initiated mutations use personal credentials | Accepted |
| ADR-003 | Webhooks are primary; polling is reconciliation and recovery | Accepted |
| ADR-004 | Web and background workers run as separate processes | Accepted |
| ADR-005 | Discord is the first chat integration | Accepted |
| ADR-006 | Branch names contain one primary Jira key and follow a fixed convention | Accepted |
| ADR-007 | Integration ownership and credential rotation belong to the configured administrator | Accepted |

## 3. System boundaries

### 3.1 Sources of truth

| Domain | Source of truth | Local responsibility |
|---|---|---|
| Issue, workflow, assignee, priority, Fix Version, comment | Jira Data Center | Cache/search, automation metadata and UI |
| Branch and pull request | Bitbucket Data Center | Task mapping, release evidence and stale detection |
| Error/regression/severity | Sentry | Import state, Jira mapping and release evidence |
| Build/test/deploy result | CI provider | Latest status and release evidence |
| User account and application role | Team Task Web database | Authentication and application RBAC |
| Watch, notification, release check, override, audit | Team Task Web database | Full ownership |

PostgreSQL is not allowed to silently overwrite authoritative Jira fields. A
local write to cached Jira data must be the result of either:

1. A successful Jira mutation, or
2. A Jira sync/webhook event.

### 3.2 Read path

The target read path is:

```text
Jira / Bitbucket / Sentry / CI
              │
       webhook + polling
              │
        queue workers
              │
       PostgreSQL read model
              │
         Next.js API/UI
```

Board, release, stale, watch, AI scoring and notification must read from the
same read model. A detail page may perform a live refresh when requested, but
it must reconcile the result into the read model instead of creating a second
independent view of the data.

### 3.3 Write path

The target user-initiated write path is:

```text
User → Next.js API → authentication/RBAC → personal Jira/Bitbucket token
     → external mutation → local cache update → audit event → reconciliation
```

If a personal credential is missing or invalid, the operation fails clearly.
It must not silently fall back to a more privileged service account.

Background integrations may perform only their explicitly assigned mutations:

- Sentry automation may create a Jira bug using a restricted Jira automation
  account.
- The sync worker is read-only.
- Notification workers do not mutate Jira or Bitbucket.
- Release automation does not mark a Jira version released without an
  authorized release-manager command.

## 4. ADR-001 — Shared PostgreSQL read model

### Context

The current implementation has two read paths: the Board queries Jira live per
user, while release, stale, watch and AI use `IssueCache`. This can produce
different answers for the same task.

### Decision

- Jira remains authoritative.
- PostgreSQL becomes the single application read model.
- A Jira service account synchronizes every configured project.
- Webhook events update the read model quickly.
- Incremental polling repairs missed or delayed events.
- Every cached row records source update time and local sync time.
- UI surfaces data freshness when the synchronization SLA is exceeded.

### Consequences

- The Board becomes fast and consistent with release/stale/watch views.
- The application must operate a reliable worker process.
- A short synchronization delay is accepted and displayed.
- Live Jira calls remain appropriate for contextual transitions and final
  permission checks before a mutation.

## 5. ADR-002 — Credential and authorization model

### Jira service account

Environment variables `JIRA_USER`, `JIRA_TOKEN` and `JIRA_AUTH` identify the
Jira service account.

Required permissions:

- Browse configured projects.
- Read issue metadata and comments.
- Read projects, workflows/statuses and versions.
- Create issues only when used as the restricted Sentry automation account.

The service account should not have Jira administrator permission. If company
policy allows, use separate read-only sync and Sentry-writer accounts. The
initial deployment may use one account, but permissions must be the union of
only those two responsibilities.

### Personal credentials & Token-based login

Users authenticate directly to Team Task Web using their Jira Personal Access Token (PAT):
- The server verifies the token against Jira `/rest/api/2/myself` (Bearer preferred, Basic fallback).
- Matches an existing user by stable `jiraIdentityKey` (or unique username alias / email fallback) or auto-provisions a new internal `User` with role `member`.
- The token is encrypted using AES-256-GCM at rest; the browser only receives a 30-day `HttpOnly` session cookie. Raw tokens are never stored in browser storage or logs.
- Bitbucket credentials remain optional and configurable in Settings for branch/PR workflows.

User-initiated Jira and Bitbucket mutations use these encrypted credentials:

- Editing issue metadata.
- Transitioning an issue.
- Adding a comment.
- Bulk actions.
- Creating a branch.
- Creating or releasing a version when authorized.

Application RBAC is checked first; Jira/Bitbucket remains the final permission
authority. Hiding a button in the UI is not an authorization control.

### Failure behavior

- Missing personal token: return a setup-required error.
- Expired personal token: return an integration-authentication error and display the reconnect banner.
- Service account unavailable: mark synced data stale and affected gates `unknown`.
- Never include tokens in logs, audit payloads or API responses.

## 6. ADR-003 — Webhook-first with polling reconciliation

### Decision

Webhooks are the primary source for low-latency updates:

- Jira: issue created/updated/deleted, transition and comment.
- Sentry: issue created, regression, resolved and severity changes.
- Bitbucket: branch and pull-request lifecycle.
- CI: build, test and deployment status.

Polling remains mandatory for reconciliation:

- Jira incremental poll every 1–2 minutes.
- Bitbucket branch/PR reconciliation every 5 minutes.
- Sentry unresolved issue reconciliation every 5 minutes.
- Full low-frequency repair scan based on deployment size.

### Processing rules

- Verify each webhook signature or shared secret.
- Persist the external event ID before processing.
- Deduplicate on `(source, externalEventId)`.
- Acknowledge the webhook quickly and process through the queue.
- Handlers must be idempotent.
- Polling and webhook processing must converge to the same state.
- Retry transient errors with exponential backoff and bounded attempts.

## 7. ADR-004 — Separate web and worker processes

### Decision

Deployment contains:

```text
web     Next.js UI and route handlers
worker  pg-boss schedules and consumers
db      PostgreSQL and pg-boss storage
```

The health endpoint is read-only. It must not start workers or mutate
infrastructure state.

### Worker responsibilities

- Register schedules at process startup.
- Consume sync, Sentry, branch, stale, AI and notification jobs.
- Handle SIGTERM and stop gracefully.
- Report last start, last success, last failure and item counts.
- Use singleton/locking rules to prevent overlapping project syncs.

### Worker queues and schedules (current)

The registry defines 17 queues. Eleven have cron schedules; the rest are
on-demand or timer-driven.

| Scheduled job | Schedule | Purpose |
|---|---|---|
| `poll-jira-dispatch` | `POLL_INTERVAL_MS` (minimum 1 min) | Fan out isolated per-project sync jobs |
| `check-branches` | 5 min | Branch/PR status from Bitbucket API |
| `parse-comment-branches` | 5 min | Parse Jira comments for PR/branch state |
| `poll-pr-comments` | 15 min | Reconcile PR comments across repositories |
| `ai-score` | 10 min | Auto-score new unscored issues when enabled |
| `sentry-import` | 5 min | Import unresolved Sentry issues idempotently |
| `stale-detect` | 30 min | Detect tasks exceeding per-status SLA |
| `deliver-notifications` | 1 min | Deliver outbox notifications with retry/backoff |
| `health-alert` | 1 min | Watchdog, alerting and Jira recovery enqueue |
| `capture-project-report-snapshots` | Daily 00:15 | Persist report snapshots |
| `detect-people-fields` | Daily 01:30 | Refresh Jira people-field metadata |

On-demand/timer-driven queues are `poll-jira-project`, legacy-compatible
`poll-jira`, `poll-watched-issues`, `refresh-board-membership`, `bulk-op` and
`process-webhook`. Queue names, payloads and retry/expiry policy are public
operational contracts.

## 8. ADR-005 — Discord as the first chat integration

### Decision

Discord is the first chat adapter because it is the channel named in the
initial product request. The domain layer must expose a vendor-neutral
`ChatProvider` contract so Slack or Teams can be added without rewriting
command and notification logic.

### First delivery scope

- Outbound release blocked/ready notifications.
- Critical Sentry alerts.
- Watched-task comment notifications.
- Commands for task lookup, transition, watch and release check.

### Security constraints

- Discord identity must be explicitly linked to a Team Task Web user.
- Commands execute with that user's application role and Jira credential.
- Mutating commands show a preview; bulk commands require confirmation.
- Ambiguous natural language never executes directly.
- Every command has a correlation ID and audit record.

Discord integration and the command confirmation/audit path are implemented.
Slack or Teams remains a future adapter, not a second domain implementation.

## 9. ADR-006 — Branch naming convention

### Issue branches

```text
<type>/<JIRA-KEY>-<short-slug>
```

Allowed types:

- `feature`
- `bugfix`
- `hotfix`
- `chore`
- `refactor`

Examples:

```text
feature/EPM-123-add-release-gate
bugfix/MR-88-fix-login-timeout
hotfix/CICM-42-prevent-duplicate-import
```

Validation expression:

```regex
^(feature|bugfix|hotfix|chore|refactor)/[A-Z][A-Z0-9]+-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$
```

Rules:

- A branch has exactly one primary Jira key.
- A branch covering several tasks uses the primary task key; other tasks are
  linked through the PR or explicit application mappings.
- Slugs use lowercase ASCII letters, digits and hyphens.
- The base branch is configured per repository; default is `main`.
- A closed/declined PR is not considered merged.
- A PR counts for release only when merged into the configured release/base
  branch.

### Release branches

When a repository uses release branches:

```text
release/<semantic-version>
```

Examples:

```text
release/1.4.2
release/2.0.0-rc.1
```

The Jira Fix Version remains the release identity. A release branch is
evidence attached to that release, not a replacement identifier.

## 10. ADR-007 — Ownership and credential rotation

### Ownership

The configured Team Task Web administrator (`ADMIN_EMAIL`) is the accountable
owner until a named platform owner is recorded by the organization.

Responsibilities:

- Jira/Bitbucket/Sentry/Discord integration accounts.
- Token creation, least-privilege review and rotation.
- Webhook secrets.
- Worker health and failed-job review.
- Access removal during offboarding.

Operational access may be delegated, but ownership must not be shared through
personal credentials or undocumented accounts.

### Rotation procedure

1. Create a new credential with the same or narrower permissions.
2. Verify it against the relevant integration health check.
3. Deploy the new secret through the deployment secret store.
4. Confirm at least one successful sync/job/webhook.
5. Revoke the old credential.
6. Record the rotation in the operational audit/runbook.

Rotation requirements:

- Immediately after suspected exposure or owner offboarding.
- On the organization's normal secret-rotation interval.
- Before expiry for credentials with an expiration date.

`.env` is for local development only. Production credentials belong in the
deployment platform's secret store and must not be committed.

## 11. Current state versus target state

This decision record describes the accepted target. M0–M8 are implemented
(2026-09-22). Remaining gaps are tracked in `docs/archive/IMPLEMENTATION_PLAN.md`:

| Area | Current implementation | Accepted target | Work item |
|---|---|---|---|
| Board reads | Shared PostgreSQL read model | Shared PostgreSQL read model | ✅ M1-04 |
| Jira sync | Incremental cursor sync + webhook + polling reconciliation | Webhook-first + polling reconciliation | ✅ M1-03 + M5 |
| Worker lifecycle | Separate pg-boss process/container, 17 queues and 11 schedules | Separate worker process | ✅ M1-05 + Clean Code 3.1–3.3 |
| Release identity | Jira Fix Version | Jira Fix Version | ✅ M3-01 |
| Release gates | 8-gate engine (non_empty, task_status, critical_bugs, sentry, branches, pull_requests, data_freshness, ai_advisory) | Fail-safe gate engine | ✅ M3-03 |
| Bulk operations | 10 actions, preview → confirm → worker, max 500 | Bulk with preview/confirm/audit | ✅ M4 |
| Event/webhook | 4 webhook endpoints + event store + outbox | Webhook-first + dedupe | ✅ M5 |
| Chat | Discord through `ChatProvider`, commands + confirm + audit | Discord first through `ChatProvider` | ✅ M6; second adapter (Slack/Teams) still pending |
| AI estimation | Estimate + human review + metrics | AI advisory with human approval | ✅ M7 |
| Stale analytics | Per-status SLA, 8 reasons, bottleneck dashboard | Bottleneck view, not leaderboard | ✅ M8 |
| Branch/PR tracking | `check-branches` (Bitbucket API) + `parse-comment-branches` (Jira comment) | Branch/PR evidence for release gates | ✅ (comment-based fallback when no Bitbucket token) |
| RBAC | `member` / `lead` / `release_manager` / `admin`; API and chat share permission helpers | Server-side permission enforcement | ✅ Implemented; browser matrix QA pending |
| Audit log | Chat, bulk and release mutation/approval/override paths write audit records | Full audit for mutations | Implemented for priority paths; continue coverage review |
| Observability | Worker cursor stats, error logging | Structured JSON log, metrics, alerts | M9-03 |

Hardening still requires browser/manual QA and resolution or acceptance of the
open Clean Code risks. Until that verification is complete, release checks
must not be the sole production release authorization.

## 12. Implementation module boundaries

The 2026-10 Clean Code program keeps runtime contracts stable while making the
dependency direction explicit:

```text
Route handler → route service/query loader → domain policy/use case
                                         ↘ repository / provider adapter

Worker entry → registry → worker handler → domain service
             schedules   enqueue API      repository / provider adapter

Client page (state owner) → controller hook → pure model + API client
```

- Route handlers own HTTP auth, validation and response mapping; domain route
  services own orchestration. Compatibility type exports remain where callers
  still depend on them.
- Jira and Bitbucket clients keep facade exports, while transport and resource
  modules own external HTTP concerns. AI providers share normalized errors and
  response parsers without putting business rules in adapters.
- Repositories own Prisma transactions and idempotency. Pure calculators,
  policies and mappers do not import Prisma.
- Queue connection lifecycle, queue catalog, schedules and enqueue functions
  are separate modules; worker handlers keep job payload and fencing contracts.
- UI page clients remain long-lived state owners. Controller hooks isolate
  effects and pure models without moving state into short-lived dialogs/tabs.

The progress source of truth and open structural risks are in
[`clean-code/05-progress-tracker.md`](clean-code/05-progress-tracker.md).

## 13. Architectural invariants

Future changes must preserve these rules:

1. Jira remains authoritative for Jira-owned fields.
2. All product views use the shared read model.
3. User actions do not silently escalate to a service account.
4. Missing or stale evidence cannot pass a mandatory release gate.
5. Webhooks and polling are idempotent and converge to the same state.
6. External side effects are auditable.
7. AI output is advisory unless a human explicitly confirms the action.
8. A health check has no side effects.
9. Secrets never appear in source control, logs or API responses.

## 14. Review triggers

Review this architecture decision when:

- The team replaces Jira or Bitbucket.
- Multi-tenant/company-wide deployment is introduced.
- SSO/LDAP replaces local authentication.
- A second chat adapter is added.
- Event volume requires a queue other than PostgreSQL/pg-boss.
- Release automation is allowed to deploy without a human confirmation.
