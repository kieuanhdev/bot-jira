# Kế hoạch sửa project động có dữ liệu trên Board nhưng trống ở Phát hành và Thao tác hàng loạt

> Phiên bản: 1.1  
> Ngày cập nhật: 2026-10-01  
> Trạng thái: Completed / Verified  
> Phạm vi: `/bulk`, `/release`, issue query theo project, Jira Fix Version sync và trạng thái dữ liệu project động  
> Tài liệu nền: `docs/JIRA_DYNAMIC_SHARED_PROJECT_CATALOG_PLAN.md`

## 1. Tóm tắt quyết định

Catalog project động đã giải quyết việc chia sẻ danh sách project giữa các tài
khoản, nhưng chưa đảm bảo mỗi tính năng tải dữ liệu đúng theo project được chọn.

Hai lỗi cần sửa độc lập:

1. **Thao tác hàng loạt** đang tải tối đa 1.000 issue của nhiều project rồi lọc
   project ở client. Project có dữ liệu nằm ngoài trang đầu sẽ bị hiển thị rỗng.
2. **Phát hành** không phân biệt project thật sự chưa có Fix Version với lỗi gọi
   Jira/quyền truy cập. API đang trả danh sách rỗng trong cả hai trường hợp.

Giải pháp:

- mọi màn hình chọn một project phải query server trực tiếp theo project đó;
- release sync phải trả kết quả có trạng thái rõ ràng và không nuốt lỗi;
- empty state chỉ được hiển thị sau khi xác nhận sync thành công;
- bổ sung contract/integration test cho project động không nằm trong
  `JIRA_PROJECT_KEYS` để bảo vệ các project thêm trong tương lai.

## 2. Bằng chứng hiện tại với EIM

Kết quả kiểm tra PostgreSQL ngày 2026-10-01:

| Dữ liệu | Trạng thái EIM |
|---|---:|
| Catalog | active, syncEnabled |
| Bootstrap | ready |
| Issue hoạt động | 85 |
| Jira sync cursor | thành công, không có lỗi |
| Workflow statuses | 5 |
| Release trong DB | 0 |
| Issue có Fix Version | 0 |
| User đã chọn EIM | 2 |

Với tài khoản chọn 9 project:

| Chỉ số | Giá trị |
|---|---:|
| Tổng issue trong scope | 7.484 |
| Giới hạn request của `/bulk` | 1.000 |
| Issue EIM trong 1.000 kết quả đầu | 0 |
| Issue EIM thực tế trong DB | 85 |

Điều này chứng minh EIM không bị lỗi issue sync. Dữ liệu bị mất ở bước lấy danh
sách cho UI hàng loạt.

## 3. Nguyên nhân gốc

### 3.1 Thao tác hàng loạt lọc sau phân trang

File: `src/app/(app)/bulk/bulk-client.tsx`

Luồng hiện tại:

```text
useIssues(includeDone=true, limit=1000, assignee=all)
  -> GET /api/issues không truyền project
  -> server lấy tối đa 1.000 issue của toàn bộ project user đã chọn
  -> client chạy issues.filter(issue.projectKey === filterProject)
  -> EIM có thể còn 0 item dù DB có 85 item
```

Đây là lỗi thứ tự toán tử:

```text
Sai:   LIMIT( FILTER_CLIENT( LIMIT_SERVER(all projects, 1000), EIM ) )
Đúng:  PAGE_SERVER( FILTER_SERVER(EIM), limit, offset )
```

Lỗi này không riêng EIM. Bất kỳ project hiện tại hoặc tương lai nào không có
issue trong trang kết quả chung đầu tiên đều bị rỗng.

### 3.2 Release sync che mất trạng thái lỗi

Files:

- `src/app/api/releases/route.ts`
- `src/app/api/releases/sync/route.ts`
- `src/lib/releases/sync.ts`
- `src/app/(app)/release/release-client.tsx`

Luồng hiện tại:

