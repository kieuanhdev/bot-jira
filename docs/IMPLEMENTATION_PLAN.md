# Team Task Web — Kế hoạch triển khai chi tiết

> Phiên bản kế hoạch: 1.0  
> Ngày lập: 2026-09-19  
> Trạng thái: In progress — M1–M7 completed (M7: AI estimation + human review + metrics, 2026-09-22)  
> Phạm vi: Jira Data Center, Bitbucket Data Center, Sentry, LLM API, Web Push và một kênh chat ở giai đoạn đầu

## 1. Mục tiêu

Xây dựng Team Task Web thành lớp điều hành công việc phía trên Jira, phục vụ các nhu cầu:

- Xem và cập nhật task mà không phải thao tác trực tiếp trên Jira.
- Gán Fix Version, chuyển trạng thái, cập nhật metadata và tạo branch cho nhiều task.
- Nhận bug từ Sentry và tạo Jira issue chính xác, không trùng lặp.
- Biết release nào sẵn sàng, release nào đang bị chặn và lý do cụ thể.
- Cảnh báo bug nghiêm trọng, branch/PR chưa merge, CI lỗi và task bị ngâm.
- Theo dõi task quan tâm và nhận thông báo khi có comment hoặc thay đổi quan trọng.
- Nhận lệnh từ web/chat nhưng vẫn tuân thủ quyền Jira, xác nhận và audit.
- Dùng AI để gợi ý story point, thiếu sót trong mô tả và rủi ro; AI không tự quyết định release.

## 2. Nguyên tắc kiến trúc

### 2.1 Nguồn dữ liệu

- Jira là source of truth cho issue, workflow, assignee, priority, Fix Version và comment.
- Bitbucket là source of truth cho branch và pull request.
- CI là source of truth cho build/test/deployment status.
- Sentry là source of truth cho error, regression, severity và số lần xuất hiện.
- PostgreSQL là read model/cache và nơi lưu metadata riêng của Team Task Web.

### 2.2 Xác thực

- Service account dùng để đồng bộ dữ liệu chung từ Jira/Bitbucket/Sentry.
- Token cá nhân được dùng cho mutation do người dùng thực hiện.
- Không dùng token service account để bỏ qua quyền của người dùng.
- Token phải được mã hóa khi lưu và không xuất hiện trong log hoặc API response.

### 2.3 Release gate

- Rule xác định là nguồn quyết định chính.
- AI chỉ bổ sung nhận định và cảnh báo.
- Khi thiếu dữ liệu hoặc integration lỗi, kết quả là `unknown`, không phải `passed`.
- Chỉ trạng thái `passed` của toàn bộ gate bắt buộc mới cho phép release.

### 2.4 Automation

- Mọi tác vụ có side effect phải idempotent.
- Bulk action phải có preview, xác nhận và kết quả từng item.
- Job chạy nền phải retry có giới hạn và có dead-letter state.
- Mọi mutation quan trọng phải có audit log.

## 3. Kiến trúc mục tiêu

```text
Jira webhook/poll ───────┐
Sentry webhook/poll ────┤
Bitbucket webhook/poll ─┼──> Event ingestion ──> Queue workers ──> PostgreSQL
CI webhook ─────────────┘                              │
                                                     ├──> Notifications
Web / Chat commands ──> Auth + RBAC ──> Commands ────┼──> Jira/Bitbucket
                                                     └──> Audit log

PostgreSQL read model ──> Next.js API ──> Board / Release / Bulk / Watch / Stale
```

Process triển khai:

```text
web     = Next.js UI + API
worker  = pg-boss scheduler + consumers
db      = PostgreSQL
```

## 4. Các vấn đề hiện tại phải xử lý

| ID | Vấn đề | Mức độ | Ảnh hưởng |
|---|---|---:|---|
| CUR-01 | Board đọc Jira live nhưng release/stale/watch/AI đọc `IssueCache` | P0 | Các màn hình có thể thấy dữ liệu khác nhau |
| CUR-02 | `poll-jira` tồn tại nhưng không được đăng ký trong queue | P0 | Cache không được cập nhật tự động |
| CUR-03 | AI release fallback trả `ready: true` | P0 | Có thể cho phép release khi AI/integration lỗi |
| CUR-04 | Release rỗng có thể trở thành ready | P0 | Kết quả release sai |
| CUR-05 | Sentry mapping được ghi sau khi tạo Jira issue và phụ thuộc IssueCache | P0 | Có thể tạo Jira issue trùng ở lần retry |
| CUR-06 | Pull request `CLOSED` được coi là merged | P0 | Bỏ lọt branch chưa merge |
| CUR-07 | Watcher chỉ được báo comment gửi từ web | P1 | Bỏ lỡ comment tạo trực tiếp trên Jira |
| CUR-08 | Queue chỉ boot khi admin gọi `/api/health` | P0 | Automation có thể không chạy sau restart |
| CUR-09 | Release dùng label thay vì Jira Fix Version | P1 | Không tương thích quy trình release chuẩn |
| CUR-10 | Inbox mới là form web, chưa phải chat integration | P2 | Chưa đáp ứng đầy đủ automation từ tin nhắn |

## 5. Phạm vi phiên bản

### 5.1 Pilot MVP

Pilot MVP bao gồm:

- Jira cache đồng nhất và ổn định.
- Worker chạy độc lập.
- Sentry import không trùng.
- Watch comment từ Jira.
- Fix Version và release gate cơ bản.
- Task–branch–PR mapping.
- Bulk Fix Version/transition/metadata.
- Audit log.

### 5.2 Sau Pilot

- CI gate.
- Chat integration.
- Tạo branch hàng loạt.
- AI estimate có feedback.
- Analytics task ngâm nâng cao.
- Digest và notification preference.

### 5.3 Chưa làm trong đợt đầu

- Thay thế hoàn toàn Jira.
- Tự động release production không có người xác nhận.
- Cho AI tự chuyển trạng thái hoặc tự ghi point hàng loạt.
- Đồng thời tích hợp nhiều kênh chat; chỉ chọn một kênh đầu tiên.

## 6. Kế hoạch triển khai theo milestone

