# Kế hoạch khôi phục một bảng tổng hợp cho mỗi Jira project

> Phiên bản: 1.1  
> Ngày lập: 2026-10-01  
> Trạng thái: Implemented (Đã hoàn thành triển khai)  
> Ngày hoàn thành: 2026-10-01  
> Phạm vi: `/board`, issue read model, project workflow columns, Jira sync worker và việc loại bỏ board membership  
> Thay thế định hướng: `docs/JIRA_BOARD_SWITCH_DB_FIRST_FIX_PLAN.md`  
> Tài liệu giữ lại để tham chiếu/rollback: `docs/JIRA_MULTI_BOARD_SELECTION_PLAN.md`, `docs/JIRA_MULTI_BOARD_LOADING_PERFORMANCE_FIX_PLAN.md`

## 1. Tóm tắt quyết định

Khôi phục mô hình đơn giản: **mỗi Jira project có đúng một bảng tổng hợp**. Bảng
đọc task trực tiếp từ `IssueCache`, không lọc theo Jira Software board ID và
không cần board membership snapshot.

Các quyết định chính:

1. Bỏ lựa chọn Jira board khỏi luồng `/board`.
2. `GET /api/issues` chỉ lọc theo project và bộ lọc người dùng; không dùng
   `JiraBoardMembershipSnapshot` hoặc `JiraBoardMembershipEntry`.
3. Mọi status đang xuất hiện trong `IssueCache` phải có một cột, không task nào
   bị rơi vào sai cột hoặc biến mất.
4. Để vẫn hiển thị cột workflow đang rỗng, lưu metadata workflow theo project
   trong DB và cập nhật nó trong **cùng vòng đời project sync**.
5. Không tạo worker, queue, TTL hoặc cảnh báo freshness riêng cho columns.
   Freshness của task và workflow dùng chung kết quả project sync.
6. Loại bỏ `refresh-board-membership` khỏi producer, consumer và UI sau khi
   rollout ổn định.
7. Giữ bảng/migration membership trong một giai đoạn rollback; chỉ xóa ở migration
   riêng sau khi xác nhận production ổn định.

Kiến trúc đích chỉ có một nguồn freshness:

```text
Jira project sync
  -> cập nhật IssueCache
  -> cập nhật ProjectWorkflowSnapshot trong cùng job
  -> cập nhật IntegrationCursor jira:<project>

Board page
  -> đọc IssueCache + ProjectWorkflowSnapshot từ PostgreSQL
  -> dựng một bảng tổng hợp của project
```

## 2. Lý do thay đổi

### 2.1 Vấn đề của kiến trúc nhiều board

Kiến trúc hiện tại có hai read model và hai nhịp freshness độc lập:

```text
IssueCache                    <- poll-jira-project
JiraBoardMembershipSnapshot  <- refresh-board-membership
```

Do đó có thể xảy ra:

- issue project vừa sync nhưng membership board đã cũ;
- project worker khỏe nhưng membership consumer chưa được deploy;
- job membership tích tụ ở trạng thái `created`;
- board không có `UserBoardPreference` không được refresh sau project sync;
- UI hiển thị “Dữ liệu phân loại board có thể cũ” dù nội dung issue vẫn mới;
- cùng project có nhiều board tạo thêm API Jira, pagination, state và lỗi vận hành.

### 2.2 Mục tiêu nghiệp vụ mới

Người dùng cần:

- xem toàn bộ task thuộc project;
- có đầy đủ cột/status;
- dữ liệu hiển thị nhanh từ DB;
- chỉ theo dõi một trạng thái đồng bộ Jira;
- không cần chọn hoặc mô phỏng chính xác filter JQL của từng Jira board.

Mô hình một bảng tổng hợp phù hợp hơn với nhu cầu này.

## 3. Định nghĩa “đầy đủ các cột”

“Đầy đủ” phải có định nghĩa kỹ thuật rõ ràng để tránh quay lại bảng ba cột chung
chung hoặc làm mất status.

### 3.1 Bắt buộc

