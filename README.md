# Team Task Web

Web nội bộ hỗ trợ team thao tác phía trên Jira. Jira vẫn là source of truth;
web cung cấp board, automation, release gate và notification.

> **Trạng thái:** MVP — M0–M8 đã hoàn thành (2026-09-22). Board, release gate,
> bulk operation, event/notification, chat (Discord), AI estimation và stale
> analytics đều đã implement. Kiến trúc và các quyết định đã chốt nằm tại
> [`docs/architecture.md`](docs/architecture.md); kế hoạch chi tiết nằm tại
> [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Workflow và
> release policy nằm tại [`docs/release-policy.md`](docs/release-policy.md).

## Chức năng (đáp ứng yêu cầu)

| # | Yêu cầu | Trạng thái |
|---|---|---|
| 1 | Đồng bộ Jira (poll issue + comment vào cache) | ✅ Incremental sync + cursor + reconciliation + webhook |
| 2 | Kanban board (thay Jira), search, filter | ✅ |
| 3 | Sửa metadata task + **bulk sửa nhiều task** | ✅ M4: 10 action (assign, labels, points, priority, transition, fix-version, comment, create-branches), preview → confirm → worker, max 500 task |
| 4 | **AI chấm task point** (OpenAI-compatible / Ollama) | ✅ M7: estimate giải thích được (confidence, missing info, similar tasks) + human review Accept/Edit/Reject, chỉ ghi Jira sau khi xác nhận + metrics |
| 5 | **Release management** + ready-check (rule + AI) + cảnh báo | ✅ M3: 8 gate engine (non_empty, task_status, critical_bugs, sentry, branches, pull_requests, data_freshness, ai_advisory), Fail-safe: unknown ≠ ready, release rỗng luôn blocked |
| 6 | **Tự tạo task Jira từ Sentry** (cron) | ✅ M2: Idempotent qua `SentryIssueImported` mapping, phục hồi qua label, backoff + failed sau 5 lần |
| 7 | **Check nhánh chưa merge** (Bitbucket DC + Jira comment) | ✅ M2 + parse-comment: `check-branches` (API, cần token) + `parse-comment-branches` (parse Jira comment, không cần token) |
| 8 | **Stale / task ngâm** + phân tích bottleneck | ✅ M8: per-status SLA, 8 lý do chờ, dashboard bottleneck + trend + support view |
| 9 | **Notification** in-app + Web Push + **Inbox lệnh chuyển trạng thái** | ✅ M5: Outbox retry/backoff/dedupe, preference theo event type, digest mode |
| 10 | **Watch** task quan tâm + notify comment mới | ✅ M5: Nhận comment từ Jira webhook + polling fallback |
| 11 | **Chat (Discord)** — nhận cảnh báo + chạy command an toàn | ✅ M6: `ChatProvider` vendor-neutral, adapter Discord, outbound alert + command có confirm/audit |

## Công nghệ

- **Next.js 16** (App Router, TypeScript) — frontend + API routes; worker dùng
  cùng codebase nhưng chạy bằng process/container riêng.
- **PostgreSQL** + **Prisma** (cache Jira + metadata team).
- **pg-boss** — cron/queue chạy trên Postgres: Jira sync, check branch, AI
  score, Sentry import và stale detect.
- **LLM qua API công ty cấp** (OpenAI-compatible) — qua interface `LLMProvider`, đổi provider/model bằng env.
  Mặc định `openai` (OpenAI/Azure/vLLM/litellm); chọn `ollama` nếu muốn self-host.
- **NextAuth** (credentials) + bcrypt, session JWT.
- **Web Push** (service worker + VAPID) + in-app notification center.
- **Tailwind CSS** + **shadcn/ui**-style components.
- Deploy: **Podman Compose** (`web`, `worker`, `db`). AI dùng API cty cấp — **không** self-host Ollama.

## Kiến trúc hiện tại và mục tiêu

```
[web — Next.js]
  ├─ API Routes (/api/*)     → PostgreSQL read model + user mutations
  └─ Board / Release / Bulk / Watch / Stale / Branches / Inbox / Settings
[worker — pg-boss]
  ├─ poll-jira              (1 phút)    incremental issue/comment sync
  ├─ check-branches         (5 phút)    nhánh chưa merge (Bitbucket API, cần token)
  ├─ parse-comment-branches (5 phút)    parse Jira comment để trích PR/branch state (không cần token BB)
  ├─ ai-score               (10 phút)   chấm task mới (tuỳ chọn)
  ├─ sentry-import          (5 phút)    tạo Jira issue từ Sentry
  ├─ stale-detect           (30 phút)   phát hiện task ngâm
  ├─ process-webhook        (one-off)  xử lý webhook Jira/Sentry/Bitbucket/CI
  └─ deliver-notifications  (1 phút)   gửi push + chat qua outbox
[PostgreSQL]   [Jira DC]  [Bitbucket DC]  [Sentry]  [LLM API cty]  [Discord]
```

Jira là source of truth. Worker dùng service account để đồng bộ issue/comment
vào PostgreSQL read model. Board, release, stale, watch và AI đọc cùng model;
mutation do người dùng thực hiện vẫn chạy bằng token cá nhân rồi đọc lại Jira
để cập nhật cache ngay.

## Đa dự án (mobile)

Web hiển thị **nhiều dự án Jira** (mặc định mobile: `CICM, EDM, EMA, EPM, ETM, MHRM, MR`).
- Thành viên vào **Board** thấy tab chọn dự án (mỗi tab có số task đang mở). Chọn 1 dự án = chỉ thấy task của dự án đó; "All" = tất cả.
- Mọi task hiển thị như trên Jira: key, summary, status (cột Kanban), assignee, priority, labels, points, comments, transitions.
- Worker `poll-jira` đồng bộ các project bằng cursor có overlap; Board có nút
  **Sync Jira** để enqueue incremental refresh.
- Đổi danh sách dự án qua `JIRA_PROJECT_KEYS` (comma-separated).

**Auth Jira**: server này nhận token **Bearer** (`JIRA_AUTH=Bearer`, mặc định). Nếu server khác dùng Basic: `JIRA_AUTH=basic`.

## Đăng nhập & Xác thực bằng Jira Token

1. **Đăng nhập một bước**: mở `/login` → dán Jira Personal Access Token (PAT) → bấm **Kết nối và tiếp tục**.
   - Server tự động xác minh token qua Jira `/myself` (hỗ trợ Bearer ưu tiên và Basic fallback).
   - Tự động liên kết tài khoản cũ hoặc tạo User nội bộ mới với role `member`.
   - Token được **mã hóa AES-256-GCM** trên server (chìa `CRED_ENCRYPTION_KEY`). Trình duyệt chỉ lưu cookie phiên 30 ngày và không bao giờ giữ token.
2. **Onboarding rút gọn**: Lần đầu đăng nhập, chọn các dự án muốn theo dõi trên Board → vào thẳng bảng công việc. Bitbucket là tích hợp tùy chọn trong **Settings → My integrations** (dành cho thao tác nhánh/PR).
3. **Rollback / Break-glass**: Đăng nhập bằng email/mật khẩu cũ được ẩn khỏi UI và chỉ kích hoạt khi cấu hình `LEGACY_PASSWORD_LOGIN=1`.

## Chạy local (dev)

```bash
# 1) Chạy Postgres (dùng Podman, port 5433)
podman run -d --name teamweb-pg \
  -e POSTGRES_USER=teamweb -e POSTGRES_PASSWORD=teamweb -e POSTGRES_DB=teamweb \
  -p 5433:5432 -v teamweb-pg-data:/var/lib/postgresql/data \
  docker.io/library/postgres:16-alpine

# 2) Config
cp .env.example .env   # sửa DATABASE_URL + các token Jira/Bitbucket/Sentry/Ollama

# 3) Dependency + DB
npm install
npm run db:migrate     # tạo + apply migration
npm run db:seed        # tạo user admin (admin@team.local / admin123)

# 4) Dev server
npm run dev            # http://localhost:3000
```

Đăng nhập: `admin@team.local` / `admin123` (hoặc giá trị trong `ADMIN_*`).

Chạy tests / lint / typecheck:

```bash
npm test        # vitest (parser inbox, JQL, AI JSON parsing)
npm run lint
npm run typecheck
```

## Deploy (Podman Compose)

```bash
cp .env.example .env        # (tuỳ chọn) hoặc sửa env trực tiếp trong compose.yaml
podman compose up -d --build
```

- `db` (postgres:16) — port 5433.
- `web` — build từ `Dockerfile`, port 3000. Boot chạy migration, seed và Next.js.
- `worker` — target riêng từ cùng `Dockerfile`, đăng ký schedule và consume pg-boss jobs.
- Mạng nội bộ: web gọi Jira/Bitbucket/Sentry bằng URL thật trong env; `DATABASE_URL` trỏ tới service `db`.
- **AI**: web gọi **API LLM do công ty cấp** (OpenAI-compatible) bằng `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL`. Không cần container Ollama.

## Biến môi trường

Xem đầy đủ + mô tả trong [`.env.example`](.env.example).

## Các endpoint chính

- `GET /api/health` — health check chỉ đọc, gồm trạng thái lần chạy gần nhất của worker.
- `GET /api/issues` — list từ PostgreSQL read model kèm data freshness.
- `POST /api/sync/jira` — enqueue Jira sync; full sync chỉ dành cho admin.
- `GET /api/issues/:key` — detail (comments, AI score, releases, stale).
- `PATCH /api/issues/:key` — sửa metadata (gửi Jira).
- `POST /api/issues/:key/transition` — chuyển trạng thái (gửi Jira).
- `POST /api/issues/:key/ai-score` — chạy AI estimate cho issue.
- `POST /api/issues/:key/ai-score/decision` — accept/edit/reject AI estimate.
- `GET /api/ai/estimation/metrics` — metrics AI estimation (accept rate, deviation).
- `POST /api/issues/bulk` — bulk action (preview).
- `POST /api/bulk/:id/confirm` — confirm bulk operation.
- `GET /api/bulk/:id` — xem kết quả bulk operation.
- `POST /api/inbox/command` — parse + chuyển trạng thái từ lệnh tự do.
- `GET /api/releases` — list release.
- `POST /api/releases` — tạo release (gắn Jira Fix Version).
- `POST /api/releases/:id/ready` — chạy ready-check (gate engine + AI).
- `GET /api/releases/:id/versions` — list Jira Fix Versions của project.
- `GET /api/stale` — stale analytics (bottleneck, trend, support, blocked).
- `GET /api/branches` — list tracked branches (từ Bitbucket API + Jira comment).
- `GET /api/watch` — list watched tasks.
- `POST /api/watch` — watch/unwatch task.
- `GET /api/notify` — list notifications.
- `GET /api/projects` — list Jira projects + columns.
- `PUT /api/me/credentials` — save/disconnect Jira/Bitbucket token.
- `GET /api/me/integrations` — check integration status.
- `POST /api/webhooks/jira` — Jira webhook (issue/comment/transition).
- `POST /api/webhooks/sentry` — Sentry webhook.
- `POST /api/webhooks/bitbucket` — Bitbucket webhook.
- `POST /api/webhooks/ci` — CI webhook.
- `POST /api/webhooks/chat` — Chat (Discord) webhook.

## Điểm cần xác nhận / giả định hiện tại

Đã code theo **giá trị mặc định hợp lý** qua env (đổi được, không hardcode). Trước khi chạy thật,
xác nhận các mục sau và cập nhật `.env`:

1. **Jira DC** — `JIRA_BASE_URL` + token đủ quyền **read/write** (update issue, transition, create issue).
   `JIRA_PROJECT_KEY` = key dự án. **`JIRA_POINTS_FIELD_ID`** = id custom field story-points
   (ví dụ `customfield_10016`) — cần để ghi points/AI điểm về Jira; để trống = không ghi points.
2. **Bitbucket Server DC** — version (5/6/7) ảnh hưởng endpoint. Code dùng `/rest/api/1.0/...`
   (branches, pull-requests). Nếu version khác thì sửa `src/lib/bitbucket/client.ts`.
 3. **LLM API (cty cấp)** — đặt `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL` cho
    endpoint OpenAI-compatible của cty. AI lỗi trả `unavailable` (503), không fabricate
    estimate. Muốn self-host Ollama: đặt `LLM_PROVIDER=ollama`.
 4. **Sentry** — self-hosted hay SaaS (đặt `SENTRY_BASE_URL`), org + project + token đọc issues.
    Sentry import idempotent: mỗi Sentry issue chỉ tạo tối đa 1 Jira issue.
 5. **Release theo Jira Fix Version** — release gắn theo Jira Fix Version (không dùng label).
    Tạo release trong web → link hoặc tạo mới Fix Version. Task thuộc release = issue có
    `fixVersionIds` chứa version đó.
 6. **Web Push** — cần **HTTPS** (hoặc localhost). Môi trường nội bộ dùng self-signed cert + trust.
    Tạo key VAPID: `npx web-push generate-vapid-keys` → điền `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`.
 7. **Phân quyền** — `member` / `admin` (cấp thủ công trong Settings). Admin: settings, user roles.
    (SSO/LDAP để phase 2.)
 8. **Chat (Discord)** — optional. Tạo Discord bot → lấy token, set
    `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_WEBHOOK_SECRET` (HMAC cho
    webhook) và chỉ định webhook cho channel. User link tài khoản của mình tại
    **Settings → Chat** (dán Discord user id). Command trong channel: `/task`,
    `/move`, `/assign`, `/watch`, `/unwatch`, `/release <v> check`, `/stale`,
    `/confirm`. Command chạy bằng quyền Jira của user đã link; bulk cần `/confirm`.
 9. **Bitbucket (optional)** — Branches tab + release gate `branches`/`pull_requests`
    hoạt động khi có `BITBUCKET_BASE_URL` + token + `BITBUCKET_REPOS`. Không có token
    Bitbucket thì worker `parse-comment-branches` parse Jira comment để trích PR/branch
    state (chỉ biết PR đã merge, không chặn được PR đang OPEN).

### Lưu ý kỹ thuật

- **Jira transition là contextual** — không hardcode status→transition. Code fetch
  `GET /issue/{key}/transitions` của từng issue rồi match theo `to.name`. Bulk chuyển trạng thái
  = loop gọi transition từng item, báo kết quả từng item.
- **Worker** chạy độc lập với web; restart web không khởi động hoặc dừng cron.
- Kiến trúc dùng polling reconciliation ở M1 và bổ sung webhook-first ở M5. Xem
  [`docs/architecture.md`](docs/architecture.md).
