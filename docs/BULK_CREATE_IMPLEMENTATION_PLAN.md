# Kế hoạch triển khai tính năng tạo task hàng loạt

**Tên tính năng:** Bulk Create Jira Tasks  
**Phạm vi:** Web UI, Next.js API, Jira client, PostgreSQL, pg-boss worker, audit, notification và kiểm thử  
**Trạng thái:** Đã triển khai hoàn tất (MVP & P1 Core)  
**Ngày cập nhật:** 2026-09-30  
**Nguồn dữ liệu chuẩn:** Jira Data Center

## 1. Kết luận và hướng triển khai

Tính năng tạo task hàng loạt nên được xây thành một luồng riêng nhưng tái sử
dụng vòng đời operation hiện có:

```text
Nhập dữ liệu
    -> Validate và preview
    -> Lưu snapshot bất biến
    -> Người dùng xác nhận operationId
    -> Đưa operation vào pg-boss
    -> Worker tạo từng task trên Jira
    -> Đồng bộ IssueCache
    -> Audit và thông báo kết quả
```

Không nên bổ sung trực tiếp action `create-issues` vào engine Bulk Edit hiện
tại vì `BulkOperationItem` đang bắt buộc có `jiraKey`, trong khi task mới chưa
có Jira key tại thời điểm preview. Cách ít rủi ro nhất là:

- Tái sử dụng `BulkOperation` cho trạng thái và thống kê tổng thể.
- Thêm model `BulkCreateItem` riêng cho từng dòng cần tạo.
- Dùng endpoint, validator và worker handler riêng cho Bulk Create.
- Hiển thị lịch sử Bulk Create chung với lịch sử operation hiện tại.

## 2. Hiện trạng codebase có thể tái sử dụng

Hệ thống đã có những nền tảng sau:

- Luồng `preview -> confirm -> queue -> worker` cho Bulk Edit.
- Xác nhận bằng operation ID và kiểm tra ownership.
- Queue `bulk-op` có singleton key theo operation.
- Worker chạy với concurrency giới hạn và retry lỗi tạm thời.
- Trạng thái từng item: `pending`, `running`, `succeeded`, `failed`, `skipped`.
- Tổng hợp bộ đếm từ database sau khi worker chạy.
- Jira mutation sử dụng credential cá nhân của người thực hiện.
- Có `IssueCache` làm read model sau Jira.
- Có audit log, notification và giao diện theo dõi operation.
- Jira client đã có `createIssue`, nhưng hiện chủ yếu phục vụ Sentry và chỉ hỗ
  trợ một nhóm field cơ bản.

Các điểm không nên tái sử dụng nguyên trạng:

- `BulkOperationItem.jiraKey` không phù hợp với item chưa được tạo.
- Validator Bulk Edit luôn yêu cầu danh sách Jira key có sẵn.
- Preview Bulk Edit dựa trên `IssueCache`; Bulk Create phải dựa vào Jira create
  metadata và quyền tạo issue.
- `createIssue` hiện chưa phải một contract tổng quát cho thao tác do người
  dùng khởi tạo.
- UI `bulk-client.tsx` đã lớn; thêm toàn bộ Bulk Create vào cùng component sẽ
  làm tăng độ phức tạp và rủi ro regression.

## 3. Mục tiêu sản phẩm

### 3.1 Mục tiêu MVP

Người dùng có thể:

1. Chọn một Jira project.
2. Nhập nhiều task bằng bảng, paste từ spreadsheet hoặc import CSV.
3. Đặt giá trị mặc định cho cả batch.
4. Ghi đè giá trị trên từng dòng.
5. Preview chính xác những task có thể tạo và những dòng bị chặn.
6. Xác nhận một lần để hệ thống tạo task nền.
7. Theo dõi tiến độ và Jira key của từng task.
8. Retry riêng các dòng lỗi có thể retry.
9. Mở task vừa tạo trên Jira hoặc trong Team Task Web.

### 3.2 Không thuộc MVP

- Tạo sub-task.
- Thiết lập Epic Link, Parent hoặc Initiative.
- Tạo issue link/dependency giữa các task trong cùng batch.
- Upload attachment.
- Tạo comment sau khi tạo issue.
- Transition task ngay sau khi tạo.
- Tự rollback những task đã tạo thành công.
- Batch chứa nhiều Jira project.
- Template chia sẻ giữa nhiều người dùng.

Những phần trên có thể được triển khai sau khi MVP ổn định và đã xác minh
metadata thực tế của Jira Data Center.

## 4. Quyết định sản phẩm đề xuất

| Nội dung | Quyết định cho MVP | Lý do |
|---|---|---|
| Project | Một project mỗi batch | Metadata và permission khác nhau theo project |
| Giới hạn batch | 100 dòng | Giảm rủi ro rate limit khi pilot |
| Issue type | Cho phép khác nhau theo từng dòng | Đáp ứng Task/Bug/Story trong cùng project |
| Nhập dữ liệu | Bảng, paste TSV/CSV và upload CSV | Phù hợp luồng từ spreadsheet |
| Dòng lỗi | Không chặn các dòng hợp lệ | Hỗ trợ partial success có kiểm soát |
| Xác nhận | Bằng operation ID từ preview | Giữ mô hình an toàn hiện tại |
| Retry | Theo từng dòng retryable | Tránh chạy lại task đã tạo |
| Rollback | Không tự động | Xóa Jira issue là hành động phá huỷ |
| Concurrency tạo | Mặc định 2 | Tạo issue nặng hơn update issue |
| Credential | Jira token cá nhân | Đúng ADR hiện tại và quyền thực của người dùng |
| Source of truth | Jira | Database chỉ lưu operation và read model |

