# Kế Hoạch Thực Thi

## Tổng quan dependency

```text
Phase 0: Baseline xanh
    |
Phase 1: Contracts + boundaries
    |
    +--> Phase 2: Jira + Issues
    |        |
    |        +--> Phase 3: Queue + Sync
    |        |        |
    |        |        +--> Phase 4: Bulk
    |        |
    |        +--> Phase 5: Bitbucket + Releases
    |
    +--> Phase 6: Reports + Stale + Leaderboard
    |
    +--> Phase 7: Notify + Chat + AI + Sentry
             |
Phase 8: API + Frontend consolidation
    |
Phase 9: Full verification + docs
```

Không chạy song song hai batch cùng sửa facade hoặc public contract giống nhau.

## Phase 0 - Khôi Phục Baseline

**Mục tiêu:** mọi quality gate cơ bản xanh trước khi refactor.

### Batch 0.1 - Jira sync test doubles

- Scope: `jira-sync-race.test.ts`, `jira-sync-integration.test.ts`.
- Việc làm:
  - Bổ sung mock `issueCache.findMany` đúng semantics `{ jiraKey: { in } }`.
  - Không thay đổi production code chỉ để chiều mock.
  - Xác nhận hai test mất lease vẫn ném `SyncLeaseLostError`.
- Kết quả bắt buộc: 4 failure hiện tại về xanh.

### Batch 0.2 - Mock contract hygiene

- Bổ sung `getProjectStatuses` cho Jira mocks cần dùng.
- Mock các Prisma model mới ở route/health tests.
- Phân biệt log được chủ ý test với log do mock thiếu.
- Kết quả bắt buộc: test output không còn error log ngoài expectation.

### Batch 0.3 - Lint zero-warning

- Xóa import `vi` không dùng.
- Xóa hai import `jiraCredentialsRequired` không dùng.
- Cấu hình CI fail khi có warning: `eslint --max-warnings=0` sau khi baseline sạch.

### Exit criteria

- [ ] Typecheck pass.
- [ ] Lint 0 error, 0 warning.
- [ ] Toàn bộ test pass.
- [ ] Build pass.
- [ ] Ghi số test và thời gian chạy vào tracker.

## Phase 1 - Contracts Và Dependency Direction

### Batch 1.1 - API contract inventory

- Lập bảng route, request DTO, response DTO, status code và consumer.
- Ưu tiên sync, bulk create, issue detail, release và notification.
- Không sửa implementation.

### Batch 1.2 - Shared contracts

- Tạo `src/lib/contracts/` theo domain, không tạo một file `types.ts` toàn cục.
- Di chuyển `ActiveJiraSyncResponse` khỏi sync route.
- Di chuyển bulk template response type khỏi templates route.
- Giữ re-export tạm thời nếu test/import hiện tại cần.

### Batch 1.3 - Shared helper direction

- Di chuyển avatar initials/class helper khỏi Board feature.
- Kiểm tra toàn bộ import `@/app/api` và `@/app/(app)` từ shared/lib.
- Thêm quy tắc review; chỉ thêm lint boundary rule nếu cấu hình đơn giản và ổn định.

### Exit criteria

- [ ] Production code không import type từ API route.
- [ ] Shared component không import feature UI.
- [ ] Không cycle mới.
- [ ] Contract tests giữ nguyên JSON/status.

## Phase 2 - Jira Và Issues

### Batch 2.1 - Jira transport characterization

- Test request headers, auth modes, timeout, retry, `Retry-After`, abort và error parsing.
- Khóa behavior trước khi di chuyển method.

### Batch 2.2 - Jira resource extraction

- Tách lần lượt: permissions, projects, versions, boards, issues, worklogs.
- Mỗi commit chỉ tách một resource.
- `jiraWith()` vẫn trả cùng public surface trong suốt quá trình.

### Batch 2.3 - Board cache policy

- Tách cache/inflight/SWR policy khỏi Jira fetch.
- Viết test cho stale window, concurrent request, failed refresh và cache clear.
- Bug promise `void`/data phải là commit sửa lỗi riêng.

### Batch 2.4 - Issue mapping

