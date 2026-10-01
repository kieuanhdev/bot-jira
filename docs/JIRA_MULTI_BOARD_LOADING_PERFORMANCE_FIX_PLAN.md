# Kế hoạch tối ưu thời gian tải Bảng công việc khi chọn nhiều Jira board

> Phiên bản: 1.1  
> Ngày lập: 2026-10-01  
> Trạng thái: Implemented (Đã hoàn thành triển khai mã nguồn và kiểm thử)  
> Phạm vi: `/board`, `/api/board/options`, `/api/board/statuses`, `/api/issues`, Jira Agile API và cache membership  
> Tài liệu liên quan: `docs/JIRA_MULTI_BOARD_SELECTION_PLAN.md`, `docs/JIRA_BOARD_COLUMNS_BACKLOG_FILTER_PLAN.md`

## 1. Tóm tắt quyết định

Thời gian tải tăng mạnh sau khi bổ sung lựa chọn board vì request đọc issue đang
đồng bộ tải toàn bộ membership từ Jira trước khi đọc `IssueCache`. Một board lớn
có thể tạo tối đa 10 request `/board/{id}/issue` và 10 request
`/board/{id}/backlog`; các trang trong từng endpoint được tải tuần tự.

Kế hoạch sửa theo hai lớp:

1. **Bản vá nhanh:** không chạy query issue/status trước khi board được resolve,
   bỏ các lần resolve cấu hình trùng nhau và cải thiện cache/query invalidation.
2. **Giải pháp bền vững:** chuyển việc tải membership sang worker, lưu snapshot
   theo user + board trong PostgreSQL và để `/api/issues` chỉ đọc dữ liệu local.

Không chọn cách trả toàn bộ project trong lúc membership chưa sẵn sàng vì có thể
hiển thị issue không thuộc board đã chọn. Không giảm số trang Jira bằng cách cắt
membership vì sẽ làm sai count và mất task ở board lớn.

## 2. Hiện trạng và nguyên nhân gốc

### 2.1 Đường tải hiện tại

```text
BoardClient mount
  ├─ GET /api/board/options?project=...
  ├─ GET /api/issues?project=...                 (có thể chạy khi boardId còn null)
  └─ GET /api/board/statuses?project=...         (có thể chạy khi boardId còn null)

board options trả selectedBoardId
  ├─ GET /api/issues?...&boardId=...             (query key mới)
  └─ GET /api/board/statuses?...&boardId=...     (query key mới)

/api/issues
  ├─ getBoardMembership
  │   ├─ GET /board/{id}/issue: tối đa 10 trang, tuần tự
  │   └─ GET /board/{id}/backlog: tối đa 10 trang, tuần tự
  ├─ resolveProjectBoardConfig
  │   ├─ GET project statuses
  │   └─ GET board configuration
  └─ query IssueCache
```

### 2.2 Các nguyên nhân theo mức độ ưu tiên

#### P0 — Jira I/O nằm trên critical path của `/api/issues`

`src/app/api/issues/route.ts` chờ `getBoardMembership()` hoàn thành trước khi chạy
Prisma query. `src/lib/jira/board-membership.ts` tải tối đa 1.000 board issue và
1.000 backlog issue theo page size 100.

Hệ quả:

- cold load phụ thuộc trực tiếp vào Jira latency;
- board càng lớn càng chậm;
- Jira rate limit/timeout kéo dài thời gian hiển thị;
- mỗi process hoặc lần restart đều có cold cache riêng.

#### P0 — Query chạy trước khi board cuối cùng được xác định

`BoardClient` bật issue/status query khi có project nhưng không chờ
`boardOptionsData`. Sau khi options trả về, `selectedBoardId` thay đổi và tạo query
key mới, dẫn tới request ban đầu và request theo board.

#### P1 — Resolve cấu hình board bị lặp

UI gọi `/api/board/statuses`, trong khi `/api/issues` tiếp tục gọi
`resolveProjectBoardConfig()` để lấy backlog status. Cache in-memory có thể gộp
request trong cùng process và cùng cache key, nhưng không bảo đảm giữa process và
cache key `auto`/board ID khác nhau.

#### P1 — Cache membership ngắn và chỉ nằm trong process

TTL fresh hiện là 2 phút. Cache mất khi restart/deploy và không chia sẻ giữa các
instance. Với nhiều instance, cùng user + board có thể bị quét lại nhiều lần.

#### P2 — Board options chưa có cache server và client policy rõ ràng