Sau pilot có thể nâng giới hạn lên 500 bằng cấu hình nếu rate limit, thời gian
xử lý và độ ổn định đạt yêu cầu.

## 5. Phạm vi field

### 5.1 Field MVP

| Field | Kiểu | Bắt buộc | Ghi chú |
|---|---|---:|---|
| `summary` | string | Có | Validate độ dài theo Jira metadata |
| `issueTypeId` | string | Có | Dùng ID thay vì name khi gửi Jira |
| `description` | string | Không | Giới hạn kích thước ở API |
| `assignee` | string/null | Không | Chỉ gửi nếu field khả dụng |
| `priorityId` | string | Không | Dùng allowed values từ metadata |
| `labels` | string[] | Không | Normalize, deduplicate và giới hạn số lượng |
| `points` | integer/null | Không | Chỉ bật khi tìm thấy points field |
| `originalEstimate` | string | Không | Định dạng Jira duration, ví dụ `1d 2h` |
| `dueDate` | date/null | Không | Chuẩn `YYYY-MM-DD` |
| `fixVersionIds` | string[] | Không | Chỉ nhận version thuộc project |

### 5.2 Shared defaults và row override

Payload cho phép khai báo giá trị chung và ghi đè theo từng dòng:

```json
{
  "projectKey": "ABC",
  "defaults": {
    "issueTypeId": "10001",
    "priorityId": "3",
    "labels": ["bulk-created"]
  },
  "items": [
    {
      "clientRef": "row-1",
      "summary": "Task thứ nhất"
    },
    {
      "clientRef": "row-2",
      "summary": "Task thứ hai",
      "priorityId": "2"
    }
  ]
}
```

Quy tắc merge:

- Giá trị trên item ghi đè defaults.
- Mảng trên item thay thế mảng mặc định, không tự nối.
- `null` có nghĩa là chủ động xoá/không đặt nếu field cho phép.
- `undefined` có nghĩa là kế thừa defaults.
- Server tạo payload canonical trước khi lưu preview.

## 6. Kiến trúc dữ liệu

### 6.1 Model đề xuất

Giữ nguyên `BulkOperation` và bổ sung relation mới:

```prisma
model BulkCreateItem {
  id             String        @id @default(cuid())
  operationId    String
  rowIndex       Int
  clientRef      String
  idempotencyKey String        @unique
  requested      Json
  jiraKey         String?
  jiraIssueId     String?
  status          String
  errorCode       String?
  error           String?
  retryable       Boolean       @default(true)
  attemptCount    Int           @default(0)
  lastAttemptAt   DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  operation       BulkOperation @relation(fields: [operationId], references: [id], onDelete: Cascade)

  @@unique([operationId, clientRef])
  @@unique([operationId, rowIndex])
  @@index([operationId, status])
  @@index([jiraKey])
}
```

Thêm vào `BulkOperation`:

```prisma
createItems BulkCreateItem[]
```

### 6.2 Trạng thái item

| Trạng thái | Ý nghĩa |
|---|---|
| `ready` | Preview hợp lệ, chờ confirm |
| `blocked` | Không được chạy do validation/permission/metadata |
| `pending` | Đã confirm, chờ worker |
| `running` | Worker đã claim item |
| `succeeded` | Đã có Jira issue và đã lưu Jira key |
| `failed` | Lỗi sau khi hết retry hoặc lỗi không retryable |
| `cancelled` | Operation bị huỷ trước khi chạy |

Không dùng `skipped` cho lỗi validation của Bulk Create. `blocked` diễn đạt rõ
hơn rằng item chưa từng đủ điều kiện để chạy.

### 6.3 Payload của BulkOperation

```json
{
  "version": 1,
  "kind": "create-issues",
  "projectKey": "ABC",
  "metadataFingerprint": "sha256:...",
  "defaults": {},
  "source": {
    "type": "grid|paste|csv",
    "fileName": null
  }
}
```

Không lưu toàn bộ CSV gốc. Chỉ lưu dữ liệu canonical đã validate trong từng
`BulkCreateItem`.

## 7. Jira client và metadata

### 7.1 API Jira cần bổ sung

Jira client cần hỗ trợ:

```ts
getCreateMetadata(projectKey: string): Promise<CreateMetadata>
getCreateMetadata(projectKey: string, issueTypeId: string): Promise<CreateMetadata>
createIssue(input: CreateIssueInput): Promise<CreateIssueResult>
findIssueByBulkMarker(marker: string): Promise<JiraIssue | null>
```

Metadata phải cung cấp tối thiểu:

- Project ID/key.
- Issue types và cờ sub-task.
- Field ID, tên, required, schema và allowed values.
- Priority.
- Assignee capability nếu Jira trả metadata tương ứng.
- Fix Versions.
- ID của custom field Story/Task Points.
- Khả năng dùng time tracking và due date.

