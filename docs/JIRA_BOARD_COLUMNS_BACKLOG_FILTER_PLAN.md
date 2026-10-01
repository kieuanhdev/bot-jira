# Kế hoạch đồng bộ cột Jira Board và luôn hiển thị đầy đủ Backlog

> Phiên bản: 1.0  
> Ngày lập: 2026-10-01  
> Trạng thái: Proposed  
> Phạm vi: `/board`, Jira Software Agile REST API, bộ lọc assignee và cache issue  
> Mục tiêu chính: cột trên ứng dụng khớp Jira board; riêng Backlog không bị giới hạn bởi assignee

## 1. Bối cảnh và vấn đề hiện tại

Trang Bảng công việc hiện không đọc cấu hình cột của Jira board. API
`GET /api/board/statuses` đang gọi:

```text
GET /rest/api/2/project/{projectKey}/statuses
```

Endpoint này trả workflow/status theo issue type, không trả cấu hình board, tên cột,
thứ tự cột hoặc mapping nhiều status vào một cột. Sau đó hệ thống ưu tiên
`JIRA_PROJECT_COLUMNS` trong `.env`, nên cột hiển thị phụ thuộc danh sách thủ công
và có thể lệch Jira.

Ngoài ra, trang board mặc định gửi `assignee=me`. Điều kiện này được áp dụng cho
toàn bộ truy vấn issue, vì vậy task Backlog chưa gán hoặc gán cho người khác biến
mất khi người dùng chọn một assignee.

## 2. Mục tiêu

1. Tên cột và thứ tự cột trên ứng dụng khớp cấu hình của Jira board đã chọn.
2. Mỗi status được đưa vào đúng cột theo mapping của Jira, kể cả khi nhiều status
   cùng thuộc một cột.
3. Khi chọn một hoặc nhiều assignee:
   - cột Backlog vẫn hiển thị tất cả task Backlog trong project;
   - các cột còn lại chỉ hiển thị task của assignee đã chọn;
   - các bộ lọc project, từ khóa, label và priority vẫn áp dụng cho mọi cột.
4. Không làm mất board khi Jira tạm lỗi hoặc tài khoản không có quyền đọc cấu hình.
5. Có khả năng chẩn đoán board đang dùng, nguồn cấu hình và lý do fallback.

## 3. Không nằm trong phạm vi

- Chỉnh sửa cấu hình cột trên Jira từ ứng dụng.
- Tạo, xóa hoặc đổi tên Jira board.
- Thay đổi workflow hoặc status Jira.
- Mô phỏng toàn bộ Scrum backlog như sprint, epic panel, rank và quick filter.
- Bỏ qua các quick filter/JQL riêng của Jira board trong bản đầu.
- Gộp nhiều Jira board thành một board duy nhất.

## 4. Quy tắc nghiệp vụ đã chốt

### 4.1 Board chính của project

Một project có thể thuộc nhiều Jira board. Vì vậy không được âm thầm chọn board
đầu tiên khi có nhiều kết quả.

Nguồn chọn board theo thứ tự ưu tiên:

1. Mapping cấu hình rõ ràng `projectKey -> boardId`.
2. Nếu chưa có mapping và Jira chỉ trả đúng một board có thể xem, dùng board đó.
3. Nếu Jira trả nhiều board mà chưa có mapping, trả trạng thái
   `board_selection_required` và dùng fallback hiện tại; đồng thời log danh sách
   board để quản trị viên bổ sung cấu hình.
4. Nếu không có board hoặc không có quyền xem, dùng fallback workflow/manual.

Đề xuất biến môi trường cho bản đầu:

```text
JIRA_PROJECT_BOARD_IDS=EPM:101,ETM:102,ECM:103
```

Không lưu board ID vào preference cá nhân vì cột cần nhất quán giữa người dùng.
Nếu sau này cần giao diện quản trị, chuyển mapping này sang bảng cấu hình trong DB.

### 4.2 Nguồn cột

Với board đã xác định, gọi:

```text
GET /rest/agile/1.0/board/{boardId}/configuration
```

Đọc `columnConfig.columns` theo đúng thứ tự Jira trả về. Mỗi cột cần giữ:

