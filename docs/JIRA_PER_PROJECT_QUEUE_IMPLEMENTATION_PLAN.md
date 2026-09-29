# Kế hoạch triển khai Jira Queue theo từng dự án

**Phiên bản:** 1.0  
**Ngày:** 2026-09-29  
**Trạng thái:** Kế hoạch đề xuất, chưa triển khai code  
**Phạm vi:** Jira polling, pg-boss queue, cursor/freshness, API đồng bộ thủ công, Board UX, health/alerting và kiểm thử  
**Không thuộc phạm vi:** thay đổi Jira workflow, cấu hình webhook trên Jira, thay đổi nghiệp vụ Release/Bulk và tối ưu toàn bộ Issue Cache

## 1. Kết luận và quyết định kiến trúc

Nên chuyển từ một scheduled job đồng bộ tất cả dự án sang các job độc lập theo dự án. Tuy nhiên, không nên tạo tám queue cố định như `poll-jira:CICM`, `poll-jira:EPM`, `poll-jira:MR`. Kiến trúc đề xuất gồm:

- Một queue điều phối nhẹ: `poll-jira-dispatch`.
- Một queue xử lý chung: `poll-jira-project`.
- Mỗi project job bắt buộc có `projectKey` và dùng project key làm khóa cô lập.
- Giới hạn tổng concurrency, mặc định là hai project đồng thời.
- Không cho hai job của cùng một project chạy đồng thời.
- Job thủ công có priority cao hơn job định kỳ.
- Jira webhook tiếp tục là luồng cập nhật gần realtime; polling theo project là lớp reconciliation/fallback.
- Freshness và lỗi được tính theo từng project, không dựa trên một dòng trạng thái tổng dễ bị ghi đè.
- Board theo dõi trạng thái thật của lần đồng bộ, không chờ một timer cố định.

Kiến trúc mục tiêu:

```text
                              +-----------------------------+
Jira webhook ---------------->| process-webhook             |
                              | refresh một issue/comment   |
                              +-----------------------------+

Cron / worker startup         +-----------------------------+
          ------------------->| poll-jira-dispatch          |
                              | fan-out danh sách project   |
                              +-------------+---------------+
                                            |
                  +-------------------------+------------------------+
                  |                         |                        |
                  v                         v                        v
          project=CICM              project=EPM              project=MR
                  |                         |                        |
                  +-------------------------+------------------------+
                                            |
                                            v
                              +-----------------------------+
                              | poll-jira-project           |
                              | bounded concurrency = 2     |
                              | serialize per project       |
                              +-------------+---------------+
                                            |
                                            v
                              IntegrationCursor(scope=KEY)

Board EPM -- manual priority --> poll-jira-project(project=EPM)
          <-- status polling --- IntegrationCursor(scope=EPM)
```

## 2. Mục tiêu

### 2.1 Mục tiêu chức năng

- Người dùng đang xem Board EPM chỉ yêu cầu đồng bộ EPM.
- EPM không phải chờ CICM, EDM hoặc project lớn khác hoàn tất.
- Lỗi của một project không làm thất bại các project còn lại.
- Admin vẫn có thể yêu cầu full sync một project hoặc toàn bộ project.
- Dữ liệu xóa trên Jira chỉ được soft-delete sau một full scan thành công của đúng project.
- Webhook và polling có thể xử lý cùng dữ liệu mà không tạo notification trùng.

### 2.2 Mục tiêu vận hành

- Giới hạn tải Jira API và database bằng concurrency cấu hình được.
- Không tích lũy scheduled job vô hạn khi Jira chậm hoặc worker restart.
- Không thao tác trực tiếp lên bảng nội bộ `pgboss.job` để dọn queue.
- Có metric theo project để nhận biết project chậm, lỗi hoặc bị backlog.
- Health toàn hệ thống phản ánh project cũ nhất/lỗi nhất thay vì lần thành công gần nhất của bất kỳ job nào.

### 2.3 Mục tiêu trải nghiệm

- Nút đồng bộ phản ánh `queued`, `running`, `succeeded`, `failed` thực tế.
- Board tự refresh ngay khi project sync hoàn tất.
- Người dùng nhận được thông báo rõ ràng khi yêu cầu đã được gộp với job đang chạy.
- Không tuyên bố SLA 1–3 giây trước khi có số liệu production/staging.

## 3. Hiện trạng đã xác minh

### 3.1 Những phần đã đúng và nên giữ

- `IntegrationCursor` đã tách theo `integration="jira"` và `scope=projectKey`.
- `syncProject()` đã cô lập JQL, cursor, soft-delete và stats theo project.
- Incremental sync có overlap để giảm nguy cơ bỏ sót issue ở biên thời gian.
- Cursor không advance khi có lỗi issue/comment; các write hiện tại có tính idempotent tương đối.
- `Promise.allSettled` đang giúp một project lỗi không làm mất kết quả project khác trong cùng lần chạy.
- API Board đã gửi `projectKey` khi người dùng đồng bộ project đang xem.
- Manual job đã có priority cao hơn scheduled job trong thay đổi chưa commit hiện tại.
- Jira webhook đã refresh một issue/comment độc lập và poll worker đóng vai trò hội tụ dữ liệu.

### 3.2 Các hạn chế cần xử lý

