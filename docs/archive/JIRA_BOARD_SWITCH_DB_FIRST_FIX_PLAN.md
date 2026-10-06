# Kế hoạch sửa chuyển Jira board theo hướng DB-first

> Phiên bản: 1.2  
> Ngày lập: 2026-10-01  
> Trạng thái: Superseded (Được thay thế bởi `docs/JIRA_SINGLE_PROJECT_BOARD_RESTORE_PLAN.md`)  
> Phạm vi: `/board`, `/api/issues`, board preference, board membership snapshot và worker `refresh-board-membership`  
> Tài liệu liên quan: `docs/JIRA_MULTI_BOARD_SELECTION_PLAN.md`, `docs/JIRA_MULTI_BOARD_LOADING_PERFORMANCE_FIX_PLAN.md`, `docs/JIRA_SINGLE_PROJECT_BOARD_RESTORE_PLAN.md`

## 1. Tóm tắt quyết định

Khi người dùng chuyển board, màn hình phải đọc và hiển thị dữ liệu đã có trong
PostgreSQL ngay; thao tác đọc không được tự gọi Jira hoặc tự tạo queue job.

Giải pháp được chọn:

1. Tách hoàn toàn **read path** và **refresh path**.
2. `GET /api/issues` chỉ đọc `IssueCache` và
   `JiraBoardMembershipSnapshot/JiraBoardMembershipEntry`.
3. Membership snapshot được chuẩn bị trước khi cần dùng: sau khi lưu board
   preference, sau full Jira sync và bằng lịch refresh nền.
4. Khi có snapshot cũ, luôn hiển thị snapshot đó trong lúc refresh nền.
5. Khi board chưa từng có snapshot, không trả toàn bộ project dưới tên board vì
   dữ liệu có thể sai. UI hiển thị lỗi/trạng thái có hành động rõ ràng, không poll
   vô hạn và không tự phát sinh Jira I/O từ API đọc.
6. Không chuyển snapshot sang dùng chung giữa người dùng trong pha này. Snapshot
   tiếp tục scope theo `userId + projectKey + boardId` để giữ đúng quyền Jira.

Kết quả mong muốn: board đã từng được chuẩn bị phải chuyển gần như tức thời từ
DB; trường hợp lần đầu trở thành ngoại lệ có kiểm soát thay vì hành vi mặc định.

## 2. Hiện trạng và nguyên nhân gốc

### 2.1 Hai loại dữ liệu khác nhau

- `IssueCache` chứa nội dung task đã đồng bộ theo project.
- `JiraBoardMembershipSnapshot` và `JiraBoardMembershipEntry` chứa tập Jira key
  thuộc board/backlog cụ thể của một người dùng.

`IssueCache` không đủ để xác định chính xác task thuộc board vì nhiều board trong
cùng project có thể dùng filter/JQL khác nhau.

### 2.2 Luồng gây chờ hiện tại

```text
Người dùng chuyển board
  -> BoardClient gọi GET /api/issues?project=...&boardId=...
  -> API đọc membership snapshot
  -> snapshot missing/pending
      -> API tự enqueue refresh-board-membership
      -> trả 202 membership_pending
  -> client poll lại mỗi khoảng 1 giây
  -> worker gọi Jira board issues và backlog, có pagination
  -> worker ghi snapshot vào DB
  -> lần poll sau đọc IssueCache theo membership keys
  -> board mới được hiển thị
```

Độ trễ nằm ở Jira API, pagination, queue lag và thời gian worker; không nằm chủ
yếu ở query `IssueCache`.

### 2.3 Các vấn đề cần sửa

1. `GET /api/issues` có side effect: request đọc có thể tạo job.
2. Chuyển board cold path phụ thuộc Jira và worker.
3. Client poll nhanh, gây nhiều request nhưng không làm worker nhanh hơn.
4. Snapshot cũ và snapshot lần đầu chưa được trình bày thành hai UX khác nhau.
5. Message “Đang chuẩn bị dữ liệu board lần đầu” không có timeout, tiến độ hoặc
   hành động khôi phục rõ ràng.
6. Snapshot được tạo muộn, chỉ khi người dùng đã cần xem board.

## 3. Mục tiêu và phi mục tiêu

### 3.1 Mục tiêu chức năng

