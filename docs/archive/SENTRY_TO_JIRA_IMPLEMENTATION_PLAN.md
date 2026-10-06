# Kế hoạch tích hợp Sentry để tự động tạo Jira task

> Phiên bản: 1.0  
> Ngày lập: 2026-09-30  
> Trạng thái: Proposed — cần chốt nghiệp vụ và cấu hình môi trường  
> Phạm vi: mỗi người dùng nội bộ tạo một webhook Sentry riêng; Team Task Web dùng Jira token của người đó để tạo Bug

## 1. Mục tiêu

Khi Sentry phát hiện một lỗi mới đáp ứng chính sách, Team Task Web tự động tạo một
Jira Bug để đội phát triển theo dõi. Hệ thống phải:

- Nhận lỗi mới gần thời gian thực.
- Không tạo nhiều Jira task cho cùng một Sentry issue.
- Không làm mất lỗi khi webhook hoặc một dịch vụ tạm thời không khả dụng.
- Cho phép theo dõi, retry và audit quá trình tạo task.
- Không đưa dữ liệu bí mật hoặc dữ liệu cá nhân không cần thiết lên Jira.

Sentry là nguồn sự thật về lỗi. Jira là nguồn sự thật về task và quy trình xử lý.
Team Task Web đóng vai trò điều phối giữa hai hệ thống. Task không được tạo bằng
một tài khoản Jira dùng chung: task phải được tạo bằng Jira credential của người
dùng đã tạo cấu hình webhook.

## 2. Quyết định kiến trúc

### 2.1 Webhook thuộc hệ thống nào?

Endpoint webhook thuộc **Team Task Web**, không thuộc Jira. Mỗi cấu hình tích hợp
có một `hookId` riêng, ví dụ:

```http
POST https://<team-task-web-domain>/api/webhooks/sentry/<hookId>
```

`hookId` là chuỗi ngẫu nhiên khó đoán, không dùng trực tiếp `userId`, email hoặc
Jira username. Khi người dùng tạo integration trên web, hệ thống sinh URL này và
gắn cấu hình với tài khoản đang đăng nhập. Người dùng sao chép URL sang Sentry.

Khi nhận request, hệ thống tra `hookId` để biết ai là chủ cấu hình. Worker sau đó
lấy Jira token đã lưu của chính người dùng đó và gọi Jira REST API để tạo Bug.

```text
Ứng dụng phát sinh lỗi
        │
        ▼
Sentry ghi nhận và gom nhóm event thành issue
        │ POST /api/webhooks/sentry/<hookId>
        ▼
Team Task Web: tìm cấu hình và chủ sở hữu qua hookId
        │ enqueue
        ▼
Worker: áp dụng chính sách, lấy Jira token của chủ webhook
        │ POST Jira REST API bằng token người dùng
        ▼
Jira Bug + mapping Sentry issue ↔ Jira key
```

### 2.2 Webhook hay chủ động gọi Sentry API?

Chốt sử dụng mô hình kết hợp:

- **Webhook là đường chính:** nhận issue mới hoặc regression gần thời gian thực.
- **Polling là đường đối soát:** định kỳ gọi Sentry API để tìm issue bị bỏ lỡ.
- Hai đường chỉ ghi vào cùng một hàng đợi; chỉ worker được phép tạo Jira task.

Không tạo Jira trực tiếp trong request webhook. Webhook phải trả phản hồi nhanh
sau khi sự kiện đã được lưu bền vững.

### 2.3 Quyền sở hữu webhook và Jira credential

- Người dùng phải đăng nhập Team Task Web và đã cấu hình Jira token hợp lệ mới
  được tạo webhook.
- Mỗi webhook lưu `ownerUserId`, nhưng URL chỉ lộ `hookId` ngẫu nhiên.
- Job phải lưu cả `integrationId` và `actorUserId` tại thời điểm nhận event.
- Trước khi gọi Jira, worker kiểm tra integration còn bật, user còn hoạt động và
  Jira token còn hợp lệ.
- Nếu token hết hạn hoặc bị xóa, job chuyển `failed`; tuyệt đối không fallback
  sang token của người khác hoặc tài khoản hệ thống.
- Có thể chuyển quyền sở hữu integration cho thành viên khác. Các job mới dùng
  token của chủ mới; job đang xử lý giữ actor đã được ghi nhận.

Để tránh hai người cùng cấu hình một Sentry project rồi tạo hai task, MVP chỉ cho
phép một integration hoạt động trên cùng bộ `(Sentry organization, Sentry
project, Jira project)`. Muốn đổi người tạo task thì chuyển owner thay vì tạo
thêm webhook song song.

