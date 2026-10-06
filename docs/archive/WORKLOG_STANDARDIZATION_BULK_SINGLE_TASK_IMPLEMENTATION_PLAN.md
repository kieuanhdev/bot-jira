# Kế hoạch triển khai Log Work cho chuẩn hóa, Bulk Edit và task đơn

> Dự án: Team Task Web  
> Phiên bản kế hoạch: 1.0  
> Ngày lập: 2026-09-30  
> Ngày hoàn thành: 2026-09-30  
> Phạm vi: Chuẩn hóa task, thao tác hàng loạt và trang chi tiết task  
> Trạng thái: Đã triển khai hoàn tất (Completed)

## 1. Bối cảnh và khoảng trống

Kế hoạch chuẩn hóa hiện đã dùng `IssueCache.timeSpent` để xác định yêu cầu `WORKLOG`, nhưng luồng hành động chưa hoàn chỉnh:

1. Mapping sang Bulk Edit đang để `WORKLOG: []`, nên CTA chuẩn hóa không thể mở đúng thao tác cần làm.
2. Domain và worker Bulk đã có action `log-work` cùng Jira client tương ứng, nhưng UI `/bulk` chỉ tạo action `update-fields`; người dùng chưa có form nhập worklog.
3. Trang `/issue/{jiraKey}` và `PATCH /api/issues/{key}` chỉ sửa metadata; chưa có API và form ghi worklog cho một task.
4. Worker Bulk đang ghép ngày bắt đầu với `09:00 UTC`, chưa giữ đúng giờ và timezone người dùng.
5. Worklog là mutation cộng dồn nhưng chưa có thiết kế chống double-submit hoặc retry tạo bản ghi trùng.

Mục tiêu là hoàn thiện một luồng Log Work thống nhất từ cảnh báo chuẩn hóa đến task đơn và Bulk Edit, bảo đảm dữ liệu Jira, cache và giao diện nhất quán.

## 2. Kết luận kiến trúc

Log Work phải được coi là **mutation cộng dồn**, không phải một field metadata:

- Mỗi lần gửi sẽ tạo một worklog mới và làm tăng `timeSpent`.
- Không đưa worklog vào `PATCH /api/issues/{key}` hoặc action `update-fields`;
  retry một request không rõ kết quả có thể ghi thời gian hai lần.
- Task đơn dùng endpoint chuyên biệt `POST /api/issues/{key}/worklogs`.
- Bulk dùng action `log-work` hiện có, nhưng hiển thị như một chế độ riêng, không
  cho chạy chung trong cùng operation với sửa Points, Due date hoặc Fix Version.
- Cả hai đường ghi phải dùng chung validation, formatter thời gian, Jira client,
  cơ chế chống ghi trùng và quy trình refresh cache.
- Mặc định `adjustEstimate = "leave"` để ghi thời gian không âm thầm thay đổi
  Remaining Estimate. Chỉ mở lựa chọn khác khi Product Owner xác nhận nghiệp vụ.

Luồng mục tiêu:

```text
/stale phát hiện thiếu WORKLOG
        ↓
CTA task đơn ───────────────→ /issue/{key}?action=log-work
CTA nhiều task ─────────────→ /bulk?keys=...&action=log-work
        ↓                                  ↓
POST /api/issues/{key}/worklogs      preview → confirm → worker
        └──────────────┬───────────────────┘
                       ↓
                 Jira addWorklog
                       ↓
            refresh IssueCache.timeSpent
                       ↓
       invalidate issue + stale queries sau thành công
```

## 3. Quy tắc nghiệp vụ cần chốt

Đề xuất mặc định cho phiên bản đầu:

| Quy tắc | Quyết định đề xuất |
|---|---|
| Điều kiện đạt chuẩn | Tổng `timespent > 0` trên task |
| Người được tính | Bất kỳ worklog hợp lệ nào trên task; không bắt buộc do assignee hiện tại ghi |
| Thời lượng | Bắt buộc, dùng cú pháp Jira như `30m`, `2h`, `1d 4h`, phải lớn hơn 0 |
| Thời điểm bắt đầu | Bắt buộc ở API; UI mặc định thời điểm hiện tại theo múi giờ trình duyệt |
| Tương lai | Không cho thời điểm lớn hơn hiện tại quá 5 phút để dung sai lệch đồng hồ |
| Ghi chú | Không bắt buộc, tối đa 4.000 ký tự theo giới hạn hiện tại |
| Estimate | Luôn giữ nguyên trong MVP (`adjustEstimate=leave`) |
| Bulk | Cùng một thời lượng/thời điểm/ghi chú được áp dụng cho từng task đã chọn |
| Task Done | Cho Jira quyết định theo permission/workflow; UI cảnh báo nhưng không tự cấm nếu Jira cho phép |
| Xóa/sửa worklog | Ngoài phạm vi; MVP chỉ tạo mới |

