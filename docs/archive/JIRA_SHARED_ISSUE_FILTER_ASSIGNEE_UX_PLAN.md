# Kế hoạch chuẩn hóa bộ lọc Issue và UX xem nhanh theo người phụ trách

> Trạng thái: Đã hoàn thành (Implemented & Verified)  
> Ngày hoàn thành: 2026-10-01  
> Phạm vi chính: `/board`, `/bulk`, `GET /api/issues`,
> `GET /api/issues/filters`, `POST /api/issues/bulk` và các shared filter components  
> Phạm vi mở rộng: `/stale`, `/release`, `/notifications`, `/bulk/create`  
> Chuẩn thiết kế: `design-system/team-task-web/MASTER.md` và override
> `design-system/team-task-web/pages/board.md`

## 1. Mục tiêu
sta
Kế hoạch này giải quyết đồng thời ba nhu cầu:

1. Sửa hành vi không rõ ràng của dấu `x` trong bộ lọc người phụ trách ở Board.
2. Sau khi chọn một nhóm người, cho phép chuyển nhanh giữa từng người mà không
   phải mở lại dropdown và không làm mất nhóm đã chọn.
3. Chuẩn hóa bộ lọc task dùng chung giữa Board, Bulk và các màn hình liên quan,
   đồng thời giữ lại những filter riêng theo từng domain.

Kết quả mong muốn:

- Người dùng hiểu rõ thao tác nào mở danh sách, thao tác nào xóa phạm vi lọc.
- Board vẫn giữ mặc định là góc nhìn cá nhân `Của tôi`.
- Một nhóm người đã chọn được giữ ổn định trong lúc xem nhanh từng thành viên.
- Board và Bulk hiểu giống nhau về `Tất cả`, `Của tôi`, `Chưa gán` và nhiều người.
- Bulk áp dụng “Tất cả khớp bộ lọc” trên toàn bộ dữ liệu phù hợp trong database,
  không chỉ trên tối đa 1.000 task đã được tải về client.
- Shared code chuẩn hóa state, query serialization, active count, reset và UI;
  không ép mọi màn hình phải có cùng một danh sách filter.

## 2. Không nằm trong phạm vi

- Không thay đổi Jira workflow hay transition.
- Không thay đổi logic drag-and-drop của Board.
- Không biến Release/Notifications thành màn hình lọc issue.
- Không lưu filter preset cá nhân trong giai đoạn đầu.
- Không đồng bộ bộ lọc sang Jira JQL hoặc Jira quick filter.
- Không thay đổi quyền truy cập project hiện hành.
- Không thay đổi business action của Bulk ngoài cách xác định tập task đầu vào.

## 3. Hiện trạng mã nguồn

### 3.1 Board

File chính: `src/app/(app)/board/board-client.tsx`.

State filter hiện tại:

```ts
const [q, setQ] = useState("");
const [label, setLabel] = useState("");
const [priority, setPriority] = useState("");
const [selectedAssignees, setSelectedAssignees] = useState<string[]>(["me"]);
```

Board hiện có:

- Search theo key/summary.
- Assignee multi-select.
- Một label.
- Một priority.
- Mặc định `selectedAssignees = ["me"]`.
- Reset toàn bộ filter đưa assignee về `["me"]`.
- Assignee `ALL` được gửi sang API dưới dạng không giới hạn người phụ trách.

Điểm tốt cần giữ:

- Board dùng server-side filtering qua `GET /api/issues`.
- API đã hiểu nhiều assignee theo phép OR.
- Danh sách filter option được lấy riêng từ `GET /api/issues/filters`.
- Query key bao gồm serialized filter nên cache của TanStack Query được tách đúng.

### 3.2 Assignee multi-select

File: `src/components/assignee-multi-select.tsx`.

Hiện trigger dropdown là một `Button`, nhưng dấu `x` lại là một phần tử
`span role="button"` nằm bên trong trigger đó:

```tsx
<DropdownMenuTrigger asChild>
  <Button>
    ...
    <span role="button" onClick={clearAssigneeFilter}>
      <X />
    </span>
  </Button>
</DropdownMenuTrigger>
```

Vấn đề:

- Interactive element bị lồng trong interactive element.
- Dropdown trigger có thể nhận `pointerdown` trước khi `onClick` của dấu `x`
  chạy, tạo cảm giác nhấn `x` nhưng menu vẫn mở.
- Semantics và thứ tự focus không rõ cho screen reader/keyboard.
- Dấu `x` ghi “xóa” nhưng thực tế chuyển sang `ALL`, trong khi nút reset toàn
  Board đưa về `me`.
- Trigger chỉ hiển thị tên đầu tiên và `+N`; không có đường chuyển nhanh qua từng
  người đã chọn.

### 3.3 Bulk update

File chính: `src/app/(app)/bulk/bulk-client.tsx`.

Filter hiện tại:

```ts
const [filterStatus, setFilterStatus] = useState("");
const [filterAssignee, setFilterAssignee] = useState("");
const [taskSearch, setTaskSearch] = useState("");
```

Bulk hiện:

- Fetch issue bằng `assignee=all`, `includeDone=true`, giới hạn từng page 1.000.
- Lọc search/status/assignee ở client trên các issue đã tải.
- Assignee chỉ chọn được một giá trị.
- Chưa đưa label và priority vào filter dù endpoint options đã trả hai nhóm này.
- Dùng token `ME`, `UNASSIGNED`, trong khi Board dùng `me`, `unassigned`.
- Chế độ `selectionMode === "filter"` tạo danh sách key bằng:

```ts
filteredIssues.map((issue) => issue.jiraKey)
```

Hệ quả: “Tất cả khớp bộ lọc” hiện chỉ có nghĩa là tất cả task khớp trong dữ
liệu đã tải vào browser. Với project lớn hoặc người dùng chưa nhấn “Tải thêm”,
tập thao tác có thể thiếu task.

### 3.4 Shared FilterBar

File: `src/components/shared/filter-bar.tsx`.

`FilterBar` hiện chỉ là layout primitive:

- Sắp xếp children/actions.
- Nhận `activeCount`.
- Hiển thị nút reset.

Component không và không nên sở hữu business state. Tuy nhiên dự án đang thiếu
một tầng domain component cho issue filter, khiến mỗi page tự lặp:

- Kiểu dữ liệu filter.
- Token đặc biệt.
- Default state.
- Active count.
- Parse/serialize URL.
- Reset semantics.
- Option loading.

### 3.5 API issue

`GET /api/issues` hiện hỗ trợ:

- Project/project list.
- Assignee đơn hoặc nhiều giá trị comma-separated.
- `me`, `all`, `unassigned`/`none`.
- Search, status, priority, label.
- Include done, limit, offset.

Hạn chế cần xử lý:

- Status, priority và label đang là single-value.
- Contract array chưa được biểu diễn đầy đủ trong `BoardFilters`.
- Alias/canonical token đang không được dùng thống nhất giữa các client.

`GET /api/issues/filters` hiện trả:

```ts
{
  assignees: string[];
  labels: string[];
  priorities: string[];
}
```

Endpoint chưa trả status và chưa có facet count.

## 4. Nguyên tắc UX

### 4.1 Một control chỉ có một mục tiêu chính

- Trigger assignee chỉ mở/đóng danh sách.
- Clear assignee là một button riêng.
- Quick chip chỉ chuyển góc nhìn.
- Việc thêm/bỏ thành viên nằm trong selector hoặc remove action rõ ràng.

### 4.2 Không làm mất ngữ cảnh khi xem nhanh

Danh sách người đã chọn và người đang được xem là hai khái niệm khác nhau:

- **Roster**: nhóm người người dùng muốn theo dõi.
- **View**: đang xem tất cả roster hay một người trong roster.

Không dùng cùng một state cho hai khái niệm này.

### 4.3 Reset phải có đích rõ ràng

- Clear riêng assignee: chuyển assignee scope sang `Tất cả`.
- Reset toàn bộ Board: trở về default Board là `Của tôi`.
- Reset toàn bộ Bulk: trở về không giới hạn assignee.
- Tooltip và accessible label phải mô tả đích, không chỉ ghi chung chung “Xóa”.

### 4.4 Đồng nhất không có nghĩa là giống hệt

- Các màn issue-based chia sẻ filter model và controls.
- Filter nghiệp vụ đặc thù vẫn nằm trong domain tương ứng.
- Release giữ release state; Stale giữ reason/severity; Notifications giữ
  category/unread/severity.

## 5. UX đích cho người phụ trách

### 5.1 Split control

Desktop:

```text
┌──────────────────────────────────┬─────┐
│ 👥 Bạn, an.nguyen             +2 ▾ │  ×  │
└──────────────────────────────────┴─────┘
```

- Phần trái là `<button aria-haspopup="menu">`.
- Phần phải là `<button aria-label="Hiển thị tất cả người phụ trách">`.
- Hai button có focus ring độc lập.
- Có thể dùng chung wrapper border/radius để vẫn giống một control.
- Nút clear không render khi assignee scope là All.
- Click/pointerdown trên clear không thể kích hoạt dropdown.

Mobile:

- Trigger chiếm chiều rộng khả dụng.
- Tên được truncate.
- Badge `+N` luôn nhìn thấy.
- Clear có hit target tối thiểu 36x36 px.

### 5.2 Dropdown

Thứ tự đề xuất:

1. Search assignee.
2. Preset `Tất cả` và `Chỉ mình tôi`.
3. `Bạn`.
4. `Chưa gán`.
5. Danh sách thành viên.
6. Footer `Đã chọn N người` và nút `Xong`.

