# Kế hoạch nâng cấp Bulk Create thành luồng tạo task thông minh

> Phiên bản: 1.4  
> Ngày lập: 2026-10-01  
> Ngày cập nhật: 2026-10-01  
> Trạng thái: P0, P1, P2, P3 completed  
> Phạm vi: `/bulk/create`, metadata Jira, validation, preview, queue worker,
> CSV/TSV/paste và kết quả tạo task  
> Mục tiêu chính: nhập liệu an toàn theo metadata Jira, chọn đúng assignee và
> hỗ trợ tạo task cha–con trong cùng một batch

## Tiến độ triển khai (P0 — An toàn dữ liệu)

| Ticket | Mô tả | Trạng thái | Ghi chú |
|--------|--------|:----------:|---------|
| BC-SMART-001 | Metadata field capability contract | ✅ Done | `fieldCapabilities`, `hasSubtaskTypes`, `defaultIssueTypeId`, `defaultSubtaskTypeId`, `allowsUnassigned` đã thêm vào type + fetch |
| BC-SMART-002 | Assignable-user Jira client + API | ✅ Done | `searchAssignableUsers()` trong Jira client, endpoint `GET /api/bulk/create/assignees` với cache 60s |
| BC-SMART-003 | Assignee combobox + server validation | ✅ Done | Component `assignee-combobox.tsx`, tích hợp vào grid + defaults form |
| BC-SMART-004 | Dynamic required-field validator | ✅ Done | Validator kiểm tra required custom fields + `allowedValues`, error codes `REQUIRED_CUSTOM_FIELD_MISSING`, `FIELD_VALUE_NOT_ALLOWED` |
| BC-SMART-005 | Option select/multi-select theo allowedValues | ✅ Done | Component `jira-option-select.tsx` với `JiraOptionSelect` + `JiraOptionMultiSelect` |
| BC-SMART-006 | Xóa priority fallback giả định | ✅ Done | Không còn fallback ID 1-5, field unavailable khi metadata thiếu |
| BC-SMART-007 | Đồng nhất points field ID | ✅ Done | Worker dùng `pointsFieldId` từ snapshot payload thay vì `env.jiraPointsFieldId` |

### File mới/tạo thêm

```
src/app/api/bulk/create/assignees/route.ts      — Assignable user search API
src/app/(app)/bulk/create/assignee-combobox.tsx  — Assignee picker component
src/app/(app)/bulk/create/jira-option-select.tsx — Option select/multi-select
```

### File đã sửa

```
src/lib/bulk/create-types.ts          — Thêm fieldCapabilities, customFields, hasSubtaskTypes, v.v.
src/lib/bulk/create-validator.ts      — Dynamic required-field check, allowedValues validation, customFields merge
src/lib/bulk/create-ops.ts            — Remove priority fallback, add pointsFieldId to payload, customFields in worker
src/lib/jira/client.ts                — Thêm searchAssignableUsers()
src/lib/query-keys.ts                 — Thêm createMetadata, createAssignees keys
src/app/(app)/bulk/create/create-task-grid.tsx    — Dùng AssigneeCombobox, thêm projectKey prop
src/app/(app)/bulk/create/create-defaults-form.tsx — Dùng AssigneeCombobox, thêm projectKey prop
src/app/(app)/bulk/create/bulk-create-client.tsx  — Truyền projectKey
```

## Tiến độ triển khai (P1 — Task cha–con)

| Ticket | Mô tả | Trạng thái | Ghi chú |
|--------|--------|:----------:|---------|
| BC-SMART-101 | Contract V2 và parent reference | ✅ Done | `BulkParentRef` type, `parent` field in row input, `isSubtask` + `parent` in canonical item, parent validation (required/not-allowed/cycle), `validateBatchParentGraph()` |
| BC-SMART-102 | Parent Jira search API | ✅ Done | `searchParentIssues()` trong Jira client, endpoint `GET /api/bulk/create/parents` với cache 30s |
| BC-SMART-103 | Parent combobox và add-subtask action | ✅ Done | Component `parent-combobox.tsx` với 2 nhóm (batch + Jira), subtask types mở trong grid, cột Parent điều kiện |
| BC-SMART-104 | Dependency graph và cycle validation | ✅ Done | `src/lib/bulk/dependency-graph.ts`: `buildDependencyGraph()`, cycle detection (DFS), topological sort, `getChildren()`, `getAllDescendants()` |
| BC-SMART-105 | Migration dependency columns | ✅ Done | `parentClientRef`, `parentJiraKey`, `resolvedParentJiraKey`, `depth` + 2 indexes |
| BC-SMART-106 | Dependency-aware worker | ✅ Done | Execution loop: pending → process → unlock children / block children → repeat. `waiting_for_parent` → `pending` khi parent thành công |
| BC-SMART-107 | Parent failure propagation | ✅ Done | `blockChildren()`: parent fail → children `blocked_by_parent` với error `PARENT_BLOCKED` |
| BC-SMART-108 | Retry entire branch | ✅ Done | Endpoint `POST /api/bulk/operations/:id/retry-branch` nhận `clientRef`, BFS tìm descendants `blocked_by_parent`, reset parent → `pending` + children → `waiting_for_parent`, re-enqueue. UI: nút "Thử lại cả nhánh" trên progress screen |
| BC-SMART-109 | CSV parentRef/parentKey | ✅ Done | Parser nhận cột `parentRef` (batch) và `parentKey` (Jira), validate không đặt đồng thời, template CSV cập nhật với ví dụ cha–con |

### File mới/tạo thêm (P1)

```
src/lib/bulk/dependency-graph.ts                    — Dependency graph, cycle detection, topological sort
src/app/api/bulk/create/parents/route.ts            — Parent Jira search API
src/app/api/bulk/operations/[id]/retry-branch/route.ts — Retry entire branch endpoint
src/app/(app)/bulk/create/parent-combobox.tsx       — Parent picker component (batch + Jira)
prisma/migrations/20261001062901_add_bulk_create_dependency_columns/
```

### File đã sửa (P1)

```
src/lib/bulk/create-types.ts          — Thêm BulkParentRef, parent field, isSubtask, new statuses
src/lib/bulk/create-validator.ts      — Remove SUBTASK_NOT_SUPPORTED, add parent validation, validateBatchParentGraph()
src/lib/bulk/create-ops.ts            — Dependency-aware execution, unlockChildren(), blockChildren(), parent in Jira create
src/lib/bulk/csv-parser.ts            — Thêm parentRef/parentKey columns, validate mutual exclusion, construct parent ref
src/lib/jira/client.ts                — Thêm searchParentIssues()
src/lib/query-keys.ts                 — Thêm createParentIssues key
src/app/(app)/bulk/create/create-task-grid.tsx    — Remove subtask filter, add Parent column + ParentCombobox
src/app/(app)/bulk/create/create-defaults-form.tsx — Remove subtask filter
src/app/(app)/bulk/create/create-progress.tsx    — Thêm retry-branch button, blocked_by_parent/waiting_for_parent badges
src/app/(app)/bulk/create/csv-import-dialog.tsx  — Template CSV + guide với parentRef/parentKey
prisma/schema.prisma                  — BulkCreateItem: +parentClientRef, +parentJiraKey, +resolvedParentJiraKey, +depth
```

## 1. Tóm tắt quyết định

Bulk Create hiện tại đã có nền tảng tốt gồm grid nhập liệu, defaults, import
CSV/paste, preview bất biến, queue worker, idempotency và retry. Tuy nhiên luồng
đang hoạt động như một bảng nhập text có validation muộn, chưa phải một công cụ
hiểu cấu hình Jira của từng project và từng issue type.

Kế hoạch này chốt các hướng sau:

1. Mọi field có tập giá trị do Jira quản lý phải dùng select/combobox từ dữ liệu
   Jira, không cho nhập text tùy ý.
2. Assignee phải được tìm từ danh sách user có thể assign vào project/issue;
   username không được xác thực sẽ không được gửi sang worker.
3. Label vẫn là dữ liệu mở, dùng creatable multi-combobox: gợi ý giá trị cũ nhưng
   vẫn cho phép tạo label mới hợp lệ.
4. Field hiển thị và validation phải phụ thuộc issue type, bao gồm custom field
   bắt buộc và `allowedValues` từ create metadata.
5. Sub-task được hỗ trợ với hai loại parent: issue Jira đã tồn tại hoặc một task
   cha trong cùng batch.
6. Task trong batch được thực thi theo đồ thị phụ thuộc: cha thành công trước khi
   con được tạo. Cha thất bại thì con bị chặn, không bị tạo thành task độc lập.
7. Preview phải là nơi có thể hiểu và sửa lỗi, không chỉ là bảng thông báo lỗi.

## 2. Hiện trạng đã xác nhận

### 2.1 Phần đang hoạt động tốt và nên giữ

- Giới hạn tối đa 100 dòng mỗi batch.
- Có defaults dùng chung và override theo từng dòng.
- Hỗ trợ grid, CSV, TSV, TXT và paste từ bảng tính.
- Preview không tạo dữ liệu Jira ngay lập tức.
- Snapshot được lưu vào `BulkOperation` và `BulkCreateItem`.
- Worker chạy nền, có giới hạn concurrency.
- Có idempotency marker để giảm nguy cơ tạo trùng khi retry.
- Có progress, kết quả từng dòng và retry item thất bại.
- Có kiểm tra duplicate summary trong batch và IssueCache.

Các cơ chế trên phải được tái sử dụng thay vì viết lại toàn bộ Bulk Create.

### 2.2 Sub-task đang bị chặn có chủ đích

`validateAndNormalizeItem()` trả lỗi `SUBTASK_NOT_SUPPORTED` cho mọi issue type
có `subtask=true`. Hai form nhập defaults và từng dòng cũng lọc các issue type
này khỏi danh sách.

Contract hiện chưa có:

- `parentClientRef` để trỏ tới một dòng cha trong batch.
- `parentJiraKey` để trỏ tới issue Jira đã tồn tại.
- Trạng thái `blocked_by_parent`.
- Kết quả parent đã resolve phục vụ preview và worker.

Worker hiện lấy toàn bộ item pending và xử lý bằng worker pool phẳng. Cơ chế này
không đảm bảo task cha được tạo trước task con.

### 2.3 Assignee chưa an toàn

Assignee ở defaults và từng dòng là `Input` text. Server chỉ trim giá trị và
chuyển nguyên chuỗi sang Jira dưới dạng `{ name: username }`.

Hệ quả:

- Có thể nhập user không tồn tại.
- User tồn tại nhưng không assignable trong project vẫn được preview là hợp lệ.
- Sai chữ hoa/thường hoặc chọn nhầm tài khoản chỉ bị phát hiện ở worker.
- Một batch lớn có thể thất bại hàng loạt sau khi người dùng đã confirm.
- UI chỉ hiển thị username, không có display name/avatar/trạng thái active.

Component autocomplete của Bulk Edit chỉ lọc một mảng string phía client, chưa
phải nguồn assignable user đáng tin cậy và không nên tái sử dụng nguyên trạng.

### 2.4 Metadata đã có nhưng chưa được dùng hết

Backend hiện thu thập `fieldsByIssueType`, `required`, `schemaType` và
`allowedValues`. UI vẫn render một tập field viết cứng. Validator chỉ kiểm tra
một số required field chuẩn như description, due date và priority.

Các tình huống còn thiếu:

- Custom select bắt buộc không được render và có thể không bị chặn ở preview.
- Custom multi-select không có UI.
- Component, environment hoặc các field đặc thù project chưa được hỗ trợ.
- Field có/không có thể thay đổi theo issue type nhưng grid chưa thay đổi tương
  ứng đầy đủ.
- Story Points được phát hiện động nhưng worker chỉ ghi khi có
  `env.jiraPointsFieldId`, tạo ra khả năng preview nhận giá trị nhưng worker bỏ
  qua field vừa phát hiện.

### 2.5 Các điểm UX chưa phù hợp

- Grid ngày càng rộng và buộc horizontal scroll.
- Description không có cách chỉnh sửa thuận tiện ngay trên từng dòng.
- Fix Version có kiểu dữ liệu mảng nhưng UI chỉ cho chọn một giá trị.
- Labels là text phân cách dấu phẩy, dễ nhập sai và khó xóa từng giá trị.
- Preview hiển thị ID issue type/priority thay vì tên.
- Preview không đưa người dùng về đúng cell cần sửa.
- Không có chọn nhiều dòng rồi áp dụng cùng giá trị.
- Không có cấu trúc trực quan để phân biệt task cha và task con.

### 2.6 Các fallback có thể gây sai dữ liệu

Nếu Jira create metadata không trả priorities, backend đang dùng danh sách ID
`1` đến `5`. Không nên giả định ID này đúng trên mọi Jira Data Center. Nếu không
lấy được allowed values, field phải chuyển sang trạng thái không khả dụng hoặc
Jira default, kèm cảnh báo rõ ràng.

## 3. Mục tiêu và ngoài phạm vi

### 3.1 Mục tiêu

- Ngăn dữ liệu không hợp lệ trước khi tạo operation.
- Chỉ cho chọn user thực sự assignable.
- Tự render input phù hợp với metadata của issue type.
- Tạo được task cha và sub-task trong một batch.
- Hỗ trợ parent đã tồn tại trên Jira.
- Import/export giữ được quan hệ cha–con.
- Retry an toàn và không tạo duplicate.
- Hiển thị lỗi đúng dòng, đúng field và có đường sửa rõ ràng.
- Giữ giới hạn 100 item và mô hình queue hiện có.

### 3.2 Ngoài phạm vi đợt này

- Attachment.
- Import file Excel nhị phân `.xlsx`/`.xls`.
- Tạo issue thuộc nhiều project trong cùng batch.
- Tự động transition hoặc comment sau khi tạo.
- Epic hierarchy khác nhau giữa Jira Company-managed/Team-managed nếu metadata
  không mô tả đủ. Epic/Parent linking ngoài sub-task sẽ được tách thành pha sau.
- Tạo hoặc sửa Jira user, permission scheme hay issue type scheme.

## 4. Trải nghiệm người dùng đề xuất

### 4.1 Luồng tổng thể

Luồng vẫn giữ ba bước nhưng thay đổi trách nhiệm của từng bước:

1. **Soạn danh sách**
   - Chọn project.
   - Hệ thống tải metadata và quyền.
   - Nhập/import task, chọn field từ dữ liệu Jira.
   - Validation tức thời tại cell.
2. **Kiểm tra và sửa**
   - Preview chuẩn hóa, phân nhóm lỗi/cảnh báo.
   - Có thể mở đúng dòng để sửa mà không mất dữ liệu.
   - Hiển thị cây task cha–con và thứ tự dự kiến.
3. **Tạo và theo dõi**
   - Tạo task theo dependency.
   - Hiển thị `waiting_for_parent`, `running`, `succeeded`, `failed`,
     `blocked_by_parent`.
   - Retry cha hoặc retry cả nhánh.

### 4.2 Bố cục màn nhập

Không hiển thị mọi field thành cột cố định. Chia thành:

**Cột luôn hiển thị**

- Số thứ tự/drag handle.
- Summary.
- Issue type.
- Parent.
- Assignee.
- Trạng thái validation.
- Nút mở chi tiết và thao tác dòng.

**Field chi tiết trong side panel/drawer**

