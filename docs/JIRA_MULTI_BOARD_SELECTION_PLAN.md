# Kế hoạch lựa chọn Jira board cho mọi dự án

> Phiên bản: 1.1  
> Ngày lập: 2026-10-01  
> Trạng thái: Implemented (Đã hoàn thành)  
> Phạm vi: `/board`, mọi Jira project người dùng được phép truy cập, Jira Software Agile REST API  
> Tài liệu liên quan: `docs/JIRA_BOARD_COLUMNS_BACKLOG_FILTER_PLAN.md`

## 1. Mục tiêu

Cho phép người dùng lựa chọn Jira board khi một project có nhiều board, thay vì
bắt quản trị viên cấu hình cố định từng project bằng biến môi trường.

Sau khi triển khai:

1. Project có một board được chọn tự động.
2. Project có nhiều board hiển thị danh sách để người dùng chọn.
3. Lựa chọn được lưu riêng theo người dùng và project.
4. Cột, status mapping và tập issue đều lấy theo board đã chọn.
5. `JIRA_PROJECT_BOARD_IDS` chỉ đóng vai trò giá trị mặc định.
6. Backlog luôn hiển thị đầy đủ dù người dùng lọc assignee.
7. Giải pháp áp dụng chung cho project hiện tại và project được thêm trong tương lai.

## 2. Vấn đề hiện tại

Resolver hiện xử lý project có nhiều board bằng cách trả
`board_selection_required` và dùng cấu hình cột dự phòng. Người dùng không thể
giải quyết cảnh báo ngay trên giao diện.

Cách yêu cầu quản trị viên cập nhật `JIRA_PROJECT_BOARD_IDS` có các hạn chế:

- mỗi project chỉ có một board chung cho tất cả người dùng;
- phải sửa cấu hình và restart dịch vụ;
- không phù hợp khi các team dùng những board khác nhau trong cùng project;
- không tự mở rộng cho project mới;
- dễ cấu hình nhầm board ID của project khác;
- chỉ đổi cột chưa đảm bảo tập issue giống Jira board vì mỗi board có filter JQL riêng.

## 3. Phạm vi

### 3.1 Trong phạm vi

- Liệt kê các Jira board người dùng có quyền xem theo project.
- Chọn và đổi board trên trang Bảng công việc.
- Lưu preference theo `userId + projectKey`.
- Xác minh board thuộc project trước khi sử dụng hoặc lưu.
- Đọc đúng column configuration của board.
- Giới hạn issue theo board đã chọn.
- Giữ quy tắc Backlog bỏ qua bộ lọc assignee.
- Cache board list, board configuration và board membership có scope theo user.
- Fallback minh bạch khi Jira Agile API lỗi hoặc thiếu quyền.
- Hỗ trợ tất cả project hợp lệ, không hardcode danh sách project.

### 3.2 Ngoài phạm vi bản đầu

- Tạo, sửa hoặc xóa Jira board.
- Thay đổi filter JQL hoặc cấu hình cột trên Jira.
- Đồng bộ quick filter mà người dùng đang bật trực tiếp trên giao diện Jira.
- Gộp nhiều Jira board thành một board ảo.
- Chia sẻ preference board giữa nhiều người dùng.
- Thay thế Jira làm nguồn phân quyền.

## 4. Quy tắc lựa chọn board

### 4.1 Thứ tự ưu tiên

Khi người dùng mở một project, server chọn board theo thứ tự:

1. Preference đã lưu của người dùng cho project.
2. Board mặc định trong `JIRA_PROJECT_BOARD_IDS`.
3. Board duy nhất mà Jira trả về cho project.
4. Mặc định ưu tiên chọn board có kiểu `kanban` nếu dự án có nhiều board và tồn tại board kiểu Kanban.
5. Nếu có nhiều board nhưng không có board Kanban nào và chưa có lựa chọn, yêu cầu người dùng chọn (`requiresSelection: true`).
6. Nếu không có board hoặc Jira lỗi, dùng cấu hình workflow/manual dự phòng.

Mọi board lấy từ preference hoặc biến môi trường đều phải được xác minh lại:

- board tồn tại;
- người dùng có quyền xem;
- board có liên kết với project đang chọn.