- Tách mapping Jira issue/comment/link thành pure functions.
- Unit test null/missing custom fields, people fields, dates và epic key.

### Batch 2.5 - Issue persistence

- Tách repository/transaction service.
- Giữ conditional update và notification-after-commit.
- Test stale update, unique comment và rollback.

### Exit criteria

- [ ] `jira/client.ts` là facade mỏng.
- [ ] Mapping không gọi Prisma/Jira.
- [ ] Persistence không chứa transport parsing.
- [ ] Queue và route imports vẫn tương thích.

## Phase 3 - Queue Và Sync

### Batch 3.1 - pg-boss lifecycle

- Tách connection singleton và start/stop.
- Test start idempotency và graceful stop.

### Batch 3.2 - Registry và schedules

- Tách job names/types, registration và schedules.
- Snapshot tên job, cron, retry, expire và singleton options.

### Batch 3.3 - Enqueue API

- Tách enqueue functions, giữ return `string | null` semantics.
- Test coalesced, rejected và database failure.

### Batch 3.4 - Jira sync pipeline

- Tách `loadCursor`, `fetchPage`, `persistPage`, `finalizeSync` và runner.
- Truyền dependency qua context nhỏ thay vì mock module rộng.
- Giữ nguyên vị trí lease renewal và abort check.

### Batch 3.5 - Webhook handlers

- Mỗi provider một handler.
- Dispatcher chỉ lookup source và gọi handler.
- Giữ event status/idempotency và safe error logging.

### Batch 3.6 - DB integration suite

- Cấu hình Vitest project hoặc script riêng dùng PostgreSQL test.
- Bao phủ lease takeover, transaction rollback, cursor advance và soft delete.
- Không chạy vào database lấy từ `.env` phát triển.

### Exit criteria

- [x] `boss.ts` không còn chứa mọi responsibility.
- [x] Sync race unit tests và DB integration tests đều pass.
- [x] Worker startup/shutdown có test.

## Phase 4 - Bulk

### Batch 4.1 - Contract và validation

- Tách request DTO, discriminated action union và validation result.
- Không đổi error message/code hiện có.

### Batch 4.2 - Selection và preview

- Tách filter-to-keys resolution.
- Tách classification `will_change/no_change/blocked/unverified`.
- Unit test từng action type và stale data.

### Batch 4.3 - Operation repository

- Tập trung claim, state transition, item result và cancel logic.
- Test invalid transition và concurrent claim.

### Batch 4.4 - Action executors

- Một executor cho field update, transition, comment, worklog và branch.
- Dùng typed execution context.
- Giữ Jira refresh và audit ordering.

### Batch 4.5 - Retry và notification

- Tách retry classifier/policy.
- Tách completion summary và notification.
- Test retryable/non-retryable/partial success.

### Batch 4.6 - Bulk create metadata/validation

- Tách metadata loader/cache, row normalization và custom-field validation.
- Test từng field shape và cache invalidation.

### Batch 4.7 - Bulk create execution

- Tách marker reconciliation, parent resolver, create executor và child unlock/block.
- Giữ idempotency qua retry/restart.

### Batch 4.8 - Bulk UI controller

- Tách selection, configure, preview và operation hooks.
- Không di chuyển state vào dialog/tab dễ unmount.

### Exit criteria

- [ ] Không còn file Bulk production trên khoảng 700 dòng nếu không có lý do.
- [ ] Executors độc lập và có test.
- [ ] Preview/confirm/retry contract không đổi.
- [ ] Browser QA Bulk hoàn tất.

## Phase 5 - Bitbucket Và Releases

### Batch 5.1 - Bitbucket transport/resources

- Characterize pagination/error/auth fallback.
- Tách repositories, branches và pull requests.

### Batch 5.2 - Link reconciliation

- Tách discovery khỏi persistence.
- Khóa priority của explicit/inferred/primary link bằng test.

### Batch 5.3 - Branch notification policy

- Gom recipient resolver và message model.
- Giữ provider delivery ngoài policy.

### Batch 5.4 - Release context/evaluator

- Tách context loader, pure evaluator và summary builder.
- Mỗi gate tiếp tục độc lập.

