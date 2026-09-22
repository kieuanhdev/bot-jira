# Team Task Web — Architecture Decisions

> Status: Accepted
>
> Decision date: 2026-09-19
>
> Scope: M0-01
>
> Owner role: Team Task Web administrator (`ADMIN_EMAIL`)
>
> Next review: Before starting Milestone 3

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

### Personal credentials

User-initiated Jira and Bitbucket mutations use credentials encrypted on the
user record. This includes:

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
- Expired personal token: return an integration-authentication error and notify
  the user to reconnect.
- Service account unavailable: mark synced data stale and affected gates
  `unknown`.
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

Discord integration is planned after the event, notification and bulk-command
foundations. It is not part of the first data-foundation milestone.

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

This decision record describes the accepted target. The following gaps still
exist and are tracked in `docs/IMPLEMENTATION_PLAN.md`:

| Area | Current implementation | Accepted target | Work item |
|---|---|---|---|
| Board reads | Shared PostgreSQL read model | Shared PostgreSQL read model | Completed in M1-04 |
| Jira sync | Incremental cursor sync with overlap | Webhook-first + polling reconciliation | M1-03 complete; webhook in M5 |
| Worker lifecycle | Separate pg-boss process/container | Separate worker process | Completed in M1-05 |
| Release identity | Jira label | Jira Fix Version | M3-01 |
| Chat | Web inbox + Discord through `ChatProvider` | Discord first through `ChatProvider` | M6 complete (Discord adapter, commands, outbound, audit); a second adapter (Slack/Teams) still adds via the same interface |
| Comment events | Web-created comments | Jira webhook + polling repair | M2-04/M5 |

Milestone 1 is implemented; its runtime acceptance checks still need staging
verification against the real Jira instance. Until M2 is complete, release
checks must not be used as the sole production release authorization.

## 12. Architectural invariants

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

## 13. Review triggers

Review this architecture decision when:

- The team replaces Jira or Bitbucket.
- Multi-tenant/company-wide deployment is introduced.
- SSO/LDAP replaces local authentication.
- A second chat adapter is added.
- Event volume requires a queue other than PostgreSQL/pg-boss.
- Release automation is allowed to deploy without a human confirmation.
