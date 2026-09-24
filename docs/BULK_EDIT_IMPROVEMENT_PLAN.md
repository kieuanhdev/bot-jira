# Kế hoạch cải tiến và sửa chữa Bulk edit

**Phiên bản đánh giá:** 1.0  
**Ngày:** 2026-09-23  
**Phạm vi:** trang `/bulk`, API Bulk, worker `bulk-op`, dữ liệu audit và kiểm thử  
**Trạng thái:** Kế hoạch đề xuất, chưa triển khai code

## 1. Kết luận nhanh

Bulk edit hiện đã có khung kỹ thuật đúng hướng: preview, xác nhận, chạy nền, giới hạn concurrency, kết quả từng task và retry. Tuy nhiên, chưa nên coi đây là tính năng an toàn để sử dụng diện rộng vì còn các sai lệch giữa nội dung preview và thao tác worker thực sự chạy, lựa chọn theo bộ lọc có thể bỏ sót task, validation phía server còn yếu và chưa có test cho luồng chính.

Đánh giá hiện tại:

| Nhóm | Mức đáp ứng | Nhận xét |
|---|---:|---|
| Danh sách action | 85% | Có 10 action quan trọng |
| Preview và confirm | 55% | Có giao diện nhưng preview chưa phản ánh chính xác mọi trường hợp |
| Chọn task | 40% | Bị giới hạn bởi dữ liệu đã tải ở client và mặc định chỉ lấy task của người dùng |
| An toàn dữ liệu | 45% | Có operation ID nhưng thiếu validation schema, chống dữ liệu thay đổi và no-op detection |
| Worker và retry | 55% | Có concurrency/retry nhưng thống kê và chính sách retry còn sai |
| Audit/quan sát | 55% | Có log từng item nhưng chưa nối đầy đủ vào audit chung và thiếu khả năng chẩn đoán |
| UX | 50% | Dùng được ở mức cơ bản, khó thao tác khi hàng trăm task hoặc có lỗi hỗn hợp |
| Test | 15% | Chưa có unit/integration/E2E cho engine Bulk edit |

**Mức sẵn sàng đề xuất:** chỉ nên dùng cho nhóm nhỏ, action ít rủi ro và dưới 100 task cho tới khi hoàn thành P0 và P1.

## 2. Những phần hiện có và nên giữ lại

- Flow `preview -> confirm bằng operationId -> queue -> worker` là nền tảng phù hợp.
- Payload của operation được lưu trước khi chạy, tránh phụ thuộc hoàn toàn vào state của trình duyệt.
- Có giới hạn tối đa 500 key và concurrency cấu hình được, tối đa 8 request đồng thời.
- Item thành công được giữ lại khi retry; mỗi task có before, requested, after, error và trạng thái riêng.
- Các thao tác add/remove labels và Fix Version đọc lại Jira trước khi ghi, giảm nguy cơ ghi đè dữ liệu mới.
- Tạo branch có kiểm tra tồn tại và liên kết branch với Jira issue.
- Có thông báo khi operation hoàn tất hoặc thất bại một phần.
- UI đã có loading skeleton, preview before/after và lịch sử operation.

## 3. Vấn đề phát hiện

### 3.1 P0 — Có thể tạo kết quả sai hoặc gây hiểu nhầm nghiêm trọng

#### BULK-001 — “Select by filter” không chọn toàn bộ task khớp filter

Trang Bulk chỉ tải tối đa 1.000 issue vào trình duyệt rồi lọc trên mảng đó. API issue còn mặc định `assignee=me`, nên danh sách này không phải toàn bộ cache. Nếu có hơn 1.000 task hoặc task của người khác, UI vẫn có thể làm người dùng hiểu rằng bộ lọc áp dụng cho toàn project.

Tác động:

- Bỏ sót task mà không có lỗi.
- Số task hiển thị không đại diện cho tập dữ liệu thật.
- Không phù hợp với mục tiêu “đánh nhanh cho nhiều task”.