| Mã | Vấn đề | Tác động |
|---|---|---|
| JQ-001 | Cron tạo một job chứa tất cả project | Một job chậm giữ worker lâu và manual priority không thể preempt job đang active |
| JQ-002 | `poll-jira` worker chưa cấu hình queue-level concurrency | Tách payload thành nhiều job vẫn có thể chạy tuần tự |
| JQ-003 | `recordRun("poll-jira")` là một dòng dùng chung | Khi project chạy song song, job thành công có thể che lỗi của job khác |
| JQ-004 | Board dùng timeout 2,5 giây | Refresh quá sớm hoặc báo xong khi job chưa hoàn tất |
| JQ-005 | Startup xóa trực tiếp job `created` trong `pgboss.job` | Có thể làm mất manual job và phụ thuộc schema nội bộ pg-boss |
| JQ-006 | Health tổng chỉ đọc `worker/poll-jira` | Không biết project nào stale hoặc lỗi |
| JQ-007 | Scheduled job và manual job dùng chung đường “all projects” | Khó dedupe, ưu tiên và theo dõi trạng thái chính xác |
| JQ-008 | Chưa có test trực tiếp cho `poll-jira` | Thay đổi cursor, pagination hoặc queue dễ gây regression |
| JQ-009 | Sync mỗi issue có nhiều database operation tuần tự | Queue split không tự giải quyết N+1 DB cost |
| JQ-010 | Jira request có retry và timeout dài | Không thể bảo đảm mọi project hoàn thành trong 1–3 giây |

### 3.3 Thay đổi chưa commit cần lưu ý

Worktree tại thời điểm lập kế hoạch đang có thay đổi ở các file liên quan, bao gồm:

- `src/lib/queue/boss.ts`: priority manual, giảm retry, stale-job skip, startup sync và SQL xóa queued job.
- `src/lib/queue/workers/poll-jira.ts`: chạy project theo chunk hai và tối ưu comment embedded.
- `src/lib/jira/client.ts`: thêm field `comment` vào Jira search.
- `src/app/(app)/board/board-client.tsx`: tăng timer refresh từ 1,5 lên 2,5 giây và invalidate freshness.
- `.env.example`: cấu hình board columns.

Khi triển khai phải giữ lại các cải tiến hợp lệ, nhưng không được ghi đè hoặc vô tình coi toàn bộ diff này là baseline đã phát hành. Đặc biệt, SQL xóa trực tiếp `pgboss.job` phải được loại bỏ hoặc thay bằng lifecycle API/chính sách queue an toàn.

## 4. Các nguyên tắc thiết kế bắt buộc

### 4.1 Một job chỉ xử lý một project

Project worker không được có semantics “thiếu `projectKey` nghĩa là tất cả project”. `projectKey` phải là trường bắt buộc ở type và được validate trước khi enqueue lẫn trước khi execute.

### 4.2 Cùng project phải được serialize

Hai job EPM không được active đồng thời vì chúng cùng đọc/cập nhật một cursor và cùng chạy full-scan deletion. Các project khác nhau được phép chạy song song trong giới hạn tổng.

### 4.3 Concurrency phải có giới hạn

Mặc định dùng hai project đồng thời. Không dùng `Promise.all()` trên toàn bộ danh sách project. Concurrency phải cấu hình qua env và có upper bound để tránh giá trị cấu hình sai làm quá tải Jira.

### 4.4 Polling không thay thế webhook

Webhook xử lý thay đổi đơn lẻ nhanh hơn và ít tốn API hơn. Polling chịu trách nhiệm:

- Phục hồi event webhook bị mất.
- Đồng bộ lại sau downtime.
- Phát hiện issue bị xóa/không còn thuộc JQL qua full scan.
- Đảm bảo eventual consistency.

### 4.5 Freshness là thuộc tính theo project

Một project vừa sync thành công không được làm toàn hệ thống healthy nếu project khác đã stale. Freshness tổng phải dựa trên project cũ nhất trong danh sách cấu hình.

### 4.6 Không phụ thuộc schema nội bộ của pg-boss

Không dùng `DELETE FROM pgboss.job` trong startup path. Việc cleanup phải dựa trên queue policy, expiration, stale skip, unschedule/cancel API hoặc migration vận hành có kiểm soát.

## 5. Thiết kế queue chi tiết

### 5.1 Danh sách queue

| Queue | Nguồn tạo | Payload | Concurrency | Mục đích |
|---|---|---|---:|---|
| `poll-jira-dispatch` | cron, worker startup, admin all-sync | dispatch request | 1 | Fan-out project jobs |
| `poll-jira-project` | dispatcher, Board, admin | một project | 2 mặc định | Gọi Jira và cập nhật cache |

Không tạo queue name động theo project. Project là dữ liệu của job, không phải topology cố định của queue.

### 5.2 Payload đề xuất

```ts
export type JiraSyncSource = "schedule" | "manual" | "startup" | "admin";

export type PollJiraProjectJobData = {
  projectKey: string;
  full: boolean;
  source: JiraSyncSource;
  requestedBy?: string;
  requestedAt: string;
};

export type PollJiraDispatchJobData = {
  full?: boolean;
  source: "schedule" | "startup" | "admin";
  requestedBy?: string;
  projectKeys?: string[];
};
```