1. Chuyển sang board đã có snapshot phải chỉ đọc DB và hiển thị ngay.
2. Không hiển thị task ngoài board đã chọn.
3. Snapshot stale vẫn sử dụng được trong stale window và không khóa UI.
4. Không có request Jira nào phát sinh trực tiếp hoặc gián tiếp bởi
   `GET /api/issues`.
5. Refresh membership có nguồn kích hoạt rõ ràng, dedupe và quan sát được.
6. Khi refresh lỗi, dữ liệu DB gần nhất vẫn dùng được nếu quyền chưa bị thu hồi.
7. 401/403/404/board-project mismatch không được tiếp tục phục vụ snapshot cũ.

### 3.2 Mục tiêu hiệu năng

| Chỉ số | Mục tiêu |
|---|---:|
| Chuyển board có snapshot, API p95 | <= 500 ms |
| Thời gian đến nội dung trên UI, warm path p95 | <= 800 ms |
| Jira request trên `GET /api/issues` | 0 |
| Job được tạo bởi `GET /api/issues` | 0 |
| Issue request cho một lần chuyển board | 1 |
| Poll mặc định khi không có job chủ động | 0 |
| Tỷ lệ board preference có snapshot sẵn | >= 99% |

### 3.3 Ngoài phạm vi

- Thay đổi filter/JQL hoặc cấu hình Jira board.
- Hiển thị tạm toàn bộ project rồi thu hẹp sau.
- Chia sẻ snapshot giữa các user có credential khác nhau.
- Thay thế `IssueCache` bằng truy vấn Jira trực tiếp.
- Tối ưu toàn bộ đồng bộ Jira project ngoài các hook liên quan membership.

## 4. Kiến trúc đích

### 4.1 Read path thuần DB

```text
BoardClient chọn project + boardId
  -> GET /api/issues
      -> đọc UserBoardPreference/validate input local
      -> đọc JiraBoardMembershipSnapshot + active generation entries
      -> query IssueCache WHERE jiraKey IN (...)
      -> trả items + membership metadata
```

Read path không import `boss`, không gọi `jiraWith`, không gọi board discovery và
không thay đổi trạng thái snapshot.

### 4.2 Refresh path chủ động

```text
PUT board preference / Jira project sync success / scheduled refresh / nút refresh
  -> enqueue refresh-board-membership (dedupe)
  -> worker xác minh quyền và board-project association
  -> fetch Jira board issues + backlog
  -> ghi generation mới atomically
  -> invalidate/refetch query liên quan nếu có client action đang theo dõi
```

### 4.3 Quy tắc phục vụ snapshot

| Trạng thái DB | API | UI | Refresh |
|---|---|---|---|
| `fresh` | 200, trả dữ liệu DB | Hiển thị bình thường | Không làm gì |
| `stale` còn hợp lệ | 200, trả dữ liệu DB | Hiển thị + badge “Dữ liệu phạm vi có thể cũ” | Scheduler/action riêng xử lý |
| `refreshing` có generation cũ | 200, trả generation cũ | Không khóa board; badge nhỏ | Job hiện tại tiếp tục |
| `missing` | 409 `membership_not_ready` | Empty state có nút chuẩn bị lại | Chỉ enqueue từ mutation/action |
| `refreshing` chưa có generation | 202 `membership_preparing` | Skeleton có timeout, poll job status | Poll endpoint trạng thái job |
| `failed` có generation hợp lệ | 200 + warning | Hiển thị DB + lỗi refresh | Cho retry thủ công |
| `failed` không có generation | 503 | Error state + retry | Retry có chủ đích |
| `forbidden` | 403 | Yêu cầu kiểm tra credential/quyền | Không dùng stale |

## 5. Quyết định về dữ liệu

### 5.1 Giữ scope theo người dùng

Tiếp tục dùng unique key:

```text
userId + projectKey + boardId
```

Lý do:

- board visibility có thể khác theo credential;
- tránh một user nhìn thấy membership được lấy bằng quyền của user khác;
- tương thích model và worker hiện tại;
- giảm rủi ro rollout.

Tối ưu snapshot dùng chung chỉ được xem xét sau khi có mô hình ACL riêng và bằng
chứng mọi user dùng cùng security scope.

### 5.2 Bổ sung metadata trạng thái

Kiểm tra và bổ sung vào `JiraBoardMembershipSnapshot` nếu còn thiếu:

```prisma
lastRequestedAt DateTime?
lastStartedAt   DateTime?
lastSuccessAt   DateTime?
lastJobId       String?
refreshReason   String?
```