## 3. Phạm vi MVP đề xuất

MVP bao gồm:

- Nhận sự kiện `issue.created` từ Sentry.
- Đối soát unresolved issue mỗi 5 phút.
- Chỉ xử lý môi trường `production`.
- Tạo task cho level `error` và `fatal`.
- Mapping rõ ràng từ Sentry project sang Jira project.
- Mỗi Sentry issue chỉ tạo tối đa một Jira Bug.
- Retry có giới hạn và màn hình/API quản trị bản ghi lỗi.
- Ghi audit log cho các lần nhận, bỏ qua, tạo thành công và thất bại.

Chưa nằm trong MVP:

- Tự động đóng Jira task khi Sentry issue được resolve.
- Tự động reopen Jira task khi regression.
- Sao chép toàn bộ stack trace hoặc request context sang Jira.
- Tự động gán assignee nếu chưa có ownership rule được xác nhận.
- Tạo một Jira task cho mỗi Sentry event.

## 4. Quy tắc nghiệp vụ cần chốt

### 4.1 Đơn vị chống trùng

Sentry có hai khái niệm:

- **Event:** một lần lỗi cụ thể xảy ra.
- **Issue:** nhóm nhiều event có cùng fingerprint.

Jira task phải được tạo theo **Sentry issue**, không theo từng event. Khóa nghiệp
vụ đề xuất:

```text
(sentryOrganization, sentryProject, sentryIssueId)
```

### 4.2 Điều kiện tạo task mặc định

Một Sentry issue được tạo Jira task khi thỏa toàn bộ điều kiện:

1. Action là `created`, hoặc issue mới được polling phát hiện.
2. Issue chưa `resolved` hoặc `ignored`.
3. Environment là `production`.
4. Level thuộc danh sách cho phép, mặc định `error,fatal`.
5. Sentry project có mapping Jira project hợp lệ.
6. Chưa tồn tại mapping sang Jira task.
7. Không tìm thấy Jira task phục hồi qua nhãn idempotency.

Các ngưỡng như số lần xuất hiện, số user bị ảnh hưởng hoặc regression sẽ được
bổ sung sau khi có dữ liệu vận hành thực tế.

### 4.3 Mapping project

Mapping phải được cấu hình tường minh:

| Sentry project | Jira project | Issue type |
|---|---|---|
| `backend-api` | `BE` | Bug |
| `mobile-app` | `MOBILE` | Bug |

Nếu không có mapping, hệ thống chuyển bản ghi sang `ignored` với lý do cụ thể;
không tự đoán Jira project.

### 4.4 Priority đề xuất

| Sentry level | Jira priority đề xuất |
|---|---|
| `fatal` | Highest/Critical |
| `error` | High |
| `warning` | Không tạo trong MVP |
| `info`, `debug` | Không tạo |

Tên priority thực tế phải được đối chiếu với cấu hình Jira của tổ chức.

## 5. Thiết kế luồng xử lý

### 5.1 Luồng webhook

1. Người dùng đăng nhập, lưu Jira token và tạo Sentry integration trên web.
2. Hệ thống sinh `hookId` và trả URL `/api/webhooks/sentry/<hookId>`.
3. Người dùng dán URL đó vào cấu hình webhook bên Sentry.
4. Sentry gửi request đến URL riêng này.
5. API tra integration và chủ sở hữu theo `hookId`.
6. API kiểm tra kích thước payload; chữ ký là tùy chọn trong mạng nội bộ.
7. API chuẩn hóa payload và dùng external event ID để loại request gửi lặp.
8. API lưu event, import record và actor trong một transaction.
9. API enqueue job rồi trả `200` hoặc `202`.
10. Worker dùng Jira token của owner để tạo Jira task.

Mục tiêu thời gian phản hồi webhook: dưới 2 giây, không phụ thuộc độ trễ Jira.

### 5.2 Luồng polling đối soát

1. Scheduler chạy mỗi 5 phút cho từng integration đang hoạt động.
2. Worker dùng cấu hình Sentry của integration để gọi API, có phân trang/cursor.
3. Worker lấy các unresolved issue thay đổi từ lần đồng bộ gần nhất.
4. Với mỗi issue, upsert cùng khóa idempotency như webhook.
5. Những issue chưa `created` hoặc `ignored` được enqueue.
6. Chỉ cập nhật cursor sau khi batch đã được lưu thành công.

Polling phải xử lý toàn bộ trang dữ liệu cần thiết, không chỉ lấy cố định một số
issue mới nhất, vì cách đó có thể bỏ sót issue khi lưu lượng tăng cao.

### 5.3 Luồng tạo Jira task