Quy tắc:

- `projectKey` normalize `trim().toUpperCase()` trước khi enqueue.
- `requestedAt` là ISO timestamp do server tạo, không tin giá trị client.
- `full=true` chỉ được tạo từ admin-authorized API hoặc internal dispatcher.
- Scheduled/startup dispatcher mặc định chỉ dùng `jiraProjectList`.
- Admin có thể truyền danh sách project hợp lệ để chạy subset/full sync.

### 5.3 Priority

| Nguồn | Priority đề xuất |
|---|---:|
| Manual từ Board | 10 |
| Admin project sync | 10 |
| Admin all/full dispatch | 5 |
| Startup reconciliation | 2 |
| Scheduled polling | 1 |

Priority chỉ ảnh hưởng job chưa active. Nó không dừng một request Jira đang chạy. Vì vậy project job phải đủ nhỏ để manual job không bị chặn lâu bởi một job “all projects”.

### 5.4 Dedupe và serialization

Mỗi project job dùng:

```ts
singletonKey: projectKey
```

Yêu cầu hành vi:

- Không có hai active job cùng `singletonKey`.
- Cho phép tối đa một yêu cầu kế tiếp trong lúc job hiện tại active để thao tác manual xảy ra giữa một scheduled scan vẫn được chạy lại sau đó.
- Các lần click manual liên tiếp trong cửa sổ ngắn được gộp.
- Scheduled job cũ hơn ngưỡng stale không gọi Jira.
- Failed job không được chặn vĩnh viễn mọi job tương lai của project.

Trước khi chốt queue policy, phải có integration test với đúng pg-boss `12.33.1`. Hai ứng viên:

1. `stately` + `singletonKey`: ưu tiên nếu kiểm chứng được hành vi một queued + một active theo key và retry không tạo overlap.
2. `singleton` + `singletonKey` + singleton window + stale skip: fallback an toàn hơn với behavior hiện tại, nhưng phải theo dõi backlog.

Không dùng `key_strict_fifo` nếu failed job có thể giữ toàn bộ successor vô thời hạn mà chưa có cơ chế recovery rõ ràng.

### 5.5 Retry và expiration

Đề xuất ban đầu:

| Loại | Retry limit | Retry delay | Backoff | Expiration |
|---|---:|---:|---|---:|
| Scheduled incremental | 1 | 15 giây | Có thể bật | 300 giây |
| Manual incremental | 1 | 10–15 giây | Có thể bật | 300 giây |
| Full sync | 1 | 30 giây | Có | Phải đo rồi cấu hình riêng |
| Dispatcher | 2 | 5 giây | Không bắt buộc | 60 giây |

Không retry toàn bộ tám project khi chỉ một project lỗi. Retry thuộc về đúng project job.

### 5.6 Multi-instance worker

Hiện deploy có một worker service. Nếu scale nhiều replica:

- `localConcurrency=2` áp dụng trên mỗi process và có thể làm tổng concurrency tăng theo số replica.
- Cần dùng pg-boss global/group concurrency hoặc cơ chế distributed limit tương đương.
- Same-project serialization phải hoạt động toàn cụm, không chỉ bằng mutex in-memory.
- Connection pool phải đủ cho số job Jira, pg-boss, Prisma và các worker khác.

## 6. Thiết kế worker theo project

### 6.1 API nội bộ

Refactor thành hàm có contract rõ ràng:

```ts
export async function runPollJiraProject(
  data: PollJiraProjectJobData
): Promise<WorkerLog>;
```

`syncProject()` có thể giữ là implementation detail hoặc export cho test. Không còn vòng lặp `jiraProjectList` và không còn `CHUNK_SIZE` trong project worker.

### 6.2 Trình tự xử lý

1. Validate Jira credential.
2. Validate/normalize project key.
3. Upsert cursor và ghi `lastStartedAt`.
4. Đọc cursor hiện tại.
5. Tạo JQL incremental với overlap, hoặc full JQL.
6. Đọc từng page Jira.
7. Với từng issue:
   - Đọc snapshot cũ.
   - Upsert issue và issue links.
   - Notify watcher nếu có thay đổi thực tế.
   - Đồng bộ embedded comments hoặc fallback `getComments()`.
   - Thu thập lỗi theo issue nhưng không làm mất toàn bộ page.
8. Chỉ advance cursor khi không có lỗi item và đã đọc hết page.
9. Với full scan thành công, soft-delete issue không còn xuất hiện trong đúng project.
10. Cập nhật cursor stats và kết thúc job.

### 6.3 Cursor safety

Các invariant phải giữ:

- Incremental failure không advance cursor.
- `newestUpdatedAt` không được nhỏ hơn cursor hợp lệ hiện tại.
- Full scan vượt `MAX_PAGES` không được soft-delete hoặc advance cursor.
- Full scan có bất kỳ item error nào không được soft-delete unseen issues.
- Project A không bao giờ cập nhật cursor/project rows của project B.
- Job retry luôn đọc cursor mới nhất tại thời điểm retry, không tái sử dụng cursor đóng gói trong payload.

### 6.4 Pagination

Offset pagination với `ORDER BY updated ASC, key ASC` hiện tương đối ổn định nhưng vẫn có thể duplicate/skip khi issue thay đổi trong lúc scan. Trong phạm vi triển khai này:

- Giữ overlap cursor hiện tại.
- Giữ writes idempotent.
- Ghi metric page count và scan duration.
- Không đổi pagination API nếu Jira deployment chưa hỗ trợ lựa chọn tốt hơn.

Keyset pagination hoặc snapshot semantics là tối ưu giai đoạn sau, không phải điều kiện để tách queue.

### 6.5 Comment strategy

Giữ tối ưu đang có:

- Nếu Jira search trả đầy đủ comments, dùng embedded comments.
- Nếu `total > comments.length`, gọi `getComments(issue.key)`.
- Nếu `total=0`, không gọi comment endpoint.

Cần test các trường hợp `comment` missing, partial, empty và malformed. Không để lỗi comment của một issue làm crash toàn project, nhưng lỗi đó phải ngăn cursor advance để lần sau có thể hội tụ.

## 7. Dispatcher design

### 7.1 Trách nhiệm

Dispatcher chỉ:

- Resolve project list.
- Normalize và dedupe project key.
- Enqueue project jobs.
- Ghi thống kê `requested`, `queued`, `coalesced`, `rejected`.
- Không gọi Jira hoặc database Issue Cache.

### 7.2 Nguồn danh sách project

- Scheduled/startup: `jiraProjectList`.
- Admin subset: danh sách đã validate.
- Board: không đi qua all-project dispatcher; enqueue trực tiếp một project job.

Project được người dùng thêm thủ công vào preferences nhưng không nằm trong `jiraProjectList` chỉ được sync thủ công, trừ khi sản phẩm quyết định mở rộng nguồn scheduled project trong một thay đổi riêng.

### 7.3 Partial enqueue failure

Nếu enqueue tám project nhưng hai project thất bại:

- Dispatcher ghi rõ hai project thất bại.
- Sáu project đã enqueue vẫn chạy.
- Dispatcher có thể retry phần thất bại, không enqueue lại mù toàn bộ danh sách.
- Không báo dispatcher thành công hoàn toàn nếu có project không được enqueue.

## 8. API đồng bộ thủ công

### 8.1 `POST /api/sync/jira`

Request project:

```json
{
  "projectKey": "EPM",
  "full": false
}
```

Response queued:

```json
{
  "state": "queued",
  "jobId": "...",
  "projectKey": "EPM",
  "full": false,
  "acceptedAt": "2026-09-29T10:00:00.000Z"
}
```

Response khi job cùng project đã queued/running và request được coalesce:

```json
{
  "state": "already_running",
  "jobId": null,
  "projectKey": "EPM",
  "full": false,
  "acceptedAt": "2026-09-29T10:00:00.000Z"
}
```

HTTP status vẫn có thể là `202 Accepted` vì yêu cầu được đáp ứng bởi sync đang hoặc sắp chạy.

### 8.2 Validation và authorization

- Bắt buộc authenticated user.
- Normalize key server-side.
- Kiểm tra format project key.
- Project không nằm trong config chỉ được chấp nhận nếu đã qua cơ chế project validation hiện có.
- `full=true` chỉ dành cho admin.
- Rate-limit thao tác manual theo user và project nếu production ghi nhận click spam.
- Không nhận `priority`, `source`, `requestedBy` từ client.

### 8.3 All-project/admin sync

Nếu không có `projectKey`:

- User thường: không nên ngầm sync toàn bộ; trả validation error hoặc route UI luôn bắt buộc project.
- Admin: tạo dispatcher request rõ ràng và trả batch summary.

Điều này loại bỏ ambiguity “không có key” ở project worker.

### 8.4 Status endpoint

Đề xuất:

```text
GET /api/sync/jira/status?projectKey=EPM&since=<ISO timestamp>
```

Response:

```json
{
  "projectKey": "EPM",
  "state": "queued",
  "lastStartedAt": null,
  "lastSuccessAt": "...",
  "lastErrorAt": null,
  "lastError": null
}
```

State derivation:

- `running`: `lastStartedAt >= since` và chưa có success/error kết thúc sau start.
- `succeeded`: `lastSuccessAt >= since`.
- `failed`: `lastErrorAt >= since` và mới hơn `lastSuccessAt`.
- `queued`: chưa có started/success/error sau `since` nhưng request đã được accepted.
- `unknown`: không thể chứng minh job còn trong queue; UI dừng polling sau timeout và hướng dẫn kiểm tra worker.

Không expose trực tiếp bảng pg-boss qua public API.

## 9. Board UX

### 9.1 State machine

```text
idle
  -> enqueueing
  -> queued/already_running
  -> running
  -> succeeded -> invalidate project queries -> idle
  -> failed    -> show retry action          -> idle
  -> unknown   -> show worker guidance       -> idle
```

### 9.2 Hành vi giao diện

- Disable nút trong lúc request enqueue đang gửi.
- Sau khi accepted, tiếp tục hiển thị trạng thái đồng bộ nhưng không khóa vô hạn.
- Poll status khoảng 1 giây trong 15 giây đầu, sau đó giảm tần suất.
- Khi success, invalidate:
  - issue queries của project;
  - board project/status metadata nếu cần;
  - freshness query.