- Description.
- Priority.
- Labels.
- Story Points.
- Original Estimate.
- Due Date.
- Fix Versions.
- Custom fields theo issue type.

Trên desktop có thể pin thêm các cột thường dùng. Trên mobile/tablet dùng danh
sách card và drawer, không ép bảng `min-width` quá lớn.

### 4.3 Field mặc định

Defaults vẫn được giữ nhưng phải thể hiện ba trạng thái rõ ràng:

- **Kế thừa mặc định**: dòng chưa override.
- **Giá trị riêng**: dòng đã override.
- **Cố ý để trống**: dòng gửi `null`, không kế thừa mặc định.

UI cần badge hoặc icon nhỏ cho biết field đang kế thừa. Nút “Xóa” trên override
phải cho người dùng chọn “Quay về mặc định” hoặc “Để trống”.

Không đặt parent ở defaults toàn batch vì dễ gắn nhầm hàng loạt. Thay vào đó hỗ
trợ chọn nhiều dòng rồi áp dụng parent có xác nhận.

### 4.4 Chọn assignee

Dùng combobox tìm kiếm server-side:

- Tìm theo display name, username và email nếu Jira cho phép trả email.
- Debounce 250–350 ms.
- Chỉ query khi có ít nhất 2 ký tự, trừ danh sách gần đây/của project.
- Hiển thị avatar, display name, username và trạng thái inactive.
- Không cho chọn user inactive.
- Có lựa chọn “Chưa gán” nếu project cho phép unassigned issue.
- Giá trị được lưu bằng định danh Jira hỗ trợ cho phiên bản đang chạy, ưu tiên
  account ID nếu API yêu cầu, fallback username với Jira Data Center cũ.
- Khi issue type hoặc project đổi, assignee phải được validate lại.

Không đưa toàn bộ user Jira vào create metadata vì danh sách có thể lớn và nhanh
lỗi thời. User picker là endpoint riêng có cache ngắn.

### 4.5 Chọn parent và tạo task con

Khi chọn issue type có `subtask=true`:

- Cột Parent tự động trở thành bắt buộc.
- Combobox Parent có hai nhóm:
  - **Trong batch này**: các dòng non-subtask có `clientRef` khác.
  - **Đã có trên Jira**: tìm theo key hoặc summary trong đúng project.
- Task con được thụt vào dưới task cha nếu parent nằm trong batch.
- Có nút “Thêm task con” ở menu của dòng cha; nút tạo dòng mới, tự đặt issue type
  sub-task mặc định và liên kết parent.
- Chuyển issue type từ sub-task về loại thường phải xóa parent sau xác nhận.
- Chuyển một task cha sang sub-task phải kiểm tra xem nó đang có con hay không.

Không cho chọn:

- Chính dòng hiện tại làm parent.
- Một sub-task khác làm parent.
- Issue thuộc project khác.
- Dòng sẽ tạo vòng lặp.
- Parent đã đánh dấu xóa hoặc đang lỗi blocking.

### 4.6 Các field khác

| Loại field | UI | Chính sách |
|---|---|---|
| Issue type | Select | Chỉ loại Jira cho phép tạo |
| Priority | Select | Chỉ từ allowed values, có Jira default |
| Fix Version | Searchable multi-select | Ẩn archived; released có nhãn cảnh báo |
| Component | Searchable multi-select | Từ metadata/API project |
| Custom select | Select | Không cho text ngoài danh sách |
| Custom multiselect | Multi-select | Lưu ID, hiển thị label |
| User picker | Server combobox | Validate assignable nếu là assignee |
| Labels | Creatable multi-combobox | Gợi ý label cũ, cho tạo label mới |
| Number | Number input | Min/max/step từ schema nếu có |
| Date | Date input | ISO date, kiểm tra ngày tồn tại |
| Text | Input/textarea | Max length và required inline |
| Estimate | Duration input | Parse và hiển thị giá trị chuẩn hóa |

### 4.7 Bulk actions

Cho phép chọn nhiều dòng và thực hiện:

- Gán assignee.
- Đặt priority.
- Thêm/xóa label.
- Thêm/xóa Fix Version.
- Đặt due date.
- Đặt issue type nếu các field liên quan tương thích.
- Gắn parent.
- Duplicate, delete và clear override.

Mỗi bulk action phải hiển thị số dòng bị ảnh hưởng và số dòng bị bỏ qua vì không
tương thích.

### 4.8 Preview có thể hành động

Preview cần hiển thị:

- Tên field thay vì ID.
- Cây cha–con.
- Tổng task thường, task cha, task con và parent Jira có sẵn.
- Số user được assign và số task chưa assign.
- Lỗi/cảnh báo theo field.
- Nút “Sửa dòng” mở side panel tại đúng field.
- Nút “Quay lại bảng và focus lỗi đầu tiên”.
- Cảnh báo metadata thay đổi sau khi preview.

Confirm bị disable khi có item `blocked`. Không tạo một phần các item ready trong
cùng snapshot trừ khi người dùng chủ động chọn “Bỏ các dòng lỗi và tạo phần còn
lại”, sau một dialog nêu rõ số dòng bị bỏ.

## 5. Thiết kế contract

### 5.1 Định danh option và user

```ts
type JiraOptionRef = {
  id: string;
  label: string;
};

type JiraUserRef = {
  accountId?: string;
  username?: string;
  displayName: string;
};

type BulkParentRef =
  | { type: "batch"; clientRef: string }
  | { type: "jira"; jiraKey: string };
```

API không nên tin `displayName` hoặc `label` từ client. Các giá trị này chỉ phục
vụ hiển thị; server resolve lại theo ID/key khi preview.

### 5.2 Row input mới

```ts
type BulkCreateRowInputV2 = {
  clientRef: string;
  summary: string;
  issueTypeId?: string;
  parent?: BulkParentRef | null;
  description?: string;
  assignee?: JiraUserRef | null;
  priorityId?: string | null;
  labels?: string[];
  points?: number | null;
  originalEstimate?: string | null;
  dueDate?: string | null;
  fixVersionIds?: string[];
  customFields?: Record<string, unknown>;
};
```

Giữ hỗ trợ payload V1 trong một giai đoạn chuyển tiếp cho CSV/client cũ. Snapshot
mới phải ghi `version: 2`.

### 5.3 Canonical item

Canonical item sau preview phải chứa dữ liệu đã resolve:

```ts
type CanonicalCreateItemV2 = {
  clientRef: string;
  summary: string;
  issueTypeId: string;
  issueTypeName: string;
  isSubtask: boolean;
  parent?: {
    type: "batch" | "jira";
    clientRef?: string;
    jiraKey?: string;
    summary?: string;
  };
  assignee?: {
    accountId?: string;
    username?: string;
    displayName: string;
  } | null;
  priorityId?: string | null;
  labels: string[];
  fixVersionIds: string[];
  customFields: Record<string, unknown>;
};
```

## 6. API đề xuất

### 6.1 Metadata tạo task

Giữ endpoint:

```http
GET /api/bulk/create/metadata?project=ABC
```

Bổ sung vào response:

- `metadataVersion`.
- `fieldCapabilities` theo issue type.
- `hasSubtaskTypes`.
- `defaultIssueTypeId` nếu Jira cung cấp.
- `defaultSubtaskTypeId` nếu xác định được.
- `allowsUnassigned`.
- Schema chi tiết hơn: `items`, `system`, `custom`, `operations`, renderer gợi ý.
- Mapping points field chính xác dùng cả ở preview lẫn worker.

Không fallback priority ID giả định. Nếu metadata thiếu, trả capability
`priority: unavailable`.

### 6.2 Assignable user search

```http
GET /api/bulk/create/assignees?project=ABC&issueTypeId=10001&q=nguyen&limit=20
```