## Milestone 0 — Baseline và quyết định kiến trúc

**Thời gian:** 1 ngày  
**Phụ thuộc:** Không  
**Kết quả:** Team thống nhất một mô hình dữ liệu và tiêu chí release.

### M0-01 — Ghi nhận quyết định kiến trúc

- [x] Tạo `docs/architecture.md`.
- [x] Xác nhận Jira service account dùng cho read/sync.
- [x] Xác nhận mutation chạy bằng token cá nhân.
- [x] Chọn webhook-first, polling làm đối soát.
- [x] Chọn Discord làm kênh chat đầu tiên.
- [x] Chốt convention tên branch.

**Quyết định:** Hoàn thành ngày 2026-09-19. Chi tiết và phạm vi chuyển đổi
được ghi trong [`docs/architecture.md`](architecture.md). Owner mặc định của
integration là administrator được cấu hình bởi `ADMIN_EMAIL`; production cần
dùng secret store và quy trình rotate trong ADR-007.

**Tiêu chí nghiệm thu**

- README và architecture không còn mô tả trái nhau.
- Mọi tính năng đọc chung một read model.
- Có người sở hữu tài khoản integration và cơ chế rotate token.

### M0-02 — Chốt workflow và release policy

- [x] Map Jira status sang status category.
- [x] Xác định status được coi là hoàn thành.
- [x] Xác định severity nào chặn release.
- [x] Xác định role được tạo release, override và đánh dấu released.
- [x] Xác định SLA stale theo trạng thái.

**Quyết định:** Hoàn thành ngày 2026-09-19. Policy chính thức được ghi trong
[`docs/release-policy.md`](release-policy.md). Code hiện tại chưa enforce đầy
đủ policy; các implementation gap được gắn với M1–M3 và M8 trong tài liệu đó.

**Cấu hình đã chốt cho implementation M1–M3**

```env
RELEASE_DONE_CATEGORIES=done
RELEASE_BLOCKING_PRIORITIES=Blocker,Critical
RELEASE_REQUIRED_GATES=non_empty_release,task_status,critical_bugs,sentry,pull_requests,data_freshness,manual_approval
RELEASE_REQUIRE_PR_MERGED=true
RELEASE_REQUIRE_CI=true
RELEASE_DATA_FRESHNESS_MINUTES=5
SENTRY_BLOCKING_LEVELS=fatal
STALE_BACKLOG_DAYS=30
STALE_TODO_DAYS=14
STALE_IN_PROGRESS_DAYS=5
STALE_REVIEW_DAYS=2
STALE_QA_DAYS=2
STALE_BLOCKED_DAYS=3
STALE_UNKNOWN_DAYS=7
```

---

## Milestone 1 — Đồng bộ Jira và worker ổn định

**Thời gian:** 4–5 ngày  
**Phụ thuộc:** Milestone 0  
**Kết quả:** Board, release, watch, stale và AI cùng sử dụng dữ liệu đồng nhất.

### M1-01 — Mở rộng Jira types/client

**File dự kiến**

- `src/lib/jira/types.ts`
- `src/lib/jira/client.ts`
- `src/lib/env.ts`

**Công việc**

- [x] Lấy thêm `project`, `statuscategorychangedate`, `fixVersions` và story-point field.
- [x] Chuẩn hóa Jira account identity.
- [x] Hỗ trợ search incremental theo `updated`.
- [x] Hỗ trợ pagination comment.
- [x] Bổ sung timeout và phân loại lỗi retryable/non-retryable.
- [x] Không trả token hoặc response nhạy cảm trong error.

### M1-02 — Mở rộng schema cache

**File:** `prisma/schema.prisma`

Thêm hoặc điều chỉnh:

```prisma
model IssueCache {
  jiraKey             String   @id
  projectKey          String
  summary             String
  description         String
  status              String
  statusCategory      String
  statusChangedAt     DateTime?
  assigneeJira        String?
  priority            String
  labels              String[]
  fixVersionIds       String[]
  fixVersionNames     String[]
  points              Int?
  jiraCreatedAt       DateTime?
  jiraUpdatedAt       DateTime?
  lastSyncedAt        DateTime
  deletedAt           DateTime?
  raw                  Json?
}

model CommentCache {
  jiraCommentId String @unique
  jiraKey       String
  author        String
  body          String
  createdAt     DateTime?
  updatedAt     DateTime?
  syncedAt      DateTime
}

model IntegrationCursor {
  id             String   @id @default(cuid())
  integration    String
  scope          String
  cursor         String?
  lastStartedAt  DateTime?
  lastSuccessAt  DateTime?
  lastErrorAt    DateTime?
  lastError      String?
  stats          Json?
  @@unique([integration, scope])
}
```

- [x] Tạo migration.
- [x] Viết backfill cho row hiện có.
- [x] Không xóa dữ liệu cũ trong migration đầu tiên.

### M1-03 — Khôi phục `poll-jira`

**File dự kiến**

- `src/lib/queue/workers/poll-jira.ts`
- `src/lib/queue/boss.ts`
- `src/lib/jira/jql.ts`

**Công việc**

- [x] Đăng ký `poll-jira` vào queue.
- [x] First sync theo từng project.
- [x] Incremental sync dựa trên cursor có overlap 2–5 phút.
- [x] Upsert issue theo `jiraKey`.
- [x] Upsert comment theo Jira comment ID.
- [x] Đánh dấu issue không còn truy cập được, không hard delete ngay.
- [x] Không tăng sai counter khi bỏ qua comment sync.
- [x] Ghi cursor chỉ sau khi batch hoàn thành.
- [x] Có lock để tránh các Jira sync chạy chồng nhau.

### M1-04 — Chuyển Board sang read model

**File dự kiến**

- `src/app/api/issues/route.ts`
- `src/hooks/use-issues.ts`
- `src/app/(app)/board/board-client.tsx`
- `src/app/api/sync/jira/route.ts`

**Công việc**