- Khi failure, hiển thị error đã sanitize và nút thử lại.
- Khi quá thời gian chờ UI, thông báo job vẫn có thể chạy nền; không báo thất bại giả.
- Không dùng `setTimeout(2500)` làm nguồn sự thật.

### 9.3 Nội dung tiếng Việt đề xuất

- Enqueue: `Đang gửi yêu cầu đồng bộ EPM…`
- Queued: `EPM đang chờ đồng bộ.`
- Already running: `EPM đang được đồng bộ. Dữ liệu sẽ tự cập nhật khi hoàn tất.`
- Running: `Đang đồng bộ Jira cho EPM…`
- Success: `Đã đồng bộ EPM.`
- Failure: `Không thể đồng bộ EPM: <lỗi ngắn>`
- Unknown: `Chưa nhận được trạng thái đồng bộ. Hãy kiểm tra worker hoặc thử lại.`

### 9.4 Design-system requirements

Trước khi sửa Board phải đọc:

- `design-system/team-task-web/MASTER.md`.
- Per-page override nếu sau này có file cho Board.

Giữ nguyên các quy tắc của dự án về semantic tokens, dark mode, lucide icons, transition và accessibility.

## 10. Health, freshness và alerting

### 10.1 Nguồn sự thật

Freshness Jira lấy từ:

```text
IntegrationCursor(integration="jira", scope=<projectKey>)
```

Không dùng `worker/poll-jira` làm nguồn duy nhất sau khi project job chạy song song.

### 10.2 Tính freshness tổng

Với danh sách project cấu hình:

- Thiếu cursor của bất kỳ project nào: Jira chưa fresh.
- `lastSuccessAt` cũ hơn SLA ở bất kỳ project nào: Jira chưa fresh.
- `jiraSyncAgeMs`: tuổi của `lastSuccessAt` cũ nhất.
- `staleProjects`: project thiếu hoặc quá SLA.
- `failingProjects`: project có `lastErrorAt > lastSuccessAt`, hoặc có `lastError` chưa được clear bởi lần success sau.

### 10.3 Worker operational rows

Có thể giữ các scope:

- `worker/liveness` cho heartbeat.
- `worker/poll-jira-dispatch` cho sức khỏe dispatcher.
- `worker/poll-jira-project:<KEY>` cho operational stats từng project, nếu cần.

Không để nhiều concurrent job ghi chung một row theo cách last-writer-wins làm mất error.

### 10.4 Alert

Thông báo phải nêu project cụ thể:

```text
Jira sync stale: CICM, MR
Jira sync failed: EPM — Jira GET /rest/api/2/search -> 401
```

Dedupe alert theo tập project lỗi/stale. Khi tất cả phục hồi, gửi một recovery event.

## 11. Observability

### 11.1 Structured log fields

Mỗi project job ghi tối thiểu:

```json
{
  "job": "poll-jira-project",
  "projectKey": "EPM",
  "source": "manual",
  "requestedBy": "<user-id-or-null>",
  "queueLagMs": 120,
  "durationMs": 1830,
  "pages": 1,
  "created": 0,
  "updated": 18,
  "comments": 3,
  "deleted": 0,
  "issueErrors": 0,
  "cursorAdvanced": true,
  "ok": true
}
```

Không log token, Jira response body, comment body, description hoặc dữ liệu cá nhân không cần thiết.

### 11.2 Metrics cần theo dõi

- Queue lag p50/p95 theo source/project.
- Duration p50/p95 theo project và full/incremental.
- Project jobs queued/active/failed/retried/coalesced.
- Số Jira request, timeout, 429 và 5xx.
- Pages/issues/comments mỗi lần sync.
- Cursor age theo project.
- Database pool utilization nếu có metric.
- Scheduled cycle completion time: từ dispatch đến project cuối cùng hoàn tất.

### 11.3 Ngưỡng cảnh báo ban đầu

- Worker heartbeat quá 2 phút.
- Project cursor quá `JIRA_FRESHNESS_MINUTES`.
- Queue lag manual quá 10 giây.
- Scheduled job cũ hơn 2 chu kỳ poll.
- Tỷ lệ Jira 429 tăng rõ rệt sau khi nâng concurrency.

Ngưỡng phải được điều chỉnh sau khi thu được baseline thực tế.

## 12. Kế hoạch thay đổi theo file

### 12.1 `src/lib/queue/workers/poll-jira.ts`

- Đổi type payload thành project-required.
- Đổi entry point thành `runPollJiraProject`.
- Bỏ import và vòng lặp `jiraProjectList` khỏi project worker.
- Bỏ `CHUNK_SIZE` và `Promise.allSettled` ở tầng worker này.
- Giữ `syncProject`, cursor, pagination, comment optimization và soft-delete safety.
- Export helper/type cần thiết cho test.
- Bổ sung structured stats như duration, cursorAdvanced và full/source nếu hợp lý.

### 12.2 `src/lib/queue/boss.ts`

- Đăng ký `poll-jira-dispatch` và `poll-jira-project`.
- Chuyển cron sang dispatcher.
- Thêm hàm `enqueueJiraProjectSync`.
- Thêm hàm `enqueueJiraDispatch`.
- Worker project dùng bounded concurrency.
- Thiết lập project `singletonKey`, priority, retry và expiration.
- Thay startup all-sync bằng startup dispatcher.
- Loại bỏ SQL xóa trực tiếp `pgboss.job`.
- Tách logging/recording theo dispatcher/project để tránh race.
- Có migration/cutover cho schedule cũ.