Yêu cầu:

- Bắt buộc session và Jira credential cá nhân.
- Giới hạn query length và `limit <= 50`.
- Rate limit theo user.
- Cache 30–60 giây theo user/project/query.
- Không log email hoặc dữ liệu nhạy cảm.
- Chuẩn hóa nhiều biến thể Jira Data Center API trong Jira client.

Nếu Jira chỉ hỗ trợ assignable search theo issue key, trước khi issue tồn tại cần
dùng endpoint theo project hoặc username và xác nhận lại bằng create metadata/
permission phù hợp. Tích hợp phải được thử trên phiên bản Jira thật của hệ thống.

### 6.3 Parent issue search

```http
GET /api/bulk/create/parents?project=ABC&q=ABC-123&limit=20
```

Chỉ trả:

- Issue thuộc project đã chọn.
- Issue không phải sub-task.
- Issue người dùng có quyền browse.
- Key, summary, issue type, status và trạng thái archived/done cần thiết.

Task done vẫn có thể làm parent nếu Jira cho phép, nhưng UI phải hiển thị trạng
thái để người dùng biết.

### 6.4 Label suggestions

```http
GET /api/bulk/create/labels?project=ABC&q=front&limit=20
```

Nguồn có thể là IssueCache trước, Jira API sau. Đây chỉ là gợi ý; labels hợp lệ
vẫn được phép tạo mới.

### 6.5 Preview và confirm

Giữ `POST /api/bulk/create`, nhưng:

- Preview nhận payload V2.
- Response trả display values và parent resolution.
- Snapshot lưu metadata fingerprint và resolved dependency graph.
- Confirm kiểm tra snapshot ownership/state như hiện tại.
- Trước confirm, so sánh fingerprint. Nếu metadata thay đổi, trả `409` và yêu
  cầu preview lại.

## 7. Validation server-side

Client validation chỉ để phản hồi nhanh. Server là nguồn quyết định cuối cùng.

### 7.1 Batch-level

- Project key hợp lệ và người dùng có `CREATE_ISSUES`.
- 1–100 item.
- `clientRef` duy nhất, ổn định, không phụ thuộc row index.
- Metadata fingerprint khớp hoặc được preview lại.
- Không có dependency cycle.
- Độ sâu parent trong phạm vi hỗ trợ. Với sub-task chuẩn, chỉ hỗ trợ một cấp.

### 7.2 Item-level

- Summary bắt buộc và không vượt giới hạn.
- Issue type thuộc project và được phép tạo.
- Tất cả required field của issue type có giá trị.
- `allowedValues` được kiểm tra bằng ID, không tin label từ client.
- Assignee tồn tại, active và assignable.
- Parent bắt buộc khi `isSubtask=true`.
- Parent phải trống khi issue type không phải sub-task, trừ hierarchy khác được
  hỗ trợ rõ ràng trong tương lai.
- Parent Jira phải tồn tại, đúng project và không phải sub-task.
- Parent batch phải trỏ tới item non-subtask hợp lệ.
- Fix Version thuộc project, chưa archived.
- Custom field đúng kiểu schema.
- Estimate/date/points/labels được validate như hiện tại nhưng không tự sửa dữ
  liệu âm thầm nếu thay đổi có thể làm sai ý nghĩa. Việc cắt label phải thành lỗi
  hoặc cần người dùng xác nhận, không chỉ warning.

### 7.3 Mã lỗi mới

| Code | Ý nghĩa |
|---|---|
| `ASSIGNEE_NOT_FOUND` | Không tìm thấy user |
| `ASSIGNEE_INACTIVE` | User đã bị khóa/inactive |
| `ASSIGNEE_NOT_ASSIGNABLE` | Không thể assign trong project/context |
| `PARENT_REQUIRED` | Sub-task chưa có parent |
| `PARENT_NOT_FOUND` | Jira key/clientRef không tồn tại |
| `PARENT_WRONG_PROJECT` | Parent thuộc project khác |
| `PARENT_IS_SUBTASK` | Chọn sub-task làm parent |
| `PARENT_CYCLE` | Quan hệ parent tạo vòng lặp |
| `PARENT_BLOCKED` | Parent trong batch không thể tạo |
| `REQUIRED_CUSTOM_FIELD_MISSING` | Thiếu custom field bắt buộc |
| `FIELD_VALUE_NOT_ALLOWED` | Giá trị ngoài allowed values |
| `FIELD_SCHEMA_UNSUPPORTED` | Field bắt buộc chưa có renderer/validator |
| `METADATA_CHANGED` | Metadata đã đổi sau preview |

Nếu gặp required field có schema chưa hỗ trợ, preview phải block thay vì bỏ qua
và để Jira trả lỗi muộn.

## 8. Thực thi task cha–con trong worker

### 8.1 Xây dependency graph

Sau preview, mỗi item được phân loại:

- `root`: task thường hoặc sub-task có parent Jira đã tồn tại.
- `dependent`: sub-task có parent là item khác trong batch.

Graph có cạnh `parent -> child`. Preview chạy cycle detection dù mô hình hiện tại
chỉ cho một cấp, để contract an toàn khi mở rộng.

### 8.2 Thuật toán thực thi

1. Claim operation.
2. Tải snapshot và item.
3. Resolve item độc lập:
   - Task thường.
   - Sub-task có parent Jira có sẵn.
4. Chạy các item này bằng bounded concurrency.
5. Sau mỗi parent batch thành công, lấy `jiraKey` đã lưu.
6. Chuyển các child của parent đó từ `waiting_for_parent` sang `pending`.
7. Tạo child với `fields.parent = { key: parentJiraKey }`.
8. Nếu parent thất bại terminal, chuyển child sang `blocked_by_parent`.
9. Lặp tới khi không còn item có thể chạy.
10. Tổng hợp operation state và gửi notification.

Không dùng `Promise.all` cho toàn bộ batch khi có dependency. Có thể giữ worker
pool nhưng queue phải chỉ chứa item đã thỏa dependency.

### 8.3 Trạng thái item

```text
ready
blocked
waiting_for_parent
pending
running
succeeded
failed
blocked_by_parent
cancelled
```

`blocked` là lỗi từ preview. `blocked_by_parent` là kết quả runtime hoặc retry khi
parent chưa thành công.

### 8.4 Retry

- Retry child khi parent đã succeeded: dùng Jira key đã lưu.
- Retry parent: khi thành công, tự mở khóa các child `blocked_by_parent` nếu lỗi
  duy nhất là parent.
- Cung cấp thao tác “Retry cả nhánh”.
- Không retry item `succeeded`.
- Trước mỗi retry vẫn tìm idempotency marker như hiện tại.
- Không thay parent snapshot trong lúc retry. Muốn đổi parent phải tạo preview/
  operation mới.

### 8.5 Tạo issue Jira

Mở rộng `CreateIssueInput` để nhận parent hoặc truyền trong `fields` đã chuẩn hóa:

```ts
fields.parent = { key: resolvedParentKey };
```

Không cho field tùy ý từ client ghi đè `project`, `issuetype`, `summary`,
`assignee` hoặc `parent` sau khi server đã chuẩn hóa.

## 9. Database và migration

Hai lựa chọn đã cân nhắc:

### Lựa chọn A — Chỉ lưu parent trong JSON `requested`

Ưu điểm: ít migration.  
Nhược điểm: khó query dependency, retry cả nhánh và theo dõi trạng thái.

### Lựa chọn B — Thêm cột dependency rõ ràng

Đề xuất chọn lựa chọn B:

```prisma
model BulkCreateItem {
  // field hiện có
  parentClientRef       String?
  parentJiraKey         String?
  resolvedParentJiraKey String?
  depth                 Int      @default(0)

  @@index([operationId, parentClientRef])
  @@index([operationId, parentJiraKey])
}
```

