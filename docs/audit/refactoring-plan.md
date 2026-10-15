# Team Task Web — Hardening & Refactoring Plan (PRIMARY EXECUTION DOCUMENT)

> **For agentic workers (Google Antigravity):** execute task-by-task, in the order of §4. Steps use `- [ ]` checkboxes; tick them in `docs/audit/progress.md` (create it, see `agent-handoff.md` §9), not in this file. Read `agent-handoff.md` first.

**Goal:** Close the verified security, reliability and App-Router performance gaps found in `codebase-audit.md` without changing intended behaviour or architecture.

**Architecture:** Keep the existing architecture (Next 16 App Router, Prisma/Postgres read model, pg-boss worker, TanStack Query). Add three small shared primitives — `src/lib/api/json-body.ts`, `src/lib/http/fetch-with-timeout.ts`, `src/lib/user-gate.ts` — and fix issues in place. No new dependencies.

**Tech Stack:** Next.js 16 (`reactCompiler: true`), React 19, TypeScript strict, Prisma 7, next-auth v4, pg-boss, Vitest 2 (Node env only).

**Spec:** `docs/audit/codebase-audit.md` (findings S*, R*, P*, M*), `docs/audit/architecture-guidelines.md`.

## Global Constraints

- **No new dependencies** and no edits to `package.json`/`package-lock.json`. (zod is NOT approved — decision D1.)
- **No Prisma schema change / migration.** None of the tasks needs one.
- `AGENTS.md`: this Next.js has breaking changes — **read the relevant file in `node_modules/next/dist/docs/` before touching any Next API** (each task names the doc). `middleware` is deprecated; the file is `src/proxy.ts`.
- Do not edit `.env`, `.env.example`, `compose.yaml`, `Dockerfile` unless the task is explicitly unblocked (REF-017 only, after D6).
- Preserve public contracts in `docs/clean-code/07-api-contract-inventory.md` (URLs, methods, status codes, JSON shapes) **except** where a task is labelled **BEHAVIOUR CHANGE** and its decision is recorded as approved in `docs/audit/decisions.md`.
- Never weaken or delete an existing test to make it pass. Where a test must change because behaviour intentionally changes (REF-002), the task says so and the test is **rewritten to assert the new behaviour**, not removed.
- Vitest runs in Node only: UI tasks have no automated DOM tests; follow `docs/clean-code/04-manual-qa.md` and the manual steps in the task.
- One task = one commit (conventional message). Never push, merge or deploy.
- Line numbers below are approximate (taken from reads that may predate edits): **re-locate by symbol** before editing.

## Review Focus (failure modes the tasks' tests must pin)

1. Hosts `${jiraBase}.evil.tld` and `${jiraBase}@evil.tld/x` (userinfo trick: passes a `startsWith(base)` check but `new URL` resolves the host to `evil.tld`) must never receive `Authorization` (REF-001).
2. Anonymous request to `/api/jira/avatar` must not trigger any outbound fetch (REF-001).
3. Malformed/empty/oversized JSON body on previously unguarded routes must give 400, never an unhandled 500 (REF-004/005).
4. Admin demoting themselves / the last admin must be rejected; unknown user id → 404 (REF-004).
5. A Bitbucket server that never responds must fail within the timeout and not stall the worker job (REF-012).

## Standard validation (referred to as **V-STD**)

```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint --max-warnings=0 src scripts prisma
npm test                   # vitest run  (baseline: 274 files / 2555 tests pass)
npx vitest run <path>      # focused run for the files a task touches
```
Tasks touching `src/app/**`, `next.config.ts` or `src/proxy.ts` also run `npm run build` (writes `.next/`; stop any `next dev` first). Tasks touching Prisma queries also run `npm run test:db` **if a database is available**; otherwise record "not run: no DB".

## Priority legend

P0 = security/critical correctness · P1 = High reliability/security · P2 = Medium · P3 = Low/cleanup. Blocked = needs a human decision recorded in `docs/audit/decisions.md` (see §5).

---

## 1. Objectives

1. Remove the Critical avatar-proxy SSRF/credential leak (REF-001).
2. Harden the API boundary (body parsing, role changes, rate limiting, headers) using small shared helpers.
3. Give all outbound HTTP a timeout; make failures observable.
4. Remove verified server-side waterfalls/duplicate queries and add missing loading/error boundaries.
5. Split the two worst client files only where it reduces re-render surface and review cost.

## 2. Phases

| Phase | Tasks | Theme |
|---|---|---|
| A — Security | REF-001 … REF-010 | Trust boundaries |
| B — Reliability | REF-011 … REF-018 | Outbound I/O, observability, caches |
| C — Performance/UX | REF-019 … REF-023 | Waterfalls, boundaries, measured bundle work |
| D — Maintainability | REF-024 … REF-027 | Component splits, shared route helpers |

## 3. Task index

