# Team Task Web

Web nội bộ hỗ trợ team thao tác phía trên Jira. Jira vẫn là source of truth;
web cung cấp board, automation, release gate và notification.

> **Trạng thái:** dự án đang ở giai đoạn MVP. Milestone 1 đã chuyển Board và
> các tính năng nền sang PostgreSQL read model chung, đồng thời tách worker
> thành process riêng. Kiến trúc và các quyết định đã chốt nằm tại
> [`docs/architecture.md`](docs/architecture.md); kế hoạch chuyển đổi nằm tại
> [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md). Workflow và
> release policy nằm tại [`docs/release-policy.md`](docs/release-policy.md).

## Chức năng (đáp ứng yêu cầu)

| # | Yêu cầu | Trạng thái |
|---|---|---|
| 1 | Đồng bộ Jira (poll issue + comment vào cache) | ✅ Incremental sync + cursor + reconciliation |
| 2 | Kanban board (thay Jira), search, filter | ✅ |
| 3 | Sửa metadata task + **bulk sửa nhiều task** | ✅ |
| 4 | **AI chấm task point** (Ollama) | ✅ M7: estimate giải thích được (confidence, missing info, similar tasks) + human review Accept/Edit/Reject, chỉ ghi Jira sau khi xác nhận + metrics |
| 5 | **Release management** + ready-check (rule + AI) + cảnh báo | ⚠️ MVP, chưa dùng cho production gate |
| 6 | **Tự tạo task Jira từ Sentry** (cron) | ⚠️ MVP, cần hoàn thiện idempotency |
| 7 | **Check nhánh chưa merge** (Bitbucket DC) | ⚠️ MVP, cần sửa mapping trạng thái PR |
| 8 | **Stale / task ngâm** + xếp hạng ai ngâm nhiều nhất | ✅ Đọc read model chung |
| 9 | **Notification** in-app + Web Push + **Inbox lệnh chuyển trạng thái** | ✅ |
 | 10 | **Watch** task quan tâm + notify comment mới | ⚠️ Chưa nhận comment tạo trực tiếp trên Jira |
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
 └─ Board / Release / Bulk / Watch / Stale
[worker — pg-boss]
 ├─ poll-jira          (1–2 phút)  incremental issue/comment sync
 ├─ check-branches     (5 phút)    nhánh chưa merge
 ├─ ai-score           (10 phút)   chấm task mới (tuỳ chọn)
 ├─ sentry-import      (5 phút)    tạo Jira issue từ Sentry
 └─ stale-detect       (30 phút)   phát hiện task ngâm
[PostgreSQL]   [Jira DC]  [Bitbucket DC]  [Sentry]  [LLM API cty]
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

## Tự đăng ký & liên kết tài khoản của từng thành viên

1. **Đăng ký**: mở `/register` → nhập tên, email, mật khẩu → tự đăng nhập. (Tắt đăng ký công khai: `REGISTER_DISABLED=1`.)
2. **Liên kết Jira/Bitbucket của riêng mình**: **Settings → My integrations** → dán token Jira (chọn Bearer/Basic) + token Bitbucket → **Save & verify**.
   - Token **mã hoá AES-256-GCM** lưu trên tài khoản (chìa `CRED_ENCRYPTION_KEY`).
   - Sau khi lưu, web **gọi Jira/Bitbucket dưới quyền người dùng đó** (task, branch, transition, bulk edit… của chính họ). Để trống → dùng chung token team (env).
3. Board đọc read model chung; token cá nhân được dùng cho mutation.

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
- `POST /api/issues/bulk` — bulk action.
- `POST /api/inbox/command` — parse + chuyển trạng thái từ lệnh tự do.
- `GET /api/releases`, `POST /api/releases/:id/ready` — release + ready-check.
- `GET /api/stale`, `GET /api/branches`, `GET /api/watch`, `GET /api/notify`.

## Điểm cần xác nhận / giả định hiện tại

Đã code theo **giá trị mặc định hợp lý** qua env (đổi được, không hardcode). Trước khi chạy thật,
xác nhận các mục sau và cập nhật `.env`:

1. **Jira DC** — `JIRA_BASE_URL` + token đủ quyền **read/write** (update issue, transition, create issue).
   `JIRA_PROJECT_KEY` = key dự án. **`JIRA_POINTS_FIELD_ID`** = id custom field story-points
   (ví dụ `customfield_10016`) — cần để ghi points/AI điểm về Jira; để trống = không ghi points.
2. **Bitbucket Server DC** — version (5/6/7) ảnh hưởng endpoint. Code dùng `/rest/api/1.0/...`
   (branches, pull-requests). Nếu version khác thì sửa `src/lib/bitbucket/client.ts`.
3. **LLM API (cty cấp)** — đặt `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `OPENAI_MODEL` cho
   endpoint OpenAI-compatible của cty. Có **retry + fallback** (điểm mặc định trung bình của
   `POINT_SCALE`) nếu model trả sai JSON. Muốn self-host Ollama: đặt `LLM_PROVIDER=ollama`.
4. **Sentry** — self-hosted hay SaaS (đặt `SENTRY_BASE_URL`), org + project + token đọc issues.
5. **Quy ước label release** — release gắn theo một Jira label (ví dụ `release-1.4.2`). Đổi theo team.
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

### Lưu ý kỹ thuật

- **Jira transition là contextual** — không hardcode status→transition. Code fetch
  `GET /issue/{key}/transitions` của từng issue rồi match theo `to.name`. Bulk chuyển trạng thái
  = loop gọi transition từng item, báo kết quả từng item.
- **Worker** chạy độc lập với web; restart web không khởi động hoặc dừng cron.
- Kiến trúc dùng polling reconciliation ở M1 và bổ sung webhook-first ở M5. Xem
  [`docs/architecture.md`](docs/architecture.md).