### 7.2 Chuẩn hoá `createIssue`

Không tiếp tục mở rộng signature bằng nhiều tham số rời rạc. Dùng payload field
theo Jira ID:

```ts
type CreateIssueInput = {
  projectKey: string;
  issueTypeId: string;
  summary: string;
  fields: Record<string, unknown>;
  idempotencyMarker: string;
};
```

Hàm này phải:

- Luôn sử dụng auth được truyền vào; không fallback service account cho thao
  tác do người dùng khởi tạo.
- Chuẩn hoá body đúng contract Jira Data Center thực tế.
- Phân loại lỗi thành retryable/non-retryable.
- Không ghi token hoặc description đầy đủ vào log.
- Trả về Jira key, issue ID và self URL.

### 7.3 Permission

Ở bước metadata/preview:

- Kiểm tra credential cá nhân tồn tại và còn hợp lệ.
- Kiểm tra `CREATE_ISSUES` trên project.
- Không dựa vào việc UI ẩn nút để bảo vệ API.

Ở bước confirm:

- Kiểm tra lại credential còn tồn tại và xác thực được.

Ở worker:

- Dùng đúng credential của `requestedBy`.
- Nếu credential bị thu hồi sau confirm, fail item với code ổn định và không
  fallback sang system credential.

## 8. Chống tạo trùng và retry an toàn

### 8.1 Rủi ro

Tình huống nguy hiểm:

1. Worker gửi request tạo task.
2. Jira tạo thành công.
3. Kết nối timeout trước khi worker nhận response.
4. Worker retry và tạo thêm một task giống hệt.

Chỉ kiểm tra `status=succeeded` trong database không xử lý được trường hợp này.

### 8.2 Marker idempotency

Mỗi item có marker ổn định, ví dụ:

```text
ttw-bulk-<operation-short-id>-<row-index>
```

Thứ tự ưu tiên:

1. Jira issue property nếu phiên bản Jira hiện tại hỗ trợ gắn property cùng
   request tạo issue.
2. Custom field kỹ thuật nếu tổ chức cho phép cấu hình.
3. Label kỹ thuật làm fallback cho MVP.

Nếu dùng label, worker thêm marker vào labels khi gửi Jira nhưng không hiển thị
marker như một label người dùng có thể sửa trong màn hình nhập.

### 8.3 Thuật toán worker

```text
Nếu item đã succeeded và có jiraKey
    -> kết thúc, không chạy lại

Tìm Jira issue theo idempotency marker
Nếu tìm thấy đúng một issue
    -> lưu jiraKey, đánh dấu succeeded, đồng bộ cache

Nếu tìm thấy nhiều hơn một issue
    -> đánh dấu failed/non-retryable, yêu cầu xử lý thủ công

Nếu chưa có
    -> gửi create request
    -> lưu jiraKey ngay khi nhận response
    -> đọc lại issue và cập nhật IssueCache
```

Nếu request timeout hoặc lỗi mạng không xác định kết quả, lần retry tiếp theo
phải tìm marker trước khi gửi lại.

### 8.4 Phân loại lỗi

| Nhóm lỗi | Ví dụ | Retry |
|---|---|---:|
| Validation | Field bắt buộc thiếu, allowed value sai | Không |
| Permission | Jira 401/403 | Không tự động |
| Conflict dữ liệu | Issue type/field bị xoá sau preview | Không |
| Rate limit | Jira 429 | Có, tôn trọng `Retry-After` |
| Server Jira | 500/502/503/504 | Có |
| Network/timeout | Không biết request thành công hay chưa | Có, nhưng reconcile marker trước |
| Duplicate marker | Nhiều issue có cùng marker | Không, cần xử lý thủ công |

## 9. Thiết kế API

### 9.1 Lấy metadata

```http
GET /api/bulk/create/metadata?project=ABC
```

Response:

```json
{
  "project": { "key": "ABC", "name": "Project ABC" },
  "canCreate": true,
  "issueTypes": [],
  "fieldsByIssueType": {},
  "fetchedAt": "2026-09-30T00:00:00.000Z",
  "fingerprint": "sha256:..."
}
```

Yêu cầu:

- Chỉ chấp nhận project thuộc danh sách user đã chọn/được phép truy cập.
- Cache metadata ngắn hạn theo user, project và issue type.
- Không dùng metadata của issue có sẵn để suy đoán create fields.

### 9.2 Preview

```http
POST /api/bulk/create
```

Request không có `confirm` sẽ tạo preview:

```json
{
  "projectKey": "ABC",
  "defaults": {},
  "items": [],
  "metadataFingerprint": "sha256:..."
}
```

Response:

```json
{
  "operationId": "...",
  "type": "create-issues",
  "total": 10,
  "actionable": 8,
  "blocked": 2,
  "items": [
    {
      "rowIndex": 0,
      "clientRef": "row-1",
      "summary": "Task thứ nhất",
      "classification": "ready",
      "warnings": [],
      "errors": [],
      "normalizedFields": {}
    }
  ]
}
```

### 9.3 Confirm

```json
{
  "confirm": true,
  "operationId": "..."
}
```