Điểm cần Product Owner xác nhận trước khi bật production:

1. Chuẩn hóa chỉ cần “đã từng log work” hay phải có worklog trong sprint/ngày
   hiện tại?
2. Bulk Log Work có thật sự được phép cho nhiều task với cùng thời lượng không?
   Nếu chỉ dùng để bổ sung dữ liệu còn thiếu, có cần giới hạn vào task đang có
   `timeSpent = 0`?
3. Có cần bắt buộc comment hoặc mã hoạt động cho một số project không?
4. Có cho người dùng chọn `adjustEstimate=auto` hay tiếp tục khóa ở `leave`?

## 4. Contract dùng chung

Tạo module dự kiến `src/lib/worklogs/schema.ts`, không phụ thuộc React/Next.js:

```ts
type CreateWorklogInput = {
  timeSpent: string;
  startedAt: string; // ISO-8601 có timezone
  comment?: string;
  adjustEstimate?: "leave"; // MVP chỉ nhận leave
  idempotencyKey: string;
};

type CreateWorklogResult = {
  jiraKey: string;
  jiraWorklogId: string | null;
  timeSpentSeconds: number | null;
  cacheSynced: boolean;
  duplicate: boolean;
};
```

Module cung cấp:

- `validateCreateWorklogInput()` dùng cho API task đơn và action Bulk.
- `parseJiraDuration()`/`formatJiraDuration()` dùng chung cho preview và UI.
- `formatJiraStartedAt()` giữ đúng timezone người dùng; bỏ cách ghép cứng
  `T09:00:00.000+0000` đang có trong worker Bulk.
- Error code ổn định: `INVALID_DURATION`, `INVALID_STARTED_AT`,
  `FUTURE_STARTED_AT`, `COMMENT_TOO_LONG`, `JIRA_CREDENTIALS_REQUIRED`,
  `WORKLOG_FORBIDDEN`, `DUPLICATE_REQUEST`, `JIRA_UNAVAILABLE`.

Không ghi nội dung comment vào application log/audit. Chỉ lưu độ dài hoặc hash
nếu cần điều tra, vì comment có thể chứa thông tin nội bộ.

## 5. API Log Work cho một task

Thêm route:

```text
POST /api/issues/{key}/worklogs
```

Request:

```json
{
  "timeSpent": "2h 30m",
  "startedAt": "2026-09-30T09:15:00+07:00",
  "comment": "Review và sửa lỗi",
  "adjustEstimate": "leave",
  "idempotencyKey": "UUID-do-client-tao"
}
```

Thứ tự xử lý:

1. Xác thực session và Jira credential cá nhân; worklog trên Jira phải mang danh
   tính người đang thao tác, không dùng service account thay thế.
2. Chuẩn hóa Jira key và kiểm tra task nằm trong project người dùng được xem.
3. Validate toàn bộ request trước khi gọi Jira.
4. Claim `idempotencyKey`; cùng key + cùng payload trả lại kết quả cũ, cùng key
   + payload khác trả `409`.
5. Gọi `jira.addWorklog(..., "leave")` và lấy `jiraWorklogId` nếu Jira trả về.
6. Refresh issue cache để cập nhật `timeSpent`; Jira đã ghi thành công không được
   biến thành lỗi chỉ vì refresh cache thất bại.
7. Ghi audit `issue.worklog_created` với actor, Jira key, duration,
   `startedAt`, worklog ID và trạng thái refresh; không ghi comment thô.
8. Trả `201` khi tạo mới, `200` với `duplicate=true` khi replay an toàn.

Không tự retry POST khi client nhận timeout mà chưa biết Jira đã nhận hay chưa.
Trước khi retry, backend phải đối soát idempotency record và, nếu Jira hỗ trợ,
đọc worklog gần nhất theo ID/marker. Nếu deployment Jira không hỗ trợ property
idempotency trên worklog, giữ request ở trạng thái `outcome_unknown` và yêu cầu
reconcile thay vì tạo lại mù quáng.