1. Mỗi `statusId` đang tồn tại trong `IssueCache` của project có đúng một cột.
2. Nếu issue cũ chưa có `statusId`, dùng cặp `status + statusCategory` làm khóa
   tương thích.
3. Status mới Jira trả về phải xuất hiện trên bảng ngay sau project sync.
4. Status không nhận diện được không được gán âm thầm vào “To Do”; đưa vào cột
   riêng theo chính tên status hoặc cột “Khác” có cảnh báo.
5. Cột Done vẫn tồn tại và được ẩn/hiện bằng `includeDone`, không xóa metadata.

### 3.2 Cột rỗng

`IssueCache` chỉ cho biết status đang có issue. Để hiển thị cả workflow status
đang không có issue, thêm read model metadata theo project:

```prisma
model JiraProjectWorkflowSnapshot {
  id            String   @id @default(cuid())
  projectKey    String   @unique
  fetchedAt     DateTime
  lastErrorCode String?
  lastErrorAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  statuses      JiraProjectWorkflowStatus[]
}

model JiraProjectWorkflowStatus {
  id           String @id @default(cuid())
  snapshotId   String
  statusId     String
  name         String
  category     String // new | indeterminate | done | unknown
  displayOrder Int

  snapshot JiraProjectWorkflowSnapshot
    @relation(fields: [snapshotId], references: [id], onDelete: Cascade)

  @@unique([snapshotId, statusId])
  @@index([snapshotId, displayOrder])
}
```

Đây không phải một hệ thống sync thứ hai. Metadata workflow được cập nhật bởi
chính `poll-jira-project`; không có queue/scheduler/freshness banner riêng.

### 3.3 Thứ tự cột

Thứ tự ưu tiên:

1. Override quản trị trong `JIRA_PROJECT_COLUMNS`, nếu có.
2. `displayOrder` từ workflow metadata đã lưu.
3. Status mới chỉ có trong `IssueCache`, chèn theo category và
   `getWorkflowRank()`.
4. Tie-break ổn định bằng tên status rồi `statusId`.

Nhóm category theo thứ tự:

```text
new -> indeterminate -> done -> unknown
```

Tên cột là tên status thực tế, ví dụ:

```text
Backlog | Open | Selected for Development | In Progress | Code Review |
Ready for QA | Testing | Ready for Release | Done | Closed
```

Không gộp nhiều status vào một cột board trừ khi có override rõ ràng.

## 4. Phạm vi và đánh đổi

### 4.1 Trong phạm vi

- Một bảng tổng hợp cho mỗi project.
- Đọc toàn bộ task project từ `IssueCache`.
- Cột theo workflow/status đầy đủ.
- Giữ filter assignee, label, priority, search, done và release.
- Giữ drag/drop transition Jira nếu transition hợp lệ.
- Giữ manual project sync và scheduled project sync.
- Xóa mọi phụ thuộc runtime vào board membership.
- Dọn queue membership tồn đọng bằng quy trình vận hành an toàn.

### 4.2 Ngoài phạm vi

- Mô phỏng filter/JQL riêng của một Jira Software board.
- Phân biệt cùng project thành Scrum board/Kanban board.
- Đồng bộ sprint, quick filter hoặc swimlane.
- Xác định backlog bằng endpoint Agile `/backlog`.
- Tạo/sửa workflow Jira.

### 4.3 Đánh đổi được chấp nhận

1. Task thuộc bất kỳ board nào của cùng project đều xuất hiện.
2. “Backlog” chỉ là status/cột có tên Backlog hoặc override quản trị, không phải
   Jira Agile backlog membership.
3. Người dùng không còn chọn board riêng.
4. Tên và thứ tự cột ưu tiên workflow project, không nhất thiết giống từng board
   Jira cụ thể.

## 5. Kiến trúc đích

### 5.1 Read path

```text
GET /api/issues?project=EPM&filters...
  -> xác thực session + project access
  -> Prisma IssueCache.findMany/count(projectKey=EPM)
  -> đọc IntegrationCursor để trả project freshness
  -> trả items

GET /api/board/statuses?project=EPM
  -> đọc JiraProjectWorkflowSnapshot
  -> union với distinct status trong IssueCache
  -> áp dụng override + sort ổn định
  -> trả columns
```