| ID | Title | Pri | Sev | Cx | Risk | Deps | Status |
|---|---|---|---|---|---|---|---|
| REF-001 | Lock down avatar proxy (auth, origin allowlist, caps) | P0 | Critical | M | Low-Med | — | READY |
| REF-002 | Webhook signatures fail closed (production only) | P1 | High | L | **Med** | D3 ✔ | READY |
| REF-003 | Stop shipping all users to every Settings visitor | P1 | High | L | Low-Med | D4 ✔ | READY |
| REF-004 | Harden `users/[id]/role` | P1 | Med | L | Low | REF-005 | READY |
| REF-005 | `readJsonBody` helper + apply to unguarded routes | P1 | High | M | Low-Med | — | READY |
| REF-006 | Issue routes project-scope policy | — | — | — | — | D2 ✔ | **CLOSED (won't fix)** |
| REF-007 | Auth rate-limit hardening | P2 | Med | M | Low | D5 ✔ | READY |
| REF-008 | Refresh JWT role periodically | — | — | — | — | D8 ✔ | **CLOSED (not doing)** |
| REF-009 | Security headers + Origin check in `src/proxy.ts` | P2 | Med | M | Low-Med | — | READY |
| REF-010 | Stop leaking raw upstream error messages | P2 | Med | M | Low-Med | D7 ✔ | READY |
| REF-011 | Characterization tests for critical untested modules | P1 | Med | M | None | — | READY |
| REF-012 | Shared `fetchWithTimeout`/retry; fix Bitbucket | P1 | High | M | Low-Med | REF-011 | READY |
| REF-013 | Log swallowed errors (`logSwallowed`) | P2 | Med | L | Low | — (do before REF-027) | READY |
| REF-014 | Worker lifecycle: shutdown timeout + process handlers | P3 | Low | L | Low | — | READY |
| REF-015 | Bound report cache; TTL for Bitbucket creds | P2 | Med | L | Low | — | READY |
| REF-016 | `check-branches` N+1 and bounded concurrency | P2 | Med | M | Med | REF-012 | READY |
| REF-017 | Env fail-fast + compose/Dockerfile hardening | P2 | Med | M | Low-Med | D6 ✔ (per-file confirm) | READY |
| REF-018 | De-duplicate `NON_OVERRIDABLE` release gates | P3 | Low | L | Low | — | READY |
| REF-019 | Remove layout/board waterfalls; cached user gate | P2 | Med | L | Low | — | READY |
| REF-020 | Add missing `loading.tsx` / `error.tsx` segments | P2 | Med | L | Low | — | READY |
| REF-021 | Bundle baseline measurement (no code change) | P2 | — | L | None | — | READY |
| REF-022 | Bundle fixes proven by REF-021 | P3 | — | M | Med | REF-021 | CONDITIONAL |
| REF-023 | `/watch` prefetch blocking | P3 | Low | M | Med | measurement | CONDITIONAL |
| REF-024 | Split `admin-sync-client.tsx` | P2 | High (maint.) | M | Med | — | READY |
| REF-025 | `board-client.tsx` effects cleanup | P3 | Med | L | Low-Med | — | READY |
| REF-026 | `requireSession` guard helper (shape-preserving) | P3 | Med | M | Low | REF-005 | READY |
| REF-027 | Shared webhook route handler | P3 | Low | M | Med | REF-002, REF-007, REF-013 | READY after those |

**27 tasks; decisions D1–D8 answered 2026-10-15 (see `decisions.md`)**: 1 Critical (REF-001); P1/High: REF-002, 003, 004, 005, 011, 012. Status: **23 READY** (REF-017 needs per-file confirmation), **2 CLOSED** (REF-006 won't-fix, REF-008 not doing → 25 active tasks), 2 CONDITIONAL on measurement (REF-022, 023); REF-027 waits on REF-002/007/013.

## 4. Recommended execution order

1. **Wave 1 (independent, no decisions):** REF-001, REF-005, REF-004, REF-018, REF-019, REF-020, REF-014, REF-013, REF-009.
2. **Wave 2:** REF-011 → REF-012 → REF-016; REF-015; REF-007 (non-IP parts); REF-026.
3. **Wave 3:** REF-002 → REF-027; REF-003; REF-010; REF-017 (confirm each protected file). REF-006 and REF-008 are closed.
4. **Wave 4 (measure first):** REF-021 → REF-022; REF-023; REF-024; REF-025.

Dependency edges: REF-011→REF-012→REF-016; REF-005→REF-004; REF-005→REF-026; REF-002/007/013→REF-027; REF-021→REF-022.

**File ownership (avoid conflicting edits):** the *first* task in execution order that touches a file owns the structural change; later tasks apply only their own delta and say "skip if already done". Shared files: `users/[id]/role/route.ts` (REF-005 creates the helper, REF-004 owns the route, REF-026 adopts only if already touched), `register` route (REF-005 body parsing → REF-007 limiter), `webhooks/_shared.ts` + webhook routes (REF-007 → REF-013 → REF-002 → REF-027), `bitbucket/transport.ts` (REF-012 owns timeouts/retry, REF-013 adds logging, REF-015 adds the creds cache). Re-read the file after every upstream task. REF-001 owns `avatarCache` bounding; REF-015 owns `reportCache` only (no overlap).

## 5. Decisions — **ANSWERED 2026-10-15** (authoritative record: `decisions.md`)

The table below keeps the original options. Outcomes: D1 no zod · D2 scope is UI filter only (REF-006 closed) · D3 reject in production · D4 admin full / managers id+name lazily · D5 no proxy (ignore `x-forwarded-for`, no `TRUSTED_PROXY_HOPS`) · D6 yes, per-file confirmation · D7 yes · D8 no (REF-008 closed).

| ID | Question | Recommended option | Blocks |
|---|---|---|---|
| D1 | Add `zod` as a dependency? | **No for now.** Hand-written guards suffice for REF-005; revisit for external-payload validation. | informational |
| D2 | Is project scope an authorization boundary for issue reads, or a UI filter? (`project-scope.ts` says "falls back to every active project"; `can()` is deliberately permissive) | If it is only a filter: close REF-006 as *won't fix* and document it. If it is access control: add `assertIssueAccess`. | REF-006 |
| D3 | Webhook secrets: fail closed always, only when `NODE_ENV=production`, or keep documented fail-open (`docs/WEBHOOK_SETUP.md:25`)? | Fail closed in production + loud boot warning in dev; update WEBHOOK_SETUP.md. | REF-002 |
| D4 | Which roles may see the full user list on Settings (email, jiraUsername)? Project leaders (non-admin) currently manage leaders via it. | Admin: full list. Non-admin who `canManage` some project: `{id, displayName}` only, fetched lazily from a gated route. Others: none. | REF-003 |
| D5 | Which proxy header is trustworthy for client IP (`x-forwarded-for` first hop spoofable)? nginx/Cloudflare in front? | Use the **last** hop appended by the trusted proxy, configured via a new optional env `TRUSTED_PROXY_HOPS` (default 1). | REF-007 (IP part) |
| D6 | Approve edits to `compose.yaml`, `Dockerfile`, `src/lib/env.ts` required-vars? | Yes: unpublish DB port by default, required secrets in production, migrate as a one-shot step. | REF-017 |
| D7 | Approve changing 500-class error bodies from raw `e.message` to stable codes (clients may display `error`)? | Yes, after grepping client consumers; keep logs detailed. | REF-010 |
| D8 | Re-read user role in JWT every N minutes (extra DB read)? | Yes, N=5, only inside the `jwt` callback. | REF-008 |

---

## 6. Tasks

### REF-001 — Lock down the Jira avatar proxy
- **Priority:** P0 · **Category:** Security · **Complexity:** Medium · **Regression risk:** Low–Medium · **Deps:** none · **Status:** READY
- **Problem:** `handleAvatarRequest` (`src/lib/jira/avatar-route-service.ts`) works without a session (falls back to `getSystemJiraAuth()`), uses `?url=` verbatim, and `fetchImageWithDedup` attaches `Authorization` when `fetchUrl.startsWith(base)`. `https://<jira-host>.evil.tld/x` passes that test → the Jira token is sent to an attacker host; arbitrary hosts (incl. internal/metadata) are fetched; non-image 200s are cached; `avatarCache` (L20) is unbounded. Only caller: `src/components/jira-avatar.tsx:77` (`?url=` is whatever `avatarUrl` the UI has, i.e. Jira `avatarUrls` values; `?username=&size=` path resolves via Jira).
- **Approach:** (a) require a session → 401 otherwise (**BEHAVIOUR CHANGE** for anonymous callers; avatars are only rendered inside the authenticated shell — confirm by grepping `JiraAvatar` usages in `(auth)` pages); (b) parse with `new URL()`, accept only `http(s)`; compare `u.origin === new URL(env.jiraBaseUrl).origin` *before* attaching `Authorization`; (c) for other origins: refuse (400) unless host is in a small constant allowlist (start empty; add Gravatar/Atlassian only if grep of real `avatarUrls` data shows they are used) — never send credentials to them; (d) `redirect: "manual"` (treat 3xx as failure; re-validate origin if following is required); (e) require `content-type` to start with `image/`; cap response size (e.g. 512 KB) and `avatarCache` entries (e.g. 500, evict oldest); (f) apply `rateLimit` per user; (g) log refusals at `warn`.
- **Files to change:** `src/lib/jira/avatar-route-service.ts`; tests: new `src/lib/jira/avatar-route-service.test.ts`. **Must NOT:** change the route URL/params, remove the `username` flow, change cache TTLs, or touch `jira-avatar.tsx`.
- **Interfaces produced:** `isJiraOrigin(rawUrl: string, jiraBaseUrl: string): boolean` (exported for test), pure.
- **Steps:**
  - [ ] Read `avatar-route-service.ts` fully; grep `JiraAvatar` and `avatarUrl` producers, **and** run a read-only query for the distinct origins of stored avatar URLs (e.g. in `IssueCache`/user rows — find the column by reading `prisma/schema.prisma`) to learn the real origins; code grep alone cannot reveal data.
  - [ ] Write failing tests: `isJiraOrigin` true for same origin / false for `${base}.evil.tld`, `${base}@evil.tld/x`, other port, other scheme, `javascript:`; handler returns 401 with no session and `fetch` not called; handler does not set `Authorization` for non-Jira origin; non-`image/*` response rejected; cache never exceeds cap.
  - [ ] Run them (`npx vitest run src/lib/jira/avatar-route-service.test.ts`) → FAIL.
  - [ ] Implement (a)–(g) above.
  - [ ] Run focused test → PASS; run V-STD (+ build).
  - [ ] Manual: log in, open Board/issue list — avatars (both `username` and `url` flavours) still render; DevTools shows 401 for avatar request when logged out.
  - [ ] Commit `fix(security): restrict jira avatar proxy to authenticated same-origin requests`.
- **Acceptance:** all review-focus cases 1–2 pass; no outbound fetch for anonymous or foreign-origin-with-credentials; cache bounded; existing avatar UX unchanged for signed-in users.
- **Expected result:** no credential exfiltration or open-proxy behaviour via this endpoint (no performance claim).
- **Risks:** an unlisted legitimate external avatar host will show initials fallback — check `jira-avatar.tsx` fallback works (it renders `initials`).

### REF-002 — Webhook signatures fail closed — **APPROVED (D3)**
- **Priority:** P1 · Security · Cx Low · Risk **Medium** (deployments without secrets begin returning 401) · Deps: D3.
- **Problem:** `verifyWebhookSignature` (`src/lib/events/signatures.ts`) returns `true` when the per-source secret is empty; secrets optional in `src/lib/env.ts:174-177`; documented as intended in `docs/WEBHOOK_SETUP.md:25`. Forged events are stored in `IntegrationEvent` and enqueued.
- **Approach (if D3 = recommended):** return `false` when no secret and `NODE_ENV === "production"`; in non-production log a one-time `warn` and accept. Update `WEBHOOK_SETUP.md` line 25. Do not add replay protection (hypothesis, out of scope).
- **Files:** `src/lib/events/signatures.ts`, `src/lib/events/signatures.test.ts`, `docs/WEBHOOK_SETUP.md`. **Must NOT:** touch the Discord verifier or HMAC comparison code.
- **Steps:** [ ] check `signatures.test.ts` for a "no secret ⇒ true" case (the current file sets all secrets; add the missing-secret cases) [ ] write tests: no secret + production ⇒ false; no secret + development ⇒ true + warn; valid/invalid signatures unchanged [ ] implement [ ] V-STD [ ] commit. **State in the PR that a test's expected result changes intentionally — it is not weakening.**
- **Acceptance:** production without secret rejects with the existing 401 path; all prior signature tests still pass.
- **Risks:** operator must set secrets before upgrade → release note.

### REF-003 — Stop shipping all users to every Settings visitor — **APPROVED (D4)**
- **Priority:** P1 · Security/Perf · Cx Low–Med · Risk Low–Med · Deps D4.
- **Problem:** `src/app/(app)/settings/page.tsx` runs `prisma.user.findMany` for every caller and passes users (email, jiraUsername, role) to `SettingsClient`; also `JSON.parse(JSON.stringify(users))`. `project-leaders-settings.tsx` (~L85-105) filters this list; `canManage = membersData?.canManage ?? isAdmin`, so non-admin leaders may need it.
- **Approach (D4 recommended):** admin ⇒ current query; non-admin ⇒ do **not** include users in the RSC payload; the leaders component fetches `{id, displayName}` lazily via a gated API route only when `canManage`. Remove the JSON round-trip (Dates serialize fine in RSC).
- **Files:** `settings/page.tsx`, `settings/settings-client.tsx`, `settings/project-leaders-settings.tsx`, one new gated route under `src/app/api/` (decide path after reading existing leader routes), query key in `src/lib/query-keys.ts`. **Must NOT:** change admin UI.
- **Steps:** [ ] read the three settings files + existing members route [ ] list every field of `users` the UI reads [ ] implement server gate + lazy fetch [ ] V-STD + build [ ] manual: as admin, as project leader, as plain member — leader picking works / member sees no user data (check RSC payload via view-source/Network) [ ] commit.
- **Acceptance:** plain member's HTML/RSC payload contains no other user's email; admin and leader flows unchanged.

### REF-004 — Harden `users/[id]/role`
- **Priority:** P1 · Security/Reliability · Cx Low · Risk Low · Deps none · READY.
- **Problem:** `src/app/api/users/[id]/role/route.ts` (read in full): `(await req.json()) as {role}` unguarded → malformed JSON ⇒ 500; `prisma.user.update` on unknown id throws P2025 ⇒ 500; admin can demote self/last admin; no `audit()` call.
- **Approach:** use `readJsonBody` from REF-005 (hard dependency; do REF-005 first); catch `PrismaClientKnownRequestError` code `P2025` ⇒ 404 `{error:"user not found"}`; reject with **409 `{error:"last_admin"}`** demoting the last remaining `admin` (count admins in a transaction) — and self-demotion if it would leave zero admins; call existing `audit()` (`src/lib/audit.ts`) with actor, target, old/new role. Keep 401/403/400 invalid-role responses identical.
- **Files:** that route + new `route.test.ts`; read `audit.ts` for the call signature. **Must NOT:** change `ROLES` or the success JSON `{ user }`.
- **Steps:** [ ] tests (unknown id ⇒ 404; malformed JSON ⇒ 400; last-admin demotion ⇒ rejected; normal change ⇒ 200 + audit called; non-admin ⇒ 403) → FAIL [ ] implement [ ] PASS [ ] V-STD [ ] commit.
- **Acceptance:** review-focus 3–4.
- **Risk:** low; UI shows generic error on 4xx — check `settings` role-change handler displays errors.

### REF-005 — `readJsonBody` helper and application to unguarded routes
- **Priority:** P1 · Reliability/Security · Cx Medium · Risk Low–Med · READY.
- **Problem:** 38 `req.json()` + `as {…}`; ~13 with no `catch` (unhandled 500): at least `issues/[key]/transition`, `issues/[key]/comments`, `users/[id]/role`, `push/subscribe`, `register`; ~25 use `.catch(() => ({}))` (lenient by design — **leave them**, changing to 400 is a contract change). `push/subscribe` writes `sub.subscription as object` into a Json column with no shape/size limit.
- **Interfaces produced** (`src/lib/api/json-body.ts`):
  `readJsonBody<T>(req: Request, guard: (v: unknown) => v is T, opts?: { maxBytes?: number }): Promise<{ ok: true; data: T } | { ok: false; response: Response }>` — failure response is `400 { error: "invalid_json" | "invalid_body" | "payload_too_large" }`.
- **Files:** new `json-body.ts` + `json-body.test.ts`; modify only the unguarded routes listed + `push/subscribe` (validate `endpoint` is https string, `keys.p256dh`/`keys.auth` strings, total ≤ 4 KB). **Must NOT:** touch routes that already `.catch(() => ({}))`; add dependencies.
- **Steps:** [ ] `grep -rn "req.json()\|_req.json()" src/app/api` and classify each as guarded/lenient/unguarded in `docs/audit/progress.md` [ ] write helper tests (valid, empty body, malformed, wrong shape, oversize via content-length and via stream) [ ] implement [ ] apply to unguarded routes one by one, adding one test per route for malformed body ⇒ 400 [ ] V-STD [ ] commit per 3–4 routes.
- **Acceptance:** review-focus 3; no route outside the classified-unguarded set changes behaviour; `docs/clean-code/07-api-contract-inventory.md` updated for any route that appears there.
- **Validation:** V-STD. **Expected:** malformed input yields 400 instead of 500; bounded push-subscription size. **Risks:** a client that relied on a 500 (unlikely) or sends >4 KB subscriptions; classify routes before editing.

### REF-006 — Issue routes project-scope policy — **CLOSED (D2: scope is only a UI filter)**
> Do not implement. Only add the clarifying sentence to `architecture-guidelines.md` §7.
- **Priority:** P2 · Security (policy) · Cx Medium · Risk Medium · Deps D2.
- **Problem:** `issues/[key]/*` (~17 routes) never call a scope helper; `handleIssueDetailRequest` (`src/lib/issues/detail-route-service.ts`) serves `?source=cache` for any key and uses system Jira auth if the user has no personal token. `project-scope.ts` doc: scope = board-selected projects, "falls back to every active project".
- **If D2 = "scope is only a filter":** close as *won't fix*, add one sentence to `architecture-guidelines.md`. **If access control:** add `assertIssueAccess(session, issueKey: string): Promise<NextResponse | null>` (in `src/lib/issues/access.ts`) built on `resolveUserProjectScope`/`assertProjectAccess` from `src/lib/reports/*`, call it first in each issue route-service, test 403 for out-of-scope key and pass-through for admin. Verify per-route first — only detail route was read.
- **Validation (if implemented):** V-STD + build. **Expected:** out-of-scope issue keys return 403 (or documented no-op). **Risks:** default scope is "all active projects", so blast radius is small; admins/system flows must stay exempt. **Do not** start before the answer.

### REF-007 — Auth rate-limit hardening (partly ready)
- **Priority:** P2 · Security · Cx Medium · Risk Low.
- **Problem:** `src/lib/auth.ts:~26-35` takes IP from spoofable `x-forwarded-for`; `checkAuthRateLimit` returns true for "unknown" (`src/lib/rate-limit.ts:~40`); legacy password provider (`LEGACY_PASSWORD_LOGIN`, `auth.ts:~68`) and `register` have no limiter; min password length 6 in register; webhook limiter (`src/app/api/webhooks/_shared.ts`) is one bucket per source and runs before signature verification.
- **READY part:** apply the same limiter to legacy login and `register`; raise min password length only if `register` is behind `LEGACY_PASSWORD_LOGIN` (check; do not change otherwise); in webhooks verify the signature **before** consuming the rate-limit bucket (so unsigned floods can't starve real deliveries).
- **IP part (D5 = no proxy):** do **not** trust `x-forwarded-for`; key the auth limiter by account identifier (email/jira username) plus a coarse global bucket; use a socket IP only if Next exposes one (read docs). No `TRUSTED_PROXY_HOPS` env.
- **Files:** `auth.ts`, `rate-limit.ts` (+test), `register` route, `webhooks/_shared.ts` (+ its tests). **Must NOT:** introduce Redis/DB.
- **Steps:** [ ] tests first (limiter keyed, unknown IP still limited by a coarse global bucket, webhook order) [ ] implement [ ] V-STD [ ] commit.
- **Acceptance:** 11th failed legacy login within the window is rejected; signed webhooks still pass under unsigned flood in test.
- **Validation:** V-STD. **Expected:** brute-force resistance on legacy login/register; no effect on normal users. **Risks:** shared NAT users locked out together — keep window/limit conservative (match existing auth limiter values).

### REF-008 — Refresh JWT role periodically — **CLOSED (D8: not doing)**
> Do not implement. Record the 30-day role staleness as an accepted risk in `codebase-audit.md` S8.
- **Priority:** P2 · Security · Cx Low · Risk Low.
- **Problem:** `src/lib/auth.ts` `jwt` callback sets `token.role` only when `user` is present (sign-in); `session.maxAge` = 30 days → a demoted admin remains admin up to 30 days.
- **Approach:** in `jwt` callback, if `token.roleCheckedAt` older than 5 min, `prisma.user.findUnique({select:{role:true}})`, update `token.role`/`roleCheckedAt`; if the user row no longer exists, clear `token.id`; **then `getSession()` in `src/lib/session.ts` must return `null` when `session.user.id` is empty** (today the `session` callback sets `id = token.id ?? ""`, which routes checking only `!session` would accept) — add that guard and a test, and grep routes that read `session.user.id` without a null check. Extend `src/types/next-auth.d.ts`.
- **Files:** `auth.ts`, `src/types/next-auth.d.ts`, new test for the pure helper `shouldRefreshRole(token, now)`. **Must NOT:** add a DB read to every request.
- **Acceptance:** role change in DB is visible within 5 min without re-login; unit test for the helper.

### REF-009 — Security headers + Origin check (`src/proxy.ts`)
- **Priority:** P2 · Security · Cx Medium · Risk Low–Med · READY.
- **Docs to read first:** `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and `.../02-guides/content-security-policy.md`. `middleware` is deprecated → file is `src/proxy.ts`. The doc warns not to rely on shared modules/globals inside proxy.
- **Problem:** no CSP/`X-Frame-Options`/`Referrer-Policy`/`X-Content-Type-Options`; no Origin validation on mutating `/api/*` calls.
- **Approach:** `src/proxy.ts` with a `matcher` for pages and `/api/*`: (1) set `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`; (2) CSP in **`Content-Security-Policy-Report-Only`** only (enforcing CSP is out of scope — risk of breaking inline styles/charts); (3) for `POST|PUT|PATCH|DELETE` to `/api/*` **excluding `/api/webhooks/*`, `/api/auth/*`, `/api/chat/*` (Discord)**: if an `Origin` header is present and its host differs from `Host`/`x-forwarded-host`, return `403 {error:"forbidden_origin"}`; absent Origin ⇒ allow (non-browser clients).
- **Files:** new `src/proxy.ts`, new `src/proxy.test.ts` (pure helper `isSameOrigin(origin: string|null, host: string|null): boolean` exported and tested; the proxy fn itself thin). **Must NOT:** edit `next.config.ts` unless the docs require; enforce CSP.
- **Steps:** [ ] read docs [ ] tests for `isSameOrigin` (null, mismatch, port, subdomain) [ ] implement [ ] V-STD + build [ ] manual: login, board drag, bulk create, admin actions behind the real proxy host (nginx) still work; check console for CSP report-only noise.
- **Acceptance:** headers present on a page and an API response (`curl -I`); cross-origin POST with forged `Origin` ⇒ 403; same-origin and webhook POSTs unaffected.
- **Risk:** reverse-proxy rewriting `Host` — verify `x-forwarded-host` handling; keep a kill-switch env? (No new env: revert the commit.)

### REF-010 — Stop leaking raw upstream error messages — **APPROVED (D7)** · BEHAVIOUR CHANGE
- **Priority:** P2 · **Category:** Security · **Complexity:** Medium · **Regression risk:** Low–Medium · **Deps:** D7
- **Problem:** `(e as Error).message` / `details: String(err)` returned to clients in `issues/bulk`, `issues/[key]/versions`, `issues/[key]/transitions`, `bulk/create`, `bulk/create/{parents,assignees,metadata,excel-import}`, `reports/projects/snapshot`, ai-score.
- **Approach (after D7):** per route, log the full error with `logger` and return a stable `{ error: "<code>" }` keeping the existing status; **first grep client code** (`grep -rn "\.error" src/app src/components src/lib/api-client.ts`) to see which UIs display `error` text; where a UI shows it, keep a safe human message (Jira business errors such as "transition not allowed" are intentionally user-facing — only map unexpected/5xx errors).
- **Files:** the ~10 routes; tests per route asserting body has no upstream text. **Must NOT:** change 4xx validation messages.
- **Validation:** V-STD; per-route test with a mocked upstream error containing a sentinel string — assert absent from the body, present in the logger call.
- **Acceptance:** no response body contains raw upstream/Prisma text for 5xx paths. **Expected:** less internal-detail disclosure; no performance effect. **Risks:** UI that displayed the raw text now shows a generic message — grep consumers first.

### REF-011 — Characterization tests for critical untested modules
- **Priority:** P1 · Maintainability/Reliability · Cx Medium · Risk None (tests only) · READY. Prerequisite of REF-012.
- **Problem (name-based, verify first):** no test file for `src/lib/jira/client.ts` (retry/timeout/error mapping — **note:** `docs/clean-code/05-progress-tracker.md` task 2.1 says "Jira transport characterization DONE": search `src/lib/jira/*.test.ts` first and extend rather than duplicate), `src/lib/credentials/route-service.ts` (265 lines, token storage), `src/lib/queue/jira-sync-lease.ts`, `src/lib/reports/task-calculator.ts`.
- **Steps:** [ ] for each module, grep for existing coverage (including `queue/jira-sync-*.test.ts`) and record gaps [ ] add tests that pin **current** behaviour (do not fix bugs found; record them in `progress.md`): Jira client timeout/abort/retry-after/429/5xx/204→`undefined`; credentials route-service auth + encrypted storage + no secret in response; lease acquire/expire/contention (use existing test helpers; DB-requiring cases go to `*.db.test.ts`) [ ] V-STD [ ] commit.
- **Acceptance:** each module has tests for success, error and boundary paths; zero source files changed.

### REF-012 — Shared `fetchWithTimeout`/retry; fix Bitbucket transport
- **Priority:** P1 · Reliability · Cx Medium · Risk Low–Med · Deps REF-011.
- **Problem:** `src/lib/bitbucket/transport.ts request()` calls `fetch` without `signal` (verified); no retry on 429/5xx; same for `bitbucket/resources/repositories.ts:20,73`. Divergent copies elsewhere: `jira/dev-status.ts:106,209`, `jira/auth-service.ts:116`, `jira/avatar-route-service.ts`, `sentry/client.ts`, `ai/openai.ts`, `ai/ollama.ts`, `chat/discord.ts`.
- **Interfaces produced** (`src/lib/http/fetch-with-timeout.ts`):
  `fetchWithTimeout(input: string | URL, init: RequestInit & { timeoutMs: number }): Promise<Response>` — aborts with `AbortSignal.timeout`, rethrows a typed `HttpTimeoutError`;
  `shouldRetryStatus(status: number): boolean` (429, 502, 503, 504);
  `withRetry<T>(fn: (attempt: number) => Promise<T>, opts: { retries: number; baseDelayMs: number; retryOn: (e: unknown, r?: T) => boolean; sleep?: (ms: number) => Promise<void> }): Promise<T>` (jittered exponential; injectable `sleep` for tests).
- **Approach:** Phase 1 (this task): add the util + apply to Bitbucket only; **retry only idempotent GET**; timeout default from new optional `env.bitbucketRequestTimeoutMs` (default 15000, defined in `env.ts` — do not edit `.env.example`). Phase 2 (optional follow-up commits, one module each): migrate `dev-status.ts` (replaces its ad-hoc abort), Discord, Sentry. **Do not** touch `jira/client.ts` retry logic (works, characterized in REF-011) unless tests prove equivalence.
- **Steps:** [ ] util tests (fake timers: timeout fires, retry count, retry-after ignored/honoured, no retry for POST) → FAIL [ ] implement [ ] Bitbucket tests: hanging fetch rejects within timeout; 503 then 200 succeeds for GET; POST not retried; 401/403 credential-fallback loop unchanged [ ] implement in transport [ ] V-STD [ ] commit per module.
- **Acceptance:** review-focus 5; `grep -n "fetch(" src/lib/bitbucket` shows no bare fetch.
- **Risks:** retries multiply load on Bitbucket rate limits — cap retries at 2.

### REF-013 — Log swallowed errors
- **Priority:** P2 · Reliability/Observability · Cx Low · Risk Low · READY.
- **Interfaces produced:** `logSwallowed(label: string, error: unknown, context?: Record<string, unknown>): void` — `logger.warn` with error name/message (no stack with secrets); place in `src/lib/logger.ts` after reading its API (`logger.test.ts` exists — extend).
- **Targets (re-locate by symbol; ~69 sites in total, fix these first):** `queue/workers/health-alert.ts` (7), `queue/workers/webhooks/jira.ts`, `queue/workers/jira-sync/runner.ts` (people-fields load), `queue/process-webhook.ts` (`markEventFailed(...).catch`), `issues/detail-route-service.ts` (fix-version sync), `chat/confirmation.ts`, webhook routes' empty `catch` around enqueue (`ci`, `sentry`, `jira`, `bitbucket`), `crypto.safeDecrypt` (log once per process that decryption failed — never log ciphertext/key), `bitbucket/transport.ts getAllBitbucketCreds` DB failure.
- **Must NOT:** change control flow, return values, or retry semantics — only add logging.
- **Acceptance:** each target logs once per failure; existing tests unchanged; test for `logSwallowed` redaction of `Error` objects.
- **Validation:** V-STD. **Expected:** failures (alert delivery, webhook enqueue, DB cred errors) become visible in logs. **Risks:** log volume if a failure repeats per item — log once per batch where in a loop.

### REF-014 — Worker lifecycle
- **Priority:** P3 · Reliability · Cx Low · Risk Low · READY.
- **Problem:** `src/worker.ts` (66 lines): `stopBoss()` awaited without timeout; no `unhandledRejection`/`uncaughtException` handler.
- **Approach:** `Promise.race([stopBoss(), timeout(25_000)])` in `shutdown`; handlers log (`logger.error`) then `process.exit(1)` (let the orchestrator restart). Keep the heartbeat as is.
- **Acceptance:** SIGTERM exits within ≤ 30 s even if `stopBoss` hangs (unit-test the extracted `withTimeout<T>(p: Promise<T>, ms: number): Promise<T | "timeout">`); `docs/clean-code` worker lifecycle tests (`3.1`) still pass.

### REF-015 — Bound report cache; TTL for Bitbucket credentials
- **Priority:** P2 · Reliability/Perf · Cx Low · Risk Low · READY.
- **Problem:** `src/lib/reports/server-cache.ts` `reportCache` (L13, `.set` L112, invalidation L161-175) never evicts on size or expiry. `bitbucket/transport.ts getAllBitbucketCreds()` does Prisma + decrypt on every `request()` without explicit creds.
- **Approach:** cap entries (e.g. 500; evict expired first then oldest on `set`); keep `inFlightRequests` dedup and invalidation API identical. For Bitbucket creds: module-level cache with 60 s TTL and `clearBitbucketCredsCache()` for tests/credential updates (call it where credentials are saved — grep the Bitbucket credential save route).
- **Must NOT:** introduce Redis; change `ttlMs` semantics or cache keys.
- **Acceptance:** tests: > cap entries ⇒ size ≤ cap; expired entry swept on set; creds fetched once within TTL and refetched after; saving creds invalidates.

### REF-016 — `check-branches` N+1 and bounded concurrency
- **Priority:** P2 · Performance/Reliability · Cx Medium · Risk **Medium** · Deps REF-012.
- **Problem:** `queue/workers/check-branches.ts:~36-50`: per-repo sequential loop and an awaited `prisma.branchInfo.findUnique` per branch; per-branch `getCommit`. `poll-pr-comments.ts:~140` sequential per repo. (`jira/project-access.ts:~66` sequential per credential — optional.)
- **Approach:** one `findMany({ where: { repo, name: { in: names } }})` per repo into a `Map`; process repos with concurrency 3 via a tiny `mapWithConcurrency<T,R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]>` in `src/lib/async/concurrency.ts` (+tests). Preserve per-branch write semantics and idempotency (clean-code guardrail: worker handlers idempotent; `docs/clean-code/00-guardrails.md`).
- **Steps:** [ ] read the worker + its tests (none by name — add characterization first via REF-011-style tests with mocked Bitbucket/Prisma) [ ] implement [ ] V-STD (+ `npm run test:db` if DB) [ ] commit. Measure before/after job duration locally and **record real numbers** in `progress.md`; do not claim a figure otherwise.
- **Risk:** Bitbucket rate limits → concurrency kept at 3.

### REF-017 — Env fail-fast + infra hardening — **APPROVED (D6) — confirm each protected file**
- **Priority:** P2 · **Category:** Security/Ops · **Complexity:** Medium · **Regression risk:** Low–Medium · **Deps:** D6 (per-file approval)
- **Scope if approved:** (1) `src/lib/env.ts`: in production require `NEXTAUTH_SECRET`, `CRED_ENCRYPTION_KEY` (fail at boot with a clear message; keep dev lenient); (2) `compose.yaml`: bind DB port to `127.0.0.1` by default or drop `ports:`; (3) `Dockerfile`: stop running `prisma migrate deploy && seed-admin` in the web `CMD` (separate one-shot service) — **read `scripts/seed-admin.mjs` first**, confirm it does not reset an existing admin's password; (4) remove default DB credentials from baked build ARGs. `crypto.ts` key derivation/rotation changes are **out of scope** (needs its own design).
- **Validation:** `docker compose config` parses; boot with/without secrets; V-STD. Deployment config is protected: get written approval per file.
- **Acceptance:** production boot without required secrets fails with a clear message; DB port not published by default; web container start no longer migrates/seeds. **Expected:** safer defaults, no runtime-performance change. **Risks:** existing deploy scripts relying on the migrate-on-start `CMD` — coordinate before merging.

### REF-018 — De-duplicate `NON_OVERRIDABLE` release gates
- **Priority:** P3 · Correctness/Maintainability · Cx Low · Risk Low · READY.
- **Problem:** the set `{"non_empty_release","ci"}` exists as `NON_OVERRIDABLE_GATES` in `src/lib/releases/repository.ts:5` and as `NON_OVERRIDABLE` in `src/lib/releases/gates/index.ts`/`evaluator.ts:~24` (grep both; `ci.ts:10` comments reference it).
- **Approach:** define once in `src/lib/releases/gates/non-overridable.ts`, import from both; add a test that asserts the set equals `["ci","non_empty_release"]` (guards accidental loosening). **Release safety invariant (architecture.md): do not make the set smaller.**
- **Acceptance:** one definition (`grep -rn "NON_OVERRIDABLE" src` shows imports only); release tests pass.
- **Validation:** V-STD. **Expected:** the safety rule cannot drift. **Risks:** circular import between `repository.ts` and `gates/` — put the constant in a leaf file.

### REF-019 — Remove layout/board waterfalls; cached user gate
- **Priority:** P2 · Performance · Cx Low · Risk Low · READY. Read `node_modules/next/dist/docs/01-app` data-fetching/caching pages relevant to `cache()` first.
- **Problem:** `src/app/(app)/layout.tsx` awaits `prisma.user.findUnique` then `await cookies()` sequentially; `board/page.tsx` awaits `getSession()` → `props.searchParams` → `getBoardBootstrap` sequentially (searchParams independent); the user row is re-queried by layout, `getBoardBootstrap` (`src/lib/board/bootstrap.ts`), `issue/[key]/page.tsx` fallback and `(auth)/setup-jira/page.tsx`.
- **Interfaces produced** (`src/lib/user-gate.ts`): `getCurrentUserGate: (userId: string) => Promise<UserGate | null>` wrapped in React `cache()`, selecting the **union** of fields used by the four call sites (`jiraUserEnc, jiraTokenEnc, jiraAuth, jiraVerifiedAt, onboarded, …`); `UserGate` type derived from the Prisma select.
- **Steps:** [ ] list the 4 selects and their union [ ] add helper (unit test `cache` isn't testable in Node — test the select shape via a mocked prisma) [ ] layout: `const [user, cookieStore] = await Promise.all([getCurrentUserGate(id), cookies()])` [ ] board page: `Promise.all([getSession(), props.searchParams ?? Promise.resolve(undefined)])` [ ] reuse helper in bootstrap/issue/setup-jira where fields are a subset [ ] V-STD + build [ ] manual: board loads with/without `?project=`, redirects for un-onboarded user unchanged.
- **Must NOT:** change redirect logic or `force-dynamic` flags.
- **Acceptance:** one user query per request for those routes (verify with Prisma query log in dev, record in `progress.md`).
- **Expected:** fewer DB round-trips per navigation (unmeasured). Polling duplicates (P7) are out of scope unless the notifications query key is confirmed identical — then delete the duplicate `useQuery` only.

### REF-020 — Missing `loading.tsx` / `error.tsx` segments
- **Priority:** P2 · UX/Reliability · Cx Low · Risk Low · READY. Follow `design-system/team-task-web/MASTER.md` and AGENTS.md UI conventions (Skeleton, empty-state pattern, semantic tokens, dark mode).
- **Problem:** `loading.tsx` exists only at `(app)`, `board`, `issue/[key]`, `reports/projects`, `reports/projects/[projectKey]`; `error.tsx` only `(app)/error.tsx`; none in `(auth)`, `admin`, `stale`, `settings`.
- **Add:** `src/app/(app)/settings/loading.tsx`, `src/app/(app)/admin/error.tsx`, `src/app/(app)/stale/loading.tsx` (only if `stale/page.tsx` does blocking reads — check first), `src/app/(auth)/loading.tsx` + `error.tsx`. Mirror the existing `(app)/error.tsx` (read it; `error.tsx` must be a Client Component and offer `reset`). Use `Skeleton`, no spinners.
- **Acceptance:** throw a test error in each segment locally ⇒ boundary renders inside the shell without breaking the sidebar; no hydration warnings; light + dark verified manually.
- **Validation:** V-STD + build + manual. **Expected:** errors in admin/settings/auth no longer blank the whole content area; skeleton during blocking reads. **Risks:** a new `loading.tsx` changes perceived transitions — keep skeletons shaped like the page.

### REF-021 — Bundle baseline measurement (no code change)
- **Priority:** P2 · Perf · Cx Low · Risk None · READY.
- **Why:** P5 (dnd-kit in main board chunk, recharts via `ui/chart.tsx`, exceljs via `bulk-logic.ts`) is import-level inference only.
- **Steps:** [ ] read `node_modules/next/dist/docs/01-app/02-guides` for the bundle analyzer available in Next 16 (do **not** add `@next/bundle-analyzer` — no new deps; use whichever built-in analyze command the docs describe, or inspect `.next` build output sizes/`next build` route table) [ ] `npm run build` and record per-route First Load JS for `/board`, `/bulk`, `/reports/projects/[projectKey]`, `/admin/sync` [ ] identify which chunks contain `@dnd-kit`, `recharts`, `exceljs` (grep chunk files for distinctive strings) [ ] write results to `docs/audit/bundle-baseline.md` (real numbers only).
- **Acceptance:** file exists with measured data; REF-022 scope derived from it.
- **Validation:** `npm run build` output attached to `bundle-baseline.md`. **Expected:** data only. **Risks:** none; only `.next/` is rewritten.

### REF-022 — Bundle fixes proven by REF-021 — CONDITIONAL
- **Priority:** P3 · **Category:** Performance · **Complexity:** Medium · **Regression risk:** Medium · **Deps:** REF-021
- Only for libraries REF-021 shows in a chunk where they are not needed at first paint. Candidate fixes: lazy-load the DnD layer behind the kanban view (`next/dynamic`, `ssr:false` where valid) so list view/other tabs don't pay for it; dynamic-import `excel-parser`/`excel-template` at the point of upload. Each fix must show a measured First Load JS delta in `progress.md`; revert if none. Docs: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (confirm path).
- **Must NOT:** change DnD behaviour, keyboard accessibility, or bulk import flow.
- **Validation:** V-STD + build; before/after First Load JS from REF-021's method. **Acceptance:** each change shows a measured reduction, else reverted. **Expected:** smaller initial JS for affected routes (amount unknown until measured). **Risks:** dynamic boundary flashes/skeleton on first interaction; DnD hydration timing.

### REF-023 — `/watch` prefetch blocking — CONDITIONAL
- **Priority:** P3 · **Category:** Performance · **Complexity:** Medium · **Regression risk:** Medium · **Deps:** measurement
- `src/app/(app)/watch/page.tsx:15-27` awaits `prefetchQuery` with no Suspense. **Only act if** a measurement (artificially slow `listWatchedItems`) shows the segment skeleton is shown noticeably longer than acceptable. Options: leave as is (default), or stream with Suspense — confirm TanStack Query v5 `dehydrate` pending-query support in the installed version first. Default decision: **no change**.
- **Validation/Acceptance:** only if changed: V-STD + build, TTFB/skeleton time measured before/after and recorded. **Expected:** none unless measured. **Risks:** hydration mismatch with pending queries.

### REF-024 — Split `admin/sync/admin-sync-client.tsx` (1034 lines)
- **Priority:** P2 · Maintainability (+ re-render surface) · Cx Medium · Risk Medium (no DOM tests) · READY.
- **Problem:** one ~900-line `AdminSyncClient` (from ~L126), ~13 `useState`, 5 mutations, project rows inline (~L655-880) and config Sheet (~L879-1000); polls every 15 s (~L158), so every poll/state change re-renders all rows; `SyncSwitch` exported from the file (~L73).
- **Approach:** extract in the same folder: `project-sync-row.tsx` (`ProjectSyncRow` takes primitive/stable props + callbacks; owns its `expandedErrors` state), `project-features-sheet.tsx` (loaded with `next/dynamic` as other sheets are), `sync-switch.tsx` (move `SyncSwitch`, update importers via grep). Keep the compiler-friendly style (no manual `memo` unless a render profile shows need). Optionally apply `content-visibility` to the row list like `stale-std-task-list.tsx:52`.
- **Must NOT:** change queries/mutations, query keys, text, layout or behaviour; leave a re-export unless grep shows importers elsewhere.
- **Steps:** [ ] read the file fully; map state → owner [ ] extract `SyncSwitch` first, commit [ ] extract row, commit [ ] extract sheet (dynamic), commit [ ] V-STD + build [ ] manual QA per `docs/clean-code/04-manual-qa.md` (admin sync page: toggle features, expand errors, open sheet, search/filter, trigger sync).
- **Acceptance:** `wc -l` of the main file < 400; identical behaviour on manual checklist; no new `useEffect` added.

### REF-025 — `board-client.tsx` effects cleanup
- **Priority:** P3 · Maintainability · Cx Low · Risk Low–Med · READY.
- **Problem:** ~895 lines, 10 `useEffect`, 4 are `performance.mark` instrumentation (~L357-380, ~L574-590), 2 persist `sortMode`/`view` in effects (~L298, ~L302).
- **Approach:** move marks to `useBoardPerfMarks(...)` in `board/hooks/` (same marks, same names, same timing); persist to storage inside the setters/handlers (`rerender-move-effect-to-event`) — keep the key names/format. Do not touch DnD, bootstrap or URL sync effects.
- **Acceptance:** same `performance.mark` names present (grep before/after); sort/view persistence survives reload (manual); V-STD + build.

### REF-026 — `requireSession` guard helper (shape-preserving)
- **Priority:** P3 · Maintainability · Cx Medium · Risk Low · Deps REF-005.
- **Problem:** 112 hand-rolled `{error:"unauthorized"}` 401s; inconsistent `!session` vs `!session?.user?.id`; `requireUser` in `src/lib/session.ts` is unused.
- **Interfaces produced** (`src/lib/api/guards.ts`):
  `requireSession(): Promise<{ ok: true; session: AppSession } | { ok: false; response: NextResponse }>` where the failure is exactly `NextResponse.json({ error: "unauthorized" }, { status: 401 })`;
  `requireAdmin()` same shape with `403 { error: "forbidden" }`. (`AppSession` = the existing return type of `getSession()`.)
- **Approach:** do **not** build a generic `withAuth` wrapper or change any response shape (contradicts the clean-code guardrail). Adopt incrementally — only in routes touched by other tasks (REF-004, 005, 010) — and use `session?.user?.id` consistently (removes the `session.user.id` dereference-after-`!session` pattern). Remove the unused `requireUser` only if grep confirms no references.
- **Acceptance:** helper tests; adopted routes' existing tests unchanged and passing.
- **Not recommended:** a repo-wide codemod.

### REF-027 — Shared webhook route handler — Deps REF-002, REF-007, REF-013
- **Priority:** P3 · **Category:** Maintainability · **Complexity:** Medium · **Regression risk:** Medium
- **Problem:** five near-identical webhook routes (rate-limit, verify, ingest, enqueue, ack) in `src/app/api/webhooks/*`; large inline structural casts in Bitbucket/Jira ones.
- **Interfaces:** `handleWebhook(source: "jira"|"sentry"|"bitbucket"|"ci", req: Request, extract: (json: unknown) => { externalId: string; type: string; subject?: string } | null): Promise<Response>` in `src/app/api/webhooks/_shared.ts` (extend the existing file). Keep each route's `extract` function and response codes identical; existing `*.test.ts` for the routes must pass unchanged (they are the characterization).
- **Skip this task** if REF-002's tests/rewrites already touched these files heavily and the diff is large — it is optional.
- **Validation:** V-STD; all existing webhook route tests unchanged. **Acceptance:** each route ≤ ~30 lines of source-specific code; identical status codes/ack bodies. **Expected:** less duplication (5 near-identical bodies → 1). **Risks:** subtle per-source differences (Jira `x-atlassian-token`, Bitbucket header) lost — keep them in `extract`/verify options.

---

## 7. Regression risks (summary)

| Risk | Tasks | Mitigation |
|---|---|---|
| Behaviour change visible to operators (401 on unsigned webhooks) | REF-002 | Decision D3, release note, production-only gate |
| Avatars missing for exotic hosts | REF-001 | initials fallback exists; allowlist from real data |
| Reverse-proxy `Host` mismatch breaks POSTs | REF-009 | exclude webhook/auth/chat paths; Origin absent ⇒ allow; verify behind nginx |
| Bitbucket load/rate limits | REF-012, 016 | GET-only retries, ≤ 2 retries, concurrency 3 |
| No DOM tests for UI splits | REF-020, 024, 025 | manual QA checklist, one commit per extraction |
| Existing clean-code contracts | all | `docs/clean-code/07-api-contract-inventory.md` must stay accurate; update it when a route contract changes |

## 8. Definition of Done (per task and overall)

Per task: acceptance criteria met · V-STD green (and build/test:db where specified) · new tests added for new logic · no test removed or weakened · diff limited to the listed files (explain any extra) · commit created (not pushed) · `docs/audit/progress.md` updated with commands run and **real** outputs/measurements · any behaviour change recorded in `docs/clean-code/07-api-contract-inventory.md`.

Overall: all READY tasks done or explicitly deferred with a reason; blocked tasks either closed by decision or implemented; baseline (274 files / 2555+ tests) still green; `npm run build` passes; no new dependencies; `git diff main -- package.json package-lock.json prisma/` empty.

## 9. Self-review notes

- Spec coverage: every finding S1–S11, R1–R9, P1–P7, M1–M5 maps to a task or to §8 of the audit (deferred with reason).
- Proportion: tasks give signatures and acceptance, not bodies; code left to the implementer except the exact helper interfaces other tasks consume.
- Type consistency: helper names used across tasks — `readJsonBody` (REF-004/005/026), `fetchWithTimeout`/`withRetry` (REF-012/016), `getCurrentUserGate` (REF-019), `logSwallowed` (REF-013), `requireSession` (REF-026), `mapWithConcurrency` (REF-016).
- Known weakness: tasks S4/S3/S2 depend on policy I could not determine from the code; they are blocked rather than guessed.
