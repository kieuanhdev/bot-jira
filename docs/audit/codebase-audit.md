# Codebase Audit — Team Task Web ("bot jira")

> Audit date: 2026-10-15 · Mode: planning-only (no source modified) · Auditor: Claude (Sonnet 5.5)
> Companion documents: [refactoring-plan.md](refactoring-plan.md) (primary execution doc), [architecture-guidelines.md](architecture-guidelines.md), [agent-handoff.md](agent-handoff.md).

## 1. Executive summary

The project is a mature, well-tested Next.js 16 / React 19 operational layer on top of Jira (see `docs/architecture.md`). The previous "Clean Code" programme (`docs/clean-code/`) and the React best-practices pass (`docs/react-best-practices-detailed-plan.md`, commit `107db01`) already removed most structural debt: `any` is almost absent, big lib modules were split, board/watch/issue pages prefetch on the server, and heavy tabs are `next/dynamic`.

Baseline is green: `tsc --noEmit` exit 0, `eslint --max-warnings=0` exit 0, `vitest run` 274 files / 2555 tests passed.

What remains is concentrated in three areas, in priority order:

1. **Security/trust-boundary gaps in the API layer** (one Critical, several High/Medium). The Critical one — an unauthenticated SSRF + Jira-token leak in the avatar proxy — was verified by reading the code.
2. **Reliability gaps in outbound I/O and background work**: Bitbucket has no timeout/retry (Jira has both), swallowed errors hide failures, one in-memory cache never evicts.
3. **Small, verified performance/UX gaps in the App Router layer** (sequential awaits, repeated user lookups, missing `loading.tsx`/`error.tsx` segments) plus a few oversized client components.

No architectural rewrite is justified. All recommendations improve the existing architecture in place.

**Important reconciliation:** `docs/clean-code/00-guardrails.md` forbids changing URLs, status codes, JSON responses and auth behaviour *inside the refactor programme*, and says real bugs go to separate batches. This audit is that separate bug/hardening track. Every task below that changes an externally visible behaviour is explicitly labelled **BEHAVIOUR CHANGE** and several are **BLOCKED** pending a human decision.

## 2. Repository and framework overview (verified)

| Item | Value |
|---|---|
| Framework | Next.js `^16.4.0` App Router, `reactCompiler: true`, `output: "standalone"`, `optimizePackageImports: [lucide-react, recharts]` (`next.config.ts`) |
| UI | React 19.2.8, Tailwind v4, shadcn/Radix, lucide-react, recharts, @dnd-kit |
| Data (client) | TanStack Query v5 (`src/lib/query-*.ts`, server prefetch + `HydrationBoundary`) |
| Data (server) | Prisma 7 + `@prisma/adapter-pg`, PostgreSQL, `pg-boss` queue (separate `worker` process, `src/worker.ts`) |
| Auth | next-auth v4, JWT strategy, 30-day maxAge, Jira-token login (+ legacy password behind `LEGACY_PASSWORD_LOGIN=1`) |
| Integrations | Jira DC, Bitbucket DC, Sentry, Discord, OpenAI/Ollama, web-push, exceljs |
| Validation | **None at runtime** — no zod/valibot dependency; JSON bodies are cast with `as` |
| Tests | Vitest 2, Node environment only (`src/**/*.test.ts`), 274 files; DB integration via `npm run test:db`. **No component/DOM tests, no e2e.** |
| TS | `strict: true`; only 7 non-test `any`/`as any` occurrences in `src` |
| Size | ~159k lines in `src` (incl. tests), 111 API `route.ts`, 21 pages, 182 `"use client"` files, 275 test files |
| No `proxy.ts` / `middleware.ts` | Authentication is enforced per route handler only |

Scripts: `dev`, `build`, `start`, `worker`, `lint`, `typecheck`, `test`, `test:db`, `db:*`.

## 3. Audit coverage and limits (be honest about these)

Four read-only analyses ran in parallel (pages/RSC, API/security, lib/worker) plus my own direct verification. **Coverage is partial; this is not a full line-by-line review.**