```ts
type JiraBoardColumn = {
  id: string;
  name: string;
  statusIds: string[];
  statuses: Array<{ id: string; name: string }>;
  isBacklog: boolean;
  isDone: boolean;
};
```

`id` nội bộ phải ổn định, ưu tiên ghép từ `boardId` và vị trí/status ID; không dùng
tên cột làm định danh duy nhất vì tên có thể đổi hoặc trùng.

### 4.3 Xác định cột Backlog

Không được coi mọi status có `statusCategory = new` là Backlog.

Thứ tự xác định:

1. Cột có tên chuẩn hóa bằng `backlog` (không phân biệt hoa thường, bỏ khoảng trắng).
2. Cho phép cấu hình override cột Backlog theo project/board nếu tên Jira là tên
   nghiệp vụ khác, ví dụ `Product Queue`.
3. Nếu không xác định được cột Backlog, không áp dụng ngoại lệ assignee và trả
   `backlogColumnId: null` để UI/telemetry thể hiện rõ.

Đề xuất override tùy chọn:

```text
JIRA_BOARD_BACKLOG_COLUMNS=101:Product Queue,102:Backlog
```

Không suy luận Backlog từ vị trí cột đầu tiên vì `Plan` hoặc `To Do` không đồng
nghĩa với Backlog.

### 4.4 Quy tắc lọc

Khi assignee là `ALL`, hành vi giữ nguyên: lấy tất cả task phù hợp các bộ lọc.

Khi assignee là `me`, một người, nhiều người hoặc `unassigned`, điều kiện logic là:

```text
project và các bộ lọc chung
AND
(
  statusId thuộc cột Backlog
  OR
  assignee thỏa lựa chọn hiện tại
)
```

Các bộ lọc chung gồm:

- project;
- task chưa bị soft-delete;
- từ khóa;
- label;
- priority;
- các bộ lọc chung khác được bổ sung trong tương lai.

Ví dụ chọn `alice`:

```text
(Backlog của tất cả mọi người) OR (các cột khác của alice)
```

Ngoại lệ chỉ áp dụng cho trang board thông qua tham số rõ ràng, không thay đổi
ngầm hành vi của các màn hình khác đang dùng `GET /api/issues`.

## 5. Thiết kế API

### 5.1 Jira client

Bổ sung vào `src/lib/jira/client.ts`:

```ts
getBoardsForProject(projectKey: string)
getBoardConfiguration(boardId: number)
```

Endpoint dự kiến:

```text
GET /rest/agile/1.0/board?projectKeyOrId={projectKey}&startAt=0&maxResults=50
GET /rest/agile/1.0/board/{boardId}/configuration
```

Yêu cầu:

- dùng credential Jira cá nhân như route hiện tại;
- validate `boardId` là số nguyên dương;
- hỗ trợ pagination khi tìm board;
- phân biệt 401/403/404, timeout và response sai schema;
- không ghi token hoặc toàn bộ response Jira vào log.

### 5.2 API cấu hình board

Giữ URL hiện tại để giảm thay đổi client:

```text
GET /api/board/statuses?project=EPM
```

Nhưng đổi response thành contract giàu thông tin hơn:

```json
{
  "projectKey": "EPM",
  "board": {
    "id": 101,
    "name": "EPM Scrum Board",
    "type": "scrum"
  },
  "source": "jira_board",
  "columns": [
    {
      "id": "101:0",
      "name": "Backlog",
      "statusIds": ["10000", "10010"],
      "statuses": [
        { "id": "10000", "name": "Open" },
        { "id": "10010", "name": "Reopened" }
      ],
      "isBacklog": true,
      "isDone": false
    }
  ],
  "backlogColumnId": "101:0",
  "fallbackReason": null
}
```

Nguồn hợp lệ:

- `jira_board`: lấy trực tiếp từ board configuration;
- `manual`: dùng `JIRA_PROJECT_COLUMNS`;
- `workflow`: tự suy ra từ project statuses;
- `default`: ba cột mặc định khi mọi nguồn đều thất bại.