```text
GET /api/releases?projectKey=EIM
  -> DB không có release
  -> gọi syncReleasesFromJira(EIM)
  -> sync có thể:
       a. Jira trả [] vì project chưa có Fix Version
       b. Jira trả 401/403
       c. Jira/network lỗi
       d. sync thành công và ghi Release
  -> lỗi được gom vào result.errors hoặc bị catch bỏ qua
  -> API vẫn query DB và trả items=[]
  -> UI luôn hiểu là “không có dữ liệu”
```

Do đó chưa thể kết luận EIM thật sự không có Fix Version chỉ từ màn hình hiện
tại. DB có 0 release và issue cache cũng chưa có Fix Version, nhưng API cần trả
đúng trạng thái Jira để xác nhận.

### 3.3 Catalog presence chưa đồng nghĩa feature readiness

`JiraProject.bootstrapState=ready` hiện được worker issue sync đánh dấu sau khi
đồng bộ issue/workflow. Trạng thái này chưa phản ánh riêng release metadata hoặc
khả năng truy cập Jira của current user.

Một project có thể đồng thời:

- issue data: ready;
- workflow data: ready;
- release data: empty/error/not_synced;
- user access: allowed/forbidden/unknown.

Không được dùng một cờ `ready` chung để suy ra mọi tính năng đều có dữ liệu.

## 4. Mục tiêu

### 4.1 Mục tiêu chức năng

1. Chọn EIM trong Thao tác hàng loạt phải tải đủ task EIM từ server.
2. Không để giới hạn của các project khác ảnh hưởng kết quả project đang chọn.
3. Hỗ trợ pagination hoặc load-more khi một project có trên 1.000 issue.
4. Phát hành phải phân biệt:
   - sync thành công và có Fix Version;
   - sync thành công nhưng project chưa có Fix Version;
   - thiếu Jira credential;
   - không có quyền project/version;
   - Jira/network lỗi;
   - dữ liệu DB cũ vẫn đang được hiển thị.
5. Project thêm sau phải tự động hoạt động ở Board, Bulk và Release mà không cần
   bổ sung whitelist.
6. Không gọi Jira liên tục mỗi lần render hoặc mỗi refetch thông thường.

### 4.2 Phi mục tiêu

- Không sửa lại toàn bộ kiến trúc catalog project.
- Không tạo Fix Version Jira tự động khi project chưa có version.
- Không tự cấp quyền release cho user.
- Không thay đổi nghiệp vụ bulk preview/execute ngoài việc cấp đúng input data.
- Không chia sẻ Jira permission giữa các user.

## 5. Kiến trúc đích

```text
Project catalog
      |
      +--> Board: GET /api/issues?project=EIM
      |
      +--> Bulk:  GET /api/issues?project=EIM&includeDone=1&limit=...
      |             -> pagination theo đúng EIM
      |
      +--> Release: GET /api/releases?projectKey=EIM
                    -> chỉ đọc Release DB + trả sync metadata
                    -> POST /api/releases/sync?projectKey=EIM để refresh có chủ đích
                    -> phân biệt ready_empty / ready / forbidden / failed
```

Nguyên tắc:

- Filter theo project phải được thực hiện trong `WHERE` trước `LIMIT/OFFSET`.
- GET read path không nên âm thầm gọi Jira và nuốt lỗi.
- Mutation sync trả kết quả typed, kể cả partial failure.
- Empty state là một trạng thái hợp lệ có bằng chứng `lastSuccessAt`, không phải
  fallback chung cho mọi lỗi.

## 6. Kế hoạch sửa Thao tác hàng loạt

### 6.1 Query issue theo project đang chọn

File: `src/app/(app)/bulk/bulk-client.tsx`

Đổi từ:

```ts
useIssues({ includeDone: true, limit: 1000, assignee: "all" })
```

thành logic tương đương:

```ts
useIssues(
  {
    project: filterProject,
    includeDone: true,
    limit: BULK_PAGE_SIZE,
    assignee: "all",
  },
  { enabled: Boolean(filterProject) }
)
```

Yêu cầu:

1. Không request issue trước khi có `filterProject`.
2. Query key phải chứa project để React Query không dùng nhầm cache project cũ.
3. Khi đổi project:
   - reset selection không thuộc project mới;
   - reset filter status/assignee/search nếu chúng không còn hợp lệ;
   - tải lại field metadata và Fix Version theo project mới.