### 12.3 `src/lib/env.ts`

Thêm:

```ts
jiraPollConcurrency: int("JIRA_POLL_CONCURRENCY", 2)
```

Clamp giá trị ở khoảng an toàn, đề xuất `1..4`. Nếu multi-instance, bổ sung config global concurrency khi cơ chế đã được chọn.

### 12.4 `.env.example`

Thêm mô tả:

```env
# Maximum Jira projects synced concurrently by one worker.
# Start at 2; increase only after monitoring Jira 429s and DB pool usage.
JIRA_POLL_CONCURRENCY=2
```

Không đưa secret hoặc config environment thực tế vào file mẫu.

### 12.5 `src/app/api/sync/jira/route.ts`

- Tách manual project sync khỏi admin all-project dispatch.
- Validate project, role và full mode.
- Server tạo `requestedAt`, `source`, `requestedBy`.
- Trả state `queued` hoặc `already_running` rõ ràng.
- Trả 503 khi queue thực sự unavailable.
- Không coi `jobId=null` là thành công mới nếu không xác định được job đã tồn tại.

### 12.6 `src/app/api/sync/jira/status/route.ts` — mới

- Authenticated read-only endpoint.
- Validate project key và `since`.
- Đọc project IntegrationCursor.
- Derive state ổn định.
- Không expose pg-boss internals hoặc raw error dài.

### 12.7 `src/app/(app)/board/board-client.tsx`

- Thay `syncQueued: boolean` bằng state machine hoặc mutation/query state rõ ràng.
- Bỏ fixed 2,5-second refresh.
- Poll status theo project/request timestamp.
- Invalidate query khi success.
- Hiển thị success/failure/already-running chính xác.
- Reset state khi người dùng đổi project trong lúc sync.
- Bảo đảm request của EPM không làm trạng thái nút MR bị nhầm.

### 12.8 `src/lib/health/worker-health.ts`

- Đọc Jira project cursors cùng worker rows.
- Tính oldest success, missing/stale/failing projects.
- Không phụ thuộc duy nhất vào scope `poll-jira`.
- Mở rộng type `WorkerHealth` theo cách backward-compatible nếu có thể.

### 12.9 `src/lib/queue/workers/health-alert.ts`

- Alert theo stale/failing project.
- Dedupe theo condition key ổn định.
- Recovery khi tập lỗi đã được clear.

### 12.10 `src/app/api/freshness/route.ts` và consumers

- Trả thêm project-level summary nếu UI cần.
- Giữ field cũ trong giai đoạn chuyển tiếp để tránh breaking frontend.
- Đồng bộ định nghĩa freshness với `/api/issues` và health endpoint.

### 12.11 Test files

Đề xuất thêm:

- `src/lib/queue/workers/poll-jira.test.ts`
- `src/lib/queue/jira-queue.test.ts` hoặc integration test tương đương
- `src/app/api/sync/jira/route.test.ts`
- `src/app/api/sync/jira/status/route.test.ts`
- Mở rộng `src/lib/health/worker-health.test.ts`
- Test Board sync state ở vị trí phù hợp với setup frontend hiện có

## 13. Kế hoạch kiểm thử

### 13.1 Unit test worker

| Case | Kỳ vọng |
|---|---|
| Project key hợp lệ | JQL chỉ chứa đúng project |
| Incremental có cursor | JQL dùng overlap time |
| Cursor invalid | Chuyển thành full scan an toàn |
| Jira trả nhiều page | Đọc đủ và advance cursor |
| Vượt `MAX_PAGES` | Throw, không advance cursor, không soft-delete |
| Một issue upsert lỗi | Ghi issue error, không advance cursor |
| Comment lỗi | Issue giữ được nhưng cursor không advance |
| Embedded comments đầy đủ | Không gọi `getComments` |
| Embedded comments partial | Gọi `getComments` đúng một lần |
| Full scan thành công | Soft-delete unseen issue đúng project |
| Full scan có lỗi | Không soft-delete unseen issue |
| Watch notification lỗi | Không làm worker crash nếu policy vẫn là best-effort |

### 13.2 Queue integration test

Chạy với Postgres và pg-boss thật:

- Hai EPM jobs không active đồng thời.
- EPM và CICM có thể active đồng thời khi concurrency là 2.
- Job thứ ba chờ.
- Manual priority được chọn trước scheduled job chưa active.
- Click manual nhiều lần được dedupe/coalesce như thiết kế.
- Retry không tạo overlap cùng project.
- Failed job không khóa project vĩnh viễn.
- Stale scheduled job không gọi Jira.
- Restart worker không xóa manual job hợp lệ.

### 13.3 API test

- Unauthenticated trả 401.
- Invalid project trả 400.
- User thường không được full sync.
- Admin được full sync.
- Queue unavailable trả 503.
- `jobId=null` được map đúng sang coalesced/already-running hoặc lỗi.
- Status endpoint derive queued/running/succeeded/failed chính xác.
- User không thể giả mạo `requestedBy`, `source` hoặc priority.

### 13.4 Health test