Hành vi:

- Chọn/bỏ checkbox không đóng menu.
- `Tất cả` là một scope, không đồng tồn tại cùng các username.
- Chọn một người trong trạng thái All chuyển roster sang đúng người đó.
- Bỏ người cuối cùng không tạo mảng rỗng mơ hồ; chuyển về All.
- Search được reset khi đóng menu hoặc khi đổi project để tránh tưởng danh sách
  thành viên bị thiếu.

### 5.3 Quick switch dưới filter bar

Chỉ hiển thị khi roster có ít nhất hai mục cụ thể:

```text
Xem nhanh  [Tất cả đã chọn · 3] [KA Bạn] [AN an.nguyen] [BT binh.tran]
```

Quy tắc:

- `Tất cả đã chọn` gửi toàn bộ roster vào query assignee.
- Chip một người chỉ gửi người đó vào query, roster không đổi.
- Active chip có `aria-pressed="true"`, border primary và nền primary nhẹ.
- Chip dùng initials/avatar màu ổn định từ username.
- `Chưa gán` dùng icon `UserX`.
- Trên mobile, hàng chip cuộn ngang và không làm toàn trang overflow.
- Nếu người đang xem bị bỏ khỏi roster, view quay về `all-selected`.
- Khi đổi project, loại các thành viên không còn hợp lệ; nếu roster không còn
  mục hợp lệ thì trở về default của page.

Không hiển thị remove icon thường trực trên chip ở giai đoạn đầu. Mục tiêu chính
của chip là chuyển view, còn chỉnh roster được thực hiện trong dropdown. Cách này
giảm click nhầm trên Board mật độ cao.

### 5.4 State model

```ts
type AssigneeToken = "me" | "unassigned" | string;

type AssigneeScope = {
  mode: "all" | "roster";
  roster: AssigneeToken[];
  view: "all-selected" | AssigneeToken;
};
```

Invariant:

- `mode === "all"` thì roster không được dùng để query.
- `mode === "roster"` thì roster phải có ít nhất một phần tử canonical.
- `view !== "all-selected"` thì view phải tồn tại trong roster.
- Không lưu đồng thời `me` và Jira username canonical của chính người dùng.
- Token được deduplicate case-insensitive.

Query assignee được resolve như sau:

```ts
function effectiveAssignees(scope: AssigneeScope): "ALL" | string[] {
  if (scope.mode === "all") return "ALL";
  if (scope.view === "all-selected") return scope.roster;
  return [scope.view];
}
```

## 6. Canonical issue filter model

Tạo file đề xuất: `src/lib/issues/issue-filters.ts`.

```ts
export type IssueFilters = {
  project: string;
  query: string;
  assigneeScope: AssigneeScope;
  statuses: string[];
  labels: string[];
  priorities: string[];
  includeDone: boolean;
};
```

Exports tối thiểu:

```ts
export const DEFAULT_BOARD_FILTERS: IssueFilters;
export const DEFAULT_BULK_FILTERS: IssueFilters;

export function normalizeIssueFilters(input: IssueFilters): IssueFilters;
export function countActiveIssueFilters(
  value: IssueFilters,
  defaults: IssueFilters
): number;
export function serializeIssueFilters(value: IssueFilters): URLSearchParams;
export function parseIssueFilters(
  params: URLSearchParams,
  defaults: IssueFilters
): IssueFilters;
export function effectiveAssignees(scope: AssigneeScope): "ALL" | string[];
```

Default đề xuất:

| Màn hình | Assignee | Include done | Filter khác |
|---|---|---:|---|
| Board | Roster `[me]` | `true` | rỗng |
| Bulk | All | `true` | rỗng |
| Stale | All | theo nghiệp vụ hiện tại | rỗng |

`activeCount` phải so với default của page, không chỉ đếm giá trị truthy. Vì
`[me]` là default của Board nhưng lại là filter active nếu áp dụng ở Bulk.

## 7. Shared component architecture

### 7.1 Giữ `FilterBar` làm primitive

Không đưa state hoặc API query vào `FilterBar`. Component tiếp tục chịu trách
nhiệm bố cục và reset affordance.

### 7.2 Refactor `AssigneeMultiSelect`

Props đề xuất:

```ts
type AssigneeOption = {
  value: string;
  label: string;
  count?: number;
};

type AssigneeMultiSelectProps = {
  value: AssigneeScope;
  onChange: (value: AssigneeScope) => void;
  options: AssigneeOption[];
  myName?: string | null;
  defaultScope: AssigneeScope;
  clearTarget?: "all" | "default";
  disabled?: boolean;
  className?: string;
};
```

Nếu cần giảm rủi ro migration, có thể giữ component hiện hành và tạo v2 trước:

```text
src/components/issues/assignee-filter.tsx
src/components/issues/assignee-quick-switch.tsx
```