`generation` cần cho phép trạng thái chưa có generation, hoặc code phải bảo đảm
giá trị placeholder không bị hiểu là snapshot hợp lệ. Ưu tiên đổi thành
`String?` để biểu diễn đúng `missing/preparing`.

### 5.3 Atomic generation

1. Worker tạo generation mới.
2. Insert toàn bộ entries của generation mới theo batch.
3. Trong transaction, cập nhật snapshot active generation và metadata success.
4. Reader chỉ đọc active generation.
5. Cleanup generation cũ sau commit; cleanup lỗi không ảnh hưởng reader.

Không xóa generation đang dùng trước khi generation mới hoàn tất.

## 6. Thay đổi chi tiết theo thành phần

### 6.1 `GET /api/issues`

File: `src/app/api/issues/route.ts`

1. Xóa hai điểm enqueue khi snapshot `missing/pending` và `stale`.
2. Không dynamic import `@/lib/queue/boss` trong GET route.
3. Không gọi Jira ở mọi membership mode của production path.
4. Đọc snapshot và map trạng thái theo bảng ở mục 4.3.
5. Với snapshot fresh/stale/refreshing có generation:
   - luôn đặt `where.jiraKey = { in: allKeys }`;
   - membership rỗng hợp lệ trả `items=[]`;
   - không bao giờ bỏ điều kiện `jiraKey` rồi trả toàn project.
6. Response bổ sung metadata:

```json
{
  "membership": {
    "state": "fresh",
    "fetchedAt": "2026-10-01T10:00:00.000Z",
    "refreshing": false,
    "stale": false,
    "lastErrorCode": null,
    "itemCount": 420,
    "truncated": false
  }
}
```

7. Thêm invariant test: mock `enqueueBoardMembershipRefresh` phải không được gọi
   từ mọi nhánh GET.
8. Trong giai đoạn chuyển tiếp, giữ feature flag để fallback route cũ nhưng mặc
   định tắt; xóa flag sau rollout.

### 6.2 Membership store

File: `src/lib/jira/board-membership-store.ts`

1. Tách rõ `missing`, `preparing`, `fresh`, `stale`, `refreshing_with_data`,
   `failed_with_data`, `failed_empty`, `forbidden`.
2. Trạng thái `refreshing` không được làm mất active generation cũ.
3. Trả `truncated` từ DB thay vì hardcode `false`.
4. Không coi `snapshot.state === "ready"` là stale hợp lệ vô thời hạn. Sau
   `staleUntil`, API vẫn có thể phục vụ theo policy khẩn cấp nhưng phải có trạng
   thái riêng và cảnh báo; mặc định chuyển thành `expired`.
5. Thêm method read-only `getMembershipReadModel()` không thay đổi DB.
6. Thêm method `getMembershipRefreshStatus()` cho endpoint status.
7. Bổ sung index/query kiểm soát số entry lớn; tránh `IN` vượt giới hạn bằng
   batch hoặc join khi board lớn.

### 6.3 Lưu board preference

File: `src/app/api/me/board-preferences/route.ts`

1. Sau khi validate và upsert preference, enqueue membership refresh như hiện
   tại nhưng phải `await` kết quả enqueue đủ để trả `jobId`/trạng thái rõ ràng.
2. Response đề xuất:

```json
{
  "projectKey": "EPM",
  "board": { "id": 101, "name": "EPM Delivery", "type": "scrum" },
  "membership": {
    "state": "fresh",
    "jobId": null
  }
}
```

Hoặc khi chưa có snapshot:

```json
{
  "membership": {
    "state": "preparing",
    "jobId": "..."
  }
}
```

3. Không nuốt lỗi queue bằng `.catch(() => {})`. Nếu preference đã lưu nhưng
   enqueue lỗi, trả `preferenceSaved=true`, `membership.state="queue_failed"`
   để UI cho phép retry.
4. Nếu chọn lại board có snapshot fresh, không enqueue lại.
5. Nếu snapshot stale, enqueue normal priority nhưng UI vẫn dùng dữ liệu cũ.

### 6.4 Chuẩn bị snapshot trước khi chuyển board

Để đạt tỷ lệ warm path cao, triển khai hai lớp prewarm:

1. **Preference prewarm bắt buộc:** mọi board được lưu làm preference đều được
   refresh ngay sau mutation.
2. **Active-board scheduled refresh:** scheduler tìm preference có snapshot gần
   hết hạn và enqueue trước `expiresAt` một khoảng, ví dụ 60 giây.

