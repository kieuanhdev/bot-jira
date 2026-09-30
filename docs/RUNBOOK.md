# Operations Runbook

> Scope: day-to-day and incident response for Team Task Web (web + worker + Postgres).
> Audience: the on-call operator. Each section is self-contained so you can act
> without reading the source.

## How the system is deployed

Two services share one Postgres database (`teamweb` network):

| Service  | What it does | Restart policy |
|----------|--------------|----------------|
| `web`    | Next.js app (UI + API + webhooks) | `unless-stopped` |
| `worker` | pg-boss background jobs (Jira/Bitbucket/Sentry/AI/stale/outbox/alerts) | `unless-stopped` |

The **worker** is the only process that mutates Jira via the sync jobs and that
delivers push notifications. Stopping the worker does **not** lose the read
model — it only stops refresh/delivery until it is started again.

## Everyday checks

1. `GET /api/health` (admin) — reports `worker.status` (`healthy`/`degraded`/
   `down`/`unknown`), `worker.jiraFresh`, and per-job last-success/error.
2. `GET /api/freshness` (any signed-in user) — the same signal the in-app
   banner polls every 30s.
3. `GET /api/admin/metrics` (admin) — outbox, Sentry import, release, gate and
   AI rollups.
4. `GET /api/admin/sentry-import` (admin) — Sentry import queue; retry a row
   with `POST { id }`.

A healthy deployment shows: `worker.status = healthy`, `jiraFresh = true`,
outbox `pending` near 0, no Sentry `failed`.

## Alert & Watchdog semantics (OPS-03 & Self-Healing)

The worker runs a `health-alert` watchdog every **1 minute**. It performs both monitoring and self-healing:
1. **Liveness & Freshness inspection:** reads each project's `IntegrationCursor`.
2. **Auto-Recovery Enqueue:** detects projects that are stale (> `JIRA_FRESHNESS_MINUTES`) or have errors newer than their last success, and immediately enqueues a `source: "recovery"` sync job with elevated priority (5) and a 4-minute per-project deduplication window.
3. **Alert conditions & Granular Recovery:**
   - **Worker down** — liveness heartbeat missing or > 2 min.
   - **Jira sync stale** — per-project stale alert (`jira-stale:<PROJECT>`).
   - **Jira sync failed** — per-project failure alert (`jira-failed:<PROJECT>`).
   - **Auto-Recovery announcement** — sends a recovery notification as soon as the project sync recovers (`Đồng bộ Jira đã phục hồi: <PROJECT>`).
   - **Background job error** — a job's last error is newer than its last success.
   - **Notification outbox backlog** — a pending push older than 10 minutes.

Alerts go to all users' in-app + push destinations, and private Discord webhooks.

## Incident: worker stopped or wedged

**Symptom:** banner shows "worker down"; `/api/health` shows `worker.status: down`; container healthcheck fails.

### Container Healthcheck & Auto-Recovery
The worker container has an active healthcheck running `node scripts/check-worker-health.mjs` every 30s (`start_period: 60s`, `timeout: 10s`, `retries: 3`). If the worker stops writing heartbeat for > 2 minutes:
- Container status switches to `unhealthy`.
- **Docker Compose**: Service `autoheal` (`willfarrell/autoheal:1.2.0`) is configured in `compose.yaml` to monitor containers labeled `autoheal: "true"`. Only `worker` has this label (database is excluded). Unhealthy worker containers are automatically restarted.
- **Podman**: Configure `--health-on-failure=restart` on container run or pod definition.
- **Kubernetes**: Configure container `livenessProbe` with `exec` running `node scripts/check-worker-health.mjs` (Compose autoheal is not needed in K8s).

### Manual Recovery Steps
1. Confirm logs: `podman logs teamweb-worker --tail 50` or `docker compose logs worker --tail 50`.
2. If stopped or wedged: `podman compose restart worker` or `docker compose restart worker`.
3. On restart:
   - Worker boots, registers queues, then writes the initial liveness heartbeat and logs `worker ready`.
   - pg-boss reclaims in-flight jobs; incomplete jobs are supervised by worker heartbeat and released after `expireInSeconds` (default 15m, configurable via `JIRA_SYNC_EXPIRE_SECONDS`) and automatically retried with exponential backoff (10s → 20s → 40s → 80s, up to 4 attempts).
   - Startup reconciliation checks for stale/failing projects (and handles brand-new DB with zero cursors) and enqueues projects needing sync.