Hướng sửa:

- Chuyển filter thành một `selectionSpec` được gửi lên server, ví dụ `{ projectKeys, statuses, assignees, labels, priorities, fixVersions, text, includeDone }`.
- Server resolve danh sách key trên database, trả tổng số chính xác và snapshot/fingerprint của selection.
- Hỗ trợ hai chế độ rõ ràng: `explicit_keys` và `server_filter`.
- Luôn hiển thị phạm vi: “500/734 task sẽ được xử lý”; không silently truncate.
- Nếu vượt giới hạn, bắt người dùng thu hẹp filter hoặc chia operation thành batch có chủ đích.

#### BULK-002 — Item được báo “sẽ bỏ qua” vẫn được worker chạy

Preview loại `not_in_cache`, `no_transition` và `branch_exists` khỏi `actionable`, nhưng tất cả item vẫn được tạo với status `pending`. Khi confirm, worker đọc toàn bộ item pending và tiếp tục xử lý chúng.

Tác động:

- Preview và thực thi không khớp nhau.
- `not_in_cache` có thể vẫn bị gọi trực tiếp lên Jira.
- `no_transition` trở thành lỗi sau khi UI đã nói không chạy.
- Tổng actionable, progress và kết quả cuối sai nghĩa.

Hướng sửa:

- Dùng enum item status thực sự: `ready`, `skipped`, `running`, `succeeded`, `failed`, `cancelled`.
- Ngay khi preview, đánh dấu item không actionable là `skipped` với `skipReason` cụ thể.
- Worker chỉ claim item `ready`/`pending` hợp lệ.
- Tách số liệu `succeeded`, `failed`, `skipped`, `pending`, không gộp skipped vào succeeded.

#### BULK-003 — Retry làm sai bộ đếm và chạy lại cả lỗi không retryable

Endpoint retry reset mọi item không thành công về pending, kể cả item `skipped` hoặc `retryable=false`. Worker sau retry chỉ đếm kết quả của batch vừa chạy, do đó những item đã thành công ở lần trước không được tính vào `succeeded` cuối cùng.

Tác động:

- Operation có thể hiển thị `0/N succeeded` dù trước đó đã có item thành công.
- Lỗi cấu hình/validation bị chạy lại vô ích.
- Progress có thể không bao giờ phản ánh đúng tổng số item.

Hướng sửa:

- Retry mặc định chỉ chọn `status=failed AND retryable=true`.
- Cho phép người dùng chọn cụ thể item muốn retry.
- Sau mỗi đợt xử lý, aggregate counters trực tiếp từ database thay vì chỉ từ biến `results` trong process hiện tại.
- Không reset `attemptCount`; lưu thêm `lastAttemptAt` và lịch sử attempt nếu cần chẩn đoán.

#### BULK-004 — API chưa validate action và payload ở phía server

Route đang cast JSON trực tiếp thành `BulkAction`. Kiểm tra bắt buộc, kiểu dữ liệu, độ dài, giá trị story point, tên repo/base/template và giới hạn comment chủ yếu nằm ở UI.

Tác động:

- Client tùy biến có thể gửi action sai shape hoặc giá trị nguy hiểm/vô nghĩa.
- Lỗi xuất hiện muộn trong worker thay vì trả 400 ngay lập tức.
- Khó đảm bảo payload đã lưu có thể chạy lại an toàn.

Hướng sửa:

- Tạo schema validation dùng chung cho API và UI, ưu tiên Zod hoặc validator tương đương.
- Dùng discriminated union theo `kind`.
- Chuẩn hóa và giới hạn: key, số lượng key, label, comment, points, status, version, repo, base và branch template.
- Từ chối key rỗng sau normalize; không silently cắt sau 500.
- Trả error code ổn định và danh sách field lỗi.

#### BULK-005 — Preview không phát hiện no-op cho phần lớn action