Sau khi Board và Bulk migrate xong mới xóa component cũ.

### 7.3 `IssueFilterBar`

File đề xuất: `src/components/issues/issue-filter-bar.tsx`.

```ts
type IssueFilterCapabilities = {
  search?: boolean;
  assignee?: false | "single" | "multi";
  status?: false | "single" | "multi";
  label?: false | "single" | "multi";
  priority?: false | "single" | "multi";
};
```

Ví dụ Board:

```tsx
<IssueFilterBar
  value={filters}
  defaults={DEFAULT_BOARD_FILTERS}
  options={filterOptions}
  capabilities={{
    search: true,
    assignee: "multi",
    status: false,
    label: "single",
    priority: "single",
  }}
  onChange={setFilters}
/>
```

Ví dụ Bulk:

```tsx
<IssueFilterBar
  value={filters}
  defaults={DEFAULT_BULK_FILTERS}
  options={filterOptions}
  capabilities={{
    search: true,
    assignee: "multi",
    status: "multi",
    label: "multi",
    priority: "multi",
  }}
  onChange={setFilters}
/>
```

### 7.4 Desktop/mobile layout

Desktop:

```text
[Search................] [Assignee] [Status] [Priority] [Bộ lọc khác] [Reset]
[Quick switch.............................................................]
```

Mobile:

```text
[Search.................................................................]
[Assignee.................................] [Bộ lọc (3)]
[Quick switch: horizontal scroll........................................]
```

Không render năm select ngang nhau ở viewport hẹp. Label/priority/status phụ có
thể chuyển vào `FilterMorePopover` khi không đủ chiều rộng.

## 8. URL state

Board và Bulk nên lưu filter có ý nghĩa chia sẻ/điều hướng vào URL.

Query đề xuất:

```text
?q=login
&assignee=me,an.nguyen
&assigneeView=an.nguyen
&status=In%20Progress,Review
&label=backend
&priority=High,Highest
```

Quy tắc:

- Bỏ query param nếu giá trị bằng default của page.
- Serialize array theo thứ tự ổn định để query key/cache ổn định.
- Dùng `router.replace`, không push history cho từng ký tự search.
- Debounce riêng search khoảng 250–350 ms trước khi ghi URL/query server.
- Dropdown selection có thể cập nhật ngay.
- Back/forward phải phục hồi đầy đủ filter và quick view.
- Project change phải normalize filter option không còn hợp lệ.

Không ghi trạng thái tạm như dropdown đang mở, search nội bộ trong dropdown hoặc
column collapse vào URL filter.

## 9. API contract đích

### 9.1 `GET /api/issues/filters`

Response v2 đề xuất:

```ts
type IssueFilterOptionsResponse = {
  projects: string[];
  assignees: Array<{ value: string; label: string; count?: number }>;
  statuses: Array<{
    value: string;
    label: string;
    category?: string;
    count?: number;
  }>;
  labels: Array<{ value: string; label: string; count?: number }>;
  priorities: Array<{ value: string; label: string; count?: number }>;
};
```

Migration an toàn:

1. Giai đoạn đầu thêm `statuses` nhưng giữ ba mảng string hiện tại.
2. Nếu cần count, thêm field mới `facets` thay vì đổi ngay kiểu dữ liệu cũ.
3. Migrate client.
4. Chỉ xóa contract cũ sau khi không còn consumer.

Ví dụ backward-compatible:

```ts
{
  assignees: ["an.nguyen"],
  labels: ["backend"],
  priorities: ["High"],
  statuses: ["In Progress"],
  facets: {
    assignees: [{ value: "an.nguyen", count: 12 }]
  }
}
```

### 9.2 `GET /api/issues`

Mở rộng `BoardFilters` thành array-aware:

```ts
type IssueQueryFilters = {
  project?: string;
  projectList?: string[];
  assignees?: string[] | "ALL";
  statuses?: string[];
  labels?: string[];
  priorities?: string[];
  q?: string;
  includeDone?: boolean;
  limit?: number;
  offset?: number;
};
```

Semantics đề xuất:

- Nhiều giá trị trong cùng field dùng OR.
- Khác field dùng AND.
- Ví dụ assignee A/B + priority High/Highest nghĩa là:

```text
(assignee = A OR assignee = B)
AND
(priority = High OR priority = Highest)
```

- Label cần quyết định rõ:
  - Mặc định đề xuất `OR`: task có ít nhất một label được chọn.
  - Nếu sau này cần `AND`, thêm `labelMode=all`, không thay semantics ngầm.
- `me` phải resolve qua `userJiraUsername()` và `jiraUsernameAliases()` như API
  hiện hành.
- `unassigned` kết hợp username tạo điều kiện OR với `assigneeJira = null`.

### 9.3 Validation