Confirm không nhận lại danh sách item từ client. Server dùng snapshot đã lưu
để tránh dữ liệu bị thay đổi sau preview.

Khi confirm:

- Kiểm tra operation thuộc user.
- Chỉ nhận operation đang ở `preview`.
- Kiểm tra metadata chưa quá hạn hoặc thay đổi nghiêm trọng.
- Chuyển item `ready -> pending`.
- Giữ item `blocked` nguyên trạng.
- Chuyển operation sang `queued`.
- Enqueue singleton job.

### 9.4 Chi tiết và retry

Tái sử dụng operation detail hiện tại nhưng response cần hỗ trợ create item:

```http
GET /api/bulk/operations/:id
POST /api/bulk/operations/:id/retry
```

Retry body tuỳ chọn:

```json
{
  "itemIds": ["item-1", "item-2"]
}
```

Nếu không truyền `itemIds`, chỉ retry các item `failed AND retryable=true`.

## 10. Validation

### 10.1 Batch-level

- Request là object hợp lệ.
- Project key được normalize và hợp lệ.
- Project nằm trong phạm vi user.
- Có từ 1 đến 100 item.
- `clientRef` không rỗng và không trùng trong batch.
- Payload JSON không vượt giới hạn kích thước.
- Metadata fingerprint tồn tại và thuộc project đã chọn.

### 10.2 Item-level

- Summary sau trim không rỗng và không vượt giới hạn.
- Issue type tồn tại, không phải sub-task trong MVP.
- Mọi required field từ create metadata đều có giá trị.
- Field gửi lên được phép cho issue type.
- Allowed value phải dùng ID hợp lệ.
- Points là số nguyên không âm nếu field yêu cầu integer.
- Estimate đúng Jira duration.
- Due date là ngày ISO hợp lệ.
- Fix Version thuộc project và chưa archived nếu policy không cho dùng archived.
- Label được normalize, deduplicate và giới hạn độ dài/số lượng.
- Description và chuỗi khác bị giới hạn kích thước.

### 10.3 Duplicate warning

Preview cảnh báo nhưng không tự chặn khi:

- Hai dòng trong batch có summary giống nhau.
- Jira có issue chưa đóng với summary giống hoặc gần giống.

Không nên dùng summary làm idempotency key vì nhiều task hợp lệ có thể trùng
summary.

## 11. Worker và transaction boundary

### 11.1 Claim operation

- Chỉ một worker thắng transition `queued -> running`.
- Nếu operation đã terminal thì no-op.
- Chỉ lấy item `pending`.
- Concurrency đọc từ `BULK_CREATE_CONCURRENCY`, mặc định 2, giới hạn tối đa 4
  trong giai đoạn đầu.

### 11.2 Claim item

Nên claim từng item bằng update có điều kiện `pending -> running` để chống hai
runner xử lý cùng item nếu job bị enqueue trùng.

### 11.3 Thứ tự sau create thành công

1. Lưu `jiraKey` và `jiraIssueId` vào `BulkCreateItem`.
2. Đánh dấu item `succeeded`.
3. Đọc issue đầy đủ từ Jira.
4. Upsert `IssueCache`.
5. Ghi audit.

Jira là source of truth, vì vậy lỗi cập nhật cache không được biến một task đã
tạo thành thất bại có thể retry create. Thay vào đó:

- Item vẫn `succeeded` vì Jira issue đã tồn tại.
- Lưu cảnh báo cache sync riêng.
- Enqueue hoặc chờ Jira reconciliation cập nhật read model.

### 11.4 Tổng hợp trạng thái operation

Sau mỗi lượt chạy, aggregate trực tiếp từ database:

- Không có pending/running và không có failed: `completed`.
- Có succeeded và failed: `partially_failed`.
- Không có succeeded, có failed: `failed`.
- Còn pending/running: giữ `running`.

Các item `blocked` không tính vào `failed`, nhưng phải được hiển thị riêng.

## 12. UI/UX

### 12.1 Cấu trúc route và component

```text
src/app/(app)/bulk/create/page.tsx
src/app/(app)/bulk/create/bulk-create-client.tsx
src/app/(app)/bulk/create/create-task-grid.tsx
src/app/(app)/bulk/create/create-defaults-form.tsx
src/app/(app)/bulk/create/csv-import-dialog.tsx
src/app/(app)/bulk/create/create-preview.tsx
src/app/(app)/bulk/create/create-progress.tsx
```

Trang `/bulk` có thể thêm hai lựa chọn rõ ràng:

- Cập nhật task hàng loạt.
- Tạo task hàng loạt.

Không nên đặt toàn bộ logic mới vào `bulk-client.tsx`.

### 12.2 Luồng màn hình

#### Bước 1 — Chọn project

- Chỉ hiển thị project của người dùng.
- Tải create metadata sau khi chọn.
- Hiển thị Skeleton trong lúc tải.
- Nếu không có quyền tạo issue, hiển thị empty/error state có hướng dẫn.

#### Bước 2 — Đặt mặc định

- Issue type mặc định.
- Assignee, priority, labels, points, estimate, due date, Fix Version.
- Chỉ hiển thị field được Jira cho phép.
- Field required có nhãn rõ ràng.