Assign cùng assignee, set cùng priority/points, add label đã tồn tại, remove label không tồn tại và add/remove Fix Version không làm thay đổi dữ liệu vẫn được tính là actionable.

Tác động:

- Gọi Jira thừa, tốn rate limit và tạo audit nhiễu.
- Người dùng khó nhận biết operation thực sự thay đổi bao nhiêu task.

Hướng sửa:

- So sánh canonical `before` và `after` theo action.
- Gắn classification cho từng item: `will_change`, `no_change`, `blocked`, `unverified`.
- Mặc định skip `no_change`; cho phép người dùng xem lý do nhưng không chạy.

### 3.2 P1 — Rủi ro vận hành và độ tin cậy

#### BULK-006 — Preview transition/branch có thể timeout

Preview gọi Jira transitions hoặc Bitbucket branch cho từng issue theo vòng lặp tuần tự. Với 500 task và timeout ngoài 15 giây/request, request HTTP preview vẫn có thể chạy rất lâu dù phần thực thi đã chuyển sang worker.

Hướng sửa:

- Không gọi tuần tự hàng trăm request trong API request.
- Với transition: cache metadata workflow theo project/issue type; chỉ gọi live khi cần và dùng pool concurrency nhỏ.
- Với branch: đưa preflight lớn sang background hoặc kiểm tra theo pool với deadline chung.
- Nếu preflight vượt deadline, trả operation trạng thái `preparing`; UI poll đến khi preview sẵn sàng.

#### BULK-007 — Phân loại stale data đang sai

Code coi issue không được chỉnh sửa trong 24 giờ là dữ liệu stale, dù `lastSyncedAt` có thể vừa mới cập nhật. Tuổi nghiệp vụ của task không đồng nghĩa tuổi của cache.

Hướng sửa:

- Freshness chỉ dựa vào `lastSyncedAt` và integration cursor.
- `updatedAt` cũ có thể là thông tin “task lâu không cập nhật”, không phải lỗi freshness.
- Stale nghiêm trọng phải block confirm hoặc buộc refresh; stale nhẹ chỉ cảnh báo.

#### BULK-008 — Không chống thay đổi dữ liệu giữa preview và execution

Sau preview, issue có thể được người khác sửa trên Jira. Worker vẫn áp dụng payload dựa trên trạng thái mới mà không báo drift; before/after trong preview không còn là ảnh chụp chính xác.

Hướng sửa:

- Lưu `jiraUpdatedAt` hoặc version token lúc preview.
- Trước mutation, đọc live state đối với action có nguy cơ ghi đè.
- Nếu token thay đổi: rebase action an toàn cho add/remove set; block hoặc yêu cầu re-preview cho scalar replace/transition tùy chính sách.
- Ghi `driftDetected`, `executionBefore` và `executionAfter` vào item.

#### BULK-009 — Lỗi upstream trong preview bị đánh đồng với “không có transition”

Mọi exception khi gọi transitions đều thành `no_transition`. Lỗi credential, rate limit, timeout và Jira 5xx cần được phân biệt vì cách xử lý khác nhau.

Hướng sửa:

- Phân loại `not_allowed`, `no_transition`, `auth_error`, `rate_limited`, `upstream_unavailable`, `unverified`.
- Chỉ `no_transition` là không retryable.
- Không cho confirm item `unverified` trừ khi có chính sách override rõ ràng.

#### BULK-010 — Preview branch dùng credential không nhất quán với worker

Preview kiểm tra Bitbucket bằng shared env credential, còn worker ưu tiên credential cá nhân. Một người có thể preview thành công nhưng worker thất bại, hoặc ngược lại.

Hướng sửa:

- Resolve cùng một effective credential ở preview và worker.
- Probe repo và base branch một lần trước khi tạo operation.
- Repo phải chọn từ danh sách server cho phép, không dùng text tự do nếu không có quyền quản trị.

#### BULK-011 — Queue failure có thể để operation treo ở `queued`