## 6. Read model cho trang task đơn

Mở rộng `LiveIssue`/`IssueView` tối thiểu:

```ts
timeSpentSeconds: number | null;
originalEstimateSeconds: number | null;
```

MVP chỉ cần tổng thời gian đã ghi, không tải toàn bộ lịch sử worklog trong GET
issue vì có thể chậm và làm lộ comment của người khác. Nếu sau này cần lịch sử,
tạo endpoint phân trang riêng và kiểm tra quyền Jira tương ứng.

Sau khi ghi thành công:

- Cập nhật card “Thời gian đã ghi” bằng dữ liệu vừa refresh.
- Invalidate `issuesKeys`, issue detail key và `staleKeys.all`.
- Nếu refresh cache lỗi, hiển thị “Jira đã ghi nhận, dữ liệu tổng hợp đang chờ
  đồng bộ”; tuyệt đối không mời người dùng bấm gửi lại.

## 7. UI sửa một task

Tại `/issue/{jiraKey}`, thêm CTA **Ghi thời gian** ở action bar và hỗ trợ deep
link `?action=log-work` tự mở dialog sau khi dữ liệu task tải xong.

Dialog gồm:

- Tổng thời gian hiện đã ghi trên task.
- Thời lượng bắt buộc, có ví dụ `30m`, `2h`, `1d 4h` và lỗi inline.
- Ngày + giờ bắt đầu, mặc định hiện tại theo timezone trình duyệt; gửi API dưới
  dạng ISO-8601 có offset.
- Ghi chú không bắt buộc và bộ đếm ký tự.
- Dòng cố định “Không thay đổi Remaining Estimate”.
- Nút **Ghi worklog**; disable trong lúc gửi và giữ cùng `idempotencyKey` cho
  mọi retry của một lần submit.

Success đóng dialog, thông báo thời lượng vừa ghi và cập nhật dữ liệu tại chỗ.
Lỗi permission/credential/validation dùng thông báo riêng có hướng xử lý. Dialog
phải dùng component hiện có, Lucide icon, semantic token, focus trap, keyboard,
light/dark mode và responsive theo design system.

## 8. UI Bulk Log Work

Không thêm Worklog như checkbox trong nhóm “các trường cần sửa”. Thay vào đó,
thêm loại thao tác loại trừ nhau ở Bước 2:

- **Cập nhật trường**: giữ UI `update-fields` hiện tại.
- **Ghi Worklog**: tạo action `{ kind: "log-work", value: ... }`.

Khi chọn **Ghi Worklog**:

1. Hiển thị cùng bộ input duration, startedAt, comment và thông báo giữ nguyên
   Remaining Estimate như task đơn.
2. Preview phải ghi rõ “Mỗi task sẽ được cộng X; tổng thời gian được ghi là
   N × X”, tránh hiểu nhầm X là tổng chia cho các task.
3. Task đã có worklog vẫn là `will_change`, vì Log Work luôn cộng thêm. Nếu đi
   từ tab chuẩn hóa, mặc định selection chỉ gồm task đang thiếu `WORKLOG`.
4. Confirm dialog lặp lại số task, thời lượng mỗi task và tổng cộng; không cho
   chạy nếu `actionable = 0`.
5. Worker tiếp tục dùng Jira credential của người tạo operation và
   `adjustEstimate=leave`.
6. Mỗi `BulkOperationItem` có idempotency identity ổn định theo
   `operationId + jiraKey`; retry chỉ chạy item chưa xác nhận thành công.
7. Khi operation đạt trạng thái terminal, mới invalidate/refetch `/api/stale`;
   việc invalidate ngay lúc vừa queue không đủ để task biến mất đúng lúc.

Preview cần phân biệt:

| Trạng thái | Ý nghĩa |
|---|---|
| `will_change` | Có quyền và sẽ tạo một worklog mới |
| `blocked` | Thiếu credential/quyền Work on Issues hoặc task không truy cập được |
| `unverified` | Jira permission không kiểm tra được; không tự coi là an toàn |
| `succeeded` | Jira trả worklog ID hoặc reconcile xác nhận đã tạo |
| `outcome_unknown` | Timeout sau khi gửi; không tự retry để tránh ghi trùng |

Nếu việc kiểm tra permission từng task làm preview quá chậm, kiểm tra theo
project bằng Jira permission API và vẫn xử lý lỗi theo từng item ở worker.