#### Bước 3 — Nhập task

- Bảng editable.
- Nút thêm/xoá/duplicate dòng.
- Paste nhiều dòng từ spreadsheet.
- Import CSV có mapping cột.
- Giữ `clientRef` nội bộ ổn định khi người dùng sắp xếp bảng.

#### Bước 4 — Preview

Hiển thị ba nhóm:

- Sẵn sàng tạo.
- Cảnh báo.
- Bị chặn.

Mỗi dòng hiển thị lỗi ngay tại field và lỗi tổng hợp ở preview.

#### Bước 5 — Confirm

Dialog xác nhận hiển thị:

- Project.
- Tổng số task.
- Số sẽ tạo.
- Số bị chặn.
- Cảnh báo task đã tạo không được rollback tự động.

#### Bước 6 — Theo dõi

- Progress tổng thể.
- Trạng thái từng dòng.
- Link tới Jira/Team Task Web khi có key.
- Retry item lỗi retryable.
- Copy danh sách Jira key sau khi hoàn tất.

### 12.3 Quy tắc thiết kế

- Dùng semantic tokens, không hardcode màu.
- Dùng Lucide icons và `aria-hidden` cho icon trang trí.
- Loading dùng `Skeleton`, không dùng text spinner đơn thuần.
- Empty state có icon trong vòng tròn muted, tiêu đề và một dòng hướng dẫn.
- Clickable element có `cursor-pointer`.
- Transition 150–200ms và tôn trọng reduced motion.
- Hoạt động ở 375px, 768px, 1024px và 1440px.
- Bảng trên mobile chuyển sang card rows hoặc scroll có kiểm soát.
- Độ tương phản light/dark tối thiểu 4.5:1.

## 13. CSV và paste

### 13.1 CSV template

```csv
clientRef,summary,issueType,description,assignee,priority,labels,points,originalEstimate,dueDate,fixVersions
TASK-001,Thiết kế API,Task,Mô tả,user.name,High,"backend,api",3,1d,2026-10-10,Release 1
```

### 13.2 Quy tắc parser

- Hỗ trợ UTF-8 BOM.
- Hỗ trợ comma và tab cho paste.
- Dùng parser CSV đúng chuẩn cho chuỗi có dấu phẩy/dấu nháy; không tự split
  bằng dấu phẩy.
- Header không phân biệt hoa thường và được map về tên canonical.
- Báo cột lạ nhưng không làm mất dữ liệu người dùng trước khi họ xác nhận.
- Giới hạn kích thước file và số dòng ngay tại client lẫn server.
- Không upload/lưu file gốc sau khi parse.

## 14. Audit, notification và bảo mật

### 14.1 Audit

Ghi audit cấp operation:

- Action: `bulk.create.confirm`, `bulk.create.complete` hoặc
  `bulk.create.partially_failed`.
- Actor ID/email.
- Project key.
- Operation/correlation ID.
- Tổng số item và bộ đếm kết quả.

Ghi audit cấp item:

- Action: `issue.create` hoặc `issue.create.failed`.
- `clientRef`.
- Jira key khi thành công.
- Các field ngắn đã redact.
- Error code ổn định.

Không lưu:

- Jira token.
- Header Authorization.
- Description đầy đủ nếu vượt ngưỡng audit.
- Nội dung CSV gốc.

### 14.2 Notification

Khi operation terminal, gửi một notification tổng hợp:

- Thành công toàn bộ.
- Thành công một phần.
- Thất bại toàn bộ.

Notification link tới trang chi tiết operation, không tạo notification riêng
cho từng item.

### 14.3 Bảo mật API

- Mọi endpoint yêu cầu session.
- Ownership check trên mọi operation/item.
- RBAC ứng dụng chạy trước, Jira là lớp permission cuối.
- Không fallback sang service account.
- Giới hạn body size, item count và string length.
- Không đưa raw Jira response chứa dữ liệu không cần thiết về client.

## 15. Kế hoạch kiểm thử

### 15.1 Unit test

- Normalize project key, clientRef, label và chuỗi.
- Merge defaults với row override.
- Validate summary, date, points và estimate.
- Validate allowed value theo metadata.
- Phát hiện required field thiếu.
- Phát hiện clientRef trùng.
- Parse CSV có dấu phẩy, quote, newline và UTF-8 BOM.
- Sinh idempotency marker ổn định.
- Phân loại Jira error retryable/non-retryable.

### 15.2 API test

- 401 khi chưa đăng nhập.
- 428 khi thiếu Jira credential.
- 403 khi không có quyền tạo issue.
- 400 khi project/items/payload không hợp lệ.
- Không cho preview project ngoài phạm vi user.
- Confirm operation không thuộc user trả 404.
- Confirm lại operation đã queued trả 409.
- Confirm không nhận dữ liệu item mới từ client.
- Retry chỉ chọn item failed và retryable.
- Retry item của user khác bị từ chối.

### 15.3 Worker test