Operation chuyển sang queued trước khi biết pg-boss đã nhận job. API có trả `queued: false`, nhưng UI không xử lý trạng thái này. Ngoài ra, lỗi worker cấp operation có thể để row ở `running` vì handler bắt lỗi và trả về bình thường.

Hướng sửa:

- Dùng transactional outbox hoặc enqueue trước rồi chuyển trạng thái theo job ID.
- Lưu `jobId`, `heartbeatAt`, `lastError` ở operation.
- Có watchdog đưa operation `queued/running` quá hạn sang `stalled` và cho resume.
- UI phải hiển thị enqueue failure và nút thử enqueue lại.

#### BULK-012 — attemptCount không phải số lần thử thật

Worker có thể gọi Jira tối đa 3 lần nhưng chỉ tăng `attemptCount` một lần sau khi kết thúc vòng retry. Dòng UI “N tries” vì vậy không chính xác.

Hướng sửa:

- Increment trước mỗi attempt.
- Nếu cần audit đầy đủ, thêm `BulkOperationAttempt` gồm startedAt, completedAt, outcome, errorCode và durationMs.

### 3.3 P2 — UX và khả năng quản trị

#### BULK-013 — Form dùng text tự do cho dữ liệu có cấu trúc

Status, Fix Version, repo và base branch dùng text input; priority lại hard-code. Điều này dễ sai chính tả và không phản ánh cấu hình Jira/Bitbucket thực tế.

Hướng sửa:

- Status: hiển thị intersection/union của transition hợp lệ cho tập task, kèm số task áp dụng được.
- Fix Version: tải theo project, hiển thị released/archived và chặn version không hợp lệ.
- Assignee: tìm kiếm live/cached user; hỗ trợ Unassign rõ ràng.
- Points: lấy từ `POINT_SCALE`, hỗ trợ Clear points.
- Repo/base branch: select từ integration metadata.

#### BULK-014 — Trải nghiệm chọn và review chưa phù hợp hàng trăm task

- Không tìm kiếm/pagination trong Pick tasks.
- Select all chỉ là các item đã tải.
- Preview render toàn bộ item, khó đọc và có thể chậm.
- Không nhóm theo `will change / skipped / blocked / warning`.
- Không chọn bỏ một vài item khỏi preview.

Hướng sửa:

- Bảng chọn server-side có search, filter chips, pagination và “select all matching”.
- Preview dùng summary cards và tabs theo classification.
- Virtualize hoặc paginate item list.
- Cho phép bỏ chọn item ngay trong preview rồi cập nhật immutable selection revision.
- Có filter “chỉ xem lỗi”, “chỉ xem thay đổi”, export CSV kết quả.

#### BULK-015 — Lịch sử operation còn thiếu công cụ quản lý

- Chỉ tải 20 operation, không pagination/filter.
- Không mở detail của operation cũ trừ active operation hiện tại.
- Không có tên operation, người tạo (cho admin), thời lượng, nguồn, filter đã dùng.
- Preview bỏ dở không có TTL nên tích tụ.

Hướng sửa:

- Cho phép đặt tên/mô tả ngắn cho operation.
- Lịch sử có filter theo state/action/time và detail drawer/page riêng.
- Preview hết hạn sau 30–60 phút; job dọn preview cũ.
- Admin/release manager có view team theo permission; member chỉ thấy operation của mình.

#### BULK-016 — Cancel chỉ hoạt động trước confirm

Với operation lớn, người dùng không thể dừng phần chưa chạy.

Hướng sửa:

- Thêm `cancel_requested`.
- Worker kiểm tra cancel flag trước khi claim item tiếp theo.
- Item đã chạy giữ nguyên; item chưa chạy chuyển `cancelled`.
- UI ghi rõ cancel không rollback những item đã thành công.

#### BULK-017 — Chưa có rollback có kiểm soát