- Giới hạn số phần tử mỗi facet, ví dụ tối đa 50.
- Giới hạn độ dài token và search.
- Trim/deduplicate case-insensitive.
- Không tin project gửi từ client; tiếp tục kiểm tra active catalog và quyền.
- Unknown option có thể trả kết quả rỗng, nhưng malformed query phải trả 400.

## 10. Thiết kế Bulk server-side selection

### 10.1 Vấn đề cần loại bỏ

Không được tiếp tục hiểu “Tất cả khớp bộ lọc” là:

```ts
filteredIssues.map((item) => item.jiraKey)
```

vì `filteredIssues` chỉ đại diện cho dữ liệu client đã tải.

### 10.2 Selector contract

Preview `POST /api/issues/bulk` hỗ trợ hai loại selector:

```ts
type BulkSelector =
  | { mode: "keys"; keys: string[] }
  | {
      mode: "filter";
      project: string;
      filters: {
        q?: string;
        assignees?: string[] | "ALL";
        statuses?: string[];
        labels?: string[];
        priorities?: string[];
      };
    };
```

Request preview:

```ts
{
  selector: {
    mode: "filter",
    project: "EPM",
    filters: {
      assignees: ["me", "an.nguyen"],
      statuses: ["In Progress"],
      labels: ["backend"],
      priorities: ["High"]
    }
  },
  action: { ... }
}
```

### 10.3 Preview snapshot

Server preview phải:

1. Kiểm tra session và project permission.
2. Normalize filter bằng cùng helper với `GET /api/issues`.
3. Resolve toàn bộ matching keys trong DB.
4. Áp dụng giới hạn vận hành nếu có.
5. Lưu operation draft/snapshot với:
   - Canonical filter.
   - Matching key set hoặc immutable selection fingerprint.
   - Count.
   - Action.
   - User/project.
   - Thời gian tạo/hết hạn.
6. Trả preview classification.

Confirm phải dùng snapshot của preview, không chạy lại filter mới một cách âm
thầm. Nếu snapshot hết hạn hoặc không khớp action, yêu cầu preview lại.

### 10.4 UX Bulk

Chế độ `Chọn từng task`:

- Bảng task phân trang/lazy-load server-side.
- Checkbox selection độc lập với page hiện tại.
- “Chọn tất cả đang hiển thị” chỉ áp dụng vào danh sách đang hiển thị.
- Header ghi `Đã chọn thủ công N task`.

Chế độ `Tất cả khớp bộ lọc`:

- Checkbox dòng được disabled/checked theo scope hoặc ẩn để tránh hiểu nhầm.
- Header ghi `Sẽ áp dụng cho N task khớp bộ lọc`.
- N là server count, không phải `filteredIssues.length`.
- Nếu vượt threshold, hiển thị warning và yêu cầu confirm rõ hơn.
- Thay đổi filter/action sau preview phải đánh dấu preview outdated.

## 11. Áp dụng theo màn hình

### 11.1 Board

Áp dụng đầy đủ:

- Canonical IssueFilters.
- Assignee split control.
- Multi-select roster.
- Quick switch.
- Search, label, priority.
- URL state.

Status filter chưa cần đưa vào Board phase đầu vì cột Board đã thể hiện workflow
status. Có thể bổ sung sau nếu người dùng cần ẩn nhanh một số status/cột.

### 11.2 Bulk

Áp dụng:

- Search.
- Assignee multi-select.
- Status multi-select.
- Label multi-select.
- Priority multi-select.
- Server-side list/count/selection.
- URL state cho project và filter; không đưa action field values nhạy cảm vào URL.

Quick switch assignee không bắt buộc ở Bulk vì mục tiêu của filter tại đây là xác
định tập thao tác, không phải theo dõi cá nhân. Component assignee vẫn dùng chung.

### 11.3 Stale

Tái sử dụng:

- Project selector.
- Assignee control.
- Status control.
- Filter reset/count.

Giữ riêng:

- Reason.
- Severity.
- Standardization requirement.
- Stale/healthy mode.

Không migrate hai nhóm filter Stale cùng lúc nếu làm tăng rủi ro; migrate scope
filter trước, standardization filter sau.

### 11.4 Release

- Giữ project, release state pills và search hiện hành.
- Chỉ tái sử dụng primitives (`SearchField`, `SegmentedControl`, `FilterBar`).
- Không dùng `IssueFilterBar` vì entity chính là release.

### 11.5 Notifications và Bulk Create

- Không dùng canonical IssueFilters.
- Có thể tái sử dụng visual primitives và quy tắc reset/accessibility.
- Filter `ready/warning/blocked` của Bulk Create là preview classification, không
  phải issue status.

## 12. Kế hoạch triển khai theo phase

### Phase 0 — Khóa contract và baseline

Mục tiêu: có test bảo vệ hành vi hiện tại trước khi refactor.

Công việc:

1. Ghi lại query contract của Board/Bulk.
2. Thêm test API hiện trạng cho `me`, `all`, `unassigned`, nhiều assignee.
3. Thêm component test mô phỏng click dấu `x` để tái hiện bug.
4. Ghi lại default/reset behavior của từng page.
5. Chụp visual baseline desktop/mobile light/dark nếu dự án có visual test.

Hoàn tất khi:

- Test tái hiện được dấu `x` mở dropdown hoặc xác nhận cấu trúc lồng button.
- API behavior hiện tại có regression coverage.

### Phase 1 — Sửa dấu `x` và accessibility

File dự kiến:

- `src/components/assignee-multi-select.tsx`, hoặc component v2 mới.
- Component test tương ứng.

Công việc:

1. Tách clear button khỏi dropdown trigger.
2. Dùng button thật, không dùng `span role="button"`.
3. Thêm `aria-label`, tooltip và focus ring.
4. Đảm bảo hit target phù hợp.
5. Reset search nội bộ khi đóng/đổi project nếu cần.
6. Chuẩn hóa copy:
   - `Hiển thị tất cả người phụ trách`.
   - `Chỉ mình tôi`.
   - `Chưa gán`.

Hoàn tất khi:

- Click clear không mở menu.
- Enter/Space trên clear chỉ clear.
- Enter/Space trên trigger chỉ mở menu.
- Không còn nested interactive element.

### Phase 2 — Quick roster/view trên Board

File dự kiến:

- `src/components/issues/assignee-quick-switch.tsx`.
- `src/app/(app)/board/board-client.tsx`.
- `src/lib/issues/issue-filters.ts` bước đầu.

Công việc:

1. Tạo `AssigneeScope`.
2. Tách roster và active view.
3. Render quick switch khi roster có từ hai mục.
4. Resolve effective assignees trước khi gọi `useIssues`.
5. Normalize khi option/project thay đổi.
6. Giữ active count đúng với default `[me]`.

Hoàn tất khi:

- Chọn ba người, chuyển qua từng người không làm mất roster.
- Quay về union bằng một click.
- Query key thay đổi đúng theo active view.
- Xóa người active tự quay về all-selected.

### Phase 3 — Canonical filter model và IssueFilterBar

File dự kiến:

- `src/lib/issues/issue-filters.ts`.
- `src/lib/issues/issue-filter-options.ts` nếu cần.
- `src/components/issues/issue-filter-bar.tsx`.
- `src/components/issues/assignee-filter.tsx`.
- `src/components/issues/assignee-quick-switch.tsx`.

Công việc:

1. Tạo types/defaults/normalize/count/serializer/parser.
2. Tạo capability-based IssueFilterBar.
3. Migrate Board khỏi state rời rạc.
4. Đồng bộ URL bằng `router.replace`.
5. Debounce search.
6. Cập nhật query key dùng serialized canonical filter.

Hoàn tất khi:

- Refresh/back/forward giữ filter Board.
- Default param không làm URL nhiễu.
- Không thay đổi kết quả query ngoài hành vi quick view đã duyệt.

### Phase 4 — API multi-filter và filter options

File dự kiến:

- `src/app/api/issues/route.ts`.
- `src/app/api/issues/filters/route.ts`.
- `src/hooks/use-issues.ts`.
- API/unit tests tương ứng.

Công việc:

1. Mở rộng type arrays.
2. Parse multi-value theo helper dùng chung.
3. Thêm statuses vào filter options.
4. Thêm validation/limit/deduplication.
5. Giữ backward compatibility với single-value query.
6. Cân nhắc facets/count ở sub-phase riêng sau khi đo query cost.

Hoàn tất khi:

- Multi-value assignee/status/label/priority hoạt động theo OR-in-field,
  AND-across-fields.
- Query cũ vẫn trả kết quả như trước.
- Project permission không thay đổi.

### Phase 5 — Bulk server-side filter và selection

File dự kiến:

- `src/app/(app)/bulk/bulk-client.tsx`.
- Có thể tách `bulk-task-selector.tsx`.
- `src/app/api/issues/bulk/route.ts` hoặc service phía sau route.
- Bulk operation types/store/tests.

Công việc:

1. Migrate Bulk sang IssueFilters/IssueFilterBar.
2. Thêm label/priority và multi-assignee/status.
3. Query server theo filter thay vì tải All rồi lọc client.
4. Thêm server total count.
5. Thêm `BulkSelector` keys/filter.
6. Preview tạo immutable snapshot.
7. Confirm dùng snapshot.
8. Loại bỏ `effectiveKeys = filteredIssues.map(...)` ở filter mode.
9. Giữ manual selected keys qua pagination.

Hoàn tất khi:

- Project có trên 1.000 issue vẫn preview đủ tất cả matching task.
- Số lượng UI, preview và confirm nhất quán.
- Thay đổi filter/action làm preview cũ hết hiệu lực.

### Phase 6 — Migrate Stale và dọn code trùng