1. Worker claim import record bằng khóa hoặc atomic update.
2. Kiểm tra mapping đã có `jiraKey` hay chưa.
3. Tìm Jira issue theo label phục hồi `sentry-id-<issue-id>`.
4. Nếu tìm thấy, lưu mapping và kết thúc với trạng thái `created`.
5. Nạp Jira credential của `ownerUserId`; không có hoặc không hợp lệ thì dừng.
6. Nếu chưa có, dựng nội dung Jira Bug và gọi Jira API bằng token owner.
7. Lưu `jiraKey`, actor, thời gian import và kết quả audit.
8. Đồng bộ Jira issue vừa tạo vào local cache.

## 6. Nội dung Jira task

Ví dụ:

```text
Issue type: Bug
Summary: [Sentry] BACKEND-42: TypeError: Cannot read property 'id'

Description:
Nguồn: Sentry
Project: backend-api
Environment: production
Level: error
First seen: 2026-09-30T08:20:00Z
Last seen: 2026-09-30T08:31:00Z
Event count: 235
Affected users: 18
Release: backend@2.4.1
Sentry issue: https://sentry.example/issues/123456

Labels:
- sentry
- sentry-id-123456
- production
```

Không đưa authorization header, cookie, password, access token, request body nhạy
cảm hoặc toàn bộ stack trace lên Jira. Nếu cần stack trace, chỉ ghi đoạn đã được
lọc và giới hạn độ dài.

## 7. Mô hình dữ liệu

Import record tối thiểu:

```text
SentryIntegration
- id
- hookId (unique, random)
- ownerUserId
- sentryOrganization
- sentryProject
- jiraProject
- webhookSecret (nullable)
- enabled
- pollingCursor
- createdAt
- updatedAt

SentryIssueImport
- id
- integrationId
- actorUserId
- sentryOrganization
- sentryProject
- sentryIssueId
- jiraKey (nullable)
- state
- attemptCount
- nextAttemptAt
- lastError
- firstReceivedAt
- lastReceivedAt
- processingStartedAt
- importedAt
- createdAt
- updatedAt
```

Unique constraint:

```text
UNIQUE(sentryOrganization, sentryProject, sentryIssueId)
```

Trạng thái đề xuất:

```text
pending → processing → created
                  └→ retrying → processing
                           └→ failed

pending → ignored
```

`processing` cần lease timeout. Nếu worker chết, một worker khác có thể claim lại
sau khi lease hết hạn.

## 8. Idempotency và chống tạo trùng

Chống trùng cần nhiều lớp:

1. Unique constraint trên Sentry issue identity.
2. Atomic claim để chỉ một worker xử lý record tại một thời điểm.
3. Jira label duy nhất `sentry-id-<id>` để phục hồi sau lỗi giữa chừng.
4. External event ID để webhook redelivery không sinh event mới.
5. Worker luôn kiểm tra mapping và Jira label trước khi gọi create.

Kịch bản cần xử lý:

```text
Worker gọi Jira thành công
        │
        ├─ lưu mapping thành công → hoàn tất
        │
        └─ tiến trình chết trước khi lưu mapping
                    ↓
          lần retry tìm task qua label
                    ↓
          lưu lại Jira key, không tạo task thứ hai
```

Label phục hồi nên chứa cả project khi ID không được đảm bảo duy nhất toàn hệ
thống, hoặc dùng hash ổn định của organization/project/issue ID.

## 9. Retry và xử lý lỗi

Phân loại lỗi:

| Loại lỗi | Xử lý |
|---|---|
| Timeout, network, Jira/Sentry 5xx | Retry với exponential backoff |
| Rate limit `429` | Tôn trọng `Retry-After` |
| Token hết hạn `401/403` | Dừng retry sớm, cảnh báo admin |
| Payload thiếu dữ liệu | `ignored` hoặc `failed` theo nguyên nhân |
| Không có project mapping | `ignored`, hiển thị cho admin |
| Jira validation `400` | `failed`, lưu response đã lọc bí mật |

Backoff đề xuất: 1 phút, 2 phút, 4 phút, 8 phút, 16 phút; tối đa 5 lần. Admin
có thể sửa cấu hình rồi retry thủ công.

## 10. API cần triển khai

### Public integration API

```http
POST /api/webhooks/sentry/:hookId
```

- Tra integration và owner từ `hookId`.
- Chữ ký là tùy chọn; có thể bật secret khi cần bảo vệ cao hơn.
- Deduplicate event.
- Lưu bền vững và enqueue.
- Không gọi Jira đồng bộ trong request.

### User integration API