- [x] `/api/issues` đọc PostgreSQL cache.
- [x] Giữ filter project, assignee, label, priority và status.
- [x] Bổ sung filter Fix Version và status category.
- [x] Trả `lastSyncedAt` và `dataFreshness`.
- [x] Nút Sync Jira gửi job và trả `jobId`.
- [x] UI hiển thị cảnh báo nếu dữ liệu quá cũ.
- [x] Sau mutation thành công, đọc lại Jira để cập nhật cache có kiểm soát.

### M1-05 — Tách worker process

**File dự kiến**

- `src/worker.ts` hoặc `scripts/worker.ts`
- `package.json`
- `Dockerfile`
- `compose.yaml`
- `src/app/api/health/route.ts`

**Công việc**

- [x] Tạo entrypoint worker riêng.
- [x] Thêm script `npm run worker`.
- [x] Thêm service `worker` trong compose.
- [x] Health endpoint chỉ đọc trạng thái, không khởi động queue.
- [x] Worker shutdown graceful khi nhận SIGTERM.
- [x] Expose last success/error của từng job.

**Trạng thái implementation:** Hoàn thành ngày 2026-09-21. Migration đã được
apply thành công trên database local; unit test, lint source, typecheck,
production build và worker image build đều pass. Full sync với Jira đã xử lý
thành công 7 project, 6.877 issue và 1.106 comment, không có item lỗi. Một lần
incremental sync kiểm tra lại CICM hoàn thành trong khoảng 2,2 giây, không tạo
thêm issue/comment. Việc restart độc lập hai process vẫn cần được diễn tập trên
staging trước khi mở pilot.

**Definition of Done Milestone 1**

- [x] Board và Jira giống nhau sau thời gian SLA sync.
- [ ] Restart web không làm worker ngừng.
- [x] Chạy sync hai lần không tạo row trùng.
- [x] Watch/release/stale nhìn thấy cùng tập task với Board.
- [x] Unit test, source lint, typecheck và production build pass.
- [x] Integration test với Jira live đã cấu hình pass.

**Bằng chứng kiểm chứng ngày 2026-09-21**

- Full sync: `ok=true`, 7 project, 6.877 issue, 1.106 comment, 1 soft-delete,
  0 issue error; tổng issue active trong cache khớp tổng kết quả Jira.
- Incremental CICM: trước/sau đều là 840 issue và 337 comment; `created=0`,
  `issueErrors=0`.
- Worker image `team-task-web-worker:m1-check` build thành công sau khi bổ sung
  `.dockerignore` để loại `.next`, `node_modules`, file môi trường và artifact
  phát triển khỏi build context.
- Tiêu chí restart web/worker giữ trạng thái chưa hoàn thành vì cần chạy hai
  container độc lập trên staging và quan sát ít nhất một chu kỳ polling.

---

## Milestone 2 — Sửa toàn vẹn dữ liệu và fail-safe

**Thời gian:** 2–3 ngày  
**Phụ thuộc:** Milestone 1  
**Kết quả:** Retry không tạo dữ liệu trùng và release không thể ready khi thiếu dữ liệu.

### M2-01 — Sentry import idempotent

**File dự kiến**

- `prisma/schema.prisma`
- `src/lib/sentry/client.ts`
- `src/lib/queue/workers/sentry-import.ts`

**Schema đề xuất**

```prisma
enum ImportState {
  pending
  created
  failed
  ignored
}

model SentryIssueImported {
  id             String      @id @default(cuid())
  sentryIssueId  String
  sentryProject  String
  jiraKey        String?
  state          ImportState @default(pending)
  attemptCount   Int         @default(0)
  lastError      String?
  lastAttemptAt  DateTime?
  importedAt     DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  @@unique([sentryProject, sentryIssueId])
}
```

**Luồng xử lý**

1. Upsert mapping `pending` bằng Sentry ID.
2. Nếu mapping đã có `jiraKey`, kết thúc thành công.
3. Tìm Jira issue có label `sentry-id-{id}` để phục hồi lần chạy dở.
4. Nếu chưa có, tạo Jira issue.
5. Upsert Jira issue vào `IssueCache`.
6. Ghi `jiraKey` và chuyển mapping sang `created`.
7. Khi lỗi, lưu `attemptCount`, `lastError` và retry backoff.

**Tiêu chí nghiệm thu**

- Cùng một Sentry issue chỉ tạo tối đa một Jira issue.
- Worker chết sau bước tạo Jira vẫn phục hồi được ở lần chạy sau.
- Sau số lần retry quy định, item chuyển `failed` và phát cảnh báo.

### M2-02 — Release checker fail-safe

**File dự kiến**

- `src/lib/ai/provider.ts`
- `src/lib/ai/openai.ts`
- `src/lib/ai/ollama.ts`
- `src/app/api/releases/[id]/ready/route.ts`

**Công việc**

- [x] AI fallback trả trạng thái `unknown`.
- [x] Release rỗng luôn `blocked`.
- [x] Dữ liệu vượt freshness threshold trả `unknown`.
- [x] Không cập nhật release thành `ready` khi có gate `unknown`.
- [x] Phân biệt `AI unavailable` với `AI found no blocker`.
- [x] Lưu kết quả từng lần kiểm tra.

### M2-03 — Sửa trạng thái Bitbucket

**File dự kiến**

- `src/lib/bitbucket/client.ts`
- `src/lib/queue/workers/check-branches.ts`

**Công việc**

- [x] Chỉ `MERGED` được coi là merged.
- [x] `OPEN`, `CLOSED`, `DECLINED` được lưu riêng.
- [x] Lấy đầy đủ pagination branch/PR.
- [x] Lưu destination branch.
- [x] Không coi PR merge vào nhánh khác là đã merge vào release base branch.

### M2-04 — Comment từ Jira gửi notification

- [x] Nhận Jira comment webhook.
- [x] Nếu chưa có webhook, poll comment ID mới làm fallback.
- [x] Upsert comment.
- [x] Notify watcher, loại trừ chính tác giả nếu map được identity.
- [x] Dùng dedupe key để không gửi lặp.

**Trạng thái implementation:** Hoàn thành ngày 2026-09-21. Migration đã được
apply trên database local; unit test (79 tests), lint, typecheck và production
build đều pass.

**Definition of Done Milestone 2**