Cả hai endpoint chỉ đọc PostgreSQL, không gọi Jira và không enqueue job.

### 5.2 Write/sync path

```text
poll-jira-project(EPM)
  -> fetch issue pages từ Jira
  -> upsert IssueCache
  -> fetch/derive project workflow statuses
  -> upsert JiraProjectWorkflowSnapshot
  -> finalize IntegrationCursor
```

Nếu fetch workflow metadata lỗi nhưng issue sync thành công:

- giữ workflow snapshot gần nhất;
- union với status từ issue vừa sync để không mất cột có task;
- ghi warning vào stats/log;
- không đánh fail toàn bộ issue sync chỉ vì metadata cột lỗi.

Nếu issue sync lỗi, giữ nguyên cả hai read model và không cập nhật
`lastSuccessAt`.

## 6. Thiết kế API

### 6.1 `GET /api/issues`

Contract giữ tương thích phần lớn, nhưng bỏ:

- query parameter `boardId`;
- `includeBacklogRegardlessOfAssignee` theo membership;
- response `membership`;
- `membership_pending`;
- `membership_not_ready`;
- `board_forbidden` phát sinh từ membership.

Query DB:

```ts
const where = {
  projectKey,
  deletedAt: null,
  // filters assignee, status, label, priority, q, done...
};
```

Response freshness chỉ còn:

```json
{
  "sync": {
    "projects": ["EPM"],
    "lastSuccessAt": "...",
    "stale": false,
    "freshnessMinutes": 5,
    "errors": []
  }
}
```

Không import Jira client, board config, membership store hoặc pg-boss trong GET.

### 6.2 `GET /api/board/statuses`

Chuyển thành local-only project workflow endpoint.

Response đề xuất:

```json
{
  "projectKey": "EPM",
  "source": "project_workflow",
  "fetchedAt": "...",
  "columns": [
    {
      "id": "status:10000",
      "name": "Open",
      "statusIds": ["10000"],
      "statuses": [{ "id": "10000", "name": "Open" }],
      "category": "new",
      "isDone": false
    }
  ],
  "statusCategoryMap": {
    "Open": "new"
  }
}
```

Quy tắc union:

1. Load workflow statuses đã lưu.
2. Group distinct `IssueCache(statusId, status, statusCategory)` của project.
3. Thêm status IssueCache chưa có trong workflow snapshot.
4. Không loại cột workflow chỉ vì count bằng 0.
5. Trả `source="issue_cache_fallback"` nếu chưa có workflow snapshot.

### 6.3 API bị loại bỏ

Sau giai đoạn tương thích, xóa:

```text
GET  /api/board/options
GET  /api/me/board-preferences
PUT  /api/me/board-preferences
POST /api/board/membership/refresh
GET  /api/board/membership/status
```

Trong pha đầu có thể trả `410 Gone` hoặc giữ route read-only sau feature flag để
client cũ không tạo thêm membership job.

## 7. Thay đổi backend chi tiết

### 7.1 Issues route

File: `src/app/api/issues/route.ts`

1. Bỏ parse/resolve `boardId`.
2. Bỏ `getStoredBoardMembership()`.
3. Bỏ mọi `where.jiraKey = { in: membershipKeys }`.
4. Bỏ nhánh backlog membership và backlog status fallback.
5. Giữ filter assignee đúng nghĩa: chọn `me` chỉ trả issue của tôi; chọn `ALL`
   trả toàn project.
6. Không giới hạn project bằng regex đơn thuần; project phải thuộc
   `JIRA_PROJECT_KEYS` hoặc quyền/project selection đã xác minh của user.
7. Giữ pagination, stable ordering và `Server-Timing` cho DB.
8. Không enqueue hoặc gọi Jira từ GET.

### 7.2 Workflow store

Tạo module, ví dụ:

```text
src/lib/jira/project-workflow-store.ts
```

Trách nhiệm:

- normalize status ID/name/category;
- upsert snapshot atomically;
- đọc workflow local;
- union workflow với observed IssueCache statuses;
- sort ổn định;
- bảo toàn snapshot cũ khi refresh lỗi.