Verified directly by me (read the code): avatar proxy SSRF path, webhook signature fail-open, `settings/page.tsx`, `(app)/layout.tsx`, `board/page.tsx`, `users/[id]/role/route.ts`, `auth.ts` jwt/session callbacks, Bitbucket transport (no signal), report cache, `NON_OVERRIDABLE` duplication, `src/lib/project-scope.ts`, `next/dist/docs` proxy docs, existing `docs/clean-code/*`.

**Not inspected (or only grepped)** — listed so nobody assumes they are clean:

- Pages/components: `bulk-configure-step.tsx`, `jira-template-dialog.tsx`, `jobs-card.tsx`, `stale-client.tsx`, `stale-std-task-list.tsx`, `issue-filter-bar.tsx`, `assignee-filter.tsx`, `board-list-view.tsx`, board quick-panel internals, login/register clients, most hooks. `useEffect`-derived-state and inline-component issues in these are **unaudited**. `board-client.tsx`, `admin-sync-client.tsx`, `watch-client.tsx`, report-tab hooks were read only partly.
- API: most `admin/*`, `notify/*`, `chat/*`, `ai/*` handlers; `src/lib/jira/auth-service.ts`; Prisma migrations and relations; `.dockerignore`; per-handler N+1/`Promise.all` candidates; per-route `take:` limits. `.env` was deliberately never read.
- Lib/worker: `src/app/**` and `src/components/**` not read by the lib auditor; internals of `bulk/ops.ts`, `excel-parser.ts`, `csv-parser.ts`, `board-config.ts`, `board-membership-store.ts`, `dev-status.ts`, `release-readiness.ts` were sized, not read; most of `scripts/` (12 files) not reviewed; whether CI runs `test:db` is unknown; test↔source mapping is by file name only (integration tests such as `queue/jira-sync-*.test.ts` may cover "untested" files).
- Nothing was run at runtime. **No bundle analysis, no `next build`, no `test:db`, no benchmarks.** Every "bundle"/"render" claim below is inferred from imports and is labelled HYPOTHESIS.

## 4. Baseline diagnostics (actual results, 2026-10-15)

| Command | Result |
|---|---|
| `npx tsc --noEmit --incremental false` | exit 0, no errors |
| `npm run lint` (`eslint --max-warnings=0 src scripts prisma`) | exit 0, no warnings |
| `npx vitest run` | 274 files, **2555 tests passed**, exit 0 |
| `npm run build` | **NOT RUN** — writes `.next/` and may clash with a running dev server; run it as part of validation of each task |
| `npm run test:db` | **NOT RUN** — requires a PostgreSQL instance |
| Pre-existing failures | none observed |

## 5. Current architecture assessment

Strengths to preserve (see `architecture-guidelines.md`): Jira = source of truth, Postgres = read model (ADR-001); web/worker split; pg-boss with idempotent handlers; AES-GCM credential encryption; HMAC webhook verification with `timingSafeEqual`; report routes use a proper guard (`reports/route-guard.ts`: session + permission + scope + rate limit); audit redaction; `React.cache` on `getSession` and the server query client; Jira client already has timeout + retry + `Retry-After`.

Weaknesses: five divergent hand-rolled `fetch`+timeout implementations; no shared API boundary helper (auth, body parsing, error shape are re-implemented per route: 112 hand-rolled `{error:"unauthorized"}` 401s, 38 `req.json()` casts, ~286 `NextResponse.json({error…})` sites with varying extra fields); several `*-route-service.ts` files in `lib/` depend on `NextResponse` (acceptable, noted only).

## 6. Findings

Legend — **Status**: VERIFIED (I read the code) / VERIFIED-BY-AGENT (subagent evidence, spot-checked or grep-level) / HYPOTHESIS (needs measurement or per-handler review). Severity/Impact/Complexity/Risk use the scale from the task statement. "Task" links to `refactoring-plan.md`.

### 6.1 Security