- [x] Test mô phỏng worker chết giữa import không tạo Jira duplicate.
- [x] AI/network lỗi không tạo kết quả ready.
- [x] PR bị decline chặn gate đúng.
- [x] Comment trực tiếp trên Jira gửi notification một lần.

---

## Milestone 3 — Release Control Center

**Thời gian:** 5–7 ngày  
**Phụ thuộc:** Milestone 1–2  
**Kết quả:** Team biết release nào sẵn sàng và lý do release bị chặn.

### M3-01 — Dùng Jira Fix Version

**Schema đề xuất**

```prisma
model Release {
  id             String        @id @default(cuid())
  projectKey     String
  jiraVersionId  String
  version        String
  description    String        @default("")
  status         ReleaseStatus @default(draft)
  releaseDate    DateTime?
  createdById    String?
  releasedAt     DateTime?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  @@unique([projectKey, jiraVersionId])
}
```

**Công việc**

- [ ] Jira client list/create/update/release version.
- [ ] Đồng bộ Jira versions theo project.
- [ ] Release task được truy vấn từ `fixVersionIds` thay vì snapshot label.
- [ ] Bulk gán hoặc bỏ Fix Version.
- [ ] Giữ migration compatibility cho release dùng label cũ.

### M3-02 — Lưu lịch sử release check

```prisma
enum GateState {
  passed
  failed
  unknown
  overridden
}

model ReleaseCheck {
  id          String   @id @default(cuid())
  releaseId   String
  triggeredBy String?
  status      String
  snapshot    Json
  startedAt   DateTime @default(now())
  completedAt DateTime?
}

model ReleaseGateResult {
  id           String    @id @default(cuid())
  checkId      String
  gate         String
  state        GateState
  summary      String
  details      Json?
  sourceTime   DateTime?
}
```

### M3-03 — Gate engine

Tạo module `src/lib/releases/gates/`:

- [ ] `task-status.ts`
- [ ] `critical-bugs.ts`
- [ ] `sentry.ts`
- [ ] `branches.ts`
- [ ] `pull-requests.ts`
- [ ] `ci.ts`
- [ ] `data-freshness.ts`
- [ ] `manual-approval.ts`
- [ ] `ai-advisory.ts`

Mỗi gate trả cấu trúc:

```ts
type GateResult = {
  gate: string;
  state: "passed" | "failed" | "unknown";
  summary: string;
  blockers: Array<{
    jiraKey?: string;
    source: string;
    reason: string;
    url?: string;
  }>;
  sourceTime?: Date;
};
```

**Luật tổng hợp**

- Gate bắt buộc `failed` → release `blocked`.
- Gate bắt buộc `unknown` → release `checking` hoặc `unknown`.
- Tất cả gate bắt buộc `passed` → release `ready`.
- AI advisory không được tự chuyển `blocked` thành `ready`.

### M3-04 — Override

```prisma
model ReleaseGateOverride {
  id            String   @id @default(cuid())
  releaseId     String
  gate          String
  reason        String
  ticketUrl     String?
  owner         String
  createdById   String
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  revokedAt     DateTime?
}
```

- [ ] Chỉ `release_manager` hoặc `admin` được override.
- [ ] Bắt buộc nhập lý do và owner.
- [ ] Override có thể hết hạn/revoke.
- [ ] Override xuất hiện trong audit và release UI.

### M3-05 — Release UI

**File dự kiến**

- `src/app/(app)/release/release-client.tsx`
- `src/app/api/releases/route.ts`
- `src/app/api/releases/[id]/ready/route.ts`
- Các route mới dưới `src/app/api/releases/[id]/`

**UI cần có**

- [ ] Danh sách release theo project.
- [ ] Progress task và point.
- [ ] Badge `draft/checking/ready/blocked/released`.
- [ ] Card từng gate.
- [ ] Link đến task/PR/Sentry/build gây blocker.
- [ ] Thời điểm dữ liệu nguồn.
- [ ] Lịch sử check.
- [ ] Form override.
- [ ] Nút release chỉ được bật khi policy cho phép.
- [ ] Skeleton, empty state và dark mode theo design system.

**Definition of Done Milestone 3**

- [ ] Có thể xác định release ready/blocked trong một màn hình.
- [ ] Mỗi blocker có lý do và link xử lý.
- [ ] Có lịch sử kết quả và override.
- [ ] Không release được khi gate bắt buộc chưa xác minh.

---

## Milestone 4 — Bulk operation và tạo branch

**Thời gian:** 4–5 ngày  
**Phụ thuộc:** Milestone 1 và M3-01  
**Kết quả:** Bulk action không timeout, có preview, retry và audit.

### M4-01 — Schema bulk operation

```prisma
enum OperationState {
  preview
  queued
  running
  completed
  partially_failed
  failed
  cancelled
}

model BulkOperation {
  id           String         @id @default(cuid())
  type         String
  requestedBy  String
  payload      Json
  state        OperationState @default(preview)
  total        Int
  succeeded    Int            @default(0)
  failed       Int            @default(0)
  createdAt    DateTime       @default(now())
  startedAt    DateTime?
  completedAt  DateTime?
}

model BulkOperationItem {
  id           String   @id @default(cuid())
  operationId  String
  jiraKey      String
  before       Json?
  requested    Json
  after        Json?
  status       String
  error        String?
  attemptCount Int      @default(0)
  @@unique([operationId, jiraKey])
}
```

### M4-02 — Preview API

- [ ] Validate quyền và transition cho từng issue.
- [ ] Hiển thị before/after.
- [ ] Không mutation trong preview.
- [ ] Cảnh báo task không truy cập được hoặc dữ liệu cũ.
- [ ] Bắt buộc confirm bằng operation ID.

### M4-03 — Worker xử lý bulk

- [ ] Queue theo operation.
- [ ] Giới hạn concurrency gọi Jira.
- [ ] Retry item retryable.
- [ ] Không chạy lại item thành công.
- [ ] Update cache sau từng item.
- [ ] Notification khi hoàn tất hoặc partially failed.

### M4-04 — Các action