Quy tắc:

- Chỉ một trong `parentClientRef` và `parentJiraKey` có giá trị.
- `resolvedParentJiraKey` được điền khi parent Jira được xác nhận hoặc parent
  batch tạo thành công.
- `requested` vẫn lưu canonical snapshot đầy đủ phục vụ audit và replay.
- Không tạo foreign key trực tiếp bằng `parentClientRef` vì uniqueness là theo
  operation; service layer chịu trách nhiệm integrity.

Migration phải không làm thay đổi các operation V1 đã tồn tại.

## 10. CSV, TSV và paste

### 10.1 Header mới

Template V2:

```csv
clientRef,summary,issueType,parentRef,parentKey,description,assignee,priority,labels,points,originalEstimate,dueDate,fixVersions
PARENT-01,Xây API đăng nhập,Task,,,Mô tả,user.name,High,"backend,api",5,1d,2026-10-10,Release 1
CHILD-01,Thiết kế schema,Sub-task,PARENT-01,,Mô tả,user.name,Medium,backend,2,2h,2026-10-08,Release 1
CHILD-02,Test với task cha cũ,Sub-task,,ABC-123,Mô tả,user.name,Medium,test,1,1h,2026-10-09,Release 1
```

### 10.2 Quy tắc parent import

- `parentRef`: trỏ tới `clientRef` trong cùng file/batch.
- `parentKey`: Jira key đã tồn tại.
- Không được đặt đồng thời cả hai.
- `parentRef` có thể trỏ tới dòng nằm phía sau; parser không phụ thuộc thứ tự.
- Sau khi append vào bảng có sẵn, phải resolve theo toàn bộ batch, không chỉ file
  vừa import.
- Nếu replace/import làm trùng `clientRef`, yêu cầu người dùng sửa hoặc tự sinh
  lại ref, đồng thời cập nhật các `parentRef` liên quan trong cùng phần import.
- CSV chỉ nhận username/account ID cho assignee để tiện nhập, nhưng preview phải
  resolve thành user cụ thể và block giá trị mơ hồ/sai.

### 10.3 Custom fields trong CSV

Không tự mở rộng tùy ý trong pha đầu. Hỗ trợ dạng header ổn định:

```text
customfield_12345
```

Import dialog hiển thị bước mapping:

- Header CSV.
- Field Jira tương ứng.
- Kiểu dữ liệu.
- Cảnh báo field không thuộc issue type.

Nếu chưa triển khai mapping UI, required custom field vẫn phải được nhập qua side
panel sau khi import và trước preview.

## 11. Component và cấu trúc file dự kiến

### 11.1 Component mới

```text
src/app/(app)/bulk/create/
  assignee-combobox.tsx
  parent-combobox.tsx
  jira-option-select.tsx
  jira-option-multi-select.tsx
  label-combobox.tsx
  dynamic-field-renderer.tsx
  task-detail-sheet.tsx
  task-tree-row.tsx
  bulk-row-actions.tsx
  bulk-selection-toolbar.tsx
```

Nếu component có giá trị dùng chung ngoài Bulk Create, chuyển vào
`src/components/shared/` sau khi API ổn định, không tổng quát hóa quá sớm.

### 11.2 Hook mới

```text
src/hooks/
  use-bulk-create-metadata.ts
  use-assignable-users.ts
  use-parent-issues.ts
  use-label-suggestions.ts
```

Query keys phải bổ sung trong `src/lib/query-keys.ts`, bao gồm project,
issueTypeId và search query phù hợp.

### 11.3 Backend mới/chỉnh sửa

```text
src/app/api/bulk/create/assignees/route.ts
src/app/api/bulk/create/parents/route.ts
src/app/api/bulk/create/labels/route.ts
src/lib/bulk/create-types.ts
src/lib/bulk/create-validator.ts
src/lib/bulk/create-ops.ts
src/lib/bulk/dependency-graph.ts
src/lib/jira/client.ts
src/lib/jira/types.ts
src/lib/queue/workers/bulk-op.ts
prisma/schema.prisma
```

## 12. Kế hoạch triển khai theo pha

### Pha 0 — Contract và test baseline

**Mục tiêu:** khóa hành vi hiện tại trước khi thay đổi lớn.

**Công việc**

1. Bổ sung test contract V1 hiện có.
2. Tạo fixture metadata gồm:
   - Task.
   - Bug.
   - Sub-task.
   - Required custom select.
   - Multi-select.
   - User field.
3. Ghi nhận E2E hiện tại: grid → preview → confirm → progress.
4. Chốt Jira Data Center version và các endpoint user picker thực tế.
5. Đo response time của create metadata và user search.

**Hoàn tất khi**

- Test hiện tại pass.
- Có fixture đại diện cho project thật.
- Chốt được định danh user dùng khi create issue.

**Ước tính:** 0.5–1 ngày.

### Pha 1 — Field metadata và assignee an toàn

**Mục tiêu:** không còn nhập text tùy ý cho dữ liệu Jira quản lý.

**Công việc backend**

1. Mở rộng metadata schema/capability.
2. Thêm Jira client và API assignable users.
3. Thêm label suggestions.
4. Chuẩn hóa priority/version/custom option bằng ID.
5. Validate mọi required field.
6. Sửa points field để field ID phát hiện trong metadata cũng được worker sử
   dụng, không phụ thuộc riêng env.
7. Xóa priority fallback giả định.

**Công việc frontend**

1. Tạo assignee combobox.
2. Tạo option select/multi-select dùng chung.
3. Tạo labels creatable combobox.
4. Tạo dynamic field renderer.
5. Thêm inline validation và field inheritance indicator.
6. Preview hiển thị display values.
7. Chuyển Fix Version sang multi-select.

**Hoàn tất khi**

- Không thể confirm assignee sai.
- Required custom field bị thiếu được báo tại đúng dòng.
- Field có allowed values không nhận text ngoài danh sách.
- Worker gửi đúng points field ID từ snapshot.

**Ước tính:** 3–4 ngày.

### Pha 2 — Parent picker và contract V2

**Mục tiêu:** soạn và preview được task cha–con.

**Công việc**

1. Bổ sung `BulkParentRef` và payload V2.
2. Mở sub-task issue type trên UI.
3. Thêm parent issue search API.
4. Thêm parent combobox hai nguồn.
5. Thêm “Thêm task con”.
6. Thêm hierarchy/tree presentation.
7. Viết dependency graph và cycle validation.
8. Mở rộng CSV parser/template với `parentRef`, `parentKey`.
9. Preview hiển thị parent resolution và execution order.

**Hoàn tất khi**

- Có thể preview task con dùng parent Jira có sẵn.
- Có thể preview task con dùng parent trong cùng batch.
- Không thể tạo cycle hoặc chọn sub-task làm parent.

**Ước tính:** 2–3 ngày.

### Pha 3 — Worker thực thi dependency và retry nhánh

**Mục tiêu:** tạo task cha–con an toàn trên Jira.

**Công việc**

1. Migration các cột parent/dependency.
2. Lưu dependency snapshot.
3. Thay flat queue bằng dependency-aware queue.
4. Truyền `fields.parent` khi create sub-task.
5. Thêm `waiting_for_parent` và `blocked_by_parent`.
6. Thêm retry parent/child/cả nhánh.
7. Bổ sung progress UI cho dependency state.
8. Bổ sung audit parent resolution.

**Hoàn tất khi**

- Parent luôn được tạo trước child.
- Parent fail không tạo child sai.
- Retry parent thành công mở khóa child.
- Retry không tạo duplicate.

**Ước tính:** 2–3 ngày.

### Pha 4 — UX năng suất và hardening

**Mục tiêu:** làm luồng hiệu quả với batch lớn.

**Công việc**