4. `projectIssues` không còn là lớp bảo vệ chính. Có thể giữ filter client như
   invariant phụ, nhưng API response phải chỉ thuộc project đã chọn.
5. Hiển thị Skeleton trong lúc đổi project, không hiển thị empty state của
   project trước đó.

### 6.2 Pagination đúng theo project

Không được coi 1.000 là toàn bộ project.

Hai lựa chọn:

1. Khuyến nghị: dùng `useInfiniteQuery` với `limit` + `offset` hiện có của
   `/api/issues` và nút “Tải thêm”.
2. Pha đầu: trả `total` và cảnh báo/nút tải trang tiếp theo khi
   `items.length < total`.

Bulk selection phải làm rõ hai chế độ:

- chọn thủ công từ các item đã tải;
- chọn toàn bộ theo filter server-side.

Không được ghi “toàn bộ project” nếu client mới tải trang đầu. Nếu chức năng hiện
tại chỉ hỗ trợ chọn item đã tải, UI phải ghi đúng số item đang có.

### 6.3 Endpoint `/api/issues`

File: `src/app/api/issues/route.ts`

Xác nhận và khóa bằng test:

1. `project=EIM` tạo `where.projectKey in ["EIM"]` trước query count/findMany.
2. `total` là tổng số issue EIM khớp filter, không phải độ dài page.
3. `limit/offset` chỉ áp dụng sau toàn bộ filter.
4. Project phải active trong catalog và nằm trong selection/policy cho user.
5. Response không lẫn issue project khác.
6. Project không hợp lệ trả `400/403`, không fallback sang toàn bộ selection.

### 6.4 Filter metadata

File: `src/app/api/issues/filters/route.ts`

- Luôn truyền `project=filterProject` từ Bulk nếu dùng endpoint này.
- Assignee, label, priority và status options phải được tính riêng cho project.
- Không derive options từ page issue đã tải vì page có thể chưa đầy đủ.

## 7. Kế hoạch sửa Phát hành

### 7.1 Tách read và sync

File: `src/app/api/releases/route.ts`

`GET /api/releases` chỉ đọc PostgreSQL và trả metadata trạng thái. Xóa hành vi tự
gọi `syncReleasesFromJira()` khi danh sách DB rỗng.

Lý do:

- GET hiện có side effect khó quan sát;
- refresh/refetch có thể gọi Jira ngoài ý muốn;
- lỗi bị biến thành empty state;
- không kiểm soát được retry/rate limit.

Response đề xuất:

```json
{
  "items": [],
  "summary": {},
  "sync": {
    "state": "never_synced",
    "lastAttemptAt": null,
    "lastSuccessAt": null,
    "lastErrorCode": null,
    "stale": false
  }
}
```

### 7.2 Chuẩn hóa kết quả release sync

Files:

- `src/lib/releases/sync.ts`
- `src/app/api/releases/sync/route.ts`

Kết quả service cần có trạng thái từng project:

```ts
type ProjectReleaseSyncResult = {
  projectKey: string;
  state: "synced" | "empty" | "forbidden" | "auth_required" | "failed";
  versionCount: number;
  created: number;
  updated: number;
  tasksLinked: number;
  errorCode: string | null;
  errorMessage: string | null;
};
```

Quy tắc mapping:

| Kết quả Jira | State | HTTP/API behavior |
|---|---|---|
| 200, có versions | `synced` | Ghi DB, trả success |
| 200, `[]` | `empty` | Success hợp lệ, xác nhận project chưa có Fix Version |
| Không có token | `auth_required` | 428 nếu chỉ sync một project |
| Jira 401 | `auth_required` | 401/428 theo convention hiện tại |
| Jira 403 | `forbidden` | 403 |
| Jira 404 | `failed` hoặc `project_not_found` | 404, không hiển thị empty |
| Timeout/5xx | `failed` | 502/503, retryable |