### Batch 5.5 - Release persistence/mutation

- Tách result repository và Jira version mutation.
- Test authorization, unknown fail-safe, approvals và overrides.

### Exit criteria

- [ ] Bitbucket transport không chứa link/release rule.
- [ ] Gate evaluation chạy được bằng input thuần.
- [ ] Branches và Release browser QA hoàn tất.

## Phase 6 - Reports, Stale Và Leaderboard

### Batch 6.1 - Query primitives

- Chuẩn hóa project scope, period và filters.
- Chỉ gom các query thật sự cùng semantics.

### Batch 6.2 - Metrics separation

- Prisma loader trả domain input; calculator nhận dữ liệu thuần.
- Test timezone và empty data.

### Batch 6.3 - Stale route decomposition

- Tách parse, query, insight calculation và response mapping.

### Batch 6.4 - Leaderboard contracts

- Chia filter, member row, summary và detail DTO.

### Exit criteria

- [ ] Metric modules không import Prisma.
- [ ] Route lớn giảm về controller dễ đọc.
- [ ] Reports/Stale/Leaderboard QA hoàn tất.

## Phase 7 - Notify, Chat, AI Và Sentry

### Batch 7.1 - Delivery contract

- Chuẩn hóa push/chat delivery result và error classification.
- Giữ outbox retry/state semantics.

### Batch 7.2 - Chat command handlers

- Tách command lookup/move/assign/watch/release/stale.
- Confirmation và authorization là middleware/use case dùng chung.

### Batch 7.3 - AI provider boundary

- Chuẩn hóa provider result/error.
- Chỉ gom parsing khi OpenAI/Ollama có cùng semantics.

### Batch 7.4 - Sentry review

- Giữ module nhỏ nếu không có duplication thực.
- Chỉ bổ sung contract/error test cần thiết.

### Exit criteria

- [ ] Provider error không rò secret.
- [ ] Chat mutation luôn đi qua permission và confirmation cần thiết.
- [ ] Outbox không mất item khi delivery một kênh thất bại.

## Phase 8 - API Và Frontend Consolidation

### Batch 8.1 - Làm mỏng route lớn

Thứ tự: stale, releases, Jira avatar, issues, credentials, bulk templates, worklogs.

Mỗi route:

1. Chụp contract bằng test.
2. Tách use case/query.
3. Giữ route làm controller.
4. So sánh status, header và JSON trước/sau.

### Batch 8.2 - Board controller

- Tách filters, sync, DnD, keyboard và optimistic update.
- Giữ DOM/ref/data attributes.

### Batch 8.3 - Các frontend controller còn lại

- Bulk create, Issue detail, Branches, Release, Reports và Settings.
- Chỉ tách nơi state ownership và API boundary rõ ràng.

### Exit criteria

- [ ] Không feature client nào có controller không thể test độc lập.
- [ ] API routes không chứa business query dài.
- [ ] Full browser QA pass light/dark và mobile.

## Phase 9 - Đóng Chương Trình

- Chạy full gates và lưu kết quả vào tracker.
- Chạy toàn bộ manual QA.
- Kiểm dependency cycles và dead exports.
- Cập nhật `architecture.md`, `README.md`, `RUNBOOK.md` nếu boundary vận hành đổi.
- Archive hoặc gắn nhãn superseded cho kế hoạch cũ.
- Viết báo cáo trước/sau: dòng/file lớn, warning, test, build, risk còn mở.

## Ước lượng

| Phase | Ước lượng một người | Rủi ro |
|---|---:|---:|
| 0 | 1-2 ngày | Trung bình |
| 1 | 2-3 ngày | Thấp |
| 2 | 4-6 ngày | Cao |
| 3 | 4-5 ngày | Rất cao |
| 4 | 6-8 ngày | Rất cao |
| 5 | 4-6 ngày | Cao |
| 6 | 3-5 ngày | Trung bình |
| 7 | 3-4 ngày | Trung bình |
| 8 | 5-7 ngày | Cao |
| 9 | 2-3 ngày | Thấp |

Tổng dự kiến: 5-7 tuần cho một người, chưa tính thời gian chờ review hoặc môi trường tích hợp.