| ID | Finding | Evidence | Sev | Status | Task |
|---|---|---|---|---|---|
| S1 | **Unauthenticated SSRF + Jira credential leak in avatar proxy.** Session is optional (falls back to `getSystemJiraAuth()`); `?url=` is used verbatim; `Authorization` is attached when `fetchUrl.startsWith(base)` — a host like `https://jira.corp.com.evil.tld` passes a prefix test; no origin allowlist, no redirect control, no body cap; `avatarCache` Map keyed by caller-supplied URL has no size cap | `src/lib/jira/avatar-route-service.ts` (`handleAvatarRequest` ~L242-324, `fetchImageWithDedup` L196-214, `avatarCache` L20); route `src/app/api/jira/avatar/route.ts`; only caller `src/components/jira-avatar.tsx:77` | **Critical** | VERIFIED | REF-001 |
| S2 | Webhook signature check **fails open** when the secret is unset (`if (!secret) return true;`). The four secrets are optional (`env.ts:174-177`). Contradicts the function's own doc comment; `docs/WEBHOOK_SETUP.md:25` documents it as intended ("empty secret ⇒ accept everything"), so this is a **policy decision**, not an accident. Discord verifier fails closed | `src/lib/events/signatures.ts:~33` | High | VERIFIED | REF-002 (BLOCKED D3) |
| S3 | Settings page loads **all users** (id, email, jiraUsername, role…) for every caller and ships them in the RSC payload; `JSON.parse(JSON.stringify())` is unnecessary. `project-leaders-settings.tsx` uses `users` for leader picking with `canManage = membersData?.canManage ?? isAdmin` → a **non-admin project leader may legitimately need the list**, so "pass `[]`" is unsafe | `src/app/(app)/settings/page.tsx:9-16`; `settings/project-leaders-settings.tsx:~85-105` | High (payload exposure verified; who may see it is a decision) | VERIFIED | REF-003 (BLOCKED D4) |
| S4 | **Issue routes have no project-scope check.** `?source=cache` returns cached issue for any signed-in user/key; non-cache path falls back to the system Jira account. **But** `project-scope.ts` documents scope as "projects the user chose on the Board… falls back to every active project", and `can()` deliberately returns true for most permissions → scope may be a *UI filter*, not an authorization boundary. Not classified as a defect until the owner decides | `src/lib/issues/detail-route-service.ts`; `src/lib/project-scope.ts` | Medium (policy) | VERIFIED-BY-AGENT | REF-006 (BLOCKED D2) |
| S5 | No runtime validation of request bodies: 38 `req.json()` + `as {…}`; ~25 use `.catch(() => ({}))` (malformed body silently becomes `{}`), ~13 have no catch (malformed JSON ⇒ unhandled 500, e.g. `users/[id]/role`, `issues/[key]/transition`, `issues/[key]/comments`, `push/subscribe`, `register`); `push/subscribe` stores `sub.subscription as object` into a Json column with no shape/size limit; no body-size limits | grep over `src/app/api`; `users/[id]/role/route.ts:15` | High | VERIFIED-BY-AGENT (role route read) | REF-004, REF-005 |
| S6 | `users/[id]/role`: `prisma.user.update` with unknown id throws P2025 → 500; admin can demote self/last admin; no audit call visible | `src/app/api/users/[id]/role/route.ts` (read in full) | Medium | VERIFIED | REF-004 |
| S7 | Auth rate-limit weaknesses: IP from client-controlled `x-forwarded-for` first hop; "unknown" IP bypasses limit (`rate-limit.ts:~40`); limiter is in-memory/per-process; legacy password login and `register` have no limiter; min password length 6; webhook limiter is one global bucket per source and runs before signature verification | `src/lib/auth.ts:~26-35,68`; `src/lib/rate-limit.ts`; `src/app/api/webhooks/_shared.ts` | Medium | VERIFIED-BY-AGENT | REF-007 (BLOCKED D5 for IP trust) |
| S8 | JWT role is written only at sign-in (`jwt` callback, `if (user)` branch, `auth.ts:105-108`) and never refreshed → a demoted admin keeps admin up to 30 days (`maxAge` 30d). Failure mode of unknown role is safe (`member`) | `src/lib/auth.ts:99-123` | Medium | VERIFIED | REF-008 |
| S9 | No security headers (CSP, frame, referrer) in `next.config.ts`; no Origin check on mutating routes (SameSite=Lax cookie mitigates most CSRF); Next 16 uses **`src/proxy.ts`** (middleware deprecated) | `next.config.ts`; `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` | Medium | VERIFIED | REF-009 |
| S10 | Raw upstream/Prisma messages returned to clients (`(e as Error).message`, `details: String(err)`) in ~10 routes | `issues/bulk`, `issues/[key]/versions|transitions`, `bulk/create*`, `reports/projects/snapshot`, ai-score | Medium | VERIFIED-BY-AGENT | REF-010 (BEHAVIOUR CHANGE) |
| S11 | Infra: compose publishes Postgres port with hard-coded creds by default; autoheal profile mounts docker.sock; web `CMD` runs `prisma migrate deploy && seed-admin` on every start (replica race; seed must not reset admin password — unverified); `env.ts` treats `NEXTAUTH_SECRET`/`CRED_ENCRYPTION_KEY` as optional strings; non-hex master key derived with plain SHA-256 | `compose.yaml`, `Dockerfile`, `src/lib/env.ts`, `src/lib/crypto.ts` | Low–Medium | VERIFIED-BY-AGENT | REF-017 (BLOCKED D6) |