Khi sync nhiều project, endpoint có thể trả `200` với kết quả từng project và
`partial=true`; khi sync riêng EIM, dùng HTTP status tương ứng để client xử lý.

### 7.3 Lưu trạng thái release sync

Không dùng chung `JiraProject.bootstrapState`. Chọn một trong hai:

#### Phương án khuyến nghị: bảng cursor theo feature

Dùng `IntegrationCursor` với scope rõ ràng, ví dụ:

```text
integration = jira-releases
scope       = EIM
```

Lưu:

- `lastAttemptAt`;
- `lastSuccessAt`;
- `lastErrorAt`;
- `lastError`/error code;
- stats gồm version count, created, updated, tasks linked.

Ưu điểm: tái sử dụng cơ chế health/cursor hiện tại và không làm phình
`JiraProject` bằng trạng thái từng feature.

#### Phương án tối thiểu

Thêm các trường release sync vào `JiraProject`. Chỉ dùng nếu
`IntegrationCursor` không biểu diễn được trạng thái mong muốn.

### 7.4 Đồng bộ và liên kết task

File: `src/lib/releases/sync.ts`

1. Normalize `projectKey` và kiểm tra catalog active.
2. Gọi Jira `getVersions(projectKey)` bằng credential đúng policy.
3. Upsert Release bằng unique logical key `projectKey + jiraVersionId`.
4. Liên kết `ReleaseTask` từ `IssueCache.fixVersionIds/fixVersionNames`.
5. Với version không còn task, xóa liên kết stale như hiện tại.
6. Xác minh schema có unique constraint phù hợp; tránh `findFirst + create` race
   bằng `upsert` nếu Prisma schema cho phép.
7. Không coi “0 task liên kết” là lỗi nếu Jira version tồn tại nhưng chưa có issue.
8. Không ghi `lastSuccessAt` khi bất kỳ bước bắt buộc nào của project thất bại.

### 7.5 Release UI

File: `src/app/(app)/release/release-client.tsx`

Khi chọn EIM:

| State | UI |
|---|---|
| `never_synced` | Empty state “Chưa đồng bộ bản phát hành” + nút Đồng bộ |
| `syncing` | Skeleton, disable nút sync trùng |
| `synced` có items | Hiển thị release cards |
| `empty` | “Dự án EIM chưa có Fix Version trên Jira” |
| `auth_required` | Hướng dẫn cấu hình Jira token |
| `forbidden` | Thông báo thiếu quyền xem version của EIM |
| `failed` | Hiển thị lỗi + nút thử lại |
| stale có DB data | Vẫn hiển thị dữ liệu cũ + warning không chặn |

Sau `POST /api/releases/sync` thành công:

- invalidate query releases của đúng project;
- refetch status;
- thông báo số version được đồng bộ;
- không hiển thị toast “thành công” nếu `result.errors` khác rỗng.

## 8. Project mới trong tương lai

Để lỗi không lặp lại với project mới, thống nhất contract readiness:

```text
Catalog registration
  -> project xuất hiện trong picker
  -> issue bootstrap chạy nền
  -> Board/Bulk đọc issue theo project từ DB
  -> release vẫn là feature state độc lập
     -> never_synced cho đến khi sync release có chủ đích/scheduled
```

Các invariant bắt buộc:

1. Project picker dùng catalog active.
2. Data query luôn gửi project được chọn.
3. Server không fallback sang project khác nếu key hợp lệ nhưng chưa ready.
4. Mỗi feature trả trạng thái readiness riêng.
5. Empty, loading và error là ba trạng thái khác nhau.
6. Project không nằm trong bootstrap env vẫn phải qua toàn bộ integration test.

## 9. Thay đổi file dự kiến