- [ ] Assign.
- [ ] Add/remove labels.
- [ ] Set priority.
- [ ] Set story point.
- [ ] Transition.
- [ ] Add/remove Fix Version.
- [ ] Add comment.
- [ ] Tạo branch.

### M4-05 — Tạo branch hàng loạt

- [ ] Chọn repository và base branch.
- [ ] Sinh tên theo template cấu hình.
- [ ] Kiểm tra branch tồn tại trước khi tạo.
- [ ] Lưu quan hệ issue–branch.
- [ ] Tùy chọn comment link branch vào Jira.
- [ ] Tạo branch là idempotent.

**Definition of Done Milestone 4**

- [ ] Bulk 100 task không làm HTTP request timeout.
- [ ] Có kết quả từng item.
- [ ] Retry không lặp lại item thành công.
- [ ] Có thể tải/xem audit của operation.

---

## Milestone 5 — Event, webhook và notification

**Thời gian:** 4–6 ngày  
**Phụ thuộc:** Milestone 1–2  
**Kết quả:** Sự kiện bên ngoài được xử lý gần realtime và không gửi notification trùng.

### M5-01 — Event store tối giản

```prisma
model IntegrationEvent {
  id             String   @id @default(cuid())
  source         String
  externalId     String
  type           String
  subject        String?
  payload        Json
  receivedAt     DateTime @default(now())
  processedAt    DateTime?
  processingError String?
  @@unique([source, externalId])
}
```

- [x] Lưu raw event có giới hạn kích thước.
- [x] Verify webhook signature.
- [x] Acknowledge nhanh rồi xử lý qua queue.
- [x] Deduplicate bằng external event ID.

### M5-02 — Webhook endpoints

- [x] `/api/webhooks/jira`
- [x] `/api/webhooks/sentry`
- [x] `/api/webhooks/bitbucket`
- [x] `/api/webhooks/ci`
- [x] Rate limit và secret riêng cho từng source.

### M5-03 — Notification preference

Cho phép cấu hình:

- [x] Theo event type.
- [ ] Theo task.
- [ ] Theo project.
- [ ] Theo release.
- [ ] Theo severity.
- [x] Gửi ngay hoặc daily digest (chế độ instant/digest; digest scheduler chưa chạy job).
- [x] In-app, Web Push (chat chưa — M6).

### M5-04 — Notification delivery

- [x] Outbox table để gửi đáng tin cậy.
- [x] Retry/backoff.
- [x] Dedupe key.
- [x] Lưu delivery status.
- [x] Vô hiệu push subscription hết hạn.

**Definition of Done Milestone 5**

- [x] Comment Jira đến watcher gần realtime.
- [x] Một external event chỉ tạo một notification logic.
- [x] Polling vẫn đối soát nếu webhook bị mất.
- [x] Người dùng tắt được loại thông báo không mong muốn.

**Trạng thái implementation:** Hoàn thành ngày 2026-09-22. Migration
`20260921101519_m5_events_notifications` và `20260921102648_m5_preference_relation`
đã apply trên database local. Event store (`IntegrationEvent`) lưu raw payload
có giới hạn, verify signature theo từng source và dedupe bằng
`(source, externalId)`. Bốn webhook endpoint ack nhanh rồi enqueue qua
`process-webhook`; worker xử lý idempotent và poll worker tiếp tục đối soát.
Outbox (`NotificationOutbox`) gửi push có retry/backoff, dedupe key và tự vô
hiệu subscription hết hạn; worker `deliver-notifications` chạy mỗi phút.
Preference theo event type + instant/digest đã có API và UI (mục digest
scheduler theo giờ chưa chạy job — ghi nhận để bổ sung). Unit test (171
tests), lint source, typecheck (chỉ còn lỗi `LayoutProps` có sẵn từ trước) và
production build đều pass.

---

## Milestone 6 — Chat integration

**Thời gian:** 4–6 ngày cho một kênh  
**Phụ thuộc:** Milestone 4–5  
**Kết quả:** Người dùng nhận cảnh báo và thực hiện command an toàn từ chat.

### M6-01 — Chọn adapter đầu tiên

- [x] Chọn Discord làm adapter đầu tiên (ADR-005); giữ interface vendor-neutral.
- [x] Tạo interface `ChatProvider` (`src/lib/chat/index.ts`) để không khóa vào một vendor.
- [x] Adapter Discord tách riêng (`src/lib/chat/discord.ts`) — REST bot token + verify HMAC webhook.
- [x] Map chat account với User/Jira account qua bảng `ChatIdentity` (explicit linking).

### M6-02 — Outbound message

- [x] Release blocked/ready (fan-out qua `notifyAll` → outbox channel `chat`).
- [x] Sentry Critical/Blocker (từ webhook handler, qua cùng đường fan-out).
- [x] Task được watch có comment mới (từ `notifyUser`/watch, qua cùng đường fan-out).
- [x] Bulk operation hoàn tất (từ bulk worker, qua cùng đường fan-out).
- [ ] PR/branch quá hạn (tái sử dụng gate/stale; chưa thêm event riêng trong đợt này).

### M6-03 — Commands

Command tối thiểu:

```text
/task PROJ-123
/move PROJ-123 "In Progress"
/assign PROJ-123 me
/watch PROJ-123   /unwatch PROJ-123
/release 1.4.2 check
/stale
/confirm
```

**Luật an toàn**

- [x] Rule-based parser xử lý action cuối cùng (`src/lib/chat/commands.ts`).
- [x] Lệnh mơ hồ không tự thực thi — trả `unknown` + `/help` (không có AI auto-execute).
- [x] Mutation phải kiểm tra RBAC và quyền Jira (role check + chạy bằng token Jira của user).
- [x] Bulk command phải confirm (multi-key move/assign tạo `ChatMessageConfirmation`, cần `/confirm`).
- [x] Command và kết quả được ghi audit (bảng `ChatMessage` + correlation id).
- [x] Token chat không được dùng như Jira identity (luôn map qua `ChatIdentity` → user Jira credential).

**Definition of Done Milestone 6**