### 6.2 Reliability

| ID | Finding | Evidence | Sev | Status | Task |
|---|---|---|---|---|---|
| R1 | **Bitbucket transport has no timeout and no retry** (`fetch` without `signal`; grep for `signal|AbortSignal|timeout` in `bitbucket/transport.ts` returns nothing). Jira client has AbortController + 2 retries + `Retry-After`. A hung Bitbucket stalls `check-branches`, `poll-pr-comments`, `sync-dev-status` | `src/lib/bitbucket/transport.ts` `request()`; `bitbucket/resources/repositories.ts:20,73`; compare `jira/client.ts:~296-385` | High | VERIFIED | REF-011, REF-012 |
| R2 | Five+ divergent timeout/abort implementations: `jira/dev-status.ts:106,209`, `jira/auth-service.ts:116`, `jira/avatar-route-service.ts:139,156,215`, `sentry/client.ts`, `ai/openai.ts`, `ai/ollama.ts`, `chat/discord.ts` (hard-coded 15000). `dev-status.ts` bypasses the Jira client (no `Retry-After`) | files listed | Medium | VERIFIED-BY-AGENT | REF-012 |
| R3 | Swallowed errors without logging (~69 `.catch(() => null)`-style): `queue/workers/health-alert.ts` (7 sites — alert-delivery failure invisible), `webhooks/jira.ts`, `jira-sync/runner.ts:54,134,137`, `process-webhook.ts:34` (`markEventFailed(...).catch(()=>null)` can leave event stuck), `issues/detail-route-service.ts:195,204` (local fix-version sync failure ⇒ DB/Jira divergence), `chat/confirmation.ts`, webhook routes' empty `catch` around enqueue, `safeDecrypt` returns null silently (key rotation looks like "no credentials"), `bitbucket getAllBitbucketCreds` hides DB outage | listed | Medium | VERIFIED-BY-AGENT | REF-013 |
| R4 | Worker: no `unhandledRejection`/`uncaughtException` handlers; `stopBoss()` has no timeout on shutdown (`src/worker.ts:~28`) | `src/worker.ts` (66 lines) | Low | VERIFIED | REF-014 |
| R5 | `reportCache` Map in `reports/server-cache.ts`: entries are overwritten on key reuse and deleted only by explicit invalidation (L161-175); no max size, no expiry sweep (verified by grep: only `.set` at L112, `.delete`/`.clear` in invalidation). Per-process, so invalidation does not reach other instances (multi-instance impact = HYPOTHESIS) | `src/lib/reports/server-cache.ts` | Medium | VERIFIED | REF-015 |
| R6 | Module-level mutable state: `jira/client.ts:47 knownPointFields`, `issues/epic.ts:3`, `jira/project-access.ts:20 accessCache`, `bitbucket/transport.ts:40 repoCredCache` (exported) — `getAllBitbucketCreds()` does Prisma + decrypt on every `request()` without explicit creds; `chat/discord.ts` cached token | files listed | Low–Medium | VERIFIED-BY-AGENT | REF-015 |
| R7 | `queue/workers/check-branches.ts:36-50`: sequential per-repo loop, awaited `prisma.branchInfo.findUnique` per branch (N+1) + per-branch `getCommit`; `poll-pr-comments.ts:140` sequential per repo; `jira/project-access.ts:66` sequential per credential | files listed | Medium | VERIFIED-BY-AGENT | REF-016 |
| R8 | External payloads cast with `as T` (`jira/client.ts requestOnce`, `bitbucket/transport.ts`); empty/204 returns `undefined as T`. Concentrated `as` casts: `bulk/repository.ts` (15), `issues/live.ts` (7), `credentials/route-service.ts` (7) | files listed | Medium | VERIFIED-BY-AGENT | **Deferred** (see §8) |
| R9 | Duplicate constant that must stay in sync: `NON_OVERRIDABLE` (`releases/gates/index.ts`/`evaluator.ts`) vs `NON_OVERRIDABLE_GATES` (`releases/repository.ts:5`, `{"non_empty_release","ci"}`) — release-gate safety rule defined twice | grep | Low | VERIFIED | REF-018 |

