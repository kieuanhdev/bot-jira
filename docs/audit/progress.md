# Hardening & Refactoring Progress

Baseline verified: 2026-10-15
- `npm run typecheck`: exit 0
- `npm run lint`: exit 0
- `npm test`: 274 files / 2555 tests passing, exit 0

## Progress Table

| Task | Status | Commit | Commands run + real result | Notes/deviations |
|---|---|---|---|---|
| REF-001 | DONE | `62473da` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (275 files / 2566 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Lock down avatar proxy: require session (401), rateLimit 120/min, `isJiraOrigin` origin check, Gravatar allowlist, 512KB response cap, 500 entries cache cap. Updated `07-api-contract-inventory.md` and `route.test.ts` for intentional behaviour change. |
| REF-005 | DONE | `d7c7f9b` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (280 files / 2590 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Added `readJsonBody` helper (`src/lib/api/json-body.ts`) with stream/length bounds and runtime type guards. Applied to unguarded routes: `issues/[key]/transition`, `issues/[key]/comments`, `push/subscribe` (4KB cap + push schema), and `register`. Added 4 colocated route test suites (18 tests). Classified all 38 `req.json()` sites. |
| REF-004 | DONE | `2e3caed` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (281 files / 2597 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Hardened `users/[id]/role`: `readJsonBody`, 404 on missing user/P2025, 409 `last_admin` when demoting last remaining admin (transaction-based count), `audit()` called on success. Added 7 unit tests. |
| REF-018 | DONE | `3e00982` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (282 files / 2600 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | De-duplicated `NON_OVERRIDABLE` and `NON_OVERRIDABLE_GATES` into leaf module `src/lib/releases/gates/non-overridable.ts`. Verified invariant set is strictly `{"non_empty_release", "ci"}`. Added unit tests in `non-overridable.test.ts` (3 tests). |
| REF-019 | DONE | `e23236e` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (283 files / 2603 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Created `src/lib/user-gate.ts` with `getCurrentUserGate` wrapped in React `cache()`. Parallelized AppLayout (`Promise.all([getCurrentUserGate, cookies])`) and BoardPage (`Promise.all([getSession, searchParams])`). Reused `getCurrentUserGate` in `getBoardBootstrap`, `issue/[key]/page.tsx`, and `setup-jira/page.tsx` eliminating duplicate user queries. Added unit tests in `src/lib/user-gate.test.ts` (3 tests). |
| REF-020 | DONE | `2057817` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (283 files / 2603 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Added missing loading/error boundaries conforming to design system (Skeleton, semantic tokens, lucide icons): `src/app/(app)/settings/loading.tsx`, `src/app/(app)/admin/error.tsx`, `src/app/(auth)/loading.tsx`, and `src/app/(auth)/error.tsx`. Verified `stale/page.tsx` uses internal Suspense fallback without blocking reads so no separate loading segment is needed. |
| REF-014 | DONE | `c2383f3` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (284 files / 2606 tests pass), `test:db` (not run: no DB) | Extracted `withTimeout` async helper (`src/lib/async/with-timeout.ts`). Added 25s timeout to worker shutdown `stopBoss()` and registered process-level `unhandledRejection` and `uncaughtException` handlers logging errors and exiting non-zero. Added unit tests in `src/lib/async/with-timeout.test.ts` (3 tests). |
| REF-013 | DONE | `aab5955` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (284 files / 2608 tests pass), `npm run build` (pass), `test:db` (not run: no DB) | Added `logSwallowed` helper (`src/lib/logger.ts`) logging at `warn` level with error name/message and context without stack trace. Applied across all 9 targeted areas: health-alert (7), webhooks/jira (5), jira-sync runner (loadPeopleFields), process-webhook (markEventFailed & payload), detail-route-service (syncLocalFixVersion & updateMany), chat confirmation (refreshJiraIssueCache), webhook routes enqueue catches (ci, sentry, jira, bitbucket), crypto safeDecrypt (logs once per process without secrets), bitbucket transport DB fallback. Added unit tests in `logger.test.ts` (2 tests). |
| REF-009 | DONE | `57f1f87` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (285 files / 2629 tests pass), `npm run build` (pass, recognizes `ƒ Proxy (Middleware)`), `test:db` (not run: no DB) | Added `src/proxy.ts` implementing security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Content-Security-Policy-Report-Only`) and Origin header validation for mutating API requests (`POST|PUT|PATCH|DELETE` on `/api/*` excluding `/api/webhooks/*`, `/api/auth/*`, `/api/chat/*`). Added pure `isSameOrigin` helper supporting standard hosts, default port normalizations, and `x-forwarded-host` lists. Added unit tests in `src/proxy.test.ts` (21 tests). |
| REF-011 | DONE | `7a002ed` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (288 files / 2673 tests pass), `test:db` (not run: no DB) | Added characterization test suites: Jira client status 204 in `client-transport.test.ts` (15 tests), credentials route-service in `route-service.test.ts` (11 tests), Jira sync lease in `jira-sync-lease.test.ts` (13 tests), and task explorer calculation in `task-calculator.test.ts` (19 tests). Zero source files modified (+44 new tests across 3 new test files and 1 extended). |
| REF-012 | DONE | `d04fc47` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (289 files / 2689 tests pass), `test:db` (not run: no DB) | Added shared `fetchWithTimeout`, `shouldRetryStatus`, and `withRetry` in `src/lib/http/fetch-with-timeout.ts`. Added optional `bitbucketRequestTimeoutMs` (default 15000) in `src/lib/env.ts`. Integrated `fetchWithTimeout` and idempotent GET retries in `bitbucket/transport.ts` and `bitbucket/resources/repositories.ts`. Zero bare `fetch(` calls remaining in `src/lib/bitbucket`. Added 16 tests across `fetch-with-timeout.test.ts` (13 tests) and `transport.test.ts` (3 tests). |
| REF-016 | DONE | `931a478` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (291 files / 2697 tests pass), `test:db` (not run: no DB) | Extracted `mapWithConcurrency` helper in `src/lib/async/concurrency.ts`. Batched `prisma.branchInfo.findMany` in `check-branches.ts` by branch names per repo replacing N individual lookups. Bounded repo iteration to concurrency 3 via `mapWithConcurrency`. Added 8 tests across `concurrency.test.ts` (4 tests) and `check-branches.test.ts` (4 tests). |
| REF-015 | DONE | `ed1a969` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (291 files / 2703 tests pass), `test:db` (not run: no DB) | Capped server-cache reportCache to 500 entries (`REPORT_CACHE_MAX_ENTRIES`), evicting expired entries first then oldest on set. Added module-level 60s TTL cache for `getAllBitbucketCreds()` in `bitbucket/transport.ts` with `clearBitbucketCredsCache()`. Invalidate cache in `route-service.ts` upon saving/disconnecting Bitbucket credentials. Added 6 tests across `server-cache.test.ts` (3 tests) and `transport.test.ts` (3 tests). |
| REF-007 | DONE | `b882d82` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (293 files / 2709 tests pass), `test:db` (not run: no DB) | Hardened rate limiting: ignored `x-forwarded-for` per D5, keyed auth limiter by account identifier with unknown bucket fallback and coarse global bucket. Added rate limiting to legacy password provider and `register` route. Raised `register` min password length to 8 characters. Reordered webhook routes (`ci`, `sentry`, `bitbucket`, `jira`) to verify HMAC signature before consuming rate limit bucket, preventing starvation by unsigned floods. Added `_resetWebhookRateLimits` helper. Added 6 tests across `rate-limit.test.ts` (2 tests), `auth.test.ts` (2 tests), `register/route.test.ts` (1 test), and `webhook-ratelimit.test.ts` (1 test). |
| REF-026 | DONE | `bf546f3` | `typecheck` (pass 0 err), `lint` (pass 0 warn), `npm test` (294 files / 2715 tests pass), `test:db` (not run: no DB) | Created shape-preserving auth guards `requireSession` and `requireAdmin` (`src/lib/api/guards.ts`). Adopted in `users/[id]/role` (`requireAdmin`), `issues/[key]/transition` (`requireSession`), `issues/[key]/comments` (`requireSession`), and `push/subscribe` (`requireSession`). Removed unused `requireUser` from `src/lib/session.ts`. Updated `AUTH_PATTERN` in `route-auth.test.ts`. Added 6 unit tests in `guards.test.ts`. |
| REF-002 | TODO | — | — | Webhook signatures fail closed |
| REF-027 | TODO | — | — | Shared webhook route handler |
| REF-003 | TODO | — | — | Stop shipping all users in Settings |
| REF-010 | TODO | — | — | Stop leaking raw upstream error messages |
| REF-017 | TODO | — | — | Env fail-fast + compose/Dockerfile hardening |
| REF-006 | SKIPPED | — | — | CLOSED by decision D2 (UI filter only) |
| REF-008 | SKIPPED | — | — | CLOSED by decision D8 (accepted risk) |
| REF-021 | TODO | — | — | Bundle baseline measurement |
| REF-022 | TODO | — | — | Bundle fixes (CONDITIONAL on REF-021) |
| REF-023 | TODO | — | — | `/watch` prefetch (CONDITIONAL) |
| REF-024 | TODO | — | — | Split `admin-sync-client.tsx` |
| REF-025 | TODO | — | — | `board-client.tsx` effects cleanup |

## Classification of 38 `req.json()` Sites (REF-005)

### Unguarded (handled in REF-005 & REF-004)
1. `src/app/api/issues/[key]/transition/route.ts` -> guarded via `readJsonBody` (REF-005)
2. `src/app/api/issues/[key]/comments/route.ts` -> guarded via `readJsonBody` (REF-005)
3. `src/app/api/push/subscribe/route.ts` -> guarded via `readJsonBody` (4KB + schema) (REF-005)
4. `src/app/api/register/route.ts` -> guarded via `readJsonBody` (REF-005)
5. `src/app/api/users/[id]/role/route.ts` -> will be guarded in REF-004
6. `src/app/api/admin/sentry-import/route.ts` -> admin-only retry action

### Guarded (try/catch returning 400)
7. `src/app/api/board/membership/refresh/route.ts`
8. `src/app/api/me/board-preferences/route.ts`
9. `src/app/api/admin/sentry-import/review/route.ts`

### Lenient (catch returning `{}` or optional body by contract)
10. `src/app/api/issues/bulk/route.ts`
11. `src/app/api/issues/[key]/ai-score/decision/route.ts`
12. `src/app/api/issues/[key]/links/route.ts`
13. `src/app/api/issues/[key]/clone/route.ts`
14. `src/app/api/issues/[key]/branches/route.ts`
15. `src/app/api/chat/identity/unlink/route.ts`
16. `src/app/api/chat/identity/link/route.ts`
17. `src/app/api/reports/projects/snapshot/route.ts`
18. `src/app/api/projects/validate/route.ts`
19. `src/app/api/projects/route.ts`
20. `src/app/api/projects/[key]/members/route.ts`
21. `src/app/api/projects/[key]/people-fields/route.ts`
22. `src/app/api/bulk/operations/[id]/retry/route.ts`
23. `src/app/api/bulk/operations/[id]/retry-branch/route.ts`
24. `src/app/api/bulk/create/route.ts`
25. `src/app/api/me/preferences/route.ts`
26. `src/app/api/discord/integration/route.ts`
27. `src/app/api/releases/[id]/approvals/route.ts`
28. `src/app/api/releases/[id]/overrides/route.ts`
29. `src/app/api/releases/[id]/route.ts`
30. `src/app/api/notify/route.ts`
31. `src/app/api/notify/mark-read/route.ts`
32. `src/app/api/notify/preferences/route.ts`
33. `src/app/api/branches/[id]/link/route.ts`
34. `src/app/api/branches/pull-requests/route.ts`
35. `src/app/api/admin/outbox/retry/route.ts`
36. `src/app/api/admin/projects/route.ts`
37. `src/app/api/admin/projects/[key]/route.ts`
38. `src/app/api/sync/jira/route.ts`

## Discovered Issues Outside Task Scope

1. `src/app/(app)/board/board-kanban-view.tsx`: `react-hooks/set-state-in-effect` error from synchronous `setSelectedKeys` inside `useEffect` on `issues` (commit `b2e5249`). Fixed by adjusting `selectedKeys` during render when `issues` prop reference changes per React 19 guidelines.