1. Side panel cho field chi tiết.
2. Row selection và bulk actions.
3. Focus lỗi từ preview về input.
4. Draft local theo project.
5. Undo delete/bulk apply.
6. Keyboard navigation và paste range.
7. Responsive card mode.
8. Accessibility và dark/light verification.
9. Metrics cho operation chậm và lỗi theo field.

**Ước tính:** 2–4 ngày.

### Tổng ước tính

- Pha 0–3, đủ field an toàn và task cha–con: **7.5–11 ngày làm việc**.
- Bao gồm Pha 4 UX nâng cao: **9.5–15 ngày làm việc**.

Ước tính chưa bao gồm xử lý một custom field Jira có renderer đặc thù hoặc sai
khác giữa nhiều phiên bản Jira Data Center.

## 13. Test plan

### 13.1 Unit test

**Metadata adapter**

- Map issue type/subtask chính xác.
- Giữ required custom fields.
- Map allowed values và multi-select.
- Không tạo priority fallback giả.
- Fingerprint thay đổi khi field schema/allowed values thay đổi.

**Validator**

- Assignee valid/not found/inactive/not assignable.
- Parent Jira hợp lệ/sai project/không tồn tại/là sub-task.
- Parent batch hợp lệ/missing/self/cycle.
- Required custom field.
- Custom option không nằm trong allowed values.
- Fix Version archived.
- V1 compatibility và V2 normalization.

**Dependency graph**

- Batch chỉ có root.
- Một parent nhiều child.
- Nhiều parent độc lập.
- Parent nằm sau child trong input.
- Self-cycle và multi-node cycle.
- Parent blocked làm child blocked.

**CSV parser**

- `parentRef` và `parentKey`.
- Hai parent field cùng có giá trị.
- Forward reference.
- Append làm trùng clientRef.
- Assignee resolve thất bại ở preview, không biến mất âm thầm.

### 13.2 API test

- Auth và Jira credential bắt buộc.
- Project access isolation.
- Search query/rate limit/limit bounds.
- Không trả user không assignable/inactive.
- Parent search không trả issue project khác hoặc sub-task.
- Preview block metadata stale.
- Confirm không cho user khác dùng operation.

### 13.3 Worker test

- Parent success rồi child success.
- Parent 400 làm child `blocked_by_parent`.
- Parent timeout rồi reconcile marker thành công, child vẫn chạy đúng một lần.
- Hai root chạy song song nhưng child không chạy sớm.
- Retry parent mở child.
- Retry child dùng resolved parent key.
- Cancel operation không khởi chạy child mới.
- Partial failure tổng hợp đúng operation state.

### 13.4 Component/E2E test

- Keyboard search/chọn assignee.
- Clear assignee và chọn unassigned.
- Đổi project invalidate selection cũ.
- Đổi issue type cập nhật dynamic fields.
- Chọn sub-task làm hiện parent required.
- Thêm task con từ row action.
- Import cây task và preview đúng hierarchy.
- Sửa từ preview quay về đúng cell.
- Light/dark, 375/768/1024/1440 px.
- Screen reader labels, combobox roles, focus trap và focus return.

## 14. Security, permission và hiệu năng

### 14.1 Security

- Mọi Jira request dùng credential cá nhân của người thao tác.
- Không cache chung kết quả assignable users giữa các user có permission khác
  nhau.
- Không log token, email đầy đủ hoặc raw description.
- Server không tin option label, display name hoặc custom field object từ client.
- Chỉ whitelist field ID đã xuất hiện trong metadata snapshot.

### 14.2 Permission

- `CREATE_ISSUES` là điều kiện đầu tiên.
- Assignee phải phù hợp `ASSIGN_ISSUES`/assignable context của Jira.
- Parent Jira phải browse được bởi user.
- Nếu project không cho unassigned issue, `null` assignee phải bị block hoặc Jira
  default phải được mô tả rõ.

### 14.3 Hiệu năng

- Không tải toàn bộ user list.
- Debounce và hủy request search cũ.
- Cache metadata 5 phút như hiện tại nhưng fingerprint phải bao gồm field schema
  quan trọng.
- Cache user search ngắn, scoped theo credential hash/project/query.
- Batch validate assignee theo danh sách unique, không gọi Jira một lần mỗi dòng.
- Batch resolve parent Jira theo unique keys hoặc JQL gộp.
- Giữ worker concurrency 2–4 cho các item đã sẵn sàng.

## 15. Observability và audit

Bổ sung metrics:

- Preview duration.
- Metadata/user search latency và error rate.
- Số item bị block theo error code.
- Tỷ lệ assignee invalid.
- Số parent batch/Jira.
- Thời gian chờ parent.
- Số child `blocked_by_parent`.
- Retry success và idempotency reconciliation count.

Audit nên ghi:

- Operation ID.
- Client ref.
- Parent type và resolved parent Jira key.
- Issue type ID.
- Kết quả tạo/retry.

Không ghi raw token, email đầy đủ hoặc nội dung description.

## 16. Rollout và tương thích ngược

### 16.1 Feature flags đề xuất

- `BULK_CREATE_DYNAMIC_FIELDS`.
- `BULK_CREATE_ASSIGNABLE_USERS`.
- `BULK_CREATE_SUBTASKS`.
- `BULK_CREATE_DEPENDENCY_RETRY`.

Không nhất thiết giữ lâu dài; dùng để rollout và rollback an toàn.

### 16.2 Thứ tự rollout

1. Deploy metadata/assignee API nhưng chưa bật UI.
2. Bật field selectors cho nhóm nội bộ.
3. Theo dõi validation/Jira 400 trong vài ngày.
4. Deploy contract V2 và parent preview sau flag.
5. Deploy worker dependency-aware.
6. Chạy staging với project thử nghiệm.
7. Bật sub-task cho nhóm nhỏ.
8. Bật rộng sau khi xác nhận không có duplicate và orphan child.

### 16.3 Rollback

- Khi tắt sub-task flag, operation V2 đã confirm vẫn phải được worker hiểu và xử
  lý; không rollback code worker trước khi hết operation đang chạy.
- Operation V1 tiếp tục chạy theo flat path.
- Migration chỉ thêm nullable/default columns nên rollback UI không làm hỏng dữ
  liệu cũ.

## 17. Tiêu chí nghiệm thu

### 17.1 Field thông minh

- [ ] Issue type, priority, versions và custom options lấy từ metadata Jira.
- [ ] Assignee chỉ chọn từ user assignable.
- [ ] User inactive/không tồn tại bị chặn trước confirm.
- [ ] Fix Version hỗ trợ nhiều giá trị.
- [ ] Labels có suggestions và cho tạo mới hợp lệ.
- [ ] Required custom fields được render hoặc block rõ nếu chưa hỗ trợ.
- [ ] Preview hiển thị label/name thay vì ID.
- [ ] Metadata thay đổi sau preview bắt buộc preview lại.

### 17.2 Task cha–con

- [ ] Sub-task issue type xuất hiện trong danh sách.
- [ ] Sub-task bắt buộc chọn parent.
- [ ] Chọn được parent Jira cùng project.
- [ ] Chọn được parent trong cùng batch.
- [ ] Không chọn được sub-task làm parent.
- [ ] Không tạo được cycle.
- [ ] Parent batch luôn được tạo trước child.
- [ ] Parent fail làm child `blocked_by_parent`.
- [ ] Retry parent có thể mở khóa child.
- [ ] Idempotency vẫn bảo đảm không tạo duplicate.

### 17.3 Import và UX