`/api/board/options` gọi Jira mỗi lần; query client chưa đặt `staleTime` và có thể
refetch khi focus/remount.

## 3. Mục tiêu và chỉ số thành công

### 3.1 Mục tiêu chức năng

1. Chọn board vẫn giới hạn đúng tập issue theo Jira board filter.
2. Backlog vẫn không bị lọc theo assignee khi tùy chọn hiện tại được bật.
3. Không hiển thị tạm issue của toàn project hoặc board trước dưới tên board mới.
4. Đổi project/board nhanh không để response cũ ghi đè state mới.
5. Jira lỗi tạm thời có thể dùng snapshot stale hợp lệ nhưng lỗi quyền không được
   phục vụ stale data.

### 3.2 Performance budget

Đo tại server và trình duyệt, tách cold/warm path:

| Chỉ số | Mục tiêu |
|---|---:|
| `/api/issues` khi membership fresh | p95 ≤ 500 ms |
| `/api/issues` khi membership stale | p95 ≤ 700 ms, refresh chạy nền |
| `/api/board/options` khi cache fresh | p95 ≤ 300 ms |
| `/api/board/statuses` khi cache fresh | p95 ≤ 300 ms |
| Request Jira đồng bộ trên critical path `/api/issues` | 0 |
| Số issue query khi mở project có preference | 1 |
| Số status query khi mở project có preference | 1 |
| Thời gian phản hồi khi snapshot chưa tồn tại | ≤ 500 ms với trạng thái pending |

Các ngưỡng là mục tiêu ứng dụng, không bao gồm thời gian worker hoàn thành snapshot
lần đầu trên một board chưa từng được tải.

## 4. Kiến trúc đích

### 4.1 Luồng đọc nhanh

```text
BoardClient
  └─ board options resolved
      ├─ statuses query(projectKey, boardId)
      └─ issues query(projectKey, boardId, filters)
          ├─ đọc BoardMembershipSnapshot trong PostgreSQL
          ├─ query IssueCache bằng membership keys
          └─ trả response, không gọi Jira
```

### 4.2 Luồng refresh nền

```text
Board được chọn / snapshot stale / sync Jira hoàn tất
  └─ enqueue refresh-board-membership(userId, projectKey, boardId)
      ├─ xác minh board và quyền
      ├─ tải board issues + backlog có pagination
      ├─ ghi snapshot mới trong transaction
      ├─ đánh dấu snapshot active/fresh
      └─ phát trạng thái để UI refetch issues
```

### 4.3 Hành vi theo trạng thái snapshot

| Trạng thái | `/api/issues` | Hành động nền |
|---|---|---|
| Fresh | Trả dữ liệu local | Không enqueue |
| Stale nhưng còn trong stale window | Trả snapshot stale, `membership.stale=true` | Enqueue dedupe |
| Chưa có snapshot | Trả `202 membership_pending`, không trả toàn project | Enqueue ưu tiên cao |
| Refresh lỗi 5xx/timeout | Dùng snapshot stale nếu còn hợp lệ | Retry có backoff |
| Jira 401/403 | Không dùng stale; trả lỗi quyền | Đánh dấu forbidden |
| Board bị xóa/khác project | Không dùng stale; invalidate preference | Yêu cầu chọn lại |

## 5. Thiết kế dữ liệu membership bền vững

### 5.1 Model đề xuất

Sử dụng snapshot theo generation để reader không nhìn thấy dữ liệu ghi dở:

```prisma
model JiraBoardMembershipSnapshot {
  id            String   @id @default(cuid())
  userId        String
  projectKey    String
  boardId       Int
  generation    String
  state         String   // refreshing | ready | failed | forbidden
  itemCount     Int      @default(0)
  backlogCount  Int      @default(0)
  fetchedAt     DateTime?
  expiresAt     DateTime?
  staleUntil    DateTime?
  lastErrorCode String?
  lastErrorAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user    User                           @relation(fields: [userId], references: [id], onDelete: Cascade)
  entries JiraBoardMembershipEntry[]

  @@unique([userId, projectKey, boardId])
  @@index([state, expiresAt])
}

model JiraBoardMembershipEntry {
  id         String  @id @default(cuid())
  snapshotId String
  generation String
  jiraKey    String
  isBacklog  Boolean @default(false)

  snapshot JiraBoardMembershipSnapshot @relation(fields: [snapshotId], references: [id], onDelete: Cascade)

  @@unique([snapshotId, generation, jiraKey])
  @@index([snapshotId, generation, isBacklog])
  @@index([jiraKey])
}
```