Trong một giai đoạn tương thích, có thể trả thêm `items` và
`statusCategoryMap`; xóa hai field cũ sau khi UI và test đã chuyển hoàn toàn.

### 5.3 API issue

Bổ sung tham số riêng cho board:

```text
GET /api/issues?...&includeBacklogRegardlessOfAssignee=1&backlogStatusIds=10000,10010
```

Tuy nhiên không được tin `backlogStatusIds` do client gửi. Phương án an toàn:

1. Client chỉ gửi `includeBacklogRegardlessOfAssignee=1` và project.
2. Server tự resolve board config theo project hoặc đọc cache server-side.
3. Server lấy danh sách status ID thuộc Backlog từ cấu hình đáng tin cậy.
4. Nếu không resolve được Backlog, áp dụng assignee bình thường.

Để làm được mapping chính xác, `IssueCache` phải có Jira status ID. Hiện cache chủ
yếu dùng tên status và category. Cần bổ sung:

```prisma
statusId String?
```

Sau migration:

- sync Jira ghi `fields.status.id` vào `IssueCache.statusId`;
- incremental sync và webhook cũng cập nhật field này;
- backfill bằng lần full sync tiếp theo;
- trong giai đoạn chuyển tiếp, fallback theo tên status từ board config nếu
  `statusId` chưa có, nhưng phải log metric số issue dùng fallback.

Không nên chỉ dùng tên status lâu dài vì hai status khác ID có thể trùng tên.

### 5.4 Xây dựng Prisma `where`

Tách điều kiện thành các nhóm rõ ràng để tránh `OR` làm mất filter chung:

```ts
const commonWhere = {
  deletedAt: null,
  projectKey: { in: projects },
  // label, priority, status, v.v.
};

const visibilityCondition = {
  OR: [
    { statusId: { in: backlogStatusIds } },
    assigneeCondition,
  ],
};

const where = {
  ...commonWhere,
  AND: [searchCondition, visibilityCondition].filter(Boolean),
};
```

Không đặt `assigneeJira` ở top-level khi bật ngoại lệ Backlog vì nó sẽ triệt tiêu
nhánh `OR` của Backlog.

## 6. Cache và độ tin cậy

Không gọi Jira board configuration ở mỗi lần refetch 30 giây của trang.

Đề xuất cache server-side:

- key: `jira-board-config:{credentialScope}:{projectKey}:{boardId}`;
- TTL thành công: 5 phút;
- TTL lỗi quyền/không tìm thấy: 1 phút;
- request đồng thời cùng key được coalesce;
- không dùng cache của người A để vượt quyền cho người B;
- response API chứa `source` và `fetchedAt` để hỗ trợ chẩn đoán.

Nếu Jira lỗi nhưng có cache thành công còn tương đối mới, dùng stale cache và trả
`stale: true`. Nếu không có cache, dùng fallback theo mục 4.1.

## 7. Thay đổi giao diện

### 7.1 Dựng cột

Trong `src/app/(app)/board/board-client.tsx`:

- dùng `columns` từ response thay cho tự dựng theo status category;
- key cột dùng `column.id`;
- route issue theo `statusId -> columnId`;
- fallback theo tên status chỉ trong giai đoạn migration;
- không tự gom toàn bộ status `done` vào cột Done nếu Jira đã ánh xạ thành nhiều
  cột khác nhau;
- giữ nguyên thứ tự Jira trả về.

### 7.2 Trạng thái hiển thị

- Nếu dùng fallback, hiển thị cảnh báo nhỏ: “Đang dùng cấu hình cột dự phòng”.
- Nếu project có nhiều board chưa được chọn, hiển thị hướng dẫn quản trị cấu hình
  board chính, không giả vờ rằng cột hiện tại khớp Jira.
- Nếu không nhận diện được Backlog, bộ lọc assignee hoạt động bình thường và có
  tooltip giải thích ngoại lệ Backlog chưa khả dụng.
- Loading dùng `Skeleton` hiện có.
- Empty state của cột Backlog phân biệt:
  - thực sự không có task;
  - đang lỗi tải cấu hình;
  - task bị loại bởi bộ lọc chung khác.