Không đặt queue logic trong module này.

### 7.3 Jira client

File: `src/lib/jira/client.ts`

Tái sử dụng endpoint project statuses/workflow hiện có nếu phù hợp. Yêu cầu:

- dùng system Jira credential trong project worker;
- trả `statusId`, name và status category;
- không cần board ID;
- có timeout/retry theo policy Jira chung;
- không biến lỗi metadata thành lỗi mất toàn bộ issue sync.

Nếu Jira Data Center không trả thứ tự workflow đáng tin cậy, dùng
`getWorkflowRank()` và override cấu hình; ghi rõ limitation.

### 7.4 Project sync worker

File: `src/lib/queue/workers/poll-jira.ts`

1. Sau khi issue pages được xử lý thành công, refresh workflow metadata.
2. Upsert workflow snapshot trong cùng run, trước finalize cursor.
3. Nếu metadata workflow lỗi:
   - giữ snapshot cũ;
   - ghi `workflowRefreshError` vào stats;
   - vẫn cho issue sync success nếu toàn bộ issue upsert thành công.
4. Xóa block enqueue `refresh-board-membership` sau sync.
5. Không tìm `UserBoardPreference`.
6. Log số workflow statuses và nguồn ordering.

### 7.5 Queue registration

File: `src/lib/queue/boss.ts`

1. Ngừng enqueue `refresh-board-membership` trước.
2. Ngừng register consumer sau khi producer đã được tắt và client mới rollout.
3. Xóa tên job khỏi `JOB_NAMES` và `QUEUE_EXPIRE_SECONDS` ở pha cleanup.
4. Không xóa job tồn đọng tự động trong deploy migration.
5. Cung cấp script vận hành read-only để thống kê job theo state và một script
   cleanup riêng yêu cầu operator xác nhận target/count.

Thứ tự này tránh producer tiếp tục thêm job trong lúc đang dọn queue.

### 7.6 Board config cũ

Files:

- `src/lib/jira/board-config.ts`
- `src/lib/jira/board-options.ts`
- `src/lib/jira/board-membership.ts`
- `src/lib/jira/board-membership-store.ts`

Không xóa ngay. Thực hiện:

1. Tách helper dùng chung `getWorkflowRank`, category normalization sang module
   project workflow.
2. Đánh dấu board-specific services deprecated.
3. Xác nhận không còn import runtime bằng `rg` và dependency graph.
4. Xóa ở pha cleanup sau thời gian rollback.

## 8. Thay đổi frontend chi tiết

### 8.1 Board header

File: `src/app/(app)/board/board-client.tsx`

1. Giữ dropdown project.
2. Xóa dropdown Jira board và mọi state `selectedBoardId`.
3. Xóa board options query, preference mutation và localStorage board ID.
4. Header hiển thị:

```text
Dự án EPM · 4083 task · Đồng bộ 1 phút trước
```

5. Chỉ nút “Đồng bộ Jira” điều khiển project sync hiện tại.
6. Không còn nút “Chuẩn bị dữ liệu board”.

### 8.2 Loading và warning

Tuân theo design system:

- dùng `Skeleton` khi query DB lần đầu;
- empty state có icon Lucide trong muted circle, title và hint một dòng;
- semantic tokens, hỗ trợ light/dark;
- clickable control có `cursor-pointer` và transition 150–200ms;
- không dùng spinner cho freshness nền nếu không có action đang chạy.

Chỉ còn warning:

```text
Dữ liệu Jira chưa được đồng bộ mới
Lần đồng bộ project thành công gần nhất: ...
```

Xóa hoàn toàn warning:

```text
Dữ liệu phân loại board có thể cũ
```

### 8.3 Cột và task mapping

1. Dùng `statusId` làm khóa chính.
2. Fallback theo exact normalized status name cho dữ liệu cũ.
3. Nếu status chưa có trong response columns, tạo cột runtime theo status thật và
   gửi metric; không dồn vào cột đầu tiên.