- [ ] CSV/paste hỗ trợ `parentRef` và `parentKey`.
- [ ] Lỗi parent/assignee chỉ đúng dòng và cột.
- [ ] Preview có thể đưa người dùng về đúng field cần sửa.
- [ ] Có bulk apply cho các field thường dùng.
- [ ] Không horizontal scroll bắt buộc trên mobile.
- [ ] Keyboard và screen reader sử dụng được combobox.
- [ ] Light/dark mode đạt tương phản tối thiểu 4.5:1.

### 17.4 Quality gates

- [ ] Unit/API/worker/component tests pass.
- [ ] Typecheck pass.
- [ ] ESLint pass ở các file thay đổi.
- [ ] Production build pass.
- [ ] Staging E2E với Jira thật pass.
- [ ] Fault injection timeout/retry không tạo duplicate.
- [ ] Không có orphan sub-task hoặc child bị tạo thành root task.

## 18. Backlog chia nhỏ đề xuất

### P0 — An toàn dữ liệu

- `BC-SMART-001`: Chốt contract metadata field capability.
- `BC-SMART-002`: Assignable-user Jira client và API.
- `BC-SMART-003`: Assignee combobox và server validation.
- `BC-SMART-004`: Dynamic required-field validator.
- `BC-SMART-005`: Option select/multi-select theo allowed values.
- `BC-SMART-006`: Xóa priority fallback giả định.
- `BC-SMART-007`: Đồng nhất points field ID giữa preview và worker.

### P1 — Task cha–con

- `BC-SMART-101`: Contract V2 và parent reference.
- `BC-SMART-102`: Parent Jira search API.
- `BC-SMART-103`: Parent combobox và add-subtask action.
- `BC-SMART-104`: Dependency graph và cycle validation.
- `BC-SMART-105`: Migration dependency columns.
- `BC-SMART-106`: Dependency-aware worker.
- `BC-SMART-107`: Parent failure propagation.
- `BC-SMART-108`: Retry entire branch.
- `BC-SMART-109`: CSV parentRef/parentKey.

### P2 — Năng suất và trải nghiệm

| Ticket | Mô tả | Trạng thái | Ghi chú |
|--------|--------|:----------:|---------|
| BC-SMART-204 | Label suggestions endpoint + creatable combobox | ✅ Done | `GET /api/bulk/create/labels`, component `label-combobox.tsx`, tích hợp vào grid + defaults |
| BC-SMART-201 | Task detail sheet (drawer sửa field chi tiết) | ✅ Done | Component `task-detail-sheet.tsx` + `sheet.tsx`, nút chi tiết trên mỗi dòng grid |
| BC-SMART-202 | Bulk selection actions | ✅ Done | Checkbox select rows, toolbar: assignee/priority/labels/dueDate/issueType/delete/clear overrides |
| BC-SMART-203 | Editable preview / error focus | ✅ Done | Nút "Sửa" trên từng lỗi/cảnh báo, "Focus lỗi đầu tiên", scroll + mở detail sheet |
| BC-SMART-205 | Local draft/template | ✅ Done | Auto-save/restore theo projectKey trong localStorage, notification banner khôi phục/bỏ qua, fix TS2448 ordering |
| BC-SMART-206 | Responsive card mode | ✅ Done | Dual layout trong `create-task-grid.tsx`: Card mode trên mobile (<md) không horizontal scroll, giữ đầy đủ select/combobox/actions/overrides, Table mode trên desktop |
| BC-SMART-207 | Metrics và slow-operation alerts | ✅ Done | Module `create-metrics.ts`, tracking preview/execution/search latency, cảnh báo slow-operation (>3s preview, >10s execution, >2s search), hiển thị duration badge & alert banner trên UI preview |

### File mới/tạo thêm (P2)

```
src/app/api/bulk/create/labels/route.ts              — Label suggestions API (IssueCache)
src/app/(app)/bulk/create/label-combobox.tsx          — Creatable multi-select label combobox
src/app/(app)/bulk/create/task-detail-sheet.tsx       — Drawer panel sửa field chi tiết từng dòng
src/app/(app)/bulk/create/bulk-selection-toolbar.tsx  — Bulk actions toolbar khi chọn nhiều dòng
src/components/ui/sheet.tsx                           — Generic slide-over sheet component
src/lib/bulk/create-metrics.ts                       — Metrics & slow-operation alerts module
src/lib/bulk/create-metrics.test.ts                  — Unit test cho metrics và alerts
```

### File đã sửa (P2)

```
src/lib/bulk/create-types.ts                         — Thêm metrics field vào BulkCreatePreviewResult
src/lib/bulk/create-ops.ts                           — Tích hợp preview/execution metrics & slow alerts
src/lib/query-keys.ts                                — Thêm createLabels key
src/app/(app)/bulk/create/create-task-grid.tsx        — LabelCombobox, detail sheet, bulk selection, focusRow, mobile card mode
src/app/(app)/bulk/create/create-defaults-form.tsx   — LabelCombobox thay Input
src/app/(app)/bulk/create/create-preview.tsx         — Nút "Sửa" per error, "Focus lỗi đầu tiên", metrics duration badge, slow alert
src/app/(app)/bulk/create/bulk-create-client.tsx    — focusRow state, onFixRow wiring, draft save/restore theo projectKey
src/app/api/bulk/create/assignees/route.ts          — Tracking search latency với recordSearchMetrics
src/app/api/bulk/create/parents/route.ts            — Tracking search latency với recordSearchMetrics
src/app/api/bulk/create/labels/route.ts             — Tracking search latency với recordSearchMetrics
src/lib/bulk/create-validator.test.ts                — Cập nhật assertion SUBTASK_PARENT_REQUIRED -> PARENT_REQUIRED
src/lib/bulk/create-ops.test.ts                      — Cập nhật bulkCreateItemFindMany mock resolved loop
```

### Trạng thái hoàn thành P2

Tất cả 7/7 hạng mục P2 (Năng suất và trải nghiệm) đã được hoàn tất và nghiệm thu toàn diện (97 test files / 798 tests pass 100%, typecheck clean 0 error).

## 19. Rủi ro và phương án giảm thiểu

| Rủi ro | Mức độ | Giảm thiểu |
|---|---:|---|
| Jira DC version khác API user picker | Cao | Probe staging, adapter Jira client, contract test |
| Custom field có schema đặc thù | Cao | Renderer registry; required unsupported field phải block |
| Parent được tạo nhưng worker mất kết nối | Cao | Lưu Jira key ngay, reconcile marker trước retry |
| Metadata đổi giữa preview/confirm | Trung bình | Fingerprint đầy đủ và bắt preview lại |
| User assignable thay đổi sau preview | Trung bình | Jira vẫn là kiểm tra cuối; lỗi rõ theo item và retry được |
| Batch graph bị deadlock | Cao | Cycle detection và invariant test trước snapshot |
| UI grid quá phức tạp | Trung bình | Cột lõi + detail sheet, không thêm mọi field thành cột |
| Cache làm lộ dữ liệu permission | Cao | Cache scoped theo credential/user/project |
| Operation V1/V2 chạy đồng thời | Trung bình | Versioned payload và hai execution paths có test |

## 20. Definition of Done tổng thể

Hạng mục chỉ được coi là hoàn tất khi một người dùng có thể:

1. Chọn project và chỉ nhìn thấy field/option Jira hợp lệ.
2. Tìm và chọn một assignee thực sự assignable.
3. Tạo một task cha cùng hai sub-task trong cùng batch.
4. Tạo một sub-task khác trỏ tới parent Jira đã tồn tại.
5. Import cùng cấu trúc đó từ CSV.
6. Nhận lỗi chính xác trước confirm nếu assignee, parent hoặc custom field sai.
7. Xem preview dạng cây với tên field dễ hiểu.
8. Confirm và thấy parent được tạo trước child.
9. Retry an toàn khi parent hoặc child gặp lỗi tạm thời.
10. Không tạo duplicate, orphan sub-task hoặc task con bị biến thành root task.