### 7.3 Ngữ nghĩa bộ lọc

Đặt ghi chú ngắn cạnh bộ lọc assignee:

```text
Backlog luôn hiển thị toàn bộ task của dự án.
```

Quy tắc này phải áp dụng nhất quán ở cả chế độ board và list. Ở list view có thể
hiển thị các task Backlog của người khác; không được lọc lần hai trên client.

## 8. File dự kiến thay đổi

| File | Thay đổi |
|------|----------|
| `src/lib/env.ts` | Parse mapping project-board và override Backlog |
| `.env.example` | Tài liệu biến môi trường mới |
| `src/lib/jira/client.ts` | Thêm Agile board/configuration methods và types |
| `src/lib/jira/types.ts` hoặc file type tương ứng | Kiểu response board Jira |
| `src/lib/jira/board-config.ts` | Resolve board, chuẩn hóa cột, cache và fallback |
| `src/app/api/board/statuses/route.ts` | Trả cấu hình cột thật từ Jira board |
| `prisma/schema.prisma` | Thêm `IssueCache.statusId` |
| `prisma/migrations/...` | Migration nullable, không khóa rollout |
| `src/lib/issues/cache.ts` | Lưu status ID khi sync |
| Các worker/webhook cập nhật issue | Duy trì `statusId` khi trạng thái đổi |
| `src/app/api/issues/route.ts` | Thêm ngoại lệ assignee cho Backlog |
| `src/hooks/use-issues.ts` | Contract/filter mới |
| `src/app/(app)/board/board-client.tsx` | Dựng/routing cột theo mapping Jira |
| `src/app/(app)/board/lib/board-utils.ts` | Route issue bằng status ID |
| Test liên quan | Unit, route, integration và component tests |

## 9. Kế hoạch triển khai theo pha

### Pha 1 — Contract và Jira board discovery

1. Thêm types cho board list/configuration.
2. Thêm hai method Jira client.
3. Parse `JIRA_PROJECT_BOARD_IDS` và override Backlog.
4. Viết resolver chọn board theo quy tắc mục 4.1.
5. Chuẩn hóa `columnConfig.columns` thành model nội bộ.
6. Thêm cache có scope theo credential/user.

**Hoàn tất khi:** có thể nhập project và nhận đúng board, cột, thứ tự cùng mapping
status; trường hợp 0/1/nhiều board có kết quả xác định.

### Pha 2 — API cột và fallback

1. Refactor `/api/board/statuses` dùng resolver mới.
2. Giữ response cũ tạm thời để tương thích.
3. Thêm `source`, `fallbackReason`, `board` và `backlogColumnId`.
4. Không nuốt lỗi hoàn toàn; log mã lỗi có cấu trúc, không log bí mật.
5. Thêm test quyền, timeout, nhiều board và response Jira sai schema.

**Hoàn tất khi:** API phản ánh đúng Jira board và luôn trả được fallback an toàn.

### Pha 3 — Lưu status ID

1. Thêm migration nullable cho `IssueCache.statusId`.
2. Cập nhật mapper sync đầy đủ và incremental.
3. Cập nhật webhook/live refresh.
4. Chạy full sync để backfill theo từng project.
5. Theo dõi tỷ lệ issue thiếu `statusId`.

**Hoàn tất khi:** project pilot có 100% issue đang hoạt động mang status ID, không
làm gián đoạn đọc dữ liệu cũ.

### Pha 4 — Ngoại lệ lọc Backlog

1. Thêm flag server-side dành cho board.
2. Resolve danh sách status ID của cột Backlog.
3. Xây `OR(backlog, assignee)` bên trong `AND` của filter chung.
4. Giữ nguyên semantics cho `ALL`, nhiều assignee và `unassigned`.
5. Áp dụng cùng query cho `findMany` và `count` để pagination chính xác.
6. Không thay đổi các caller khác của `/api/issues` khi không gửi flag.

**Hoàn tất khi:** chọn bất kỳ assignee nào vẫn thấy toàn bộ Backlog nhưng không
làm lộ task ngoài project hoặc bỏ qua label/priority/search.

### Pha 5 — UI dùng cột thật