## 9. Nối luồng chuẩn hóa với hai đường ghi

Cập nhật mapping:

```ts
REQUIREMENT_BULK_FIELDS.WORKLOG = ["worklog"];
```

Quy ước deep link:

```text
/issue/MHRM-1255?action=log-work&returnTo=%2Fstale%3Fview%3Dmy-work%26tab%3Dstandardization
/bulk?project=MHRM&keys=MHRM-1255,MHRM-1260&action=log-work&returnTo=standardization
```

Yêu cầu:

- CTA **Ghi Worklog** trên từng task mở form task đơn.
- CTA **Chuẩn hóa đã chọn** nếu mọi task đều thiếu Worklog có thể mở thẳng Bulk
  Log Work; nếu các task thiếu nhiều loại field, hiển thị menu chọn thao tác thay
  vì giả vờ thực hiện tất cả trong một operation.
- Không prefill thời lượng giả. Duration và startedAt là dữ liệu thực tế do
  người dùng xác nhận.
- Sau thành công, quay lại đúng tab/filter/scroll nếu có `returnTo`, refresh
  cache và để evaluator tự quyết định task còn thiếu gì.
- `returnTo` phải được tạo bằng `URLSearchParams` và backend/client chỉ chấp nhận
  đường dẫn nội bộ trong allowlist để tránh open redirect.
- Task chỉ biến mất khỏi hàng đợi khi toàn bộ requirement bắt buộc đã đạt; ghi
  worklog không được làm mất task vẫn thiếu Fix Version hoặc Due date.

## 10. Danh sách thay đổi dự kiến theo file

| Khu vực | File dự kiến | Công việc |
|---|---|---|
| Contract | `src/lib/worklogs/schema.ts` | Input/result, validation, duration và datetime formatter |
| Jira client | `src/lib/jira/client.ts` | Chuẩn hóa response `addWorklog`, hỗ trợ reconcile/get worklogs nếu Jira cho phép |
| Task API | `src/app/api/issues/[key]/worklogs/route.ts` | POST chuyên biệt, auth, idempotency, audit, refresh cache |
| Task read model | `src/lib/issues/live.ts` | Trả `timeSpentSeconds` và estimate tổng hợp |
| Task UI | `src/app/(app)/issue/[key]/issue-detail-client.tsx` | CTA, dialog, deep link, mutation state và query invalidation |
| Bulk domain | `src/lib/bulk/ops.ts` | Dùng schema chung, startedAt đúng timezone, outcome unknown, idempotency item |
| Bulk UI | `src/app/(app)/bulk/bulk-client.tsx` | Chế độ Log Work, input, preview tổng thời gian, deep link action |
| Chuẩn hóa | `src/lib/issues/standardization.ts` | Mapping `WORKLOG` sang action Bulk |
| Stale UI | `src/app/(app)/stale/stale-client.tsx` | CTA task đơn/hàng loạt và return URL |
| Query keys | `src/lib/query-keys.ts` | Key cho issue detail/worklog nếu cần |
| Persistence | `prisma/schema.prisma` + migration | Idempotency ledger/trạng thái outcome nếu không tái sử dụng an toàn BulkOperationItem |
| Audit | `src/lib/audit.ts` hoặc caller | Event worklog không chứa comment thô |

Trước khi code route mới hoặc thay đổi App Router, đọc guide tương ứng trong
`node_modules/next/dist/docs/` theo quy định repository.

## 11. Thứ tự triển khai đề xuất

### P0 — Contract và an toàn ghi dữ liệu

- Chốt quy tắc ở mục 3.
- Tạo schema dùng chung và test duration/datetime/timezone.
- Chốt thiết kế idempotency/reconcile cho task đơn và Bulk item.
- Chuẩn hóa Jira client response và phân loại lỗi permission, validation,
  transient, `outcome_unknown`.

### P1 — Task đơn hoàn chỉnh

- Thêm API worklog chuyên biệt và audit.
- Mở rộng `IssueView` với tổng thời gian.
- Thêm dialog Ghi thời gian, deep link và cache invalidation.
- Hoàn thành unit/API/component test cho task đơn trước khi nối từ `/stale`.

### P2 — Bulk Log Work

- Thêm action mode và form riêng trong `/bulk`.
- Sửa startedAt không còn 09:00 UTC cố định.
- Bổ sung preview tổng thời gian, permission, idempotency item và trạng thái
  `outcome_unknown`.