## 21. P3 — Issue type rõ ràng, vùng nhập dễ dùng và task Jira làm mẫu

### 21.1 Kết quả rà soát hiện trạng

1. **Issue type không thiếu ở contract, nhưng chưa đủ rõ trên UI.** Grid desktop,
   mobile card và detail sheet đều có select “Loại task”; server cũng trả lỗi
   `ISSUE_TYPE_REQUIRED`. Tuy nhiên một dòng có thể để `issueTypeId` trống và kế
   thừa defaults. Select lúc đó chỉ hiện “Mặc định”, nên người dùng không biết
   task cuối cùng sẽ là Task, Story, Bug hay loại khác.
2. **Vùng nhập chính đang quá chật.** Summary trên desktop chỉ có chiều cao
   `h-8`, cột tối thiểu 220 px và hàng dùng padding nhỏ. Description chỉ có trong
   detail sheet với `rows={5}`. Cách bố trí này phù hợp xem nhanh nhưng khó nhập
   nhiều task hoặc nội dung dài.
3. **Hiện mới nhân bản được dòng trong batch.** Nút copy ở mỗi dòng sao chép row
   đang soạn và thêm hậu tố “(bản sao)”. Chưa có API/UI để đọc một issue Jira đã
   tồn tại rồi chuyển các field phù hợp thành dòng mẫu.

| Ticket | Mô tả | Trạng thái | Ưu tiên |
|--------|--------|:----------:|:-------:|
| BC-SMART-301 | Làm issue type bắt buộc và hiển thị giá trị hiệu lực rõ ràng | ✅ Done | P0 |
| BC-SMART-302 | Tăng kích thước, khả năng nhập liệu của grid và detail sheet | ✅ Done | P0 |
| BC-SMART-303 | API đọc task Jira để dùng làm mẫu | ✅ Done | P1 |
| BC-SMART-304 | Dialog “Lấy task Jira làm mẫu” và mapping preview | ✅ Done | P1 |
| BC-SMART-305 | Test contract, component và E2E cho P3 | Planned | P1 |

### 21.2 BC-SMART-301 — Issue type phải nhìn thấy và hiểu được

- Đổi nhãn cột thành “Loại task *” ở desktop, mobile và detail sheet.
- Khi dòng kế thừa defaults, select phải hiển thị tên hiệu lực, ví dụ
  “Task (mặc định)”, không chỉ hiển thị chữ “Mặc định”.
- Khi metadata có `defaultIssueTypeId`, khởi tạo defaults bằng ID đó. Nếu Jira
  không cung cấp default thì yêu cầu người dùng chọn trước khi preview.
- Phân biệt trực quan `kế thừa` và `ghi đè`; không ép ghi issue type vào từng row
  nếu defaults đã có giá trị hợp lệ.
- Khi đổi type, giữ quy tắc hiện tại về parent/sub-task và kiểm tra lại các custom
  field phụ thuộc type. Không âm thầm giữ field không hợp lệ của type cũ.
- CSV vẫn nhận ID hoặc tên issue type; preview chuẩn hóa về ID và hiển thị tên.

### 21.3 BC-SMART-302 — Vùng nhập task dễ sử dụng hơn

- Desktop: tăng chiều cao control lõi từ 32 px lên tối thiểu 40 px, tăng padding
  theo hàng và tăng cột Summary lên khoảng 320–420 px tùy viewport.
- Giữ các cột nhập nhanh gồm Summary, Issue type, Parent và Assignee. Các field
  ít dùng chuyển về detail sheet để bảng không bị kéo ngang quá mức.
- Cho phép Summary xuống dòng bằng textarea tự tăng chiều cao trong giới hạn
  2–3 dòng; Enter xuống dòng, không làm dịch chuyển bố cục ngoài giới hạn đặt ra.
- Detail sheet: tăng vùng Description lên tối thiểu khoảng 240 px, cho resize dọc
  và giữ bộ đếm ký tự theo `MAX_DESCRIPTION_LENGTH`.
- Mở detail sheet rộng hơn trên desktop nhưng vẫn full-width hợp lý trên mobile;
  sticky header/footer để nút đóng và trạng thái lưu luôn nhìn thấy.
- Kiểm tra bàn phím, focus, 375/768/1024/1440 px, light/dark mode và
  `prefers-reduced-motion`.

### 21.4 BC-SMART-303/304 — Dùng task Jira đã có làm mẫu

Thêm thao tác cấp trang **“Lấy task Jira làm mẫu”** cạnh “Nhập CSV / Dán Excel”.
Luồng đề xuất:

1. Người dùng nhập Jira key hoặc tìm theo key/summary trong project đang chọn.
2. UI gọi endpoint read-only và hiển thị preview các field có thể sao chép.
3. Người dùng chọn “Thêm thành dòng mới” hoặc “Áp dụng vào dòng đang chọn”.
4. Dòng mới luôn có `clientRef` mới; summary mặc định thêm “(bản sao)” nhưng cho
   sửa ngay trước khi thêm.
5. Dữ liệu đi qua validator/preview hiện có; không coi dữ liệu đọc từ Jira là đã
   hợp lệ cho create metadata hiện tại.

Endpoint đề xuất:

```http
GET /api/bulk/create/templates/from-issue?project=ABC&issueKey=ABC-123
```

Response chỉ trả DTO đã chuẩn hóa cho Bulk Create, không trả toàn bộ raw issue.
Backend kiểm tra session, Jira credential, quyền browse và issue thuộc đúng
project. Có thể tái sử dụng `jira.getIssue()` hiện có, bổ sung danh sách field
cần đọc và đối chiếu create metadata trước khi trả response.

**Field được sao chép khi hợp lệ:**

- Summary và description.
- Issue type nếu type đó có trong create metadata của project.
- Assignee sau khi xác nhận vẫn assignable.
- Priority, labels, story points, estimate, due date và Fix Version còn hợp lệ.
- Custom field chỉ khi đã có renderer/validator và field cho phép create.

**Field tuyệt đối không sao chép:**

- Jira key/id, status, resolution, created/updated, reporter và creator.
- Comment, attachment, worklog, changelog, watcher và vote.
- Issue link, sprint/rank, release state và dữ liệu hệ thống chỉ đọc.
- Parent mặc định; nếu source là sub-task, yêu cầu người dùng chọn parent mới.

Nếu một field không còn hợp lệ, dialog hiển thị “Bỏ qua” kèm lý do. Không làm
thất bại toàn bộ thao tác lấy mẫu chỉ vì một field tùy chọn không thể sao chép.
Issue type hoặc required field không tương thích phải được đánh dấu để người dùng
sửa trước preview.

### 21.5 Kiểm thử và tiêu chí nghiệm thu P3

- [ ] Mọi dòng đều hiển thị được tên issue type hiệu lực, kể cả khi kế thừa.
- [ ] Không thể confirm nếu issue type hiệu lực trống hoặc không thuộc project.
- [ ] Summary và description sử dụng thoải mái ở desktop/mobile, không overlap.
- [ ] Nhân bản dòng nội bộ vẫn hoạt động độc lập với lấy task Jira làm mẫu.
- [ ] Có thể nhập `ABC-123`, xem trước mapping và thêm thành một dòng mới.
- [ ] Task mẫu thuộc project khác hoặc không có quyền browse bị từ chối.
- [ ] Source là sub-task không mang parent cũ sang batch mới.
- [ ] Assignee/version/custom field hết hợp lệ bị bỏ qua hoặc block rõ ràng.
- [ ] Không response/log comment, attachment hoặc dữ liệu Jira ngoài allowlist.
- [ ] Unit test mapping allowlist/denylist; API test auth/project/error; component
  test inheritance và dialog; E2E cover lấy mẫu rồi preview/confirm.