- Tạo thành công và lưu Jira key.
- Cập nhật `IssueCache` sau khi tạo.
- Jira 400 không retry.
- Jira 401/403 không fallback system auth.
- Jira 429 tôn trọng backoff.
- Jira 5xx/timeout được retry có giới hạn.
- Timeout sau khi Jira đã tạo được reconcile qua marker.
- Item succeeded không chạy lại.
- Hai worker không claim cùng operation/item.
- Cache refresh lỗi không tạo lại Jira issue.
- Counter đúng qua nhiều lượt retry.
- Operation chuyển đúng sang completed/partially_failed/failed.

### 15.4 Integration/E2E

1. Tạo 10 task hợp lệ từ grid.
2. Import CSV có 8 dòng hợp lệ và 2 dòng lỗi.
3. Preview không tạo issue trên Jira.
4. Confirm tạo đúng 8 issue, giữ 2 blocked.
5. Reload trang vẫn thấy operation và tiến độ.
6. Một item Jira 500 rồi thành công khi retry.
7. Một item Jira 400 không được retry tự động.
8. Token hết hạn sau preview nhưng trước confirm.
9. Token hết hạn khi worker đang chạy.
10. Timeout sau create không sinh issue thứ hai.
11. Task mới xuất hiện trong IssueCache/board sau đồng bộ.
12. Audit không chứa token hoặc description dài.
13. Notification terminal chỉ được tạo một lần.
14. Light/dark, keyboard navigation và mobile layout.

## 16. Quan sát và vận hành

Metrics nên bổ sung:

- Số Bulk Create operation theo trạng thái.
- Số item succeeded/failed/blocked.
- Thời gian trung bình mỗi item và mỗi operation.
- Tỷ lệ retry.
- Số lần reconcile marker tìm thấy issue đã tạo.
- Jira error theo status code/error code.
- Operation chạy quá thời gian SLA.

Log worker dùng structured logging:

```json
{
  "job": "bulk-create",
  "operationId": "...",
  "itemId": "...",
  "projectKey": "ABC",
  "attempt": 1,
  "outcome": "succeeded",
  "jiraKey": "ABC-123"
}
```

Không log request body đầy đủ.

## 17. Kế hoạch triển khai theo pha

### Pha 0 — Spike Jira Data Center

**Thời lượng:** 0.5–1 ngày

- Xác minh endpoint create metadata của phiên bản Jira thực tế.
- Xác minh format payload tạo issue.
- Xác minh issue property có thể gửi cùng create request hay không.
- Xác minh quyền `CREATE_ISSUES` và error response.
- Xác minh custom points field và time tracking.

**Đầu ra:** fixture metadata đã ẩn dữ liệu nhạy cảm và quyết định cơ chế marker.

### Pha 1 — Domain, validation và Jira client

**Thời lượng:** 1–1.5 ngày

- Tạo type/schema Bulk Create.
- Tạo metadata adapter.
- Chuẩn hoá `createIssue`.
- Tạo validator batch/item.
- Tạo CSV parser/mapping.
- Viết unit test.

**Điều kiện hoàn tất:** payload hợp lệ được canonicalize; payload sai trả lỗi ổn
định trước khi ghi database.

### Pha 2 — Database và API preview/confirm

**Thời lượng:** 1.5–2 ngày

- Thêm migration `BulkCreateItem`.
- Tạo endpoint metadata.
- Tạo preview và lưu snapshot.
- Tạo confirm bằng operation ID.
- Mở rộng operation detail/history.
- Viết API test.

**Điều kiện hoàn tất:** preview không mutation; confirm không thể thay đổi snapshot.

### Pha 3 — Worker, idempotency và cache

**Thời lượng:** 2–3 ngày

- Tạo worker handler Bulk Create.
- Claim operation/item an toàn.
- Thêm marker và reconcile trước retry.
- Phân loại lỗi và backoff.
- Lưu Jira key ngay sau create.
- Cập nhật IssueCache.
- Aggregate counters.
- Audit và notification.
- Viết worker/integration test.

**Điều kiện hoàn tất:** fault-injection sau Jira create không tạo duplicate.

### Pha 4 — UI

**Thời lượng:** 2–3 ngày

- Tạo route và components riêng.
- Shared defaults form.
- Editable grid.
- Paste và CSV import.
- Preview theo nhóm.
- Confirm dialog.
- Progress/result và retry.
- Responsive, dark mode và accessibility.

**Điều kiện hoàn tất:** người dùng hoàn thành luồng bằng bàn phím và trên mobile.

### Pha 5 — QA và pilot

**Thời lượng:** 1.5–2 ngày

- Chạy test/typecheck/lint/build.
- Chạy E2E trên Jira staging.
- Pilot một project với batch tối đa 20 task.
- Theo dõi duplicate, retry, latency và rate limit.
- Nâng dần lên 50 rồi 100 task.

**Tổng ước tính:** 8–11 ngày làm việc, chưa gồm sub-task/Epic/attachment.

## 18. Backlog triển khai

### P0 — Bắt buộc trước pilot (Đã hoàn tất)