- Chỉ refetch chuẩn hóa khi operation terminal.

### P3 — Tích hợp chuẩn hóa

- Cập nhật mapping/deep link và CTA từng task/nhiều task.
- Đảm bảo chỉ preselect task thuộc cùng project; nếu selection nhiều project,
  chia theo project hoặc yêu cầu người dùng xử lý từng project.
- Kiểm tra task rời hàng đợi đúng theo toàn bộ requirement, không chỉ Worklog.

### P4 — Rollout

- Bật feature flag theo một project pilot.
- So sánh worklog ID/audit/cache sau mỗi operation trong giai đoạn đầu.
- Theo dõi duplicate rate, `outcome_unknown`, permission failure, cache refresh
  failure và thời gian từ mutation tới khi `/stale` cập nhật.
- Chỉ mở rộng Bulk sau khi task đơn ổn định và không có duplicate.

## 12. Ma trận kiểm thử bắt buộc

Unit:

- Duration hợp lệ/không hợp lệ, duration bằng 0, comment quá dài.
- ISO datetime có offset, DST, tương lai và timezone khác UTC.
- Cùng idempotency key + cùng payload trả lại kết quả; payload khác trả conflict.
- `WORKLOG` mapping tạo đúng deep link/action.

API task đơn:

- 401 khi chưa đăng nhập, 428 khi thiếu Jira token, 403 khi thiếu quyền.
- Jira thành công + cache thành công; Jira thành công + cache lỗi vẫn không báo
  mutation thất bại.
- Jira 400/403/429/5xx và timeout sau send được phân loại đúng.
- Double-click và retry cùng key không tạo worklog thứ hai.
- Không rò comment vào audit/application log.

Bulk:

- Preview cho biết thời lượng mỗi task và tổng chính xác.
- Worker gửi đúng `startedAt`, comment và `adjustEstimate=leave`.
- Partial failure giữ item thành công, retry không chạy lại item đó.
- Crash/timeout ở ranh giới Jira response không tự tạo bản ghi trùng.
- Operation terminal refresh `/api/stale`; operation queued chưa báo task đã đạt.

UI/E2E:

- Deep link từ `/stale` mở đúng dialog/chế độ và giữ selection.
- Validation accessible, focus management, disable double submit.
- Thành công cập nhật tổng thời gian và trạng thái chuẩn hóa.
- Task còn thiếu requirement khác vẫn ở danh sách.
- Light/dark mode và responsive tại 375px, 768px, 1024px, 1440px.

## 13. Tiêu chí nghiệm thu riêng cho Log Work

1. Người dùng có thể ghi worklog thật lên Jira từ trang task đơn bằng danh tính
   Jira cá nhân.
2. Người dùng có thể preview và ghi cùng một worklog lên nhiều task qua Bulk,
   với cảnh báo rõ thời lượng mỗi task và tổng cộng.
3. CTA từ chuẩn hóa mở đúng task/action, không yêu cầu người dùng tìm lại task.
4. Không có đường nào dùng PATCH metadata để tạo worklog.
5. Retry/double-click không tạo worklog trùng; trường hợp không xác định được
   kết quả phải dừng để reconcile.
6. Remaining Estimate không đổi trong MVP.
7. Sau đồng bộ, `IssueCache.timeSpent`, issue detail và `/api/stale` nhất quán.
8. Task chỉ được đánh dấu đạt chuẩn khi evaluator đọc `timeSpent > 0`; task còn
   thiếu requirement khác không biến mất sai.
9. Audit xác định được ai ghi, task nào, thời lượng nào và Jira worklog ID nào,
   nhưng không lưu comment thô.
10. Toàn bộ unit/API/Bulk/E2E test ở mục 12 pass trước khi bỏ feature flag.

## 14. Báo cáo kết quả triển khai thực tế (Implementation Report)

Toàn bộ các pha từ P0 đến P3 đã được triển khai hoàn tất và vượt qua 100% các bài kiểm thử liên quan.

### 14.1. Chi tiết các thành phần đã thực hiện