Công việc:

1. Migrate project/assignee/status scope filters của Stale.
2. Giữ domain filters riêng.
3. Xóa token/constants/helpers trùng lặp sau khi không còn consumer.
4. Cập nhật shared UI documentation.
5. Thêm lint/import boundary nếu cần để shared component không import domain lib.

Hoàn tất khi:

- Board, Bulk, Stale có semantics cơ bản thống nhất.
- Release/Notifications không bị ép vào issue domain.
- Không còn hai implementation assignee filter cùng chức năng.

### Phase 7 — Facet count và saved presets, tùy chọn

Chỉ thực hiện sau khi core ổn định.

- Count theo assignee/status/priority.
- Hiển thị số task trên quick chips.
- Lưu preset như “Team backend”, “QA”, “Việc ưu tiên cao”.
- Lưu preference server-side theo user/project.

Không đưa phase này vào critical path.

## 13. Test plan

### 13.1 Unit test filter model

- Normalize token case-insensitive.
- Deduplicate username.
- Không đồng tồn tại `me` và alias username của chính user.
- All loại bỏ roster khỏi effective query.
- View phải nằm trong roster.
- Active count so đúng với default từng page.
- Serialize ổn định bất kể thứ tự chọn.
- Parse malformed params về default an toàn.

### 13.2 Component test assignee

- Click trigger mở dropdown.
- Click clear không mở dropdown.
- Clear đưa đến target đã cấu hình.
- Toggle checkbox không đóng menu.
- Chọn người từ All tạo roster.
- Bỏ người cuối chuyển về All.
- Search/empty state đúng.
- Keyboard Arrow/Enter/Escape/Tab đúng.
- Accessible name của trigger/clear/checkbox đúng.

### 13.3 Quick switch test

- Không render với zero/one roster member.
- Render All + N user chips khi roster >= 2.
- Click user chỉ đổi view.
- Click All phục hồi union.
- Remove active member phục hồi All.
- Project switch normalize roster.
- Horizontal overflow không làm page overflow.

### 13.4 API test matrix

| Case | Kỳ vọng |
|---|---|
| `assignee=me` | Resolve aliases tài khoản hiện tại |
| `assignee=all` | Không thêm assignee predicate |
| `assignee=unassigned` | `assigneeJira = null` |
| `assignee=me,A` | OR aliases của me và A |
| `assignee=A,unassigned` | A hoặc null |
| `status=A,B` | Status A hoặc B |
| `priority=High,Highest` | High hoặc Highest |
| `label=backend,urgent` | Có ít nhất một label |
| Assignee + status + priority | AND giữa các facet |
| Unknown project | 404/403 theo contract hiện hành |
| Malformed/too many values | 400 |
| Old single-value query | Không regression |

### 13.5 Bulk integration test

- Manual keys preview đúng.
- Filter selector preview đúng toàn bộ matching set.
- Hơn 1.000 matches không bị truncate.
- Snapshot thuộc đúng user/project.
- Confirm không nhận action/filter bị sửa sau preview.
- Snapshot hết hạn yêu cầu preview lại.
- Issue thay đổi sau preview xử lý theo policy operation hiện hành.
- Permission bị thu hồi trước confirm phải chặn confirm.
- Retry không mở rộng tập keys ngoài snapshot.

### 13.6 Visual và accessibility

Kiểm tra:

- Light/dark.
- 375, 768, 1024, 1440 px.
- Contrast >= 4.5:1.
- Focus visible.
- Reduced motion.
- Touch target.
- Không horizontal page scroll.
- Loading dùng `Skeleton`.
- Filtered-empty có icon, title và hướng dẫn reset.

## 14. Observability

Không log username/search text thô nếu không cần thiết. Metrics đề xuất:

```text
event=issue_filter_applied
page=board|bulk|stale
facet_count=3
assignee_count=2
result_count=42
duration_ms=...
```

```text
event=bulk_filter_snapshot_created
project=EPM
match_count=1240
duration_ms=...
```

Theo dõi:

- P50/P95 API issues/filter latency.
- P50/P95 bulk selector resolution.
- Tỷ lệ preview outdated.
- Số thao tác bulk trên >1.000 task.
- Query DB chậm khi bật facets/count.

Không ghi filter search content hoặc danh sách assignee vào log ứng dụng thông
thường.

## 15. Performance

- Search debounce 250–350 ms.
- Filter option query `staleTime` tối thiểu 5 phút nếu catalog ít đổi.
- Stable serialized query để tránh cache miss do array khác thứ tự.
- Board pagination tiếp tục giới hạn 1.000/page và load more.
- Bulk list phân trang; count/selector chạy server-side.
- Facet count chỉ thêm sau khi có index/query plan phù hợp.
- Đánh giá index cho các cột `projectKey`, `status`, `priority`, `assigneeJira`;
  labels array cần xem xét GIN index theo schema/database hiện tại.