1. Chuyển column model sang ID ổn định.
2. Map `statusId -> columnId`.
3. Cập nhật drag/drop và transition để dùng status đích hợp lệ.
4. Bổ sung thông báo ngoại lệ Backlog và trạng thái fallback.
5. Kiểm tra board/list, responsive, light/dark mode và keyboard navigation.

**Hoàn tất khi:** tên, thứ tự và mapping cột khớp board Jira pilot; kéo task không
được gửi tên cột giả thay cho Jira transition/status thật.

### Pha 6 — Rollout và dọn cấu hình cũ

1. Bật feature flag cho một project pilot.
2. So sánh số task từng cột giữa Jira và ứng dụng.
3. Mở rộng lần lượt theo project.
4. Sau khi ổn định, hạ `JIRA_PROJECT_COLUMNS` thành fallback-only.
5. Xóa contract cũ `items/statusCategoryMap` ở một phiên bản sau.

## 10. Kiểm thử

### 10.1 Jira client và resolver

- Một project có đúng một board.
- Project có nhiều board và có mapping board ID.
- Project có nhiều board nhưng thiếu mapping.
- Board ID cấu hình không thuộc project.
- User không có quyền xem board.
- Jira trả 401, 403, 404, 429, 5xx hoặc timeout.
- Board có tên cột trùng nhau.
- Một cột chứa nhiều status.
- Một status không được map vào cột nào.
- Backlog tên chuẩn và Backlog dùng tên override.
- Board không có cột Backlog.

### 10.2 API issue

- `assignee=ALL`: không tạo điều kiện assignee.
- `assignee=me`: toàn bộ Backlog + cột khác của chính mình.
- Một assignee cụ thể: toàn bộ Backlog + cột khác của người đó.
- Nhiều assignee: toàn bộ Backlog + union assignee ở cột khác.
- `unassigned`: toàn bộ Backlog + task chưa gán ở cột khác.
- Search, label và priority vẫn giới hạn cả Backlog.
- Không trả issue project khác.
- `findMany` và `count` dùng cùng điều kiện.
- Không có Backlog config: hành vi assignee cũ được giữ nguyên.
- Issue chưa backfill `statusId`: fallback tên status hoạt động có kiểm soát.

### 10.3 UI

- Tên và thứ tự cột giống Jira fixture.
- Task có status ID được đặt đúng cột.
- Đổi assignee không làm số lượng Backlog thay đổi.
- Đổi label/priority/search có thể làm Backlog thay đổi.
- List view và board view có cùng tập issue.
- Pagination không tạo trùng hoặc mất task.
- Drag/drop qua cột có nhiều status xử lý status đích rõ ràng.
- Hiển thị fallback/permission error đúng.
- Loading dùng Skeleton; empty state không để màn hình trống.

### 10.4 Kiểm thử nghiệm thu với Jira thật

Với mỗi project pilot:

1. Ghi lại board ID và tên board.
2. So sánh từng cột: tên, thứ tự và status mapping.
3. Đếm task Backlog trên Jira và ứng dụng khi assignee là `ALL`.
4. Chọn ít nhất hai assignee khác nhau; số Backlog phải giữ nguyên.
5. Số task các cột khác phải thay đổi theo assignee.
6. Thử task unassigned trong Backlog.
7. Thử đổi status trên Jira, sync lại và xác nhận task chuyển đúng cột.

## 11. Quan sát và vận hành

Log có cấu trúc:

- `projectKey`, `boardId`, `source`;
- thời gian gọi Jira;
- cache hit/miss/stale;
- `fallbackReason`;
- số cột, số status mapped và số issue thiếu status ID.

Metric đề xuất:

- tỷ lệ resolve board thành công;
- tỷ lệ fallback theo project;
- latency Jira board API;
- số project có nhiều board nhưng thiếu mapping;
- số issue không map được vào cột;
- số issue đang fallback từ status name vì thiếu status ID.

Không ghi token, authorization header hoặc payload Jira chứa dữ liệu người dùng
không cần thiết.