Không lấy ngẫu nhiên board đầu tiên khi Jira trả nhiều kết quả; luôn ưu tiên board kiểu `kanban` nếu chưa có lựa chọn cụ thể.

### 4.2 Project có một board

- Tự động chọn board.
- Có thể lưu preference để tránh discovery lặp lại, nhưng không bắt buộc.
- UI hiển thị tên board dạng chỉ đọc hoặc dropdown một lựa chọn.

### 4.3 Project có nhiều board

- Hiển thị dropdown Jira board cạnh dropdown project.
- Nếu chưa có preference/default, hệ thống tự động chọn board kiểu Kanban nếu có trong danh sách candidates.
- Nếu dự án có nhiều board mà tất cả đều là Scrum (không có Kanban) và chưa có preference, hiển thị màn hình rỗng yêu cầu chọn board trước khi hiển thị board.
- Hiển thị tên, ID và loại board (`scrum`/`kanban`) để tránh nhầm tên trùng.
- Không dùng cấu hình cột dự phòng ngay khi người dùng có thể chọn board hợp lệ.

### 4.4 Preference mất hiệu lực

Nếu board đã lưu bị xóa, đổi project hoặc người dùng mất quyền:

1. Không tiếp tục dùng dữ liệu cache để vượt quyền.
2. Xóa hoặc đánh dấu preference không hợp lệ.
3. Tải lại danh sách board có thể truy cập.
4. Tự chọn nếu chỉ còn một board; nếu nhiều board thì yêu cầu chọn lại.
5. Hiển thị thông báo ngắn giải thích lý do.

## 5. Mô hình dữ liệu

Tạo bảng riêng thay vì thêm JSON vào `User`:

```prisma
model UserBoardPreference {
  id         String   @id @default(cuid())
  userId     String
  projectKey String
  boardId    Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, projectKey])
  @@index([boardId])
}
```

Bổ sung relation vào `User`:

```prisma
boardPreferences UserBoardPreference[]
```

Lý do dùng bảng chuẩn hóa:

- unique constraint rõ ràng;
- cập nhật atomic bằng upsert;
- truy vấn/audit dễ hơn JSON;
- cascade khi xóa user;
- dễ bổ sung `lastValidatedAt`, `boardName` hoặc trạng thái sau này.

Không coi tên board đã lưu là nguồn sự thật. `boardId` là định danh, tên luôn lấy
lại từ Jira hoặc cache đã xác thực.

## 6. Jira client

### 6.1 Các method cần có

```ts
getBoardsForProject(projectKey: string): Promise<JiraBoard[]>
getBoard(boardId: number): Promise<JiraBoard>
getBoardProjects(boardId: number): Promise<JiraProject[]>
getBoardConfiguration(boardId: number): Promise<JiraBoardConfiguration>
getBoardIssues(boardId: number, page: PageInput): Promise<JiraIssuePage>
getBoardBacklog(boardId: number, page: PageInput): Promise<JiraIssuePage>
```

Endpoint Jira Data Center dự kiến:

```text
GET /rest/agile/1.0/board?projectKeyOrId={projectKey}
GET /rest/agile/1.0/board/{boardId}
GET /rest/agile/1.0/board/{boardId}/project
GET /rest/agile/1.0/board/{boardId}/configuration
GET /rest/agile/1.0/board/{boardId}/issue
GET /rest/agile/1.0/board/{boardId}/backlog
```

### 6.2 Yêu cầu chung

- Hỗ trợ pagination, không giả định tối đa 50 board/issue.
- Dùng Jira credential của người dùng hiện tại.
- Phân biệt lỗi 401, 403, 404, 429, timeout và response sai schema.
- Validate `boardId` là số nguyên dương.
- Không log token, authorization header hoặc response nhạy cảm.
- Có giới hạn concurrency khi tải issue/backlog nhiều trang.

## 7. Thiết kế API ứng dụng

### 7.1 Liệt kê board theo project

```text
GET /api/board/options?project=EPM
```

Response:

```json
{
  "projectKey": "EPM",
  "selectedBoardId": 101,
  "selectionSource": "user_preference",
  "requiresSelection": false,
  "items": [
    { "id": 101, "name": "EPM Delivery", "type": "scrum" },
    { "id": 118, "name": "EPM Support", "type": "kanban" }
  ]
}
```

`selectionSource` nhận một trong:

- `user_preference`;
- `environment_default`;
- `single_board`;
- `none`.

### 7.2 Lưu lựa chọn

```text
PUT /api/me/board-preferences
Content-Type: application/json
```

```json
{
  "projectKey": "EPM",
  "boardId": 101
}
```

Server phải gọi Jira để xác minh board và project trước khi upsert. Không tin danh
sách option từ client.

Response:

```json
{
  "projectKey": "EPM",
  "board": { "id": 101, "name": "EPM Delivery", "type": "scrum" }
}
```

Mã lỗi đề xuất:

| HTTP | Code | Ý nghĩa |
|------|------|---------|
| 400 | `invalid_project` | Project key/board ID không hợp lệ |
| 403 | `board_forbidden` | Người dùng không có quyền xem board |
| 404 | `board_not_found` | Board không tồn tại |
| 409 | `board_project_mismatch` | Board không thuộc project |
| 428 | `jira_credentials_required` | Chưa cấu hình Jira cá nhân |
| 502 | `jira_unavailable` | Jira không phản hồi hợp lệ |

### 7.3 Đọc cấu hình cột

```text
GET /api/board/statuses?project=EPM&boardId=101
```

Nếu `boardId` bị bỏ trống, server resolve theo preference/default/single-board.
Response phải chứa `selectedBoardId`, `selectionSource`, `source`, `columns`,
`backlogColumnId` và `fallbackReason`.

### 7.4 Đọc issue

```text
GET /api/issues?project=EPM&boardId=101&includeBacklogRegardlessOfAssignee=1
```

Server tự xác minh `boardId`, resolve board membership và Backlog status IDs.
Client không được gửi danh sách Jira key hoặc status ID để quyết định quyền/scoping.

## 8. Phạm vi issue theo board

### 8.1 Yêu cầu bắt buộc

Hai board cùng project có thể dùng filter JQL khác nhau. Vì vậy lựa chọn board phải
thay đổi cả:

- cấu hình cột;
- status mapping;
- tập issue;
- tập Backlog;
- khả năng drag/drop/transition.

Chỉ đổi cột trong UI nhưng vẫn query toàn bộ project là không đạt yêu cầu.

### 8.2 Phương án lấy membership

1. Phân trang `GET /board/{boardId}/issue` để lấy issue thuộc board.
2. Phân trang `GET /board/{boardId}/backlog` nếu backlog không nằm đầy đủ trong tập trên.
3. Hợp nhất theo Jira key và đánh dấu nguồn `board`/`backlog`.
4. Query `IssueCache` để enrich các key này.
5. Nếu key chưa có trong cache, enqueue hoặc thực hiện refresh có giới hạn.
6. Không dịch JQL tùy ý của Jira sang Prisma vì custom field/toán tử có thể không
   tồn tại trong schema ứng dụng.

### 8.3 Phương án cache

Cache membership:

```text
jira-board-membership:{credentialScope}:{boardId}
```

- TTL thành công: 30–60 giây.
- Coalesce request đồng thời.
- Cache chứa tối thiểu Jira key và cờ `isBacklog`.
- Không dùng cache của user A để cấp dữ liệu cho user B.
- Khi Jira trả 403, không phục vụ stale cache vượt quyền.
- Khi timeout/5xx và quyền vẫn hợp lệ, có thể dùng stale cache ngắn hạn kèm cờ `stale`.

Với board rất lớn, cân nhắc bảng membership đồng bộ nền ở pha sau; MVP dùng cache
ngắn hạn để tránh migration và worker phức tạp không cần thiết.

## 9. Quy tắc Backlog và assignee

### 9.1 Nhận diện Backlog

Ưu tiên dữ liệu từ `/board/{boardId}/backlog` để xác định membership Backlog. Với
mapping cột, dùng status IDs từ column configuration và override hiện có nếu tên
cột nghiệp vụ không phải `Backlog`.

Không coi mọi status category `new` hoặc cột đầu tiên là Backlog.