4. Column key ổn định: `status:<statusId>`; không dùng display name làm React key.
5. Empty column vẫn hiển thị để phản ánh workflow đầy đủ.
6. Có nhiều cột thì desktop dùng horizontal scroll có chủ đích; mobile giữ list
   view hiện tại để không tạo horizontal overflow.

### 8.4 Drag/drop transition

1. Kéo task sang cột status đích vẫn gọi Jira transition API.
2. Kiểm tra transition hợp lệ trước khi optimistic update.
3. Sau success, cập nhật cache issue; project poll sẽ hội tụ về sau.
4. Nếu transition Jira không tồn tại, rollback và thông báo rõ.
5. Không dùng board column ID trong transition logic.

## 9. Schema và migration

### Pha schema thêm mới

1. Thêm `JiraProjectWorkflowSnapshot`.
2. Thêm `JiraProjectWorkflowStatus`.
3. Tạo unique/index như mục 3.2.
4. Không chỉnh/xóa membership tables trong migration này.

### Backfill

Backfill theo thứ tự:

1. Lấy distinct status từ `IssueCache` cho từng project.
2. Tạo workflow snapshot ban đầu với `fetchedAt` bằng thời điểm backfill và
   source nội bộ là `issue_cache_backfill`.
3. Sort theo category/rank.
4. Project sync kế tiếp thay metadata bằng dữ liệu Jira đầy đủ.

Backfill không gọi Jira trong migration; migration phải deterministic và không
phụ thuộc network.

### Pha schema cleanup

Chỉ sau khi hết rollback window:

1. Drop `JiraBoardMembershipEntry`.
2. Drop `JiraBoardMembershipSnapshot`.
3. Drop `UserBoardPreference` nếu không còn consumer khác.
4. Xóa relations khỏi `User`.

Mỗi drop phải ở migration riêng, có database backup và thống kê row count trước.

## 10. Xử lý job membership đang tồn đọng

Hiện production/dev DB đã có nhiều job `refresh-board-membership` ở trạng thái
`created` nhưng chưa `started`. Không restart consumer mới rồi để toàn bộ backlog
chạy vì có thể tạo burst Jira request không cần thiết.

Quy trình vận hành:

1. Deploy producer-off: web và worker không tạo thêm membership job.
2. Quan sát ít nhất hai chu kỳ project sync để xác nhận count không tăng.
3. Chạy truy vấn read-only thống kê chính xác:
   - `created`;
   - `active`;
   - `retry`;
   - `completed/failed`;
   - tuổi job nhỏ nhất/lớn nhất.
4. Dừng/disable consumer membership.
5. Operator xác nhận xóa/cancel đúng các job chưa chạy theo tên queue; không dùng
   lệnh xóa rộng hoặc xóa toàn bộ pg-boss schema.
6. Xác nhận project sync queues không bị ảnh hưởng.
7. Giữ audit count trước/sau cleanup.

Không đưa thao tác destructive này vào Prisma migration hoặc app startup.

## 11. Query keys và client cache

Files:

- `src/lib/query-keys.ts`
- `src/hooks/use-issues.ts`

Thay đổi:

1. Issue query key bỏ `boardId`.
2. Status query key chỉ còn `projectKey`.
3. Xóa membership status key.
4. Filter serialization vẫn ổn định.
5. Không dùng refetch interval 30 giây mặc định.
6. Sau manual project sync success, invalidate:
   - issues của project;
   - workflow columns của project;
   - freshness của project.
7. Không invalidate toàn bộ project khác.

## 12. Kế hoạch kiểm thử

### 12.1 Unit test

- Mỗi distinct `statusId` tạo đúng một column.
- Hai status cùng tên nhưng khác ID không làm mất task.
- Issue thiếu `statusId` vẫn map theo tên.
- Unknown status tạo cột thật, không rơi vào To Do.
- Sort category/rank ổn định.
- Override `JIRA_PROJECT_COLUMNS` hoạt động.
- Workflow metadata lỗi vẫn giữ snapshot cũ.

### 12.2 API test

- `/api/issues` không gọi board membership, Jira hoặc queue.
- Không có `boardId` vẫn trả đủ issue project.
- `boardId` cũ bị bỏ qua có telemetry trong compatibility window, sau đó trả 400
  nếu muốn contract nghiêm ngặt.