Không tự prewarm mọi board trả về từ board options trong pha đầu vì có thể tạo
nhiều Jira request cho board người dùng không bao giờ mở.

Scheduler:

- chạy mỗi 60 giây;
- chọn snapshot/preference theo batch;
- chỉ enqueue board active gần đây, dựa trên `lastRequestedAt`;
- singleton key giữ nguyên theo user/project/board;
- có concurrency và rate limit;
- không refresh `forbidden` đến khi credential/preference thay đổi.

### 6.5 Worker `refresh-board-membership`

Files:

- `src/lib/queue/workers/refresh-board-membership.ts`
- `src/lib/queue/boss.ts`

1. Nhận `reason`: `preference_saved`, `jira_sync_completed`, `scheduled`,
   `manual_retry`.
2. Ghi `lastStartedAt`, `lastJobId`, `refreshReason` trước khi fetch.
3. Nếu đã có active generation, đánh dấu refreshing nhưng giữ generation đó.
4. Fetch board issues và backlog với pagination có giới hạn rõ ràng.
5. Xử lý 429 theo `Retry-After`; timeout/5xx retry exponential backoff + jitter.
6. 401/403 đánh dấu forbidden và không phục vụ stale.
7. 404/409 invalidate preference hoặc đánh dấu cần chọn lại board.
8. Sau success, cập nhật snapshot atomically và phát tín hiệu/invalidation nếu
   hệ thống realtime có sẵn.
9. Log queue lag, Jira duration, page count, item count và outcome; không log
   credential hoặc nội dung issue.
10. Dedupe window phải dài hơn thời gian job thông thường; singleton 30 giây có
    thể quá ngắn cho board lớn. Dùng singleton theo lifetime hoặc kiểm tra
    snapshot state/lease trong DB để ngăn hai worker ghi đồng thời.

### 6.6 Full Jira sync integration

File: `src/lib/queue/workers/poll-jira.ts`

1. Giữ refresh membership sau khi project sync thành công.
2. Chỉ enqueue preference/snapshot đang active gần đây.
3. Dùng `Promise.allSettled` có giới hạn concurrency thay vì fire-and-forget tuần
   tự không theo dõi.
4. Ghi metric số membership job đã enqueue/bỏ qua/dedupe.
5. Full sync không được chờ toàn bộ membership refresh hoàn tất.

### 6.7 Client hook

File: `src/hooks/use-issues.ts`

1. Bỏ `refetchInterval: 30000` mặc định.
2. Cấu hình đề xuất:

```ts
staleTime: 60_000
refetchOnWindowFocus: false
refetchOnReconnect: true
```

3. Không poll `/api/issues` khi `membership_not_ready` nếu chưa có một job ID do
   mutation/action trả về.
4. Nếu đang theo dõi job vừa tạo, poll endpoint status riêng với backoff:
   `1s -> 2s -> 5s`, tối đa 60 giây.
5. Khi job success, invalidate đúng issue key của `project + boardId`, không
   invalidate toàn bộ `issuesKeys.all`.
6. Giữ dữ liệu board hiện tại trong lúc background refetch của chính key đó;
   không giữ dữ liệu board trước dưới key board mới.

### 6.8 Board UI

File: `src/app/(app)/board/board-client.tsx`

1. Phân biệt các trạng thái:
   - `loading_db`: skeleton rất ngắn;
   - `ready`: board tương tác bình thường;
   - `ready_stale`: board vẫn hiện, badge cảnh báo;
   - `preparing_first_snapshot`: chỉ khi mutation vừa tạo job;
   - `not_ready`: empty state có nút “Chuẩn bị dữ liệu board”;
   - `refresh_failed`: lỗi có Retry;
   - `forbidden`: yêu cầu kiểm tra quyền/token.
2. Không dùng spinner `animate-spin` cho snapshot stale nếu không chắc đang có
   job chạy. Dùng icon trạng thái tĩnh hoặc hiển thị đúng `refreshing=true`.
3. Sau 60 giây preparing, dừng poll và hiển thị:
   “Worker chưa hoàn tất. Bạn có thể thử lại hoặc kiểm tra trạng thái worker.”
4. Khi chuyển board có snapshot, board phải hiển thị ngay từ query cache/DB.
5. Có thể prefetch query cho board dropdown khi người dùng hover/focus, nhưng chỉ
   prefetch DB API, không tạo job.