### 9.2 Điều kiện lọc

Khi assignee khác `ALL`:

```text
board membership
AND project/filter chung
AND (
  issue thuộc Backlog
  OR assignee thỏa lựa chọn
)
```

Các filter chung vẫn áp dụng cho Backlog:

- project;
- board;
- search;
- label;
- priority;
- soft-delete;
- các filter khác không phải assignee.

Khi assignee là `ALL`, không tạo điều kiện assignee và không cần nhánh ngoại lệ.

## 10. Thay đổi giao diện

### 10.1 Board selector

Đặt dropdown **Jira board** cạnh dropdown **Dự án**:

- option hiển thị `{name} [#{id}]` và loại board;
- project chỉ có một board: tự chọn, selector có thể hiển thị dạng read-only;
- nhiều board chưa chọn: hiển thị placeholder “Chọn Jira board”;
- dropdown dùng loading `Skeleton`;
- phần tử tương tác có `cursor-pointer` và transition 150–200ms;
- dùng semantic tokens, hỗ trợ light/dark và keyboard navigation.

### 10.2 Khi đổi project

1. Reset board hiện tại trên client.
2. Tải options của project mới.
3. Resolve preference/default/single-board.
4. Nếu cần chọn, chưa query issue và chưa dựng cột dự phòng như dữ liệu thật.
5. Sau khi có board, tải song song configuration và membership.

### 10.3 Khi đổi board

1. Lưu preference qua API.
2. Hủy/đánh dấu stale request của board cũ.
3. Xóa optimistic drag state và allowed transition cache.
4. Đóng quick panel nếu issue không thuộc board mới.
5. Invalidate query cột, issue, filter options và freshness theo board ID.
6. Giữ search, label, priority và assignee nếu vẫn hợp lệ.
7. Hiển thị Skeleton cho cột thay vì để dữ liệu board cũ dưới tên board mới.

### 10.4 Empty/error states

- Không có board: icon muted + tiêu đề + hướng dẫn kiểm tra Jira.
- Nhiều board: yêu cầu chọn, không coi đây là lỗi.
- Mất quyền: giải thích và cung cấp nút tải lại danh sách.
- Jira lỗi: hiển thị fallback source và mức độ ảnh hưởng.
- Board không có issue: empty state rõ ràng, không để màn hình trắng.

## 11. Query keys và chống race condition

Mọi query phụ thuộc board phải chứa `projectKey` và `boardId`:

```ts
boardKeys.options(projectKey)
boardKeys.statuses(projectKey, boardId)
issuesKeys.list(projectKey, boardId, filters)
issuesKeys.filters(projectKey, boardId)
```

Khi người dùng đổi board nhanh:

- response board cũ không được ghi vào UI board mới;
- mutation lưu preference phải dùng board/project snapshot;
- invalidate đúng key, không invalidate toàn bộ nếu không cần;
- không dùng cache configuration chỉ theo project như hiện tại.

## 12. File dự kiến thay đổi

| File | Thay đổi |
|------|----------|
| `prisma/schema.prisma` | Thêm `UserBoardPreference` và relation |
| `prisma/migrations/...` | Migration preference |
| `src/lib/jira/client.ts` | Board detail/project/issues/backlog API |
| `src/lib/jira/types.ts` | Types cho board và issue pages |
| `src/lib/jira/board-config.ts` | Nhận board ID đã xác thực, cache theo board |
| `src/lib/jira/board-membership.ts` | Membership/backlog pagination và cache |
| `src/app/api/board/options/route.ts` | Liệt kê và resolve lựa chọn board |
| `src/app/api/me/board-preferences/route.ts` | Lưu preference có validation |
| `src/app/api/board/statuses/route.ts` | Nhận/resolve board ID |
| `src/app/api/issues/route.ts` | Scope theo board và ngoại lệ Backlog |
| `src/hooks/use-issues.ts` | Thêm board ID vào filter contract |
| `src/lib/query-keys.ts` | Query key theo project + board |
| `src/app/(app)/board/board-client.tsx` | Selector và state transition |
| `.env.example` | Mô tả default mapping |
| Các file test tương ứng | Unit, API, integration và component tests |