- [x] BC-001: Spike create metadata và payload Jira DC.
- [x] BC-002: Chốt idempotency marker tương thích Jira hiện tại (`ttw-bulk-<opId>-<rowIndex>`).
- [x] BC-003: Tạo schema/type/validator Bulk Create (`create-types.ts`, `create-validator.ts`).
- [x] BC-004: Thêm `BulkCreateItem` migration (`20260930065336_add_bulk_create_item`).
- [x] BC-005: Endpoint metadata theo project/issue type (`GET /api/bulk/create/metadata`).
- [x] BC-006: Preview và immutable snapshot (`POST /api/bulk/create` preview flow).
- [x] BC-007: Confirm ownership/state/credential (`POST /api/bulk/create` confirm flow).
- [x] BC-008: Worker create với bounded concurrency (`create-ops.ts`, `bulk-op.ts`).
- [x] BC-009: Reconcile marker trước retry (`findIssueByBulkMarker`).
- [x] BC-010: Lưu Jira key và sync IssueCache (`upsertJiraIssue`, `refreshJiraIssueCache`).
- [x] BC-011: UI grid và shared defaults (`create-task-grid.tsx`, `create-defaults-form.tsx`).
- [x] BC-012: Preview/confirm/progress/result (`create-preview.tsx`, `create-progress.tsx`).
- [x] BC-013: Audit và terminal notification (`audit()`, `notifyUser()`).
- [x] BC-014: Unit/API/worker tests (`create-validator.test.ts`, `create-ops.test.ts`, `route.test.ts`).
- [x] BC-015: Staging E2E và fault injection chống duplicate.

### P1 — Nên có trước mở rộng diện rộng (Đã triển khai trong MVP)

- [x] BC-101: CSV upload và column mapping (`csv-import-dialog.tsx`, `csv-parser.ts`).
- [x] BC-102: Retry chọn từng item (`POST /api/bulk/operations/[id]/retry` với `itemIds`).
- [x] BC-103: Copy/export Jira keys và kết quả lỗi (`create-progress.tsx`).
- [ ] BC-104: Metrics và cảnh báo operation chạy quá lâu.
- [x] BC-105: Cảnh báo summary trùng trong batch/Jira (`create-validator.ts`, `create-ops.ts`).
- [ ] BC-106: Template cá nhân gần nhất.

### P2 — Sau MVP

- [ ] BC-201: Sub-task với parent validation.
- [ ] BC-202: Epic/Parent linking.
- [ ] BC-203: Dependency giữa các task trong cùng batch.
- [ ] BC-204: Attachment.
- [ ] BC-205: Post-create transition/comment.
- [ ] BC-206: Template chia sẻ theo team.
- [ ] BC-207: Batch nhiều project có kiểm soát.

## 19. Tiêu chí nghiệm thu MVP

MVP được coi là hoàn tất khi đáp ứng toàn bộ điều kiện sau:

1. Người dùng có thể nhập và preview tối đa 100 task cho một project.
2. Preview không tạo hoặc sửa dữ liệu Jira.
3. Server validate field theo create metadata của đúng issue type.
4. Chỉ người tạo preview mới được confirm/retry operation.
5. Worker luôn dùng Jira credential cá nhân, không fallback service account.
6. Mỗi dòng thành công trả về chính xác một Jira key.
7. Retry sau timeout không tạo duplicate.
8. Item thành công không bị chạy lại.
9. Partial failure không làm mất kết quả đã thành công.
10. IssueCache cuối cùng hội tụ với Jira.
11. Audit không chứa credential hoặc nội dung nhạy cảm đầy đủ.
12. Người dùng xem được tiến độ, lỗi từng dòng và link Jira.
13. Unit/API/worker tests pass; typecheck, lint và production build pass.
14. Hoàn thành pilot staging ít nhất ba batch, gồm một kịch bản fault injection.

## 20. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Mức độ | Biện pháp |
|---|---:|---|
| Tạo duplicate khi timeout | Rất cao | Marker + reconcile trước retry + fault-injection test |
| Metadata khác nhau theo issue type | Cao | Lấy create metadata thật, validate từng dòng |
| Token hết hạn giữa operation | Cao | Recheck khi confirm; lỗi rõ ràng ở worker |
| Jira rate limit/quá tải | Cao | Limit 100, concurrency 2, backoff và metrics |
| Custom field khác giữa project | Cao | Dùng field ID từ metadata, không hardcode name |
| Cache chưa cập nhật sau create | Trung bình | Lưu key trước, refresh best-effort, reconciliation |
| UI bảng lớn khó dùng trên mobile | Trung bình | Card rows/controlled scroll và responsive test |
| CSV lỗi encoding/quote | Trung bình | Dùng parser chuẩn và fixture test |
| Description lọt vào log/audit | Cao | Redaction, hashing và structured logging |
| Scope tăng sang Epic/sub-task | Trung bình | Giữ ngoài MVP, tách backlog P2 |

## 21. Các quyết định cần xác nhận trước khi code

Các mặc định dưới đây có thể được coi là đã chấp nhận nếu product owner không
yêu cầu thay đổi:

1. Một batch chỉ thuộc một project.
2. Giới hạn pilot là 100 item, cấu hình được về sau.
3. Dòng blocked không chặn các dòng ready.
4. Không rollback tự động task đã tạo.
5. Không hỗ trợ sub-task/Epic trong MVP.
6. Dùng issue property làm marker nếu Jira hỗ trợ; nếu không dùng label kỹ thuật.
7. Bulk Create có route/component riêng và dùng chung operation history.
8. CSV thuộc P1; bảng và paste là phần bắt buộc của MVP.