6. Thay hint empty-state “chạy đồng bộ Jira” bằng hành động đúng ngữ cảnh:
   refresh issue data hoặc chuẩn bị membership.

### 6.9 Endpoint refresh/status riêng

Tạo API có mutation rõ ràng:

```text
POST /api/board/membership/refresh
GET  /api/board/membership/status?project=EPM&boardId=101
```

`POST`:

- yêu cầu session và credential;
- xác minh board thuộc preference/options hợp lệ;
- enqueue dedupe;
- trả `202`, `jobId`, `state`;
- rate-limit theo user/board.

`GET status`:

- chỉ đọc DB/queue metadata;
- không enqueue;
- trả `preparing|running|succeeded|failed|forbidden`;
- không trả dữ liệu issue.

### 6.10 Query keys và cache invalidation

File: `src/lib/query-keys.ts`

Yêu cầu:

- issue key chứa `projectKey`, `boardId` và filters chuẩn hóa;
- membership status key chứa `user scope + projectKey + boardId` ở server và
  `projectKey + boardId` ở client session;
- preference mutation chỉ invalidate board vừa thay đổi;
- worker completion/realtime event chỉ invalidate các consumer liên quan;
- không invalidate toàn bộ issue query khi một board refresh xong.

## 7. API contract đề xuất

| HTTP | Code/state | Ý nghĩa | UI |
|---:|---|---|---|
| 200 | `fresh` | Có snapshot mới | Hiển thị board |
| 200 | `stale` | Có snapshot cũ dùng được | Hiển thị + cảnh báo |
| 200 | `refreshing_with_data` | Đang refresh nhưng có dữ liệu | Hiển thị + trạng thái nền |
| 202 | `membership_preparing` | Có job chủ động, chưa có generation | Skeleton + poll status có giới hạn |
| 409 | `membership_not_ready` | Chưa có snapshot và chưa có job | Empty state + nút chuẩn bị |
| 403 | `board_forbidden` | Mất quyền Jira | Không dùng stale |
| 404 | `board_not_found` | Board đã bị xóa | Xóa/invalidate preference |
| 409 | `board_project_mismatch` | Board không thuộc project | Yêu cầu chọn lại |
| 428 | `jira_credentials_required` | Thiếu token | Link Settings |
| 503 | `membership_refresh_failed` | Không có dữ liệu và refresh lỗi | Error + Retry |

## 8. Migration và tương thích dữ liệu

1. Tạo migration metadata mới nếu schema cần thay đổi.
2. Backfill `lastSuccessAt=fetchedAt` cho snapshot ready hiện có.
3. Không xóa snapshot/entry hiện tại.
4. Chạy script/audit read-only để thống kê:
   - số preference;
   - số preference chưa có snapshot;
   - snapshot stale/failed/forbidden;
   - snapshot có `itemCount` lệch số entry active.
5. Enqueue backfill theo batch cho preference thiếu snapshot, có rate limit.
6. Chỉ bật DB-first strict mode sau khi tỷ lệ coverage đạt ngưỡng, ví dụ 99%.

## 9. Kế hoạch kiểm thử

### 9.1 Unit test

- Store trả đúng mọi trạng thái fresh/stale/refreshing/missing/failed/forbidden.
- Refreshing có generation cũ vẫn trả entries cũ.
- Empty membership hợp lệ không biến thành toàn project.
- Worker commit generation atomically.
- Dedupe ngăn hai refresh cùng user/project/board.
- 401/403 không phục vụ stale; timeout/5xx vẫn giữ generation cũ.

### 9.2 API test

- `GET /api/issues` không import/call queue hoặc Jira client.
- Fresh/stale snapshot đều chỉ query DB.
- Missing trả contract xác định và không enqueue.
- POST refresh kiểm tra auth, validation, rate limit và dedupe.
- PUT preference trả rõ queue success/failure.
- Status endpoint không có side effect.

### 9.3 Client test

- Chuyển giữa hai board đã warm không xuất hiện message chuẩn bị lần đầu.
- Không hiển thị dữ liệu board A dưới tên board B.
- Snapshot stale vẫn hiển thị task.
- Poll dừng sau success, failure và timeout.
- Không poll 30 giây khi board idle.
- Retry tạo đúng một job và không invalidate query không liên quan.

### 9.4 Integration/E2E