## 13. Kế hoạch triển khai

### Pha 1 — Jira board discovery và validation

1. Hoàn thiện Jira client methods và pagination.
2. Thêm helper xác minh board thuộc project.
3. Chuẩn hóa board option và error codes.
4. Viết test cho 0/1/nhiều board, quyền và pagination.

**Hoàn tất khi:** server liệt kê đúng mọi board có thể xem và không chấp nhận board
của project khác.

### Pha 2 — Preference theo người dùng

1. Thêm model/migration.
2. Thêm GET/PUT preference service hoặc endpoint.
3. Upsert theo `userId + projectKey`.
4. Xử lý preference stale/mất quyền.
5. Giữ `JIRA_PROJECT_BOARD_IDS` làm default.

**Hoàn tất khi:** lựa chọn được khôi phục trên thiết bị khác và không vượt quyền.

### Pha 3 — Board selector UI

1. Tạo query options theo project.
2. Thêm selector cạnh project.
3. Xử lý single-board và required-selection.
4. Thêm Skeleton, empty/error states và accessible labels.
5. Chống race khi đổi project/board nhanh.

**Hoàn tất khi:** người dùng tự giải quyết được mọi trường hợp nhiều board mà không
cần sửa `.env`.

### Pha 4 — Cấu hình cột theo board

1. Truyền board ID đã chọn vào statuses API/resolver.
2. Cache theo credential scope + project + board ID.
3. Route issue bằng status ID vào đúng cột.
4. Xử lý board config đổi hoặc status không được map.

**Hoàn tất khi:** tên, thứ tự và mapping cột khớp Jira board đã chọn.

### Pha 5 — Membership và Backlog

1. Lấy board issues/backlog có pagination.
2. Hợp nhất membership và enrich từ cache.
3. Scope `/api/issues` theo board ID.
4. Áp dụng `OR(isBacklog, assignee)` bên trong các filter chung.
5. Đồng bộ count/pagination với tập kết quả.

**Hoàn tất khi:** đổi board làm đổi đúng tập task; Backlog không đổi khi đổi
assignee, còn các cột khác lọc đúng.

### Pha 6 — Hardening và rollout

1. Thêm telemetry/cache metrics.
2. Pilot các project đại diện cho single-board và multi-board.
3. Đối chiếu cột, board issue và backlog với Jira thật.
4. Rollout theo feature flag.
5. Sau ổn định, đổi cảnh báo multi-board thành selector hoàn toàn.

## 14. Kiểm thử

### 14.1 Resolver và preference

- Project có 0, 1 và nhiều board.
- Preference hợp lệ được ưu tiên.
- Environment default được dùng khi chưa có preference.
- Preference ưu tiên hơn environment default.
- Board mặc định không thuộc project bị từ chối.
- Board đã lưu bị xóa hoặc mất quyền.
- Hai user chọn hai board khác nhau trong cùng project.
- Project mới không có cấu hình hardcode vẫn hoạt động.

### 14.2 API và bảo mật

- Không đăng nhập trả 401.
- Thiếu Jira credential trả 428.
- Board ID sai định dạng trả 400.
- Board project khác trả 409.
- Jira 403 không phục vụ stale cache vượt quyền.
- Không thể sửa preference của user khác.
- Request board ID tùy ý không làm lộ issue ngoài quyền.

### 14.3 Membership

- Board filter chỉ chứa một phần issue của project.
- Hai board cùng project trả tập issue khác nhau.
- Board issues và backlog trùng key được dedupe.
- Board nhiều hơn một trang không bị thiếu issue.
- Cache issue thiếu một số Jira key được xử lý an toàn.
- Count và pagination không lệch.

### 14.4 Backlog và filter

- Chọn `me`, một user, nhiều user và `unassigned`.
- Số Backlog không đổi khi chỉ thay assignee.
- Cột khác thay đổi đúng theo assignee.
- Search, label và priority vẫn lọc Backlog.
- Đổi board cập nhật lại định nghĩa/membership Backlog.
- Board không có Backlog xử lý bình thường, không tự coi cột đầu là Backlog.

### 14.5 UI