- [x] Người không có quyền không thể transition qua bot (403 từ Jira → `blocked`).
- [x] Lệnh mơ hồ không tự thực thi.
- [x] Có xác nhận trước bulk mutation.
- [x] Mọi command có correlation ID và audit record.

**Trạng thái implementation:** Hoàn thành ngày 2026-09-22. Migration
`20260922090000_m6_chat_integration` thêm `ChatIdentity`, `ChatMessage` và
`ChatMessageConfirmation`. `ChatProvider` là contract vendor-neutral
(`src/lib/chat/index.ts`); adapter Discord ở `src/lib/chat/discord.ts` (REST bot
token, verify HMAC `X-Discord-Signature`, normalize inbound). Parser
`src/lib/chat/commands.ts` xử lý rule-based và không bao giờ tự thực thi lệnh
mơ hồ. Executor `src/lib/chat/execute.ts` enforce RBAC (release check chỉ cho
`release_manager`/`admin`), chạy mutation bằng Jira credential của user (403 →
`blocked`), yêu cầu confirm cho bulk, và ghi mọi command + correlation id vào
`ChatMessage`. Inbound qua `/api/webhooks/chat` (verify signature, map
`ChatIdentity`). Outbound fan-out gộp vào `notify/outbox.ts` (channel `chat`)
và worker `deliver-notifications` đã có xử lý channel `chat`; dedupe theo
`chat:<type>:<eventId>`. Link/unlink qua web (`/api/chat/identity*` + UI trong
Settings → Chat). Unit test (48 test mới), lint source, typecheck (chỉ còn lỗi
`LayoutProps` có sẵn từ trước) và production build đều pass.

**Phạm vi còn lại (không block pilot):** outbound riêng cho PR/branch quá hạn;
digest scheduler cho chế độ digest (đã ghi nhận từ M5); adapter chat thứ hai
(Slack/Teams) qua cùng `ChatProvider`.

---

## Milestone 7 — AI estimation và task quality

**Thời gian:** 3–5 ngày  
**Phụ thuộc:** Milestone 1  
**Kết quả:** AI đưa ra estimate giải thích được và có human approval.

### M7-01 — Chuẩn hóa input

Đầu vào:

- [x] Summary và description.
- [x] Issue type và component.
- [x] Acceptance criteria.
- [x] Dependency.
- [x] Backend/frontend/mobile impact.
- [x] Migration và test requirement.
- [x] Các task lịch sử tương tự nếu có.

### M7-02 — Output schema

```json
{
  "suggestedPoints": 5,
  "confidence": 0.72,
  "reasoning": "...",
  "missingInformation": ["Acceptance criteria"],
  "risks": ["Database migration"],
  "similarTasks": ["PROJ-101"]
}
```

### M7-03 — Human review

- [x] `Accept`, `Edit` hoặc `Reject` suggestion.
- [x] Chỉ ghi Jira sau khi xác nhận.
- [x] Lưu AI point và final point riêng.
- [x] Lưu model, prompt version và thời điểm.
- [x] AI lỗi trả `unavailable`, không giả lập estimate hợp lệ.

### M7-04 — Metrics

- [x] Tỷ lệ suggestion được accept.
- [x] Sai lệch giữa AI và final point.
- [x] Confidence theo issue type.
- [x] Không dùng nội dung task nhạy cảm cho training ngoài chính sách công ty.

**Definition of Done Milestone 7**

- [x] Không có AI fallback bị ghi vào Jira như kết quả thật.
- [x] Người dùng thấy confidence và thông tin còn thiếu.
- [x] Có feedback data để cải thiện rubric/prompt.

**Trạng thái implementation:** Hoàn thành ngày 2026-09-22. Migration
`20260922015326_m7_ai_estimation` thêm `confidence`, `missingInformation`,
`similarTasks`, `promptVersion` vào `AiScore` và model `AiEstimateDecision`
(lưu quyết định + final points riêng). Input chuẩn hóa ở
`src/lib/ai/estimation-input.ts` (derive impact flags, acceptance criteria,
dependencies, similar tasks theo similarity). Output mới ở `src/lib/ai/prompts.ts`
(với `AI_PROMPT_VERSION`); provider giờ throw `AiUnavailableError` thay vì
fabricate estimate, nên API trả `503 unavailable` và worker không ghi fake vào
cache/Jira. Human review qua `POST /api/issues/[key]/ai-score/decision`
(accept/edit ghi Jira, reject không ghi) + UI tab AI (confidence badge, missing
info, similar tasks, Accept/Edit/Reject). Metrics: `GET /api/ai/estimation/metrics`
(accept rate, mean absolute deviation AI-vs-final, accuracy, avg confidence,
confidence theo issue type). Unit test (22 test mới), lint source, typecheck
(chỉ còn lỗi `LayoutProps` pre-existing ở `src/app/layout.tsx`).

---

## Milestone 8 — Stale analytics

**Thời gian:** 2–3 ngày  
**Phụ thuộc:** Milestone 1  
**Kết quả:** Dashboard phản ánh bottleneck thay vì chỉ xếp hạng cá nhân.

### M8-01 — Định nghĩa tuổi task

- [ ] `totalAgeDays`: từ lúc tạo.
- [ ] `stateAgeDays`: thời gian trong trạng thái hiện tại.
- [ ] `inactiveDays`: thời gian không có cập nhật đáng kể.
- [ ] `blockedDays`: thời gian bị blocked.

### M8-02 — Phân loại stale

- [ ] Chờ thực hiện.
- [ ] Đang làm nhưng không cập nhật.
- [ ] Chờ review.
- [ ] Chờ QA.
- [ ] Chờ team khác.
- [ ] Không có assignee.

### M8-03 — Dashboard

- [ ] Task vượt SLA.
- [ ] Bottleneck theo status.
- [ ] Người cần hỗ trợ.
- [ ] Task blocked lâu nhất.
- [ ] Xu hướng theo tuần.
- [ ] Filter project/team/assignee/status.

**Nguyên tắc**

- Không dùng leaderboard đơn giản để đánh giá hiệu suất cá nhân.
- Hiển thị nguyên nhân chờ nếu có.
- Notification chỉ gửi khi vượt threshold hoặc severity tăng.