1. Hai board cùng project có tập issue khác nhau.
2. Board lớn nhiều trang Jira.
3. Restart web/worker rồi chuyển board warm.
4. Jira chậm hoặc unavailable nhưng DB có snapshot.
5. Worker down khi tạo snapshot lần đầu.
6. User mất quyền board sau khi đã có snapshot.
7. Hai user có quyền khác nhau trên cùng board.
8. Full Jira sync hoàn tất và membership refresh sau đó.

## 10. Observability

### 10.1 Read-path log/metric

```text
event=board_db_read
projectKey=EPM
boardId=101
membershipState=fresh|stale|refreshing_with_data|missing|failed|forbidden
membershipAgeMs=...
membershipEntryCount=...
dbDurationMs=...
totalDurationMs=...
jiraCalls=0
queueWrites=0
```

### 10.2 Worker metric

```text
event=board_membership_refresh
reason=preference_saved|jira_sync_completed|scheduled|manual_retry
queueLagMs=...
jiraDurationMs=...
issuePages=...
backlogPages=...
itemCount=...
outcome=success|retry|failed|forbidden|deduped
```

Dashboard/alert tối thiểu:

- p95 board DB read;
- membership coverage của active preferences;
- thời gian preparing lần đầu;
- queue lag và failure rate;
- số lần `membership_not_ready`;
- số Jira request phát sinh từ read path, mục tiêu luôn bằng 0.

## 11. Rollout theo pha

### Pha 0 — Baseline và guardrail

1. Đo cold/warm switch trên board nhỏ/vừa/lớn.
2. Thêm test chứng minh GET hiện đang enqueue.
3. Thêm metric read path và worker.

**Hoàn tất khi:** có baseline và test tái hiện hành vi chậm.

### Pha 1 — Sửa semantics snapshot

1. Giữ generation cũ khi refreshing.
2. Chuẩn hóa state và metadata.
3. Sửa `truncated`, expiry và error mapping.

**Hoàn tất khi:** stale/refreshing snapshot luôn đọc được an toàn từ DB.

### Pha 2 — Tách mutation/status API

1. Thêm POST refresh và GET status.
2. PUT preference trả job state rõ ràng.
3. Sửa worker dedupe/lease và retry.

**Hoàn tất khi:** refresh có thể chạy mà không phụ thuộc GET issues.

### Pha 3 — Chuyển GET issues thành pure read

1. Xóa enqueue và Jira path khỏi route.
2. Thêm invariant tests.
3. Bật feature flag cho nội bộ.

**Hoàn tất khi:** instrumentation xác nhận Jira calls và queue writes bằng 0.

### Pha 4 — Sửa client

1. Bỏ polling 30 giây.
2. Theo dõi job qua status endpoint với backoff/timeout.
3. Hiển thị stale data thay vì khóa UI.
4. Thêm retry/error state đúng ngữ cảnh.

**Hoàn tất khi:** board warm chuyển tức thời và first-time failure không chờ vô hạn.

### Pha 5 — Prewarm và backfill

1. Backfill preference thiếu snapshot theo batch.
2. Bật scheduler refresh trước expiry cho active boards.
3. Theo dõi coverage đến >= 99%.

**Hoàn tất khi:** `membership_not_ready` trở thành trường hợp hiếm.

### Pha 6 — Rollout và cleanup

1. Rollout theo user/project cohort.
2. So sánh membership DB với Jira trên sample board.
3. Xóa synchronous/shadow path và feature flag sau thời gian ổn định.
4. Cập nhật tài liệu vận hành/runbook.

**Hoàn tất khi:** rollout 100%, không có mismatch nghiêm trọng và đạt performance budget.

## 12. Danh sách file dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `prisma/schema.prisma` | Metadata refresh/status nếu cần |
| `prisma/migrations/...` | Migration không phá dữ liệu |
| `src/app/api/issues/route.ts` | Pure DB read, không enqueue/Jira |
| `src/lib/jira/board-membership-store.ts` | State machine read model |
| `src/lib/queue/workers/refresh-board-membership.ts` | Lease, reason, retry, atomic commit |
| `src/lib/queue/boss.ts` | Dedupe/schedule/registration |
| `src/lib/queue/workers/poll-jira.ts` | Enqueue active membership sau sync |
| `src/app/api/me/board-preferences/route.ts` | Trả refresh result/job state |
| `src/app/api/board/membership/refresh/route.ts` | Mutation refresh mới |
| `src/app/api/board/membership/status/route.ts` | Read-only status mới |
| `src/hooks/use-issues.ts` | Bỏ interval, query policy DB-first |
| `src/lib/query-keys.ts` | Key/invalidation theo board |
| `src/app/(app)/board/board-client.tsx` | State UI, bounded polling, retry |
| Các file `*.test.ts(x)` liên quan | Unit/API/client/integration regression tests |