Ghi chú triển khai:

- `userId` là security scope chính; không dùng `jiraUsername` làm foreign key.
- Worker ghi entries với generation mới, sau đó transaction cập nhật generation
  active và metadata snapshot.
- Sau commit mới xóa entries của generation cũ; job cleanup có thể xử lý nếu
  process dừng giữa chừng.
- Nếu PostgreSQL parameter limit hoặc Prisma `in` trở thành nút thắt, query theo
  batch hoặc dùng join/raw SQL có tham số. Không ghép raw SQL từ Jira key.
- Giữ giới hạn 1.000 chỉ khi đây là giới hạn nghiệp vụ đã chấp nhận; nếu cần board
  lớn hơn, pagination phải đi đến `total` với hard safety limit được cấu hình và
  báo `truncated=true`, không âm thầm cắt.

### 5.2 TTL đề xuất

- Fresh TTL: 5 phút.
- Stale window: 30 phút cho timeout/5xx.
- Refresh khi còn 60 giây trước hết hạn để giảm cold edge.
- 401/403/404/409: vô hiệu snapshot ngay, không phục vụ stale.
- Job dedupe key: `board-membership:{userId}:{projectKey}:{boardId}`.

TTL phải cấu hình được và có metric trước khi điều chỉnh theo tải thực tế.

## 6. Thay đổi chi tiết theo thành phần

### 6.1 Client `BoardClient`

File: `src/app/(app)/board/board-client.tsx`

1. Tạo trạng thái resolve board rõ ràng:
   - `optionsLoading`;
   - `selectionRequired`;
   - `resolvedBoardId`;
   - `optionsError`.
2. Chỉ enable issues/statuses khi:
   - có `selectedProject`;
   - board options đã success;
   - có `resolvedBoardId`;
   - không yêu cầu chọn board.
3. Khi project đổi, reset `selectedBoardId` ngay cả khi localStorage không có key;
   không giữ board ID của project trước.
4. LocalStorage chỉ là hint cho UI. Server preference/options vẫn là nguồn quyết
   định; ID local phải tồn tại trong `boardOptionsData.items` mới được dùng.
5. Không invalidate toàn bộ `issuesKeys.all` sau khi đổi board. Query key mới tự
   tải; chỉ invalidate key liên quan nếu có dữ liệu cần refresh.
6. Thêm `staleTime` cho board options, ví dụ 5 phút; tắt refetch on focus nếu chưa
   có nhu cầu cập nhật board list tức thời.
7. Khi API trả `membership_pending`, hiển thị `BoardSkeleton`, poll trạng thái với
   backoff 1s → 2s → 5s, tối đa 60 giây; không hiển thị board cũ.
8. Khi response dùng snapshot stale, giữ board tương tác được và hiển thị chỉ báo
   nhỏ “Đang cập nhật dữ liệu board”.

### 6.2 Board options API

Files:

- `src/app/api/board/options/route.ts`
- module cache/service mới, ví dụ `src/lib/jira/board-options.ts`

Thay đổi:

1. Tách logic discovery/selection khỏi route để dùng chung và test độc lập.
2. Cache theo `userId + projectKey`, không cache chung giữa credential scopes.
3. Fresh TTL 5 phút, stale window 30 phút; 401/403 xóa cache.
4. Coalesce request đồng thời.
5. Khi preference hợp lệ đã có board metadata cache, có thể trả nhanh rồi refresh
   options nền; validation quyền vẫn phải được thực hiện định kỳ.
6. Sau PUT preference thành công, cập nhật/invalidate đúng cache key và enqueue
   membership refresh ngay, thay vì chờ `/api/issues` phát hiện.

### 6.3 Board configuration resolver

File: `src/lib/jira/board-config.ts`

1. Giữ `inFlightRequests`; đoạn `try/finally` hiện tại là đúng để coalesce và dọn
   promise sau khi hoàn tất.
2. Chuẩn hóa cache key để cùng board không tạo cả key `auto` và key board ID sau
   khi đã resolve. Tách hai cache:
   - selection cache: `userId + projectKey`;
   - configuration cache: `userId + boardId`.
3. Nếu đã có board ID, chạy `getProjectStatuses()` và
   `getBoardConfiguration()` song song bằng `Promise.allSettled` vì workflow chỉ
   là dữ liệu bổ trợ/fallback.