| File | Thay đổi |
|---|---|
| `src/app/(app)/bulk/bulk-client.tsx` | Query issue theo `filterProject`, loading/reset state và pagination |
| `src/hooks/use-issues.ts` | Tái sử dụng hoặc bổ sung infinite query helper theo project |
| `src/app/api/issues/route.ts` | Khóa contract project-before-pagination và lỗi scope rõ ràng |
| `src/app/api/issues/filters/route.ts` | Metadata theo project server-side |
| `src/app/api/releases/route.ts` | GET thuần DB, trả release sync metadata |
| `src/app/api/releases/sync/route.ts` | Typed result và HTTP status đúng theo lỗi |
| `src/lib/releases/sync.ts` | Không nuốt lỗi; kết quả từng project; cursor; upsert an toàn |
| `src/app/(app)/release/release-client.tsx` | UI state empty/error/auth/syncing/stale riêng biệt |
| `src/hooks/use-releases.ts` | Mutation/query contract mới và invalidation theo project |
| `src/lib/query-keys.ts` | Query key bao gồm project và release sync status |
| `prisma/schema.prisma` | Chỉ đổi nếu cần unique key/cursor metadata bổ sung |

## 10. Kế hoạch kiểm thử

### 10.1 Bulk API và UI

1. Tạo 1.200 issue project A mới hơn 85 issue EIM.
2. User chọn cả A và EIM.
3. Chọn EIM trong Bulk.
4. Xác nhận request có `project=EIM`.
5. API trả 85 EIM, không trả issue A.
6. UI hiển thị 85 task thay vì 0.
7. Đổi EIM -> A -> EIM không dùng nhầm cache.
8. Project có 1.500 issue hiển thị `total=1500` và tải được trang tiếp theo.
9. Filter assignee/label/priority chỉ chứa option của project đang chọn.

### 10.2 Release service/API

- Jira trả versions: upsert Release và link task đúng.
- Jira trả mảng rỗng: state `empty`, `lastSuccessAt` được ghi.
- Không có token: `auth_required`, không trả empty giả.
- Jira 403: `forbidden`.
- Jira timeout/500: `failed`, retryable.
- DB đã có releases nhưng refresh lỗi: vẫn trả DB data kèm stale/error metadata.
- Sync riêng project không nuốt `result.errors`.
- Sync nhiều project trả partial result chính xác.

### 10.3 Project động

Tạo project test `DYN` chỉ trong `JiraProject`, không thêm vào
`JIRA_PROJECT_KEYS`:

1. `/api/projects` có DYN.
2. `/api/issues?project=DYN` trả issue DYN.
3. Bulk chọn DYN thấy task.
4. Release sync gọi `getVersions("DYN")`.
5. Release page thể hiện đúng `empty/synced/error`.
6. Không consumer nào yêu cầu sửa env hoặc restart.

### 10.4 Regression

- Board giữ nguyên query và dữ liệu.
- Các project bootstrap cũ vẫn hoạt động.
- Bulk preview/execute chỉ tác động key thuộc project đã chọn.
- Release permission/create-version flow không bị thay đổi ngoài error handling.
- Query cache không trộn dữ liệu giữa các project.

## 11. Trình tự triển khai

### Pha 1 — Sửa Bulk trước

1. Thêm test tái hiện 7.484 issue và EIM bị rơi khỏi top 1.000.
2. Truyền `filterProject` vào `useIssues`.
3. Reset state khi đổi project.
4. Bổ sung total/load-more.
5. Chạy test issue route, bulk UI và bulk operation.

Điều kiện hoàn tất: EIM hiển thị 85 issue ở Bulk đối với cả tài khoản chọn 3 và
9 project.

### Pha 2 — Làm rõ Release state

1. Thêm test chứng minh GET hiện biến Jira error thành empty.
2. Tách Jira sync khỏi GET.
3. Chuẩn hóa result/error code ở service và POST sync.
4. Lưu cursor release theo project.
5. Cập nhật UI state và retry.

Điều kiện hoàn tất: khi EIM không có version, UI xác nhận rõ “chưa có Fix
Version”; nếu Jira lỗi, UI hiển thị lỗi thật thay vì danh sách trống.

### Pha 3 — Future-proof

1. Thêm integration test với `DYN` ngoài env.
2. Rà mọi feature có pattern “fetch all rồi filter client”.
3. Rà mọi GET route có side effect Jira và `catch {}` trả empty.
4. Thêm logging/metrics và cập nhật runbook.

## 12. Quan sát vận hành