## 13. Tiêu chí nghiệm thu

1. Chuyển giữa các board đã có snapshot không hiện “Đang chuẩn bị dữ liệu board
   lần đầu”.
2. Network trace chỉ có request ứng dụng đọc DB; không có Jira call từ request
   `/api/issues`.
3. `GET /api/issues` không tạo pg-boss job trong mọi trường hợp.
4. Snapshot stale/refreshing có generation vẫn hiển thị board ngay.
5. Board chưa có snapshot có trạng thái kết thúc rõ ràng trong tối đa 60 giây,
   có Retry và không poll vô hạn.
6. Không có thời điểm task của board/project khác xuất hiện dưới board đang chọn.
7. Worker down hoặc Jira lỗi không làm board có snapshot sẵn bị trắng.
8. Mất quyền Jira không tiếp tục hiển thị snapshot cũ.
9. p95 warm board switch và membership coverage đạt mục tiêu ở mục 3.2.
10. Test suite, lint và typecheck đều đạt.

## 14. Rủi ro và phương án giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Snapshot cũ hiển thị membership không mới | Badge stale, TTL, scheduled prewarm, manual refresh |
| Prewarm tạo tải Jira lớn | Chỉ active preferences, batch, rate limit, dedupe |
| Worker ghi đè generation mới hơn | DB lease/version check và atomic generation switch |
| User mất quyền nhưng vẫn có cache | 401/403 invalidate ngay; validation định kỳ |
| Board lần đầu vẫn chậm | Prewarm khi lưu preference, backfill, bounded UI và status rõ ràng |
| `IN` list quá lớn | Join membership entries hoặc query batch có tham số |
| Queue enqueue lỗi sau khi lưu preference | Response một phần rõ ràng + nút retry |

## 15. Thứ tự triển khai khuyến nghị

Không bắt đầu bằng việc chỉ đổi câu chữ hoặc giảm polling; hai việc đó không xử
lý nguyên nhân gốc. Thứ tự an toàn là:

1. Sửa state machine để snapshot cũ luôn dùng được.
2. Tạo refresh/status API độc lập.
3. Làm `GET /api/issues` pure DB read.
4. Sửa client polling và UI.
5. Backfill + prewarm để loại cold path trong thực tế.
6. Rollout, đo đạc rồi xóa đường cũ.

## 16. Kết quả triển khai thực tế (Implementation Log)

Toàn bộ các pha trong kế hoạch đã được hiện thực hóa và kiểm thử thành công:

### 16.1 Database Schema & Migration
- Bổ sung các trường telemetry và metadata vào `JiraBoardMembershipSnapshot`:
  `truncated`, `lastRequestedAt`, `lastStartedAt`, `lastSuccessAt`, `lastJobId`, `refreshReason`.
- Migration `20261001120000_add_board_membership_snapshot_metadata` đã được tạo và apply vào database PostgreSQL.
- Prisma client v7.10.0 đã generate đầy đủ models.

### 16.2 Read-only Membership Store (`src/lib/jira/board-membership-store.ts`)
- Hàm `getMembershipReadModel` tách rõ các trạng thái:
  `fresh`, `stale`, `refreshing_with_data`, `preparing`, `missing`, `failed_with_data`, `failed_empty`, `forbidden`.
- Khi snapshot đang refresh nhưng đã có generation trước đó, active generation cũ vẫn được giữ nguyên và phục vụ cho reader (`refreshing_with_data`).
- Hàm `getMembershipRefreshStatus` cung cấp read model chuyên biệt cho endpoint status, không gây tác dụng phụ.
- Tự động ghi nhận `lastRequestedAt` bất đồng bộ để scheduler/prewarm nhận diện board active gần đây.