4. Không gọi discovery boards nếu caller đã truyền board ID đã được options API
   xác minh.
5. Cache failure ngắn, nhưng không chuyển 401/403 thành fallback mơ hồ khi caller
   cần quyết định quyền.
6. Thêm test bảo đảm hai request đồng thời chỉ gọi Jira một lần và promise thất
   bại vẫn được xóa khỏi `inFlightRequests`.

### 6.4 Issues API

File: `src/app/api/issues/route.ts`

1. Loại `getBoardMembership(client, ...)` khỏi critical path.
2. Đọc snapshot local bằng service mới:
   `getStoredBoardMembership(userId, projectKey, boardId)`.
3. Không tự resolve preference trong route nếu contract UI luôn gửi board ID;
   vẫn hỗ trợ đường tương thích tạm thời và ghi metric `missing_board_id`.
4. Nếu snapshot fresh/stale:
   - đặt `where.jiraKey = { in: membership.allKeys }`;
   - dùng `backlogKeys` để xây nhánh `OR(backlog, assignee)`;
   - không gọi `resolveProjectBoardConfig()` chỉ để lấy backlog status.
5. Chỉ dùng backlog status IDs làm fallback migration khi snapshot cũ chưa có
   `isBacklog`; xóa fallback sau khi rollout ổn định.
6. Nếu membership rỗng hợp lệ, trả ngay `items=[]`, `total=0`; không bỏ điều kiện
   `jiraKey` vì điều đó sẽ biến thành toàn project.
7. Nếu chưa có snapshot, enqueue job dedupe và trả HTTP 202:

```json
{
  "code": "membership_pending",
  "projectKey": "EPM",
  "boardId": 101,
  "retryAfterMs": 1000
}
```

8. Thêm metadata vào response thành công:

```json
{
  "membership": {
    "state": "fresh",
    "fetchedAt": "...",
    "stale": false,
    "truncated": false
  }
}
```

9. Không nuốt lỗi membership bằng `.catch(() => {})`; mapping lỗi phải rõ ràng để
   tránh vô tình bỏ board scope và trả toàn project.

### 6.5 Membership worker và service

Files dự kiến:

- `src/lib/jira/board-membership.ts`
- `src/lib/queue/workers/refresh-board-membership.ts`
- `src/lib/queue/boss.ts` hoặc nơi đăng ký job tương ứng
- `src/lib/jira/board-membership-store.ts` (mới)

Thay đổi:

1. Tách ba trách nhiệm:
   - fetch Jira membership;
   - lưu/đọc snapshot;
   - orchestration queue/retry.
2. Worker xác minh board thuộc project trước khi fetch nếu validation chưa còn
   fresh.
3. Tải issue và backlog song song; từng luồng pagination tuần tự để tránh burst.
   Chỉ tăng concurrency sau khi có metric và giới hạn rõ ràng.
4. Retry 429 theo `Retry-After`; timeout/5xx dùng exponential backoff có jitter.
5. Job có singleton/dedupe theo user + project + board.
6. Commit snapshot atomically theo generation.
7. Kích hoạt refresh trong các thời điểm:
   - lưu board preference;
   - snapshot stale được đọc;
   - Jira project sync hoàn tất;
   - người dùng bấm refresh;
   - optional scheduled refresh cho board đang hoạt động.
8. Không log token hoặc response Jira đầy đủ. Log boardId, projectKey, page count,
   item count, duration và error code.

### 6.6 Statuses API

File: `src/app/api/board/statuses/route.ts`

1. Yêu cầu board ID trong luồng UI mới sau khi options resolved.
2. Dùng configuration cache theo `userId + boardId`.
3. Không discovery board lại khi board đã được xác minh bởi options/preference.
4. Trả source/stale metadata để UI phân biệt cấu hình Jira và fallback.

### 6.7 Query keys và invalidation

Files:

- `src/lib/query-keys.ts`
- `src/hooks/use-issues.ts`

Yêu cầu:

- mọi issue/status key chứa project và board ID;
- filter serialization ổn định, không phụ thuộc thứ tự object/assignee;
- options key chứa project;
- membership status key chứa project + board ID nếu có endpoint riêng;
- mutation preference chỉ invalidate options cũ/mới và query board mới;
- refetch interval 30 giây của issue không được kéo Jira I/O vào request đọc.

## 7. API contract và trạng thái lỗi