- Tám project fresh => healthy.
- Một project missing => stale/degraded.
- Một project quá SLA => jiraSyncAge dùng project cũ nhất.
- Một project error mới hơn success => failing project.
- Project khác success không clear lỗi đó.
- Worker heartbeat down luôn ưu tiên trạng thái down.
- Recovery clear đúng alert key.

### 13.5 UI test

- Click sync gửi đúng selected project.
- Đổi project khi request cũ đang chạy không làm lẫn state.
- Queued/running giữ loading state phù hợp.
- Success invalidate đúng queries.
- Failure cho phép retry.
- Unknown/timeout không báo success giả.
- Reduced motion và accessibility của icon/button được giữ.

### 13.6 Load/smoke test

- Dispatch đủ tám project.
- Concurrency thực tế không vượt config.
- Đo incremental duration cho từng project.
- Chạy trong lúc một project bị Jira timeout.
- Chạy trong lúc Jira trả 429.
- Restart worker giữa một scheduled cycle.
- Bấm manual sync khi scheduled job cùng project đang active.
- Xác nhận database pool không bị cạn.

## 14. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0 — Baseline và test harness

Mục tiêu:

- Ghi duration/queue lag hiện tại theo project.
- Bổ sung test worker cơ bản trước refactor.
- Xác định behavior thật của pg-boss policy với singleton key và retry.

Điều kiện hoàn tất:

- Có số liệu incremental/full sync cho tám project.
- Có integration test chứng minh policy được chọn không chạy trùng project.

### Giai đoạn 1 — Single-project worker

Mục tiêu:

- Tách worker thành một project/job.
- Giữ nguyên logic cursor và cache.
- Chưa tăng concurrency.

Điều kiện hoàn tất:

- Test cursor/full scan/comment pass.
- Chạy project job đơn lẻ cho từng project thành công.

### Giai đoạn 2 — Dispatcher và queue topology

Mục tiêu:

- Thêm dispatcher.
- Fan-out scheduled/startup sync.
- Dùng concurrency 1 ở lần deploy đầu.
- Ngừng schedule cũ an toàn.

Điều kiện hoàn tất:

- Một cron cycle tạo đúng số project job.
- Không còn all-project worker active.
- Không mất manual job khi restart.

### Giai đoạn 3 — Health và observability

Mục tiêu:

- Freshness/error theo project.
- Log và alert đủ để vận hành.

Điều kiện hoàn tất:

- Một project lỗi được hiển thị đúng mà project khác vẫn fresh.
- Health không bị race bởi concurrent jobs.

### Giai đoạn 4 — Manual status UX

Mục tiêu:

- API response/status rõ ràng.
- Board bỏ timer và refresh theo completion thật.

Điều kiện hoàn tất:

- Người dùng thấy đúng queued/running/success/failure.
- Board EPM refresh ngay sau EPM success.

### Giai đoạn 5 — Bật bounded concurrency

Mục tiêu:

- Tăng `JIRA_POLL_CONCURRENCY` từ 1 lên 2.
- Theo dõi Jira/API/DB ít nhất một chu kỳ vận hành đủ dài.

Điều kiện hoàn tất:

- Không tăng đáng kể 429/timeout.
- Manual queue lag giảm.
- Scheduled cycle hoàn tất trong poll interval mục tiêu.

### Giai đoạn 6 — Tối ưu sau đo đạc

Chỉ thực hiện nếu metric chứng minh cần thiết:

- Batch/prefetch database reads để giảm N+1.
- Tối ưu issue-link writes.
- Điều chỉnh page size.
- Tăng concurrency lên 3–4.
- Cải thiện pagination semantics.
- Thêm push/SSE completion event thay cho status polling.

## 15. Cutover và migration

### 15.1 Trước deploy

- Xác nhận không có full sync dài đang chạy.
- Ghi lại queue depth và project cursors.
- Backup database theo runbook hiện có nếu release bao gồm migration khác.
- Chạy typecheck, lint, unit và integration tests.

### 15.2 Trong deploy

- Dừng worker cũ.
- Unschedule `poll-jira` cron cũ bằng API được pg-boss hỗ trợ.
- Đăng ký queue/schedule mới.
- Không chạy SQL delete broad trên `pgboss.job`.
- Khởi động worker mới với concurrency 1.
- Trigger một dispatcher startup reconciliation.

### 15.3 Xử lý legacy jobs

- Liệt kê chính xác job cũ còn queued/active.
- Active job được để hoàn tất hoặc dừng theo runbook nếu thực sự cần.
- Queued legacy job được cancel/expire có kiểm soát.
- Không dùng wildcard hoặc xóa tất cả created jobs vì có thể chứa manual request hợp lệ.

### 15.4 Sau deploy

- Xác nhận đủ cursor của tám project được cập nhật.
- Xác nhận health không báo fresh khi còn project chưa chạy.
- Test manual sync một project nhỏ và một project lớn.
- Theo dõi queue lag, duration, 429, timeout và DB pool.

## 16. Rollback

### 16.1 Rollback nhanh

- Đặt concurrency về 1 nếu Jira/DB quá tải.
- Tắt schedule dispatcher mới nếu fan-out lỗi.
- Rollback application image về phiên bản trước.
- Không xóa project cursors; schema cursor không thay đổi và tương thích với worker cũ.