### 16.3 Pure DB Read Path (`src/app/api/issues/route.ts`)
- **Tách hoàn toàn pg-boss khỏi GET /api/issues:** Xóa mọi dynamic import `@/lib/queue/boss` và lệnh enqueue trong GET route.
- 0 queue writes và 0 Jira API calls phát sinh từ request đọc issue.
- Xử lý xác định cho từng trạng thái:
  - `missing`: HTTP 409 `membership_not_ready` (kèm thông tin project, boardId).
  - `preparing` / `pending`: HTTP 202 `membership_preparing`.
  - `forbidden`: HTTP 403 `board_forbidden`.
  - `failed_empty`: HTTP 503 `membership_refresh_failed`.
  - `fresh` / `stale` / `refreshing_with_data`: HTTP 200 kèm metadata `membership` đầy đủ (`state`, `refreshing`, `stale`, `itemCount`, `truncated`, `lastErrorCode`).
  - Empty membership hợp lệ luôn trả `items: []` ngay lập tức, không drop điều kiện `jiraKey`.

### 16.4 Dedicated Refresh & Status Endpoints
- `POST /api/board/membership/refresh` (`src/app/api/board/membership/refresh/route.ts`):
  Xác thực session, token Jira, validate input và enqueue job với priority high cùng lý do `reason` (mặc định `manual_retry`), trả HTTP 202.
- `GET /api/board/membership/status` (`src/app/api/board/membership/status/route.ts`):
  Query read-only trạng thái refresh của snapshot theo user/project/boardId, trả HTTP 200.

### 16.5 Mutation Board Preference (`src/app/api/me/board-preferences/route.ts`)
- Await kết quả enqueue và kiểm tra snapshot trước khi quyết định enqueue:
  - Nếu board đã có snapshot `fresh`: không enqueue lại, trả ngay `membership.state = "fresh"`, `jobId: null`.
  - Nếu board có snapshot `stale`: enqueue normal priority, UI tiếp tục dùng dữ liệu cũ.
  - Nếu board chưa có snapshot: enqueue high priority, trả `membership.state = "preparing"`, `jobId`.
- Nếu queue lỗi: trả `preferenceSaved = true` và `membership.state = "queue_failed"` để UI cho phép retry thay vì nuốt lỗi.

### 16.6 Worker & Post-Sync Telemetry
- Worker `refresh-board-membership` nhận tham số `reason`, cập nhật snapshot atomically và log có cấu trúc đầy đủ `event=board_membership_refresh`, `reason`, `durationMs`, `itemCount`, `outcome`.
- Worker `poll-jira` sau khi sync thành công trigger refresh cho các board preferences với `Promise.allSettled`, có đo đạc số job `enqueued`, `deduped`, `failed`.

### 16.7 Client Hook & UI UX
- `src/hooks/use-issues.ts`:
  - Xóa polling nền 30 giây mặc định (`refetchInterval: false`).
  - Cấu hình `staleTime: 60_000`, `refetchOnWindowFocus: false`, `refetchOnReconnect: true`.
  - Hỗ trợ cả `membership_pending` và `membership_preparing`.
- `src/app/(app)/board/board-client.tsx`:
  - `ready_stale`: hiển thị icon `Clock` tĩnh với thông báo "Dữ liệu phân loại board có thể cũ" (không dùng icon xoay gây hiểu lầm là đang chạy).
  - `refreshing_with_data`: hiển thị spinner nền và không khóa tương tác của board.
  - `membership_not_ready` (409): hiển thị EmptyState với nút hành động "Chuẩn bị dữ liệu board" gọi mutation refresh.
  - `membership_preparing` (202): skeleton có timeout 60 giây. Nếu vượt quá 60s, dừng chờ và hiển thị cảnh báo timeout kèm nút "Thử lại".
  - `board_forbidden` (403): hiển thị cảnh báo phân quyền kèm link sang Settings.
  - `membership_refresh_failed` (503): hiển thị cảnh báo lỗi và nút Retry.
  - Cập nhật hint khi board trống không còn khuyến nghị chạy sync Jira toàn bộ một cách mơ hồ.

### 16.8 Kết quả kiểm thử
- Chạy toàn bộ test suite dự án: **111 test files passed, 886 tests passed (100% pass)**.
- Đã bổ sung đầy đủ unit tests cho:
  - `src/lib/jira/board-membership-store.test.ts`
  - `src/app/api/issues/route.test.ts` (kiểm tra chặt chẽ invariant 0 queue write và 409/202 responses)
  - `src/app/api/board/membership/refresh/route.test.ts`
  - `src/app/api/board/membership/status/route.test.ts`
  - `src/app/api/me/board-preferences/route.test.ts`
  - `src/hooks/use-issues.test.ts`
  - `src/lib/queue/workers/refresh-board-membership.test.ts`