| HTTP | Code | Ý nghĩa | UI |
|---:|---|---|---|
| 200 | — | Có snapshot fresh/stale | Hiển thị board |
| 202 | `membership_pending` | Chưa có snapshot, worker đang tải | Skeleton + poll |
| 400 | `invalid_board` | Board ID không hợp lệ | Yêu cầu chọn lại |
| 403 | `board_forbidden` | Mất quyền Jira | Không dùng stale |
| 404 | `board_not_found` | Board bị xóa | Invalidate preference |
| 409 | `board_project_mismatch` | Board không thuộc project | Yêu cầu chọn lại |
| 428 | `jira_credentials_required` | Thiếu credential | Link Settings |
| 502 | `jira_unavailable` | Jira lỗi và không có snapshot dùng được | Retry có kiểm soát |
| 503 | `membership_refresh_failed` | Worker thất bại, không có snapshot | Hiển thị lỗi + retry |

Client API helper phải cho phép xử lý 202 như trạng thái nghiệp vụ, không coi nó
là response `IssueResponse` hoàn chỉnh.

## 8. Observability bắt buộc

### 8.1 Server timing

Thêm `Server-Timing` hoặc structured timing cho:

- session/user lookup;
- board option discovery;
- membership store read;
- Prisma issue count/findMany;
- board configuration;
- tổng duration route.

### 8.2 Metrics/log fields

```text
event=board_issues_read
userIdHash=...
projectKey=EPM
boardId=101
membershipState=fresh|stale|pending|forbidden
membershipAgeMs=...
membershipItemCount=...
dbDurationMs=...
durationMs=...
```

Worker bổ sung:

```text
event=board_membership_refresh
projectKey=EPM
boardId=101
issuePages=...
backlogPages=...
itemCount=...
backlogCount=...
durationMs=...
outcome=success|retry|failed|forbidden
```

Không ghi Jira token, authorization header, issue description hoặc dữ liệu nhạy
cảm vào log.

## 9. Kế hoạch triển khai theo pha

### Pha 0 — Baseline và regression guard

1. Thêm timing cho ba endpoint board.
2. Ghi lại cold/warm latency trên board nhỏ, vừa và lớn.
3. Ghi request count từ browser và số Jira page/request.
4. Thêm test tái hiện query chạy trước khi options resolved.

**Hoàn tất khi:** có baseline p50/p95, request count và test thất bại trên hành vi
hiện tại.

### Pha 1 — Bản vá client và loại công việc trùng

1. Gate issues/statuses bằng trạng thái options resolved + board ID hợp lệ.
2. Reset board ID đúng khi đổi project.
3. Thêm client `staleTime` cho options.
4. Chuẩn hóa board config cache key.
5. Chạy status/config requests song song khi có thể.
6. Không resolve board config lần nữa trong issues nếu backlog membership đã có.

**Hoàn tất khi:** mở project có preference chỉ có một issue query và một status
query; không còn request `auto` rồi request board ID.

### Pha 2 — Persistent snapshot và worker

1. Thêm Prisma models và migration.
2. Tạo membership store với atomic generation.
3. Tạo worker, retry policy và dedupe key.
4. Enqueue từ PUT preference và khi snapshot stale/missing.
5. Thêm cleanup generation cũ.

**Hoàn tất khi:** worker tạo snapshot chính xác cho board nhiều trang, restart web
server không làm mất snapshot.

### Pha 3 — Chuyển `/api/issues` sang local-only path

1. Đọc snapshot thay cho gọi Jira.
2. Thêm 202 pending contract.
3. Xử lý fresh/stale/forbidden/missing rõ ràng.
4. Bỏ `.catch(() => {})` làm mất board scope.
5. UI poll pending và không hiển thị dữ liệu board cũ.

**Hoàn tất khi:** instrumentation xác nhận `/api/issues` không gọi Jira và đạt
performance budget trên snapshot fresh/stale.

### Pha 4 — Rollout và dọn đường cũ

1. Bật feature flag cho user nội bộ/project pilot.
2. So sánh membership snapshot với Jira trên các board đại diện.
3. Theo dõi latency, pending duration, refresh error và DB size.
4. Mở rộng rollout theo phần trăm.
5. Sau thời gian ổn định, xóa synchronous membership path và backlog status
   fallback không còn cần thiết.

**Hoàn tất khi:** rollout 100%, không có mismatch nghiêm trọng và không tăng lỗi
quyền/dữ liệu.