### 6.3 Performance (App Router)

None of these have measurements; they are code-evidenced waste, not proven bottlenecks.

| ID | Finding | Evidence | Sev | Status | Task |
|---|---|---|---|---|---|
| P1 | `(app)/layout.tsx` awaits `prisma.user.findUnique` then `await cookies()` sequentially (independent). `board/page.tsx` awaits `getSession()` → `searchParams` → bootstrap sequentially (`searchParams` is independent of session) | `src/app/(app)/layout.tsx:~17-37`, `board/page.tsx:11-16` | Medium (tiny latency) | VERIFIED | REF-019 |
| P2 | The same user row is queried by layout, `getBoardBootstrap`, `issue/[key]/page.tsx` fallback and `(auth)/setup-jira/page.tsx` — no `cache()` helper (DB load, not latency) | agent grep | Medium | VERIFIED-BY-AGENT | REF-019 |
| P3 | `watch/page.tsx` `await queryClient.prefetchQuery(...)` blocks render with no Suspense; fix choice depends on TanStack streaming support | `watch/page.tsx:15-27` | Low–Med | HYPOTHESIS (fix) | REF-023 (gated on measurement) |
| P4 | Segment coverage: `loading.tsx` only at `(app)` root, `board`, `issue/[key]`, `reports/projects`, `reports/projects/[projectKey]`; `error.tsx` only `(app)/error.tsx`; none in `(auth)`, `admin`, `stale`, `settings` | `find src/app -name loading.tsx` = 5, `error.tsx` = 1 | Medium (UX/reliability) | VERIFIED | REF-020 |
| P5 | Bundle: `board-client.tsx` imports `useBoardDnD` → `@dnd-kit` likely in main board chunk even for list view; `components/ui/chart.tsx` imports recharts (importers not all verified dynamic); `exceljs` possibly pulled into bulk client chunk via `bulk-logic.ts` | imports only | — | **HYPOTHESIS** | REF-021 → REF-022 |
| P6 | 16 pages are thin server components rendering one big client component with post-hydration `useQuery` (leaderboard, release, branches, notifications, bulk…) — one extra round-trip each | agent | Low | HYPOTHESIS | **Deferred** |
| P7 | Polling: `refetchInterval` 15–60 s in 8 places; notifications polled in `use-notifications.ts:34` and `notifications-client.tsx:76` (shared key unverified); redundant `refetchIntervalInBackground:false` | agent grep | Low | VERIFIED-BY-AGENT | folded into REF-019 (trivial cleanup only after key check) |
| P8 | Not a finding: `reportsKeys.members` shared across 3 report components (TanStack dedupes); `getSession` and query client already `cache()`d | verified by agent | — | — | — |

### 6.4 Maintainability / technical debt