Structured logs đề xuất:

```text
event=bulk_issues_query projectKey=EIM total=85 returned=85 offset=0 limit=200
event=jira_release_sync projectKey=EIM state=empty versionCount=0 durationMs=...
event=jira_release_sync projectKey=EIM state=forbidden errorCode=jira_forbidden
```

Metric/cảnh báo:

- bulk response `total > returned` nhưng UI không có khả năng load-more;
- release sync failed theo project;
- project `never_synced` quá ngưỡng nếu release feature được sử dụng;
- số lần GET release trả empty khi last sync chưa từng thành công;
- Jira 401/403/5xx tách riêng.

Không log Jira token, auth header hoặc response Jira đầy đủ.

## 13. Rủi ro và giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Đổi project trong Bulk còn selection project cũ | Reset/validate selection theo prefix và projectKey |
| Project lớn vẫn bị cắt ở 1.000 | Pagination server-side, hiển thị total và load-more |
| Tách sync khỏi GET khiến release ban đầu trống | `never_synced` state + CTA sync rõ ràng; có thể enqueue bootstrap riêng |
| Jira version sync tăng tải | Mutation có chủ đích, TTL/cursor và dedupe |
| User có Board access nhưng không có release permission | Permission state riêng, không suy ra từ issue access |
| Dữ liệu cũ biến mất khi refresh lỗi | Giữ DB data và trả stale warning |

## 14. Tiêu chí nghiệm thu

1. [x] EIM hiển thị đúng 85 issue ở Thao tác hàng loạt với tài khoản đang có 7.484
   issue trong tổng scope (`project: filterProject` được gửi trực tiếp đến server).
2. [x] Request Bulk luôn chứa project đang chọn và response không lẫn project khác (khóa server-side where.projectKey = [project] không fallback).
3. [x] Project có trên một trang issue không bị hiểu nhầm là đã tải toàn bộ (hiển thị `đã tải X/Y task` kèm nút Tải thêm).
4. [x] Release EIM không còn trả empty mơ hồ (GET tách hoàn toàn khỏi mutation sync, trả metadata sync).
5. [x] UI phân biệt ít nhất `never_synced`, `empty`, `ready`, `auth_required`,
   `forbidden` và `failed`.
6. [x] Jira sync error được trả về client và ghi cursor/log, không bị `catch {}` bỏ qua (`IntegrationCursor` scope `projectKey` lưu state và errorCode).
7. [x] Project động `DYN` ngoài env pass Board, Bulk và Release integration test (`src/app/api/dynamic-project-features.test.ts`).
8. [x] Không cần thêm project vào `JIRA_PROJECT_KEYS` để các tính năng hoạt động.
9. [x] Không regression với các project hiện tại (117 test files, 916 tests passed).

## 15. Ưu tiên thực hiện

| Ưu tiên | Hạng mục | Trạng thái | Ghi chú |
|---|---|---|---|
| P0 | Bulk query theo `filterProject` | Đã hoàn thành | Client gửi project scope và server validate nghiêm ngặt |
| P0 | Không nuốt lỗi release sync | Đã hoàn thành | Phân loại lỗi `auth_required`, `forbidden`, `failed` |
| P1 | Release sync status/cursor | Đã hoàn thành | Ghi bảng `IntegrationCursor` với scope = `projectKey` |
| P1 | Bulk pagination/load-more | Đã hoàn thành | Nút Tải thêm và hiển thị loaded/total |
| P1 | Dynamic-project integration test | Đã hoàn thành | Test case dự án động ngoài env pass 100% |
| P2 | Scheduler release metadata | Sẵn sàng | Có thể kích hoạt sync định kỳ qua cursor |

## 16. Báo cáo thực hiện và kết quả nghiệm thu (Execution Report)

Thời gian hoàn thành: 2026-10-01.

### 16.1 Các thay đổi đã thực hiện