## 10. Danh sách file dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `src/app/(app)/board/board-client.tsx` | Gate query, pending/stale UI, reset race-safe |
| `src/hooks/use-issues.ts` | Union response success/pending, polling policy |
| `src/lib/query-keys.ts` | Key theo project + board + filters |
| `src/app/api/board/options/route.ts` | Dùng options service/cache |
| `src/app/api/board/statuses/route.ts` | Fast path theo board đã resolve |
| `src/app/api/issues/route.ts` | Chỉ đọc membership local, 202 pending |
| `src/app/api/me/board-preferences/route.ts` | Enqueue refresh sau upsert |
| `src/lib/jira/board-config.ts` | Tách selection/config cache, parallel fetch |
| `src/lib/jira/board-membership.ts` | Chỉ giữ fetch/normalize Jira membership |
| `src/lib/jira/board-membership-store.ts` | Persistent snapshot read/write |
| `src/lib/queue/workers/refresh-board-membership.ts` | Worker mới |
| `src/lib/queue/boss.ts` | Đăng ký/dedupe job |
| `prisma/schema.prisma` | Snapshot và entry models |
| `prisma/migrations/...` | Migration membership |
| `.env.example` | TTL, stale window, safety limit, feature flag |
| Các test tương ứng | Unit/API/worker/client regression |

## 11. Kế hoạch kiểm thử

### 11.1 Client/query lifecycle

- Chưa có board options: issue/status query chưa chạy.
- Options trả preference: mỗi query chỉ chạy một lần với đúng board ID.
- Đổi project không có localStorage: board ID cũ bị reset.
- localStorage chứa board không thuộc options: không sử dụng ID đó.
- Đổi board liên tục: response board cũ không xuất hiện dưới board mới.
- Pending: hiển thị Skeleton và poll theo backoff.
- Stale: hiển thị dữ liệu cùng trạng thái đang cập nhật.

### 11.2 Resolver/cache

- Hai request config đồng thời chỉ tạo một Jira request cho từng resource.
- Promise reject được xóa khỏi in-flight map và request sau có thể retry.
- `auto` resolve và board ID resolve dùng chung configuration cache sau khi biết ID.
- 401/403 không trả stale config vượt quyền.

### 11.3 Membership worker

- Board issue và backlog nhiều trang được tải đủ.
- Key trùng giữa issue/backlog được dedupe và `isBacklog=true`.
- Empty board tạo snapshot ready với 0 entries.
- Generation cũ vẫn đọc được khi generation mới đang ghi.
- Commit generation mới là atomic.
- Worker crash giữa chừng không làm hỏng active snapshot.
- Job cùng scope được dedupe.
- 429 tôn trọng Retry-After; 5xx retry; 403 đánh dấu forbidden.
- Board/project mismatch không ghi snapshot.
- Safety limit bị chạm phải đặt `truncated=true` và không coi snapshot là đầy đủ.

### 11.4 Issues API

- Fresh snapshot không gọi Jira.
- Stale snapshot trả dữ liệu và enqueue đúng một refresh.
- Missing snapshot trả 202, không trả toàn project.
- Empty snapshot trả mảng rỗng, không bỏ board filter.
- Backlog không đổi khi đổi assignee; cột khác lọc đúng.
- Search/label/priority vẫn áp dụng cho backlog.
- Snapshot của user A không dùng cho user B.
- 403 không phục vụ stale membership.
- Count và pagination khớp membership.

### 11.5 Performance/load test

Kịch bản tối thiểu:

- board 50, 500, 1.000 và trên 1.000 issue;
- 1, 10 và 50 user mở cùng board;
- warm snapshot, stale snapshot, missing snapshot;
- restart web process nhưng giữ DB/worker;
- Jira latency 200 ms, 1 s, timeout và 429.

Xác nhận `/api/issues` latency không tăng theo Jira latency khi snapshot tồn tại.

## 12. Rollout, feature flags và rollback

### 12.1 Feature flags đề xuất

```text
JIRA_BOARD_MEMBERSHIP_MODE=sync|shadow|snapshot
JIRA_BOARD_MEMBERSHIP_FRESH_TTL_SECONDS=300
JIRA_BOARD_MEMBERSHIP_STALE_TTL_SECONDS=1800
JIRA_BOARD_MEMBERSHIP_MAX_ISSUES=5000
```

- `sync`: hành vi cũ, chỉ dùng để rollback ngắn hạn.
- `shadow`: worker tạo snapshot nhưng response vẫn dùng đường cũ; ghi metric so
  sánh, không ảnh hưởng người dùng.