```http
GET    /api/me/integrations/sentry
POST   /api/me/integrations/sentry
PATCH  /api/me/integrations/sentry/:id
POST   /api/me/integrations/sentry/:id/regenerate-hook
DELETE /api/me/integrations/sentry/:id
```

Người dùng chỉ quản lý integration của mình. API tạo integration phải kiểm tra
người dùng đã có Jira token và token xác thực thành công.

### Admin API

```http
GET  /api/admin/sentry-imports?state=failed
POST /api/admin/sentry-imports/:id/retry
GET  /api/admin/integrations/sentry/health
```

Các API admin phải yêu cầu quyền quản trị và ghi audit log khi retry.

## 11. Cấu hình cần có

```dotenv
# Sentry API/polling
SENTRY_BASE_URL=https://sentry.io
SENTRY_ORG=
SENTRY_PROJECTS=backend-api,mobile-app
SENTRY_TOKEN=

# Import policy
SENTRY_IMPORT_LEVELS=error,fatal
SENTRY_IMPORT_ENVIRONMENTS=production
SENTRY_PROJECT_MAPPINGS=backend-api:BE,mobile-app:MOBILE
SENTRY_POLL_CRON=*/5 * * * *

# Jira kết nối chung; credential mutation lấy từ tài khoản người dùng
JIRA_BASE_URL=
```

Token Sentry chỉ cần quyền đọc issue/project cần thiết. Jira token cá nhân đã lưu
trong hồ sơ người dùng được dùng để tạo task, vì vậy người dùng chỉ tạo được task
ở project mà tài khoản Jira của họ thực sự có quyền.

## 12. Bảo vệ tối thiểu và vận hành nội bộ

- Dùng HTTPS nếu endpoint đi qua mạng ngoài; trong mạng nội bộ vẫn nên dùng HTTPS
  nếu hạ tầng hỗ trợ.
- `hookId` phải là giá trị ngẫu nhiên đủ dài; không dùng ID tuần tự hoặc user ID.
- Không bắt buộc cơ chế ký phức tạp cho MVP nội bộ. Cho phép secret tùy chọn để
  tăng bảo vệ sau này mà không đổi kiến trúc.
- Giới hạn request body và rate limit cơ bản để tránh lỗi cấu hình gây tải.
- Jira token vẫn phải mã hóa khi lưu vì token có quyền tạo task thay người dùng.
- Che token, cookie, email và PII trong log/error response.
- Không trả chi tiết lỗi nội bộ cho webhook caller.
- Theo dõi số lượng `pending`, `retrying`, `failed`, thời gian xử lý và tuổi job.
- Cảnh báo khi không nhận webhook/poll thành công trong SLA hoặc có `failed` mới.

## 13. Kế hoạch triển khai theo giai đoạn

### Giai đoạn 0 — Chốt nghiệp vụ

- Xác nhận danh sách Sentry project và Jira project.
- Chốt level/environment được tạo task.
- Chốt issue type, priority và các Jira field bắt buộc.
- Chốt hành vi khi Sentry issue regression hoặc resolved.
- Chốt quy tắc owner của webhook và cách chuyển owner khi nhân sự thay đổi.

**Đầu ra:** bảng mapping và policy được phê duyệt.

### Giai đoạn 1 — Nền tảng dữ liệu và hàng đợi

- Thêm schema import state và unique constraint.
- Thêm event store/deduplication key.
- Thêm queue job, atomic claim và processing lease.
- Thêm audit event.

**Đầu ra:** có thể enqueue, claim, retry và quan sát job mà chưa gọi Jira.

### Giai đoạn 2 — Webhook Sentry

- Tạo màn hình/API để người dùng sinh webhook riêng.
- Tạo endpoint `/api/webhooks/sentry/:hookId` và tra owner.
- Thêm kiểm tra payload/rate limit cơ bản; signature là tùy chọn.
- Chuẩn hóa payload `created`.
- Lưu event + import record rồi enqueue.
- Cấu hình webhook trên Sentry test project.

**Đầu ra:** gửi thử từ Sentry tạo được một `pending` record duy nhất.

### Giai đoạn 3 — Jira creator theo người dùng

- Nạp Jira credential của owner và tạo Jira client theo từng job.
- Dừng rõ ràng nếu owner bị vô hiệu hóa hoặc token hết hạn.
- Kiểm tra metadata/field bắt buộc của Jira project.
- Dựng summary, description, priority và labels.
- Thực hiện idempotency/recovery label.
- Lưu mapping và cập nhật local cache.

**Đầu ra:** một Sentry issue test tạo đúng một Jira Bug.

### Giai đoạn 4 — Polling reconciliation