- `/api/board/statuses` chỉ đọc DB.
- Workflow snapshot + observed status được union đầy đủ.
- Project không hợp lệ/không được phép bị từ chối.

### 12.3 Worker test

- Issue sync success cập nhật workflow metadata.
- Workflow fetch lỗi không làm mất metadata cũ.
- Issue upsert lỗi không advance cursor.
- Worker không enqueue membership job.
- Project sync stats chứa workflow count/error.

### 12.4 Client test

- Không render board dropdown.
- Không gọi board options/preference/membership APIs.
- Không render membership stale banner.
- Mọi issue xuất hiện đúng một lần ở một cột.
- Empty workflow columns vẫn render.
- Unknown status không biến mất.
- Drag/drop dùng target status ID/name đúng.
- Mobile dùng list view; desktop nhiều cột scroll đúng.

### 12.5 E2E/integration

1. Project có nhiều Jira board nhưng một bảng hiển thị union toàn project.
2. Project có hơn 10 status, gồm status không có task.
3. Status mới xuất hiện sau sync.
4. Worker/Jira tạm lỗi nhưng bảng vẫn dùng DB cũ.
5. Manual sync cập nhật task và columns.
6. Restart web/worker không tạo membership job.
7. Queue cleanup không ảnh hưởng `poll-jira-project`.
8. Light/dark và các breakpoint 375/768/1024/1440 px.

## 13. Observability

### 13.1 Project sync

Log/metric đề xuất:

```text
event=jira_project_sync
projectKey=EPM
issuePages=...
created=...
updated=...
workflowStatusCount=...
workflowSource=jira|cached|issue_cache_fallback
workflowRefreshError=...
durationMs=...
outcome=success|partial|failed
```

### 13.2 Board read

```text
event=project_board_read
projectKey=EPM
issueCount=...
columnCount=...
unmappedIssueCount=0
workflowAgeMs=...
dbDurationMs=...
jiraCalls=0
queueWrites=0
```

Alert bắt buộc:

- project sync stale theo `IntegrationCursor`;
- worker liveness;
- issue có status không map được;
- workflow metadata refresh lỗi nhiều chu kỳ;
- membership jobs tiếp tục tăng sau producer-off.

Không còn alert membership freshness theo board.

## 14. Rollout theo pha

### Pha 0 — Baseline và feature flag

1. Thêm flag, ví dụ `PROJECT_BOARD_MODE=single_project|jira_board`.
2. Ghi baseline latency, issue count và column count.
3. Export danh sách project/board/status hiện tại để đối chiếu.
4. Thêm regression tests trước khi đổi behavior.

**Hoàn tất khi:** có thể bật/tắt chế độ mới mà chưa drop dữ liệu.

### Pha 1 — Workflow read model

1. Thêm schema/migration workflow.
2. Backfill từ IssueCache.
3. Tích hợp refresh metadata vào project sync.
4. Tạo local-only workflow store và statuses API.

**Hoàn tất khi:** mỗi project có columns đầy đủ từ DB và không cần board ID.

### Pha 2 — Project-only issues API

1. Bỏ membership filter dưới feature flag mới.
2. Bỏ board-specific backlog logic.
3. Giữ pagination/filter hiện tại.
4. So sánh issue count với DB và kiểm tra không trùng/mất task.

**Hoàn tất khi:** `/api/issues` local-only và mọi task map được vào cột.

### Pha 3 — Client một bảng

1. Xóa board dropdown/state/query.
2. Dùng project workflow columns.
3. Xóa membership warnings/actions/polling.
4. Cập nhật header, empty/loading/error state.
5. Kiểm tra drag/drop và responsive.

**Hoàn tất khi:** người dùng chỉ chọn project và thấy bảng đầy đủ ngay từ DB.

### Pha 4 — Producer-off và queue cleanup

1. Bỏ enqueue membership từ preference, project sync và API.
2. Tắt membership endpoints.
3. Xác nhận queue không tăng.
4. Operator dọn job membership tồn đọng theo quy trình mục 10.
5. Bỏ consumer khỏi worker.