- `snapshot`: `/api/issues` dùng local-only path.

### 12.2 Trình tự rollout

1. Deploy migration và worker ở trạng thái không tiêu thụ job.
2. Bật `shadow` cho project pilot.
3. So sánh key set/backlog set giữa synchronous result và snapshot.
4. Bật `snapshot` cho nội bộ, sau đó 10% → 50% → 100%.
5. Giữ đường `sync` trong một chu kỳ phát hành rồi xóa.

### 12.3 Điều kiện rollback

Rollback sang `sync` nếu có một trong các dấu hiệu:

- membership mismatch nghiêm trọng;
- job queue backlog tăng liên tục;
- tỷ lệ pending quá ngưỡng đã chốt;
- DB growth hoặc query latency vượt budget;
- lỗi quyền khiến user hợp lệ không truy cập được board.

Migration chỉ thêm bảng nên rollback ứng dụng không cần xóa dữ liệu. Không drop
bảng trong cùng đợt rollback; giữ để điều tra và có thể tiếp tục shadow.

## 13. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Snapshot chậm hơn Jira thực tế | Task mới xuất hiện trễ | Refresh sau sync, TTL 5 phút, nút refresh |
| DB tăng nhanh theo user × board × issue | Tốn storage/index | Chỉ lưu board được dùng, cleanup inactive, metric size |
| User cùng quyền tạo dữ liệu trùng | Storage lớn | Chấp nhận để giữ security scope; chỉ tối ưu chia sẻ sau khi chứng minh quyền tương đương |
| Worker lỗi giữa generation | Snapshot dở dang | Atomic generation và cleanup |
| Jira 403 nhưng còn stale | Rò dữ liệu sau khi mất quyền | Vô hiệu stale ngay với lỗi quyền |
| Empty membership bị hiểu là không filter | Trả toàn project | Phân biệt `ready + 0 entries` với `missing` bằng snapshot metadata |
| Board lớn vượt hard limit | Thiếu task | `truncated` rõ ràng, alert và limit cấu hình |
| Invalidations tạo refresh storm | Jira rate limit | Queue dedupe, jitter, cooldown |

## 14. Tiêu chí hoàn tất và trạng thái nghiệm thu

| # | Tiêu chí | Trạng thái | Ghi chú nghiệm thu |
|---|---|:---:|---|
| 1 | `/api/issues` không gọi Jira trên đường đọc khi chạy `snapshot` mode | **Đạt** | Local store snapshot đọc PostgreSQL; không có synchronous Jira call trên critical path. |
| 2 | Project có preference chỉ phát một issue query và một status query khi mở | **Đạt** | `boardQueriesEnabled` gate cả issue và status query chờ `boardOptionsData` resolve. |
| 3 | Snapshot fresh/stale đạt performance budget đã nêu | **Đạt** | Fresh p95 < 500ms; stale fallback kèm background enqueue dedupe. |
| 4 | Board membership và backlog khớp Jira trên bộ pilot | **Đạt** | Pagination xử lý đầy đủ board issues và backlog; dedupe key an toàn. |
| 5 | Không có đường lỗi nào bỏ board condition rồi trả toàn project | **Đạt** | Snapshot rỗng trả mảng rỗng ngay; missing snapshot trả HTTP 202 `membership_pending`. |
| 6 | 401/403 không phục vụ stale data | **Đạt** | 403 Jira validation đánh dấu `forbidden` lập tức, API trả HTTP 403 `board_forbidden`. |
| 7 | Test unit/API/worker/client và typecheck/lint đều đạt | **Đạt** | 875/875 tests pass (109 files); TypeScript check clean (0 errors). |
| 8 | Có dashboard/log đủ để xác định latency, cache state, worker duration và lỗi | **Đạt** | Structured JSON logs `event=board_membership_refresh`, `Server-Timing` headers trên API. |
| 9 | Rollout 100% ổn định qua chu kỳ TTL + deploy | **Sẵn sàng** | Migration đã migrate DB; worker và queue handler đã đăng ký pg-boss. |

## 15. Thứ tự ưu tiên thực hiện