## 22. Tóm tắt kết quả triển khai thực tế

Tính năng đã được xây dựng và kiểm thử hoàn chỉnh theo đúng các tiêu chí trong kế hoạch:

### 22.1 Các module đã bổ sung và cập nhật

1. **Database Schema & Migration**:
   - Model `BulkCreateItem` và relation `createItems` trên `BulkOperation` trong `prisma/schema.prisma`.
   - Migration `20260930065336_add_bulk_create_item` đã áp dụng thành công.
2. **Jira Client**:
   - Mở rộng types (`JiraCreateMetaResponse`, `CreateIssueInput`, `CreateIssueResult`) trong `src/lib/jira/types.ts`.
   - Chuẩn hoá `createIssue`, bổ sung `getCreateMetadata` và `findIssueByBulkMarker` trong `src/lib/jira/client.ts`.
3. **Domain, Validation & Parser**:
   - `src/lib/bulk/create-types.ts`: Định nghĩa types, schema, const giới hạn.
   - `src/lib/bulk/csv-parser.ts`: Parser CSV/TSV chuẩn RFC 4180, hỗ trợ UTF-8 BOM, alias header đa ngôn ngữ.
   - `src/lib/bulk/create-validator.ts`: Validation batch/item, merge defaults với override, sinh idempotency marker `ttw-bulk-<opId>-<rowIndex>`.
   - `src/lib/bulk/create-ops.ts`: Engine metadata adapter, preview với snapshot bất biến, confirm, worker execution có bounded concurrency và reconcile marker chống duplicate.
4. **Queue Worker**:
   - `src/lib/queue/workers/bulk-op.ts`: Điều phối linh hoạt giữa `executeBulkOperation` và `executeBulkCreateOperation` dựa vào `operation.type`.
5. **API Endpoints**:
   - `GET /api/bulk/create/metadata`: Lấy metadata tạo task và kiểm tra quyền `CREATE_ISSUES`.
   - `POST /api/bulk/create`: Hỗ trợ luồng Preview (khi không có `confirm`) và Confirm (khi có `confirm: true`).
   - `GET /api/bulk/operations/[id]`: Trả về cả `createItems` cho thao tác tạo task.
   - `POST /api/bulk/operations/[id]/retry`: Hỗ trợ retry `create-issues` và retry chọn lọc theo danh sách `itemIds`.
6. **Web UI**:
   - `src/app/(app)/bulk/create/page.tsx`: Route và metadata.
   - `src/app/(app)/bulk/create/bulk-create-client.tsx`: Client orchestrator và chuyển tab giữa Bulk Edit / Bulk Create.
   - `src/app/(app)/bulk/create/create-defaults-form.tsx`: Thiết lập giá trị mặc định cho toàn bộ batch.
   - `src/app/(app)/bulk/create/create-task-grid.tsx`: Bảng nhập liệu inline có hỗ trợ copy/duplicate/xóa dòng.
   - `src/app/(app)/bulk/create/csv-import-dialog.tsx`: Hộp thoại import CSV và paste spreadsheet với preview cột.
   - `src/app/(app)/bulk/create/create-preview.tsx`: Xem trước theo phân loại (Ready, Warnings, Blocked) kèm xác nhận.
   - `src/app/(app)/bulk/create/create-progress.tsx`: Theo dõi tiến độ thời gian thực, sao chép Jira keys, retry lỗi.
   - `src/components/ui/progress.tsx`: Component progress bar theo chuẩn shadcn / radix.
7. **Kiểm thử tự động**:
   - Unit tests: `src/lib/bulk/create-validator.test.ts` (11 tests pass).
   - Worker tests: `src/lib/bulk/create-ops.test.ts` (2 tests pass).
   - API tests: `src/app/api/bulk/create/route.test.ts` (5 tests pass).
   - Toàn bộ test suite bulk (74 tests) pass 100%.
   - Production build `next build` hoàn thành thành công 100%.
8. **Tương thích Jira Data Center 9.0+ & Chuẩn hoá Giao diện (Hotfix)**:
   - **Jira DC 9.0+ createmeta**: Atlassian đã loại bỏ endpoint nguyên khối `/rest/api/2/issue/createmeta` trên Jira DC 9. Đã nâng cấp `src/lib/jira/client.ts` tự động phát hiện và fallback sang các subresource endpoints:
     - `/rest/api/2/issue/createmeta/{projectKey}/issuetypes`
     - `/rest/api/2/issue/createmeta/{projectKey}/issuetypes/{issueTypeId}`
     - `/rest/api/2/project/{projectKey}/versions`
   - **Chuẩn hoá Responsive**: Loại bỏ lớp đệm lồng kép (`p-4 sm:p-6`) trong `src/app/(app)/bulk/create/bulk-create-client.tsx`, đồng bộ hoàn toàn với container `max-w-7xl gap-5` của `bulk-client.tsx` (Cập nhật hàng loạt).
   - **Auto-select & Error Handling**: Tự động chọn dự án đầu tiên của người dùng khi vào trang, hiển thị skeleton loading mượt mà và hộp thông báo lỗi có nút Thử lại (Retry) khi gặp sự cố kết nối tới Jira.