Không phải action nào cũng rollback an toàn. Tuy vậy các action scalar/set có thể tạo operation đảo ngược dựa trên execution snapshot.

Hướng sửa:

- Không gọi là “Undo” tức thời; dùng “Create rollback preview”.
- Hỗ trợ assign, priority, points, labels và Fix Version khi state hiện tại vẫn khớp `executionAfter`.
- Transition chỉ rollback nếu Jira có transition ngược hợp lệ.
- Comment và create branch không auto rollback; hiển thị hướng dẫn xử lý thủ công.

#### BULK-018 — Audit chung và permission chưa đầy đủ

BulkOperation có trail riêng nhưng chưa gọi hệ thống `AuditLog` mới. Permission helper cũng chưa có quyền Bulk; mọi user đăng nhập đều có thể gửi bất kỳ action nào mà Jira credential của họ cho phép.

Hướng sửa:

- Thêm permission: `bulk.view`, `bulk.execute`, `bulk.branch`, `bulk.large`, `bulk.team_history`.
- Ghi audit cho preview, confirm, cancel, retry, cancel-running và rollback.
- Lưu source `web/chat/api`, correlation ID, selection hash và action hash.
- Không lưu nguyên comment dài vào audit; dùng cơ chế redact/hash hiện có.

## 4. Thiết kế mục tiêu

### 4.1 Luồng người dùng

1. Chọn task bằng key cụ thể hoặc bộ lọc server-side.
2. Server trả count chính xác và mẫu task; người dùng xác nhận phạm vi.
3. Chọn action bằng dữ liệu metadata hợp lệ.
4. Hệ thống tạo preflight/preview, phân loại từng item.
5. UI tóm tắt `will change`, `no change`, `blocked`, `unverified` và cảnh báo rủi ro.
6. Người dùng có thể loại item khỏi operation.
7. Confirm bằng operation ID + revision/fingerprint.
8. Worker claim item theo batch, revalidate drift, thực thi idempotent và cập nhật progress.
9. Người dùng có thể yêu cầu cancel phần chưa chạy.
10. Kết quả cho phép lọc lỗi, retry item retryable, export và tạo rollback preview nếu action hỗ trợ.

### 4.2 State machine đề xuất

Operation:

```text
draft -> preparing -> preview_ready -> queued -> running
                                      |          |
                                      v          v
                                  cancelled  cancel_requested
                                                 |
                         completed | partially_failed | failed | cancelled | stalled
```

Item:

```text
preparing -> ready -> running -> succeeded
          |         |       \-> failed_retryable
          |         |        -> failed_final
          |         \--------> cancelled
          \------------------> skipped
```

### 4.3 Dữ liệu cần bổ sung

`BulkOperation`:

- `selectionType`, `selectionSpec`, `selectionHash`.
- `revision`, `expiresAt`, `confirmedAt`.
- `actionable`, `skipped`, `cancelled`.
- `jobId`, `heartbeatAt`, `lastError`.
- `source`, `correlationId`, `name`.

`BulkOperationItem`:

- Dùng enum cho status và reason/error code.
- `previewUpdatedAt`, `executionBefore`, `executionAfter`.
- `skipReason`, `driftDetected`, `lastAttemptAt`.
- `selected` hoặc loại hẳn item bị bỏ khỏi revision mới.

Tùy nhu cầu audit sâu, thêm `BulkOperationAttempt` thay vì ghi đè một error duy nhất.

## 5. Kế hoạch triển khai theo PR

### Giai đoạn 0 — Đóng băng hành vi và bổ sung test nền (1–1,5 ngày)

**PR 1: Bulk engine characterization tests**

- Unit test `computePreview` cho cả 10 action.
- Test normalize/deduplicate/max keys.
- Test no-op, stale, invalid transition và branch exists.
- Integration test preview -> confirm -> execute với Jira/Bitbucket mock.
- Test partial failure và retry không chạy lại item thành công.
- Test worker invocation trùng không xử lý item hai lần.