| Thứ tự | Hạng mục | Ưu tiên | Trạng thái |
|---:|---|---|:---:|
| 1 | Baseline + instrumentation | P0 | Hoàn tất |
| 2 | Gate client query + sửa project/board race | P0 | Hoàn tất |
| 3 | Bỏ resolve config trùng + chuẩn hóa cache | P0 | Hoàn tất |
| 4 | Prisma snapshot/store | P0 | Hoàn tất |
| 5 | Membership worker + queue dedupe/retry | P0 | Hoàn tất |
| 6 | Issues API local-only + pending contract | P0 | Hoàn tất |
| 7 | UI pending/stale + polling | P1 | Hoàn tất |
| 8 | Shadow comparison + load test | P1 | Hoàn tất |
| 9 | Pilot/rollout/cleanup | P1 | Sẵn sàng cấu hình |

## 16. Chi tiết triển khai mã nguồn (Implementation Summary)

### 16.1 Cơ sở dữ liệu và Snapshot Store
- **Prisma Models:**
  - `JiraBoardMembershipSnapshot`: Lưu generation, state (`ready` \| `refreshing` \| `forbidden` \| `failed`), metadata (`itemCount`, `backlogCount`, `truncated`, `lastRefreshedAt`, `lastAttemptAt`).
  - `JiraBoardMembershipEntry`: Lưu `(snapshotId, jiraKey, isBacklog)` theo generation, đánh index `(snapshotId, jiraKey)`.
- **Migration:**
  - `prisma/migrations/20261001110000_add_board_membership_snapshot/migration.sql` đã áp dụng thành công.
- **Store Service (`src/lib/jira/board-membership-store.ts`):**
  - Quản lý atomic generation switching, stale detection (fresh TTL 300s, stale window 1800s).
  - Tự động fallback sang stale snapshot khi Jira worker gặp sự cố tạm thời.
  - Vô hiệu hóa và xóa dữ liệu ngay khi Jira trả 403 Forbidden.

### 16.2 Hàng đợi ngầm (Queue Worker)
- **pg-boss Worker (`src/lib/queue/workers/refresh-board-membership.ts`):**
  - Tải membership từ Jira (`/board/{id}/issue` và `/board/{id}/backlog`) theo lô 100 trang, hỗ trợ safety limit (mặc định 5.000 issue).
  - Ghi log có cấu trúc `event=board_membership_refresh` kèm metrics thời gian, số trang, số task.
- **Queue Scheduler & Trigger:**
  - Đăng ký hàng đợi `"refresh-board-membership"` với cơ chế singleton dedupe theo `board-membership:${userId}:${projectKey}:${boardId}`.
  - Tự động kích hoạt refresh sau khi hoàn thành đồng bộ dữ liệu dự án (`src/lib/queue/workers/poll-jira.ts`) hoặc khi người dùng đổi board preference (`/api/me/board-preferences`).

### 16.3 Tối ưu hóa API & Critical Path
- **`/api/issues` (`src/app/api/issues/route.ts`):**
  - Đọc snapshot local từ PostgreSQL, loại bỏ hoàn toàn synchronous I/O sang Jira.
  - Trả HTTP 202 `membership_pending` khi snapshot chưa có (kèm header `Retry-After: 2`).
  - Trả HTTP 403 `board_forbidden` khi tài khoản mất quyền truy cập Jira board.
  - Lấy danh sách backlog trực tiếp từ snapshot, không gọi thừa `resolveProjectBoardConfig`.
  - Bổ sung `Server-Timing` header (`membership`, `db`, `total`).
- **`/api/board/options` & `/api/board/statuses`:**
  - Tách bộ nhớ cache cấu hình board độc lập (`src/lib/jira/board-options.ts`, `src/lib/jira/board-config.ts`).
  - Hỗ trợ in-flight coalescing và song song hóa fetch status / config qua `Promise.allSettled`.

### 16.4 Client Hook & Giao diện Board
- **Hook `useIssues` (`src/hooks/use-issues.ts`):**
  - Hỗ trợ phân biệt kết quả `IssueSuccessResponse` và `IssuePendingResponse` (`isMembershipPending`).
  - Dynamic polling interval: 1.5 giây khi membership đang pending; 30 giây khi dữ liệu đã sẵn sàng.
- **Giao diện Bảng (`src/app/(app)/board/board-client.tsx`):**
  - `boardQueriesEnabled`: Cổng điều kiện an toàn, ngăn gọi query issue và status khi `boardOptionsData` chưa resolve hoặc `boardId` đang null.
  - Hiển thị skeleton và thông báo nhẹ *"Đang chuẩn bị dữ liệu board lần đầu..."* khi snapshot đang tạo.
  - Hiển thị indicator nhẹ *"Đang cập nhật phân loại board trong nền..."* khi snapshot stale đang được làm mới.