4. Verify recovery: within 1–2 minutes, `/api/freshness` flips to `healthy` and a recovery notification is broadcast.

**No data is lost** on restart. In-flight jobs are re-claimed by pg-boss
(singletons are not double-run).

## Incident: Jira unavailable

**Symptom:** `jira` service ping fails in `/api/health`; `poll-jira` errors;
Jira sync goes stale.

- The app keeps serving cached data; the banner warns "data is stale".
- Release ready-checks report `data_freshness = unknown` and **cannot** be
  `ready` (fail-safe) — do not attempt a release while Jira is down.
- Jira is the source of truth, so no local mutation is possible until it is
  back. Wait for Jira, then confirm the next `poll-jira` succeeds.
- Per-user credentials that fail (401/403) surface as job errors; do **not**
  fall back to a higher-privilege token. Rotate the user's token in Settings.

## Incident: Bitbucket unavailable

**Symptom:** `check-branches` errors; branches stop refreshing.

- Branch/PR gates report `unknown` (cannot verify), so a release cannot become
  `ready`. Cached `BranchInfo` stays but `checkedAt` ages out.
- No local state is lost. When Bitbucket returns, the next `check-branches`
  (every 5 min) reconciles.

## Incident: Sentry unavailable

**Symptom:** `sentry-import` errors; new Sentry issues do not appear on Jira.

- Import is idempotent on `(sentryProject, sentryIssueId)`; missed issues are
  caught by the 5-minute reconciliation poll once Sentry is back.
- If the worker crashes *after* Jira created the issue but *before* recording
  it, the next retry recovers the Jira key by the `sentry-id-*` label — it will
  **not** create a duplicate.
- Check `GET /api/admin/sentry-import` for `failed` rows and retry them.

## Incident: AI (LLM) unavailable

**Symptom:** `ai-score` errors; AI advisory shows unavailable.

- AI is **advisory only**: it never makes a release ready and never blocks one.
- No fake/fallback estimate is recorded as a real score.
- Safe to ignore until the provider is back; the next `ai-score` run resumes.

## Incident: notification outbox backlog

**Symptom:** `/api/admin/metrics` shows high `outbox.pending`; an
"outbox backlog" alert fired.

1. `podman logs teamweb-worker --tail 100` — look for `deliver-notifications`
   errors (VAPID key, 410 expired subscription).
2. Expired subscriptions are cleared automatically when the provider returns
   404/410.
3. If VAPID is misconfigured, regenerate keys (`node scripts/gen-vapid.mjs`) and
   set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`; in-app notifications are
   unaffected (they are the source of truth).

## Incident: a background job is stuck

**Symptom:** one job's `lastSuccessAt` is far behind while others run.

- Check `/api/health` `workers` list for the job's `lastError`.
- Jobs are singletons with bounded retries; a persistent failure usually means
  an upstream credential problem, not a code problem.
- To force a re-run now, enqueue the equivalent via the relevant API (e.g.
  `POST /api/sync/jira`) or simply `podman compose restart worker`.

## Credential rotation & Token Management

- **Jira / Bitbucket / Sentry tokens:** update the env vars, restart `web` and
  `worker`. Per-user tokens are edited in Settings (re-encrypted at rest).
- **`CRED_ENCRYPTION_KEY`:** do **not** rotate unless you have a re-encrypt
  procedure for stored per-user credentials; rotating it makes stored tokens
  unreadable.
- **Backfill Jira Identities:**
  Run `npx tsx --env-file-if-exists=.env scripts/backfill-jira-identities.ts [--dry-run]`
  to verify and associate stable `jiraIdentityKey` for existing users without leaking tokens.
- **Token leak runbook:**
  1. Revoke the token immediately on Jira Data Center.
  2. Disconnect in Settings or update user record in DB (`jiraTokenEnc = null`).
  3. If widespread session compromise is suspected, rotate `NEXTAUTH_SECRET` and restart `web` to terminate all active 30-day sessions immediately.

## Admin break-glass & rollback

If Jira token login encounters critical upstream downtime or identity lockouts:
1. Set `LEGACY_PASSWORD_LOGIN=1` in `.env` and restart `web`.
2. Open `/login?legacy=1` to display the email and password login form.
3. Authenticate with admin credentials (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

## Database restore

See `docs/BACKUP_RESTORE.md` for the backup schedule and the tested restore
procedure.