1. **Thao tác hàng loạt (`/bulk`)**:
   - `src/app/(app)/bulk/bulk-client.tsx`:
     - Chuyển `filterProject` lên đầu và truyền `project: filterProject` vào `useIssues({ ... }, { enabled: Boolean(filterProject) })`.
     - Thêm xử lý phân trang/tải thêm (`handleLoadMore`) với `fetchIssuesPage` khi `issues.length < totalServerIssues`.
     - Tích hợp endpoint `/api/issues/filters?project=filterProject` để lấy danh sách assignee/label/priority toàn bộ dự án từ server-side.
     - Reset `extraIssues`, `selected`, `filterStatus`, `filterAssignee`, `taskSearch` mỗi khi chuyển đổi dự án để chống nhiễm chéo dữ liệu.
     - Hiển thị Skeleton `isIssuesLoading` khi đang nạp dữ liệu dự án mới, ngăn ngừa chớp empty state cũ.

2. **Endpoint Issues & Filter**:
   - `src/app/api/issues/route.ts`:
     - Kiểm tra nghiêm ngặt `project` query param. Nếu project không nằm trong active catalog thì trả 404; nếu user không có quyền thì trả 403; không fallback sang toàn bộ selection.
     - Giữ nguyên `where.projectKey in [project]` trước khi count và findMany.
   - `src/app/api/issues/filters/route.ts`:
     - Tương tự, khóa chặt `project` scope và tính toán filters trên toàn bộ issue của dự án trong PostgreSQL.

3. **Phát hành (`/release`) & Release Sync**:
   - `src/app/api/releases/route.ts`:
     - Tách rời hoàn toàn đọc dữ liệu DB khỏi Jira mutation sync (xóa auto-sync nuốt lỗi khi DB rỗng).
     - Truy vấn `IntegrationCursor` với `integration = "jira-releases"` và `scope = projectKey`, trả về cấu trúc sync metadata: `{ state, lastAttemptAt, lastSuccessAt, lastErrorCode, lastError, stale }`.
   - `src/lib/releases/sync.ts`:
     - Định nghĩa `ProjectReleaseSyncState = "synced" | "empty" | "forbidden" | "auth_required" | "failed"`.
     - Hàm `syncReleasesFromJira` ghi nhận trạng thái từng dự án vào `IntegrationCursor` và mảng `result.projects`.
     - Phân biệt rõ ràng trường hợp Jira trả mảng rỗng `[]` (project thật sự chưa có Fix Version, ghi `state: "empty"`, `lastSuccessAt`) so với các lỗi gọi Jira (`auth_required`, `forbidden`, `failed`).
   - `src/app/api/releases/sync/route.ts`:
     - Trả mã HTTP status tương ứng cho request sync một dự án: 428 (thiếu credential), 403 (bị từ chối quyền), 502/404 (lỗi kết nối Jira/dự án), 200 (thành công hoặc empty).
   - `src/app/(app)/release/release-client.tsx`:
     - Hiển thị UI trực quan tương ứng với từng trạng thái: `never_synced`, `empty` (thông báo rõ dự án chưa có Fix Version trên Jira), `auth_required` (nút dẫn đến Settings), `forbidden` (báo thiếu quyền), `failed` (hiển thị lỗi và nút Thử lại), `stale` (banner cảnh báo không chặn dữ liệu cũ).
     - Nút đồng bộ báo cáo chính xác số lượng version/task hoặc thông báo dự án chưa có Fix Version.

### 16.2 Kết quả kiểm thử tự động

- **Toàn bộ test suite**: 117 test files passed, 916 tests passed.
- **Các bộ test mới & kiểm thử tích hợp**:
  - `src/lib/releases/sync.test.ts`: 5/5 passed (kiểm tra đầy đủ các kịch bản empty, synced, auth_required, forbidden, failed, cursor updates).
  - `src/app/api/dynamic-project-features.test.ts`: 4/4 passed (kiểm thử tích hợp chéo cho dự án động `DYN` không nằm trong biến môi trường static qua các route Projects, Issues/Bulk, Releases).
  - `src/app/api/issues/route.test.ts`: 10/10 passed.
  - `src/app/api/releases/route.test.ts`: 12/12 passed.
  - `src/app/api/releases/sync/route.test.ts`: 6/6 passed.