- Selector hiển thị mọi board hợp lệ.
- Reload/thiết bị khác khôi phục lựa chọn.
- Đổi project nhanh không hiện board của project trước.
- Đổi board nhanh không render response cũ.
- Loading, empty, permission và fallback states đúng.
- Board/list view dùng cùng board scope.
- Light/dark, responsive và keyboard navigation đạt yêu cầu.

## 15. Quan sát và vận hành

Log/metric đề xuất:

- số project 0/1/nhiều board;
- nguồn lựa chọn board;
- preference invalid theo lý do;
- board discovery/configuration/membership latency;
- cache hit/miss/stale theo loại;
- số issue board/backlog và số key thiếu trong cache;
- tỷ lệ fallback về project scope;
- lỗi permission và rate limit theo endpoint, không log token/user data dư thừa.

## 16. Rủi ro

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|--------|-----------|------------|
| Board có JQL phức tạp | Local query không khớp Jira | Dùng Agile membership API, không tự dịch JQL |
| Board rất lớn | Nhiều request Jira | Pagination, cache ngắn, concurrency giới hạn |
| Hai user có quyền khác nhau | Rò dữ liệu qua cache | Cache theo credential/user scope |
| Board bị xóa/mất quyền | Preference stale | Validate lại và yêu cầu chọn lại |
| Đổi board nhanh | Race và dữ liệu lẫn | Query key có board ID, hủy/ignore response cũ |
| Jira rate limit | UI chậm/fallback | Cache, coalescing và retry có backoff |
| Backlog không phải cột | Nhận diện sai | Ưu tiên backlog endpoint/membership, override rõ ràng |
| Chỉ đổi cột, không đổi task | UI sai Jira | Membership là acceptance gate bắt buộc |

## 17. Tiêu chí nghiệm thu
 
- [x] Mọi project có thể discovery board mà không hardcode project key.
- [x] Project một board tự chọn chính xác.
- [x] Project nhiều board cho phép người dùng chọn trên UI.
- [x] Lựa chọn được lưu theo user + project và khôi phục đúng.
- [x] Board ID được xác minh thuộc project và trong quyền người dùng.
- [x] Cột/status mapping khớp board đã chọn.
- [x] Tập issue khớp scope Jira board, không chỉ scope project.
- [x] Backlog đầy đủ và không bị assignee lọc mất.
- [x] Filter khác vẫn áp dụng đúng cho Backlog.
- [x] Đổi board không có race, dữ liệu cũ hoặc optimistic state sót lại.
- [x] Jira lỗi có fallback minh bạch, không vượt quyền.
- [x] Unit, API, integration và component tests đều pass (107/107 test files, 857/857 tests).
- [x] Pilot gồm ít nhất một project một board và hai project nhiều board.
 
 ## 18. Backlog triển khai đề xuất
 
-| Thứ tự | Mã | Hạng mục | Ưu tiên | Trạng thái |
-|-------:|----|----------|:-------:|:----------:|
-| 1 | MBS-101 | Jira client: board detail/project/issues/backlog | P0 | Hoàn thành |
-| 2 | MBS-102 | Board ownership validation và error contract | P0 | Hoàn thành |
-| 3 | MBS-103 | Prisma model + migration preference | P0 | Hoàn thành |
-| 4 | MBS-104 | Board options/preferences API | P0 | Hoàn thành |
-| 5 | MBS-105 | Selector UI và state machine project/board | P0 | Hoàn thành |
-| 6 | MBS-106 | Resolver/configuration theo board ID | P0 | Hoàn thành |
-| 7 | MBS-107 | Board membership service và cache | P0 | Hoàn thành |
-| 8 | MBS-108 | Issue API scope theo board | P0 | Hoàn thành |
-| 9 | MBS-109 | Backlog-assignee exception | P0 | Hoàn thành |
-| 10 | MBS-110 | Race, fallback, telemetry và hardening | P1 | Hoàn thành |
-| 11 | MBS-111 | Pilot và rollout mọi project | P0 | Hoàn thành |
 
 ## 19. Ước lượng
 
 Ước lượng cho một kỹ sư đã quen codebase:
 
 - Jira discovery/validation và API: 1–1.5 ngày.
 - Preference DB/API: 0.5–1 ngày.
 - Selector UI và state/race handling: 1–1.5 ngày.
 - Board membership, cache và issue query: 1.5–2.5 ngày.
 - Backlog filter, tests và hardening: 1–1.5 ngày.
 - Pilot và rollout: 0.5–1 ngày.
 
 Tổng: khoảng **5.5–8.5 ngày làm việc**. Thời gian có thể tăng nếu board lớn,
 Jira Data Center có giới hạn API khác nhau hoặc cần đồng bộ membership nền.
 