| Pha | Thành phần | File triển khai | Nội dung chính |
|---|---|---|---|
| **P0** | Contract & Duration Formatter | `src/lib/worklogs/schema.ts`<br>`src/lib/worklogs/schema.test.ts` | Parser và validator thời lượng Jira (`30m`, `2h`, `1d 4h`, `1w 2d`), timezone offset formatter, validate comment (≤ 4000), clock-drift protection (≤ 5 min), hash payload và allowlist returnUrl an toàn. **22/22 unit tests passing**. |
| **P0** | Idempotency Ledger | `prisma/schema.prisma`<br>`prisma/migrations/20260930040000_add_worklog_idempotency/` | Bảng `WorklogIdempotency` lưu trạng thái `in_progress`, `succeeded`, `failed`, `outcome_unknown`, hash request, Jira worklog ID và timeSpentSeconds. |
| **P0** | Jira Client Safety | `src/lib/jira/client.ts`<br>`src/lib/jira/types.ts` | Bổ sung type `JiraWorklog`. `addWorklog` chuyển sang dùng `requestOnce` (không auto-retry khi socket timeout để tránh ghi trùng worklog), trả về worklog object chuẩn. |
| **P1** | Single Task Worklog API | `src/app/api/issues/[key]/worklogs/route.ts`<br>`src/app/api/issues/[key]/worklogs/route.test.ts` | Endpoint POST chuyên biệt, xác thực session + Jira token người dùng, kiểm tra idempotency ledger (trả replay 200, conflict 409), bắt socket timeout thành `outcome_unknown` (504), non-fatal cache refresh và audit log an toàn (không ghi comment thô). **8/8 API tests passing**. |
| **P1** | Read Model & UI Task đơn | `src/lib/issues/live.ts`<br>`src/app/(app)/issue/[key]/issue-detail-client.tsx` | Bổ sung `timeSpentSeconds` và `originalEstimateSeconds` vào `IssueView`. Thêm badge tổng thời gian đã ghi trên header/card, CTA "Ghi thời gian" trên quick action bar, dialog ghi worklog với idempotency key cố định theo submit và deep link `?action=log-work&returnTo=...`. Invalidate đúng `issuesKeys.all` và `staleKeys.all`. |
| **P2** | Bulk Worklog Domain | `src/lib/bulk/ops.ts`<br>`src/lib/bulk/ops.test.ts` | Chuẩn hóa `startedAt` theo ISO datetime với timezone offset thực tế. Bắt timeout Jira thành `outcome_unknown` không retry (`retryable: false`). |
| **P3** | Bulk UI Chuyên biệt | `src/app/(app)/bulk/bulk-client.tsx` | Chế độ chọn loại thao tác loại trừ nhau ở Bước 2 (`update-fields` vs `log-work`). Input duration, startedAt, comment. Banner cảnh báo tính toán: "Mỗi task sẽ được cộng X; tổng thời gian được ghi là N × X". Confirm dialog chi tiết. Hỗ trợ nút "Quay lại danh sách chuẩn hóa" khi thao tác kết thúc nếu có `returnTo`. Invalidate query khi terminal. |
| **P3** | Tích hợp Chuẩn hóa | `src/lib/issues/standardization.ts`<br>`src/app/(app)/stale/stale-client.tsx` | Cập nhật `REQUIREMENT_BULK_FIELDS.WORKLOG = ["worklog"]`. Component `BulkStandardizationAction` hỗ trợ: kiểm tra cùng dự án (cảnh báo multi-project), mở thẳng Bulk Log Work khi mọi task chỉ thiếu Worklog, hoặc hiển thị menu chọn thao tác (Cập nhật trường vs Ghi Worklog) khi thiếu nhiều loại. CTA từng task hiển thị đúng nút "Ghi Worklog" / "Sửa trường", và checklist badge "Chưa log work" cho phép click trực tiếp để ghi worklog kèm return URL an toàn. |

### 14.2. Kết quả kiểm thử

- **TypeScript Typecheck**:
  `tsc --noEmit --incremental false` -> **0 errors, Exit code 0**.
- **Vitest Test Suite (Worklog, Bulk, Standardization & Stale)**:
  - `src/lib/worklogs/schema.test.ts`: **22/22 passed**
  - `src/app/api/issues/[key]/worklogs/route.test.ts`: **8/8 passed**
  - `src/lib/issues/standardization.test.ts`: **12/12 passed**
  - `src/lib/bulk/branch-name.test.ts`: **41/41 passed**
  - `src/lib/bulk/ops.test.ts`: **9/9 passed**
  - `src/app/api/stale/route.test.ts`: **3/3 passed**
  - **Tổng cộng**: **95/95 passed (100%)**.