- Gọi Sentry API có pagination/cursor.
- Upsert vào cùng import pipeline.
- Lưu cursor an toàn sau batch.
- Test tình huống webhook bị tắt nhưng issue vẫn được phát hiện.

**Đầu ra:** không mất issue khi webhook thất bại.

### Giai đoạn 5 — Admin và quan sát

- Danh sách import theo trạng thái.
- Xem lỗi đã lọc dữ liệu nhạy cảm.
- Retry thủ công.
- Metrics, health check và cảnh báo.

**Đầu ra:** vận hành viên có thể tự chẩn đoán và phục hồi import lỗi.

### Giai đoạn 6 — Pilot và rollout

- Chạy dry-run: chỉ ghi nhận “would create”, chưa gọi Jira.
- Pilot với một Sentry project và một Jira project.
- So sánh Sentry issue với task dự kiến trong 3–7 ngày.
- Bật tạo Jira thật với rate limit thấp.
- Mở rộng từng project sau khi không còn duplicate/missing issue.

## 14. Kế hoạch kiểm thử

### Unit test

- Parse và resolve project mapping.
- Policy theo action, status, level và environment.
- Tạo idempotency key/label ổn định.
- Chuyển trạng thái và tính backoff.
- Lọc bí mật khỏi description/log.

### Integration test

- Hai request giống nhau vào cùng webhook chỉ tạo một import record.
- Event qua hai integration trùng scope không tạo hai Jira task.
- Jira task được tạo bởi đúng tài khoản Jira của owner webhook.
- Token owner hết hạn không được fallback sang service account/người khác.
- Webhook và polling cùng thấy một issue vẫn chỉ có một record.
- Hai worker chạy đồng thời chỉ một worker gọi Jira create.
- Jira tạo thành công nhưng DB update thất bại: retry tìm lại bằng label.
- Jira `429`, timeout và `5xx` được retry đúng.
- Jira `401/403` sinh cảnh báo cấu hình.
- Issue không có mapping được `ignored`.

### End-to-end test

1. Tạo lỗi test ở ứng dụng/Sentry test project.
2. Xác nhận webhook được nhận và tìm đúng owner qua `hookId`.
3. Xác nhận Jira Bug đúng project, nội dung và label.
4. Gửi lại webhook và chạy polling nhiều lần.
5. Xác nhận không có Jira Bug thứ hai.
6. Mô phỏng Jira outage rồi xác nhận retry thành công sau phục hồi.

## 15. Tiêu chí nghiệm thu

- 100% webhook có `hookId` hợp lệ được lưu trước khi trả thành công.
- Jira creator phản ánh đúng tài khoản Jira của chủ webhook, trong giới hạn cách
  Jira instance ghi nhận người tạo.
- Một Sentry issue chỉ liên kết với tối đa một Jira task trong test concurrency.
- Issue bị bỏ lỡ webhook được polling phát hiện trong tối đa 10 phút.
- Không tạo task cho issue ngoài policy hoặc không có mapping.
- Retry không vượt số lần cấu hình và lỗi cuối cùng quan sát được bởi admin.
- Không có secret/PII bị ghi vào log hoặc Jira description ngoài dữ liệu cho phép.
- Có audit trail từ Sentry event đến Jira key.
- Có runbook xử lý token hết hạn, Sentry/Jira outage và duplicate nghi ngờ.

## 16. Các quyết định còn cần xác nhận

Trước khi bắt đầu triển khai, cần trả lời:

1. Sentry đang dùng SaaS hay self-hosted?
2. Những Sentry project nào được tích hợp?
3. Project Jira tương ứng và issue type chính xác là gì?
4. Chỉ `fatal`, hay cả `error` cũng tạo task?
5. Có bắt buộc `production` không?
6. Jira có field bắt buộc nào ngoài summary/description/issue type?
7. Ai là owner ban đầu của từng webhook và ai được quyền chuyển owner?
8. Khi regression, chỉ comment/thông báo hay reopen task?
9. Khi Sentry resolve, Jira task có được tự động chuyển trạng thái không?
10. Dữ liệu nào được phép đưa từ Sentry sang Jira?

## 17. Kết luận đề xuất

Giải pháp được chốt theo hướng: **mỗi người dùng nội bộ tạo một webhook có
`hookId` riêng; Sentry gọi webhook đó; Team Task Web xác định owner và dùng Jira
token của owner để tạo Bug; polling Sentry API đóng vai trò đối soát**. Mọi nguồn
sự kiện đi qua một import pipeline có idempotency, retry và audit thống nhất.
MVP dùng bảo vệ gọn nhẹ phù hợp hệ thống nội bộ nhưng vẫn giữ kín Jira token.