---

## Milestone 9 — Bảo mật, observability và rollout

**Thời gian:** 3–4 ngày  
**Phụ thuộc:** Tất cả milestone pilot  
**Kết quả:** Sẵn sàng pilot có kiểm soát.

### M9-01 — RBAC

Role đề xuất:

| Role | Quyền chính |
|---|---|
| member | Xem, sửa task theo quyền Jira, watch, chạy AI suggestion |
| release_manager | Tạo release, chạy check, override gate, release |
| admin | Quản lý user, integration, policy và worker |

- [ ] API kiểm tra role phía server.
- [ ] UI hide/disable chỉ là hỗ trợ, không thay thế server authorization.
- [ ] Kiểm tra Jira permission trước mutation.

### M9-02 — Audit log

```prisma
model AuditLog {
  id            String   @id @default(cuid())
  actorUserId   String?
  actorType     String
  action        String
  targetType    String
  targetId      String
  before        Json?
  after         Json?
  source        String
  correlationId String?
  ipHash        String?
  createdAt     DateTime @default(now())
}
```

Audit bắt buộc cho:

- Transition/edit/bulk task.
- Tạo branch.
- Tạo/sửa/release version.
- Override gate.
- Thay đổi role và integration.
- Chat command.

### M9-03 — Observability

- [ ] Structured JSON log.
- [ ] Correlation ID cho API/job/webhook.
- [ ] Metrics job duration/success/failure/retry.
- [ ] Metrics external API latency/error.
- [ ] Alert worker không chạy.
- [ ] Alert sync cursor quá cũ.
- [ ] Không log token, password, toàn bộ comment hoặc description nhạy cảm.

### M9-04 — Backup và recovery

- [ ] Backup PostgreSQL hằng ngày.
- [ ] Xác nhận restore được trên môi trường test.
- [ ] Tài liệu rotate credentials.
- [ ] Runbook khi Jira/Sentry/Bitbucket unavailable.

### M9-05 — Pilot rollout

1. Deploy staging.
2. Kết nối một Jira project thử nghiệm.
3. Chạy shadow mode cho release gate; chưa chặn release thật.
4. So sánh kết quả với release manager trong 1–2 tuần.
5. Sửa false positive/negative.
6. Bật gate bắt buộc cho một project.
7. Mở rộng dần sang project khác.

## 7. API dự kiến

### Issues

```text
GET    /api/issues
GET    /api/issues/:key
PATCH  /api/issues/:key
POST   /api/issues/:key/transition
POST   /api/issues/:key/comments
POST   /api/issues/:key/watch
POST   /api/issues/:key/ai-score
```

### Sync và jobs

```text
POST   /api/sync/jira
GET    /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/retry
```

### Releases

```text
GET    /api/releases
POST   /api/releases
GET    /api/releases/:id
PATCH  /api/releases/:id
POST   /api/releases/:id/checks
GET    /api/releases/:id/checks
POST   /api/releases/:id/overrides
DELETE /api/releases/:id/overrides/:overrideId
POST   /api/releases/:id/release
```

### Bulk operations

```text
POST   /api/bulk/preview
POST   /api/bulk/:id/confirm
GET    /api/bulk/:id
POST   /api/bulk/:id/retry
POST   /api/bulk/:id/cancel
```

### Webhooks

```text
POST   /api/webhooks/jira
POST   /api/webhooks/sentry
POST   /api/webhooks/bitbucket
POST   /api/webhooks/ci
POST   /api/webhooks/chat
```

## 8. Chiến lược kiểm thử

### 8.1 Unit tests

- [ ] Jira JQL và escaping.
- [ ] Status category mapping.
- [ ] Release gate aggregation.
- [ ] AI parser và unavailable path.
- [ ] Sentry idempotency state machine.
- [ ] Branch/PR state mapping.
- [ ] Inbox/chat command parser.
- [ ] Permission policies.
- [ ] Notification dedupe.

### 8.2 Integration tests

- [ ] Jira mock server: search, update, transition, comments, versions.
- [ ] Sentry issue → một Jira issue duy nhất.
- [ ] Jira comment webhook → watcher notification.
- [ ] Bitbucket PR event → branch cache → release gate.
- [ ] Bulk retry không chạy lại item thành công.
- [ ] Worker restart tiếp tục job đúng.
- [ ] Expired/invalid token không làm lộ credential.

### 8.3 End-to-end tests

1. Tạo release, gán task, chạy check và nhận blocker.
2. Merge PR, đóng bug, CI xanh và release chuyển ready.
3. Mất kết nối AI nhưng release không chuyển ready sai.
4. Sentry gửi cùng event hai lần nhưng chỉ có một Jira issue.
5. Comment trực tiếp trên Jira gửi một notification.
6. Bulk transition có item thành công và item thất bại.
7. Người không đủ role không override gate.
8. Chat command mơ hồ chỉ tạo preview, không mutation.

### 8.4 Quality gates cho pull request

```text
npm test
npm run typecheck
npm run lint
npm run build
```

Ngoài ra:

- Migration được thử trên database snapshot.
- Không giảm coverage của module release/security/idempotency.
- UI mới kiểm tra light/dark, keyboard và empty/loading/error states.

## 9. Thứ tự thực hiện backlog