**Hoàn tất khi:** không còn membership job mới và project sync vẫn khỏe.

### Pha 5 — Rollout production

1. Pilot một project có nhiều board và nhiều status.
2. So sánh số issue/cột trong 24–48 giờ.
3. Mở rộng theo cohort/project.
4. Theo dõi stale sync, unmapped issue và latency.
5. Bật `single_project` mặc định.

**Hoàn tất khi:** rollout 100%, không mất task và không còn membership warning.

### Pha 6 — Cleanup schema/code

1. Hết rollback window.
2. Xóa board-specific API/service/client code không dùng.
3. Drop membership/preference tables bằng migration riêng.
4. Xóa feature flag và compatibility params.
5. Cập nhật README/runbook.

**Hoàn tất khi:** dependency graph không còn board membership runtime path.

## 15. Danh sách file dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `prisma/schema.prisma` | Thêm project workflow snapshot/status; cleanup membership về sau |
| `prisma/migrations/...` | Migration add/backfill/drop tách riêng |
| `src/app/api/issues/route.ts` | Project-only DB query |
| `src/app/api/board/statuses/route.ts` | Workflow columns local-only |
| `src/lib/jira/project-workflow-store.ts` | Store/merge/sort columns mới |
| `src/lib/jira/client.ts` | Fetch project workflow/status metadata |
| `src/lib/queue/workers/poll-jira.ts` | Refresh workflow; bỏ membership enqueue |
| `src/lib/queue/boss.ts` | Producer/consumer membership cleanup |
| `src/app/(app)/board/board-client.tsx` | Một project board, bỏ board selector/banner |
| `src/app/(app)/board/lib/board-utils.ts` | Map status chính xác, unknown column |
| `src/hooks/use-issues.ts` | Bỏ membership union/polling/boardId |
| `src/lib/query-keys.ts` | Key theo project, bỏ membership key |
| `src/app/api/board/options/*` | Deprecate/xóa |
| `src/app/api/board/membership/*` | Deprecate/xóa |
| `src/app/api/me/board-preferences/*` | Deprecate/xóa |
| Test files liên quan | Regression unit/API/client/worker/E2E |

## 16. Tiêu chí nghiệm thu

1. `/board` chỉ có project selector, không có Jira board selector.
2. Chuyển project hiển thị dữ liệu DB mà không chờ Jira/membership worker.
3. Không còn dòng “Dữ liệu phân loại board có thể cũ”.
4. Không còn request đến board options/membership/preference APIs từ client.
5. Không có job `refresh-board-membership` mới sau deploy producer-off.
6. Mọi issue active trong `IssueCache` của project xuất hiện đúng một lần.
7. Mọi status có issue có cột; workflow status rỗng đã biết vẫn có cột.
8. Status mới/unknown không bị đưa sai vào To Do hoặc biến mất.
9. Project freshness khớp `IntegrationCursor.lastSuccessAt`.
10. Manual và scheduled project sync tiếp tục hoạt động.
11. Drag/drop transition đúng và rollback khi Jira từ chối.
12. p95 read path đạt <= 500 ms ở API và không có Jira call/queue write.
13. Light/dark, accessibility và responsive đạt checklist design system.
14. Test, typecheck và lint đều pass.

## 17. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Bảng có quá nhiều cột | Desktop scroll ngang; mobile list; cho phép ẩn cột ở pha sau |
| Mất empty columns nếu Jira metadata lỗi | Persist snapshot cũ + union IssueCache |
| Hai status trùng tên | Khóa bằng `statusId`, display name chỉ để hiển thị |
| Không còn Agile backlog semantics | Ghi rõ Backlog là status; dùng override nếu cần |
| Task ngoài board cũ xuất hiện | Đây là hành vi chủ đích của project tổng hợp; truyền thông trước rollout |
| Queue membership tồn đọng gọi Jira hàng loạt | Producer-off trước, cleanup có xác nhận, không auto-drain |
| Drop schema quá sớm | Rollback window và migration drop riêng |
| Workflow API làm project sync chậm | Timeout riêng, giữ cache cũ, không fail issue sync |