## 12. Rủi ro và giảm thiểu

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|--------|-----------|------------|
| Một project có nhiều board | Chọn sai cột | Mapping board ID bắt buộc khi mơ hồ |
| User không có quyền board | Không đọc được cấu hình | Cache có scope và fallback minh bạch |
| Tên Backlog khác chuẩn | Không áp dụng ngoại lệ | Override theo board, không đoán theo category |
| Cache issue thiếu status ID | Route sai cột | Migration nullable, full sync, fallback tạm theo tên |
| OR assignee viết sai | Bỏ qua filter chung hoặc rò project | Nhóm `AND(common, OR(backlog, assignee))` và route tests |
| Board config đổi trên Jira | UI chậm cập nhật | TTL 5 phút và invalidation khi sync thủ công |
| Cột có nhiều status | Drag/drop không biết status đích | Chọn status đích được cấu hình/transition hợp lệ |
| Agile API không có trên instance | Không thể lấy cột thật | Phát hiện capability, dùng fallback hiện tại |

## 13. Tiêu chí nghiệm thu

- [ ] Mỗi project được cấu hình có board ID rõ ràng hoặc chỉ có đúng một board.
- [ ] Tên và thứ tự cột khớp Jira board.
- [ ] Mapping status-to-column dùng status ID, không dựa chủ yếu vào category.
- [ ] Backlog được nhận diện rõ ràng hoặc có override.
- [ ] Chọn assignee không làm mất task Backlog của người khác/chưa gán.
- [ ] Các cột ngoài Backlog vẫn lọc đúng assignee.
- [ ] Search, label, priority và project vẫn áp dụng cho Backlog.
- [ ] Count và pagination chính xác.
- [ ] Jira lỗi/quyền thiếu có fallback cùng thông báo rõ ràng.
- [ ] Test unit, route và integration liên quan đều pass.
- [ ] Pilot đối chiếu số liệu thành công trên Jira thật trước khi mở rộng.

## 14. Thứ tự backlog đề xuất

| Thứ tự | Mã | Hạng mục | Ưu tiên |
|-------:|----|----------|:-------:|
| 1 | JB-101 | Jira Agile board client và types | P0 |
| 2 | JB-102 | Mapping project-board và resolver nhiều board | P0 |
| 3 | JB-103 | Chuẩn hóa column/status mapping và nhận diện Backlog | P0 |
| 4 | JB-104 | Refactor API `/api/board/statuses` | P0 |
| 5 | JB-105 | Migration và đồng bộ `IssueCache.statusId` | P0 |
| 6 | JB-106 | Query `OR(backlog, assignee)` an toàn | P0 |
| 7 | JB-107 | UI route task theo status ID/cột Jira | P0 |
| 8 | JB-108 | UX fallback, cảnh báo và mô tả bộ lọc | P1 |
| 9 | JB-109 | Cache, telemetry và diagnostics | P1 |
| 10 | JB-110 | Pilot, đối chiếu và rollout từng project | P0 |

## 15. Quyết định cần xác nhận trước khi triển khai

1. Board ID chính của từng project là gì?
2. Nếu board không có cột tên `Backlog`, cột nghiệp vụ nào được coi là Backlog?
3. Ngoại lệ Backlog chỉ bỏ qua assignee, hay cũng bỏ qua label/priority/search?
   Kế hoạch này mặc định **chỉ bỏ qua assignee**.
4. Với cột Jira chứa nhiều status, khi kéo task vào cột sẽ chọn status đích nào?
   Đề xuất dùng transition hợp lệ đầu tiên theo thứ tự status của cột và yêu cầu
   người dùng chọn nếu có nhiều transition hợp lệ ngang nhau.

## 16. Ước lượng

Ước lượng cho một kỹ sư đã quen codebase:

- Pha 1–2: 1–1.5 ngày.
- Pha 3: 0.5–1 ngày, chưa tính thời gian full sync.
- Pha 4: 0.5–1 ngày.
- Pha 5: 1–1.5 ngày.
- Test, pilot và hardening: 1–1.5 ngày.

Tổng: khoảng **4–6 ngày làm việc**, tùy số board/project, quyền Jira thực tế và
độ phức tạp của transition khi một cột chứa nhiều status.