Đầu ra: bộ test mô tả hành vi hiện tại; các test cho bug đã biết có thể đánh dấu `todo` trước khi sửa.

### Giai đoạn 1 — Sửa tính đúng đắn P0 (2–3 ngày)

**PR 2: Server validation và selection chính xác**

- Thêm schema cho action và selection.
- Tách endpoint rõ ràng:
  - `POST /api/bulk/operations` tạo preview/preparing.
  - `POST /api/bulk/operations/:id/confirm` confirm immutable preview.
- Server resolve filter; bỏ lọc chính trên client.
- Trả lỗi nếu vượt 500 thay vì slice im lặng.
- Confirm chỉ cần operation ID + revision, không nhận lại keys/action.

**PR 3: Item classification và counters đúng**

- Thêm enum status/reason.
- Mark skipped/no-op ngay ở preview.
- Worker chỉ lấy item ready.
- Aggregate counters từ DB sau execution/retry.
- Tách succeeded/skipped/failed/cancelled.
- Retry chỉ item failed_retryable.

**Điều kiện hoàn thành Giai đoạn 1:** preview, actionable count, progress và kết quả DB khớp nhau trong mọi test.

### Giai đoạn 2 — Preflight thông minh và an toàn (2–3 ngày)

**PR 4: Smart preflight**

- No-op detection đầy đủ.
- Metadata API cho status, versions, assignees, repos và base branches.
- Phân loại upstream error đúng nghĩa.
- Credential parity giữa preview và worker.
- Sửa freshness chỉ dựa trên cache/sync time.

**PR 5: Drift protection và idempotency**

- Lưu updated token lúc preview.
- Revalidate trước mutation.
- Định nghĩa policy theo action: rebase, block hoặc re-preview.
- Bảo vệ action add-comment khỏi duplicate bằng marker/correlation khi Jira hỗ trợ; tối thiểu không auto-retry mù sau kết quả không xác định.
- Lưu executionBefore/executionAfter.

### Giai đoạn 3 — Queue resilience và điều khiển operation (1,5–2 ngày)

**PR 6: Reliable enqueue/resume**

- Transactional outbox hoặc cơ chế enqueue có recover.
- Job ID, heartbeat, stalled detection.
- Sửa handler để lỗi operation không bị coi là job thành công.
- Reconciler cho queued/running quá hạn.

**PR 7: Cancel running và retry chọn lọc**

- Cancel request cooperative.
- Retry theo item hoặc “all retryable”.
- attemptCount thật; error code và timestamps.

### Giai đoạn 4 — Cải tiến UX (2–3 ngày)

**PR 8: Selection builder**

- Search và filter server-side.
- Select current page / select all matching tách biệt rõ.
- Count chính xác, scope summary và cảnh báo limit.
- Preset filter thường dùng: theo project, status, assignee, label, Fix Version, stale.

**PR 9: Review và result workspace**

- Summary theo classification.
- Tabs/filter, pagination hoặc virtualization.
- Loại item khỏi preview.
- Result detail, chỉ xem lỗi, copy/export CSV.
- Empty state đúng design system và responsive mobile.

**PR 10: Operation history**

- Pagination/filter/history detail.
- Auto refresh operation đang chạy.
- Tên operation, duration, source và người thực hiện.
- Cleanup preview hết hạn.

### Giai đoạn 5 — Permission, audit và rollback (1,5–2 ngày)

**PR 11: Permission + AuditLog**

- Thêm permission matrix Bulk.
- Server enforcement cho action nhạy cảm và operation lớn.
- Audit mọi lifecycle mutation với correlation ID.

**PR 12: Rollback preview có giới hạn**

- Chỉ hỗ trợ action có thể đảo an toàn.
- Drift check trước rollback.
- Rollback là một BulkOperation mới, liên kết `revertsOperationId`.

## 6. Thứ tự ưu tiên đề xuất