| Thứ tự | Task | Ưu tiên | Phụ thuộc | Ước tính |
|---:|---|---:|---|---:|
| 1 | M0-01 Kiến trúc | P0 | — | 0.5 ngày |
| 2 | M0-02 Release policy | P0 | — | 0.5 ngày |
| 3 | M1-01 Jira client/types | P0 | M0 | 1 ngày |
| 4 | M1-02 Cache schema | P0 | M1-01 | 1 ngày |
| 5 | M1-03 Poll Jira | P0 | M1-02 | 1.5 ngày |
| 6 | M1-05 Worker process | P0 | M1-03 | 1 ngày |
| 7 | M1-04 Board dùng cache | P0 | M1-03 | 1 ngày |
| 8 | M2-01 Sentry idempotency | P0 | M1 | 1 ngày |
| 9 | M2-02 Release fail-safe | P0 | M1 | 0.5 ngày |
| 10 | M2-03 Bitbucket states | P0 | — | 0.5 ngày |
| 11 | M2-04 Comment notifications | P1 | M1 | 1 ngày |
| 12 | M3-01 Fix Version | P1 | M1 | 1.5 ngày |
| 13 | M3-02 Check history | P1 | M3-01 | 1 ngày |
| 14 | M3-03 Gate engine | P1 | M2, M3-02 | 2 ngày |
| 15 | M3-04 Override | P1 | M3-03 | 1 ngày |
| 16 | M3-05 Release UI | P1 | M3-03 | 2 ngày |
| 17 | M4 Bulk operation | P1 | M1, M3-01 | 4–5 ngày |
| 18 | M5 Event/notification | P1 | M1–2 | 4–6 ngày |
| 19 | M6 Chat integration | P2 | M4–5 | 4–6 ngày |
| 20 | M7 AI estimation | P2 | M1 | 3–5 ngày |
| 21 | M8 Stale analytics | P2 | M1 | 2–3 ngày |
| 22 | M9 Hardening/pilot | P0 trước production | Tất cả pilot | 3–4 ngày |

## 10. Kế hoạch theo tuần

### Tuần 1 — Data foundation

- Milestone 0.
- Jira schema/client.
- Cache migration.
- Poll worker.
- Worker process độc lập.

### Tuần 2 — Integrity

- Board đọc cache.
- Sentry idempotency.
- Release fail-safe.
- Bitbucket state.
- Jira comment notification.

**Mốc:** Có thể bắt đầu internal test dữ liệu.

### Tuần 3 — Release backend

- Jira Fix Version.
- Release check history.
- Gate engine.
- Task–branch–PR mapping.

### Tuần 4 — Release UI và bulk

- Release Control Center.
- Override.
- Bulk operation foundation.
- Bulk Fix Version/transition.

**Mốc:** Có thể pilot release cho một project nhỏ.

### Tuần 5 — Event và notifications

- Jira/Sentry/Bitbucket webhooks.
- Notification outbox.
- Preferences.
- CI integration cơ bản.

### Tuần 6 — Automation

- Chat integration đầu tiên.
- Tạo branch hàng loạt.
- AI estimation review.

### Tuần 7 — Hardening và pilot

- RBAC/audit.
- Metrics/alerts.
- Backup/restore test.
- End-to-end tests.
- Shadow release gate.

## 11. Điều kiện mở pilot

Chỉ mở pilot khi toàn bộ điều kiện sau đạt:

- [ ] Không còn P0 bug đã biết.
- [ ] Jira sync có metrics và cảnh báo freshness.
- [ ] Sentry import đã qua test idempotency.
- [ ] Release checker fail-safe.
- [ ] `CLOSED` PR không được tính là merged.
- [ ] Audit log cho mutation và override.
- [ ] Backup và restore đã thử thành công.
- [ ] Unit, integration, E2E, typecheck và build pass.
- [ ] Pilot project có owner và release manager chịu trách nhiệm.
- [ ] Có rollback/runbook khi integration lỗi.

## 12. Chỉ số đánh giá sau pilot

### Độ tin cậy

- Tỷ lệ Jira sync thành công ≥ 99%.
- Không có Sentry issue bị tạo Jira trùng.
- Không có notification duplicate do cùng một event.
- Không có release được đánh dấu ready khi dữ liệu bắt buộc là unknown.

### Hiệu quả

- Thời gian chuẩn bị release giảm ít nhất 30%.
- Số thao tác Jira thủ công giảm ít nhất 30%.
- Thời gian phát hiện release blocker dưới 5 phút sau event.
- Bulk action 100 task hoàn tất trong SLA đã thống nhất.

### Chất lượng AI

- Theo dõi tỷ lệ Accept/Edit/Reject.
- Không coi fallback là AI success.
- Theo dõi sai lệch giữa suggested point và final point.

## 13. Rủi ro và phương án giảm thiểu

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Jira API chậm hoặc rate limit | Sync/bulk chậm | Cursor sync, concurrency limit, retry/backoff |
| Token cá nhân hết hạn | Mutation lỗi | Verify định kỳ, cảnh báo người dùng, không fallback âm thầm |
| Webhook mất event | Cache thiếu | Polling reconciliation |
| AI trả JSON sai hoặc unavailable | Estimate/gate không chắc chắn | Schema validation, retry, `unknown`, human review |
| Mapping branch–task sai | Gate sai | Convention + xác nhận thủ công + link evidence |
| Release policy khác giữa project | False blocker | Policy cấu hình theo project |
| Notification quá nhiều | Người dùng tắt toàn bộ | Preference, severity, digest, dedupe |
| Migration dữ liệu lỗi | Downtime/mất dữ liệu | Expand–migrate–contract, backup và dry run |

## 14. Definition of Done chung

Một task chỉ được coi là hoàn thành khi:

- [ ] Có implementation và migration cần thiết.
- [ ] Có xử lý loading, empty, error và retry phù hợp.
- [ ] Có authorization phía server.
- [ ] Có audit nếu tạo side effect.
- [ ] Có unit/integration test theo mức rủi ro.
- [ ] Không log secret hoặc dữ liệu nhạy cảm không cần thiết.
- [ ] README/config/example env được cập nhật.
- [ ] `npm test`, `npm run typecheck` và `npm run build` pass.
- [ ] Lint phần source pass; thư mục tooling không liên quan được cấu hình ignore đúng.
- [ ] Có tiêu chí nghiệm thu được kiểm tra trên staging.

## 15. Bước tiếp theo ngay lập tức

Sprint đầu tiên nên lấy các task sau:

1. M0-01 và M0-02: chốt kiến trúc/policy.
2. M1-01: mở rộng Jira client và types.
3. M1-02: migration cache.
4. M1-03: khôi phục incremental poll.
5. M1-05: tách worker process.
6. M1-04: chuyển Board sang cache.
7. M2-01: sửa Sentry idempotency.
8. M2-02 và M2-03: đóng các lỗi release P0.

Sau các bước này mới bắt đầu mở rộng Release Control Center và bulk automation.