## 16. Rollout và rollback

### Rollout

1. Ship Phase 1 không cần feature flag nếu test đầy đủ.
2. Quick switch có thể đặt sau flag `BOARD_ASSIGNEE_QUICK_SWITCH`.
3. API multi-filter triển khai backward-compatible trước client.
4. Migrate Board trước, quan sát, sau đó Bulk.
5. Bulk filter selector cần flag riêng vì thay đổi execution scope.
6. Pilot trên một project nhỏ và một project >1.000 issue.

### Rollback

- Component Board có thể quay lại props/state cũ nếu v2 song song.
- API vẫn nhận single-value query trong compatibility window.
- Bulk giữ `mode: keys` luôn khả dụng.
- Không rollback confirm sang client-loaded “all matching”; nếu filter selector có
  sự cố thì tạm disable chế độ filter và giữ manual selection.

## 17. Rủi ro và biện pháp

| Rủi ro | Mức | Biện pháp |
|---|---:|---|
| Quick chip làm mất roster | Cao | Tách roster/view, enforce invariant |
| Bulk xử lý thiếu task | Cao | Server-side selector + snapshot |
| Bulk vô tình xử lý nhiều hơn dự kiến | Cao | Preview count, threshold warning, immutable snapshot |
| Query multi-filter chậm | Trung bình | Index review, pagination, đo P95, trì hoãn facet count |
| URL quá dài | Thấp/Trung bình | Giới hạn facet count; preset để phase sau |
| Project switch giữ option không hợp lệ | Trung bình | Normalize theo options mới |
| `me` khác alias Jira cache | Trung bình | Dùng helper alias hiện hành ở server |
| Mỗi page reset khác nhau gây nhầm | Trung bình | Defaults explicit + copy mô tả đích |
| Shared component quá tổng quát | Trung bình | Capability API nhỏ; giữ filter domain riêng |

## 18. Danh sách file dự kiến

### Tạo mới

- `src/lib/issues/issue-filters.ts`
- `src/components/issues/issue-filter-bar.tsx`
- `src/components/issues/assignee-filter.tsx`
- `src/components/issues/assignee-quick-switch.tsx`
- Các unit/component test tương ứng

### Chỉnh sửa

- `src/app/(app)/board/board-client.tsx`
- `src/app/(app)/bulk/bulk-client.tsx`
- `src/app/(app)/stale/stale-client.tsx`
- `src/hooks/use-issues.ts`
- `src/app/api/issues/route.ts`
- `src/app/api/issues/filters/route.ts`
- `src/app/api/issues/bulk/route.ts` hoặc service bulk tương ứng
- `src/lib/query-keys.ts`
- Shared UI documentation

### Xóa sau migration

- Assignee filter implementation cũ nếu không còn consumer.
- Token `ME`/`UNASSIGNED` và filter helpers trùng lặp trong Bulk.
- Client-side “all matching” dựa trên `filteredIssues.map(...)`.

## 19. Definition of Done

Tính năng chỉ được xem là hoàn tất khi:

1. Dấu `x` không mở dropdown trong mouse, touch và keyboard interaction.
2. Không còn nested interactive element trong assignee trigger.
3. Board chọn nhiều người và chuyển nhanh từng người mà không mất roster.
4. `Tất cả đã chọn` trả đúng union của roster.
5. Board mặc định/reset toàn bộ vẫn về `Của tôi`.
6. Board và Bulk dùng cùng canonical tokens/serializer.
7. Bulk hỗ trợ search, assignee, status, label và priority theo contract mới.
8. Bulk “Tất cả khớp bộ lọc” resolve ở server và không bị giới hạn 1.000 task.
9. Preview và confirm Bulk dùng cùng immutable snapshot.
10. URL filter của Board/Bulk hoạt động với refresh/back/forward.
11. Unit, component, API và integration tests pass.
12. Typecheck, lint và build pass.
13. Light/dark, keyboard, screen reader và responsive checklist pass.
14. Không có regression về permission, project scope, query cache hoặc Jira
    transition.

## 20. Thứ tự thực hiện khuyến nghị

```text
Phase 0: Baseline tests
    ↓
Phase 1: Sửa clear trigger
    ↓
Phase 2: Quick roster/view trên Board
    ↓
Phase 3: Canonical model + IssueFilterBar + URL
    ↓
Phase 4: API multi-filter/options
    ↓
Phase 5: Bulk server-side selector/snapshot
    ↓
Phase 6: Stale migration + cleanup
    ↓
Phase 7: Facet counts/presets (tùy chọn)
```

Không copy nguyên filter UI của Board sang Bulk trước Phase 4–5. Làm như vậy chỉ
đồng nhất phần nhìn nhưng vẫn giữ sai lệch dữ liệu nghiêm trọng của chế độ “Tất
cả khớp bộ lọc”.