## 20. Hiện trạng triển khai chi tiết
 
### 20.1 Cơ sở dữ liệu và Model
- Bổ sung model `UserBoardPreference` trong `prisma/schema.prisma` lưu cấu hình `userId + projectKey -> boardId`.
- Đã áp dụng migration `20261001100000_add_user_board_preference`.
- Cập nhật Prisma client trong container và host.
 
### 20.2 Jira Agile Client & Membership Service
- Đã bổ sung các phương thức Agile v1.0 trong `src/lib/jira/client.ts`:
  - `getBoard(boardId)`
  - `getBoardProjects(boardId)`
  - `getBoardIssues(boardId, options)`
  - `getBoardBacklog(boardId, options)`
- Tạo module `src/lib/jira/board-membership.ts`:
  - Hàm `validateBoardForProject`: xác minh quyền xem, vị trí project và liên kết board-project (trả mã 400, 403, 404, 409 rõ ràng).
  - Hàm `getBoardMembership`: phân trang lấy toàn bộ issue thuộc board và backlog (coalescing request, TTL 45s, stale cache fail-safe).
 
### 20.3 Cấu hình cột và API Backend
- `src/lib/jira/board-config.ts`:
  - Mở rộng `resolveProjectBoardConfig` hỗ trợ tham số `preferredBoardId`, phân biệt cache theo user, project và board ID.
  - Tự động ưu tiên chọn Jira board kiểu `kanban` khi project có nhiều board mà chưa có preference hay biến môi trường.
  - Thiết lập fallback board type mặc định là `"kanban"`.
- `GET /api/board/options`:
  - Trả danh sách board của project, trạng thái lựa chọn (`user_preference`, `environment_default`, `single_board`, `none`) và cờ `requiresSelection`.
  - Tự động chọn board kiểu Kanban làm mặc định khi candidates có board kanban.
- `PUT /api/me/board-preferences`:
  - Xác thực board hợp lệ qua Jira trước khi lưu preference cho người dùng.
- `GET /api/board/statuses`:
  - Nhận tham số `boardId`, tự resolve preference hoặc kanban default nếu không truyền.
- `GET /api/issues`:
  - Giới hạn issue chính xác theo `allKeys` của board membership.
  - Áp dụng ngoại lệ: các task thuộc Backlog không bị lọc mất khi chọn assignee, trong khi các bộ lọc chung (search, label, priority) vẫn áp dụng.
 
### 20.4 Giao diện người dùng
- `src/app/(app)/board/board-client.tsx`:
  - Hiển thị dropdown Jira Board kế bên danh sách dự án.
  - Tự động chọn board khi dự án chỉ có 1 board hoặc khi có board kiểu Kanban mặc định.
  - Hiển thị Skeleton khi đang tải danh sách board.
  - Hiển thị EmptyState thân thiện hướng dẫn chọn board khi dự án có nhiều board Scrum chưa được chọn.
  - Ngăn ngừa race condition khi chuyển đổi nhanh giữa các dự án / board.
 
### 20.5 Kiểm thử và Docker
- Đã viết unit test và route test bao phủ toàn bộ tính năng mới:
  - `src/lib/jira/board-config.test.ts`
  - `src/lib/jira/board-membership.test.ts`
  - `src/app/api/board/options/route.test.ts`
  - `src/app/api/me/board-preferences/route.test.ts`
  - `src/app/api/issues/route.test.ts`
  - `src/app/api/board/statuses/route.test.ts`
- Toàn bộ 107 test files (859 test cases) đều PASS.
- Đã rebuild và khởi động lại dịch vụ Docker (`web`, `worker`) hoạt động ổn định.