| ID | Finding | Evidence | Sev | Status | Task |
|---|---|---|---|---|---|
| M1 | `admin/sync/admin-sync-client.tsx` 1034 lines: one ~900-line component, ~13 `useState`, 5 mutations, project rows (L655-880) and config Sheet (L879-1000) inline, polls every 15 s; `SyncSwitch` exported from it | `wc -l`, agent read | High (maintainability) | VERIFIED | REF-024 |
| M2 | `board/board-client.tsx` 895 lines, 10 `useEffect` (4 are `performance.mark` instrumentation; 2 persist state in effects instead of setters) | agent read | Medium | VERIFIED-BY-AGENT | REF-025 |
| M3 | Other files > 500 lines (not split, not read): `bulk-configure-step` 728, `bulk-logic` 717, `jira-template-dialog` 679, `bulk/ops.ts` 660, `jobs-card` 645, `stale-std-task-list` 643, `board-quick-panel` 623, `tasks-tab` 613, `board-config.ts` 603 … | `wc -l` | Low–Med | sizes only | **Deferred** (split only when touched) |
| M4 | No shared API boundary helper: 112 hand-rolled 401s, inconsistent `!session` vs `!session?.user?.id`, `requireUser` in `session.ts` never used, `ErrorResponse` shape inconsistent (acknowledged in `docs/clean-code/07-api-contract-inventory.md` §1), 5 near-identical webhook route bodies | grep counts | Medium | VERIFIED-BY-AGENT | REF-026, REF-027 |
| M5 | Test gaps (by file name): `credentials/` (265 lines, token storage — zero tests), `contracts/`, `jira/client.ts`, `jira/resources/issues.ts`, `bitbucket/link-service.ts`, `bitbucket/task-delivery-query.ts`, `queue/jira-sync-lease.ts`, `queue/workers/check-branches.ts`, `reports/task-calculator.ts`, `env.ts`, `auth.ts` — some may be covered by integration tests | file-name mapping | Medium | VERIFIED-BY-AGENT (name-based) | REF-011 |
| M6 | `JSON.parse(JSON.stringify(x))` deep-clone + cast in `audit.ts:90-91`, `issues/mapping.ts:109`, `releases/repository.ts:96-97`, `releases/summary-builder.ts:113` | agent | Low | VERIFIED-BY-AGENT | **Deferred** |
| M7 | Vitest: no coverage threshold; `*.db.test.ts` excluded from default run | `vitest.config.ts` | Low | VERIFIED-BY-AGENT | **Deferred** |
| M8 | Dead code: heuristic scan for unused lib exports found none (false negatives possible). One-off scripts (`backfill-*`, `cleanup-*`) may be archivable — unverified | agent | — | HYPOTHESIS | none |

Superseded/not re-reported: pagination ("143 `findMany` vs 14 `take:`") was in an agent draft and is **dropped** — raw counts are not evidence. Per-route `take:` review is a coverage gap, not a finding.

## 7. Findings requiring further verification before any code change

1. S4 — resolved: owner confirmed (D2) scope is a UI filter only; REF-006 closed.
2. S3 — which roles may see the user list in Settings? (D4)
3. S2 — do existing deployments run without webhook secrets? (D3)
4. P5 — run a bundle analysis before touching imports (REF-021 is measurement-only).
5. P3 — measure `/watch` TTFB with a slow `listWatchedItems` before changing prefetch (REF-023).
6. R5/R6 multi-instance impact — only matters if the web tier is scaled beyond one process.
7. S11 — whether `scripts/seed-admin.mjs` resets the admin password on every boot.
8. Unaudited files in §3.

## 8. Technical-debt items deliberately **not** turned into tasks

- Adding zod everywhere / schema-validating every Jira/Bitbucket response (R8): large, medium regression risk (Jira instances return odd shapes), needs dependency decision D1. REF-005 solves the request-body half with a small hand-written helper first.
- Moving report cache / rate limiter to Redis/Postgres: only justified if the web tier scales out; no Redis exists today (YAGNI).
- Server-side prefetch for leaderboard/release/branches (P6), splitting every >500-line file (M3), `JSON.parse(JSON.stringify)` cleanup (M6), coverage thresholds (M7), re-layering `*-route-service.ts` away from `NextResponse` (works; reuse by worker/chat is not demonstrated).