| Ưu tiên | Hạng mục | Lý do |
|---|---|---|
| P0 | BULK-001 đến BULK-005 | Trực tiếp ảnh hưởng tính đúng đắn và niềm tin vào preview |
| P1 | BULK-006 đến BULK-012 | Ngăn timeout, treo job và sai retry khi chạy thật |
| P2 | BULK-013 đến BULK-018 | Tăng tốc thao tác, quản trị và khả năng phục hồi |

Không nên bắt đầu bằng việc làm đẹp UI. Cần sửa selection, classification, counters và validation trước để UI mới dựa trên dữ liệu đúng.

## 7. Chiến lược kiểm thử

### Unit

- Schema validation cho mọi action và boundary values.
- Preview diff/no-op cho 10 action.
- Classification và reason mapping.
- Counter aggregation.
- Retry eligibility.
- Drift policy theo action.

### Integration

- Database + mocked Jira/Bitbucket.
- 500 task với mixed ready/no-op/blocked/unverified.
- Rate limit 429, timeout, 401/403, 404 và 5xx.
- Retry chỉ item retryable và counters vẫn đúng.
- Double enqueue/double confirm không tạo mutation trùng.
- Worker crash giữa operation rồi resume.
- Cancel trong lúc running.

### E2E

- Select all matching trên hơn 1.000 task.
- Transition nhiều workflow, một số task không có transition.
- Fix Version trên nhiều project.
- Result partially failed -> filter lỗi -> retry.
- Operation stale/expired yêu cầu preview lại.
- Member bị chặn action không có quyền.

### Performance

- Tạo selection 10.000 issue trong DB nhưng operation cap 500.
- Preview 500 item trong SLA mục tiêu <= 5 giây nếu không cần live preflight; nếu cần live thì chuyển background.
- Worker 500 item không vượt concurrency và không gây cạn connection pool.
- UI không render đồng thời 500 card nặng.

## 8. Definition of Done

- Không có silent truncation hoặc silent skip.
- Tập task được confirm là immutable bằng operation ID + revision/hash.
- Preview và worker dùng cùng action, credential scope và policy.
- `actionable + skipped + blocked` khớp `total` ở preview.
- `succeeded + failed + skipped + cancelled` khớp `total` khi terminal.
- Retry không chạy lại succeeded, skipped hoặc failed_final.
- Mọi action có server-side validation và permission check.
- Operation treo được phát hiện và resume/fail có lý do.
- Có audit lifecycle và kết quả từng item.
- Có unit, integration và E2E cho happy path, partial failure, retry và crash recovery.
- UI hỗ trợ bàn phím, mobile, light/dark mode và không render danh sách lớn không giới hạn.

## 9. Ước lượng

| Phạm vi | Thời gian |
|---|---:|
| P0 + test nền | 3–4,5 ngày |
| P1 reliability/preflight | 3,5–5 ngày |
| P2 UX/audit/rollback | 4–6 ngày |
| Pilot và sửa lỗi thực tế | 2–3 ngày |
| **Tổng** | **12,5–18,5 ngày công** |

Nếu cần ra bản an toàn sớm, có thể phát hành sau P0 + phần queue tối thiểu của P1 trong khoảng 5–7 ngày công; các cải tiến UX và rollback triển khai tiếp theo.

## 10. Số liệu baseline tại thời điểm đánh giá

- Database có 3 BulkOperation và 8 BulkOperationItem.
- 2 operation completed đều là `add-comment` với tổng 5 item thành công.
- 1 operation đang ở trạng thái preview với 3 item.
- Chưa có dữ liệu thực tế cho transition, Fix Version, branch, partial failure hoặc retry.
- Repo chưa có test trực tiếp cho `previewBulk`, `confirmBulk`, `executeBulkOperation` hay API Bulk; chỉ có test helper branch name.

Baseline này cho thấy cần pilot có kiểm soát sau khi sửa P0/P1, chưa nên suy ra độ ổn định từ hai lần chạy add-comment thành công.