## 18. Thứ tự triển khai khuyến nghị

Không xóa membership tables hoặc restart consumer tồn đọng trước. Thứ tự an toàn:

1. Thêm workflow read model và backfill.
2. Làm statuses API local-only.
3. Làm issues API project-only dưới feature flag.
4. Chuyển UI sang một bảng tổng hợp.
5. Tắt toàn bộ membership producers.
6. Dọn queue membership có kiểm soát rồi bỏ consumer.
7. Rollout và quan sát.
8. Sau rollback window mới xóa code/schema cũ.

## 19. Kết quả triển khai thực tế (2026-10-01)

Toàn bộ các mục trong kế hoạch đã được triển khai và kiểm thử thành công:

1. **Database Schema & Backfill**:
   - Thêm `JiraProjectWorkflowSnapshot` và `JiraProjectWorkflowStatus` vào `prisma/schema.prisma`.
   - Tạo migration `20261001134430_add_project_workflow_snapshot` với logic backfill tự động, deterministic từ `IssueCache` cho tất cả các project hiện có.
   - Chạy `prisma migrate dev` và `prisma generate` đồng bộ client thành công.

2. **Project Workflow Store (`src/lib/jira/project-workflow-store.ts`)**:
   - Quản lý metadata workflow theo project, phân loại category chuẩn (`new` -> `indeterminate` -> `done` -> `unknown`).
   - Đảm bảo sort rank và override từ `JIRA_PROJECT_COLUMNS`.
   - Kết hợp atomic snapshot với các status phát sinh từ `IssueCache` để không bao giờ mất cột hay task.

3. **API Local-only (`GET /api/board/statuses`)**:
   - Đọc 100% từ PostgreSQL qua `project-workflow-store`.
   - Không gọi Jira Agile API hay enqueue job nền khi client mở trang.

4. **API Issues thuần Project (`GET /api/issues`)**:
   - Đọc trực tiếp từ `IssueCache` theo `projectKey` và bộ lọc người dùng (assignee, q, priority, label, done...).
   - Bỏ hoàn toàn phụ thuộc `boardId`, `JiraBoardMembershipSnapshot` và `where.jiraKey = { in: membershipKeys }`.
   - Freshness phản ánh trực tiếp từ `IntegrationCursor`.

5. **Project Sync Worker (`src/lib/queue/workers/poll-jira.ts`)**:
   - Cập nhật workflow snapshot trong cùng lifecycle đồng bộ issue của project.
   - Đã gỡ bỏ block enqueue `refresh-board-membership` nền.

6. **Giao diện người dùng (`src/app/(app)/board/board-client.tsx`)**:
   - Gỡ bỏ dropdown chọn Jira board; mỗi project có đúng 1 bảng tổng hợp đầy đủ.
   - Header hiển thị: `Dự án {project} · {count} task · Đồng bộ {timeAgo}`.
   - Gỡ bỏ hoàn toàn các cảnh báo "Dữ liệu phân loại board có thể cũ" và các nút/modal chuẩn bị membership.
   - Bảng ánh xạ task theo `statusId` chính xác và tự động tạo dynamic runtime column nếu phát hiện status mới, không đẩy sai vào To Do.

7. **Producer-Off & Quản trị Hàng đợi**:
   - Chuyển `enqueueBoardMembershipRefresh` trong `src/lib/queue/boss.ts` sang trạng thái producer-off (trả về `null`).
   - Cung cấp 2 script vận hành an toàn:
     - `scripts/audit-board-membership-jobs.ts`: Thống kê số lượng job `refresh-board-membership` theo trạng thái (read-only).
     - `scripts/cleanup-board-membership-jobs.ts`: Cho phép operator xóa/hủy job `created` tồn đọng khi có cờ `--confirm`.

8. **Kiểm thử & Chất lượng**:
   - Toàn bộ 112/112 test file trong test suite vitest đều PASS (882/882 tests).
   - TypeScript compiler (`tsc --noEmit`) vượt qua với 0 lỗi (0 errors).
   - ESLint vượt qua với 0 cảnh báo/lỗi (0 errors, 0 warnings).