### 16.2 Điều kiện rollback

- Có bằng chứng hai job cùng project chạy song song.
- Cursor lùi hoặc full scan soft-delete sai project.
- Jira 429/timeout tăng mạnh sau bật concurrency.
- Queue depth tăng liên tục qua nhiều chu kỳ.
- Health báo healthy sai khi project stale.
- Manual sync bị mất hoặc không thể theo dõi kết quả.

### 16.3 Dữ liệu sau rollback

Issue/comment upsert là idempotent nên không cần rollback cache chỉ vì chạy lại job. Nếu phát hiện soft-delete sai, phải phục hồi bằng full sync đúng project sau khi sửa lỗi, không sửa hàng loạt `deletedAt` bằng lệnh broad thiếu điều kiện.

## 17. Tiêu chí nghiệm thu

### 17.1 Correctness

- [ ] Một project job chỉ truy vấn và ghi dữ liệu của đúng project.
- [ ] Không có hai active job cùng project.
- [ ] Cursor không advance khi có item error.
- [ ] Full scan lỗi không soft-delete unseen issues.
- [ ] CICM lỗi không làm EPM/MR thất bại.
- [ ] Retry không làm cursor lùi.

### 17.2 Performance

- [ ] Concurrency không vượt giá trị cấu hình.
- [ ] Manual job không phải chờ một all-project scan.
- [ ] Queue lag manual p95 đạt ngưỡng thống nhất sau baseline.
- [ ] Scheduled cycle hoàn tất trước chu kỳ kế tiếp trong điều kiện Jira bình thường.
- [ ] Jira 429 và timeout không tăng ngoài ngưỡng cho phép.

### 17.3 UX

- [ ] Board gửi đúng selected project.
- [ ] UI hiển thị đúng queued/running/succeeded/failed.
- [ ] Không còn fixed timer làm nguồn xác nhận hoàn tất.
- [ ] Board invalidate và hiển thị dữ liệu mới sau success.
- [ ] Error cho phép retry và không khóa nút vô hạn.

### 17.4 Operations

- [ ] Không còn SQL startup xóa trực tiếp `pgboss.job`.
- [ ] Health tổng dùng project cũ nhất.
- [ ] Alert nêu rõ project stale/lỗi.
- [ ] Log có projectKey, source, queue lag và duration.
- [ ] Worker restart không làm mất manual request hợp lệ.

## 18. Definition of Done

Hạng mục chỉ được coi là hoàn tất khi:

1. Code, unit test và integration test đều pass.
2. Schedule cũ đã được loại bỏ an toàn.
3. Dispatcher fan-out đúng danh sách project.
4. Project worker chạy concurrency 2 mà không overlap cùng project.
5. Cursor/freshness/health hoạt động theo project.
6. Board theo dõi completion thật và không còn timer cố định.
7. Có metric/log đủ để đo SLA thay vì giả định 1–3 giây.
8. Runbook có hướng xử lý backlog, Jira 429, stale project và rollback.

## 19. Thứ tự ưu tiên triển khai

### P0 — Bắt buộc

- Single-project worker.
- Dispatcher fan-out.
- Same-project serialization.
- Bounded concurrency.
- Bỏ SQL delete trực tiếp pg-boss.
- Project-level cursor safety tests.
- Health/freshness theo project.

### P1 — Nên hoàn thành cùng đợt

- Manual status endpoint.
- Board completion polling.
- Structured logs và queue lag metrics.
- Project-specific alert.
- Safe cutover/unschedule legacy cron.

### P2 — Sau khi có metric

- Database batching để giảm N+1.
- Dynamic concurrency hoặc tăng giới hạn.
- SSE/push job completion.
- Pagination cải tiến.
- Dashboard vận hành theo project.

## 20. Ghi chú về kỳ vọng “1–3 giây”

Mốc 1–3 giây có thể đạt với incremental sync ít thay đổi, Jira phản hồi nhanh và comment data đã embedded. Đây không nên là cam kết cứng vì thời gian còn phụ thuộc:

- Số issue thay đổi trong overlap window.
- Số page Jira.
- Số issue cần fallback comment request.
- Jira latency, timeout, retry và rate limiting.
- Số database write và watcher notification.
- Queue lag tại thời điểm người dùng bấm sync.

SLA nên được chốt sau Giai đoạn 0. Các chỉ số phù hợp hơn là:

- Manual queue lag p95.
- Incremental project duration p50/p95.
- Thời gian từ click đến Board thấy dữ liệu mới.
- Tỷ lệ job thành công không retry.

## 21. Kết quả kỳ vọng cuối cùng

Sau khi hoàn tất kế hoạch:

- Mỗi project là một đơn vị retry, quan sát và cô lập lỗi độc lập.
- Người dùng Board EPM không còn phụ thuộc thời gian sync của bảy project khác.
- Hệ thống giữ tải Jira có kiểm soát thay vì chạy đồng thời không giới hạn.
- Webhook cung cấp cập nhật nhanh; polling đảm bảo hội tụ dữ liệu.
- Health và alert phản ánh đúng project có vấn đề.
- Việc tăng tốc được chứng minh bằng metric thực tế, không dựa trên timer hoặc ước lượng.
