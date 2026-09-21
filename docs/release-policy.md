# Team Task Web — Workflow and Release Policy

> Status: Accepted
>
> Decision date: 2026-09-19
>
> Scope: M0-02
>
> Policy owner: Release manager; administrator manages configuration
>
> Implementation status: Policy approved, enforcement is delivered by M1–M3

## 1. Mục đích

Tài liệu này là nguồn quy định chính thức cho:

- Cách chuẩn hóa workflow khác nhau giữa các Jira project.
- Điều kiện một task được coi là hoàn thành.
- Bug hoặc Sentry event nào chặn release.
- Ai được tạo, kiểm tra, override và phát hành một release.
- Khi nào task được coi là stale.
- Cách tổng hợp các release gate thành trạng thái cuối cùng.

Policy này thay thế việc hardcode các tên trạng thái như `Done`, `Closed`,
`Resolved` hoặc `Done/In Review`. Tên status chỉ dùng để hiển thị và phân loại
chi tiết; quyết định hoàn thành dựa trên Jira status category.

## 2. Phạm vi và thuật ngữ

### 2.1 Phạm vi

Policy áp dụng cho tất cả Jira project được cấu hình trong
`JIRA_PROJECT_KEYS`. Project có quy trình đặc biệt có thể khai báo override,
nhưng không được làm yếu các gate bảo mật mà không có quyết định được ghi lại.

### 2.2 Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Release | Một Jira Fix Version thuộc một project |
| Mandatory gate | Gate bắt buộc phải `passed` hoặc được override hợp lệ |
| Advisory gate | Gate chỉ cung cấp cảnh báo, không tự chặn release |
| Unknown | Không có đủ dữ liệu hoặc integration không xác minh được |
| Stale | Task vượt SLA trong trạng thái hiện tại hoặc không có hoạt động cần thiết |
| Release manager | Role được phép quản lý và phát hành release |

## 3. Chuẩn hóa Jira workflow

### 3.1 Nguồn phân loại chính

Ứng dụng sử dụng `fields.status.statusCategory.key` do Jira trả về. Không dùng
status name hoặc numeric category ID làm nguồn quyết định chính vì tên và ID có
thể khác giữa Jira instance/project.

Mapping chuẩn:

| Jira `statusCategory.key` | Nhóm chuẩn | Có đang mở? | Có hoàn thành? |
|---|---|---:|---:|
| `new` | `todo` | Có | Không |
| `indeterminate` | `in_progress` | Có | Không |
| `done` | `done` | Không | Có |
| Thiếu/khác | `unknown` | Có | Không |

Quy tắc fail-safe:

- Category thiếu hoặc không nhận diện được phải thành `unknown`.
- `unknown` không bao giờ được coi là hoàn thành.
- Numeric IDs chỉ được dùng làm fallback tương thích tạm thời trong migration;
  không được lưu như policy lâu dài.

### 3.2 Nhóm hiển thị chi tiết

Board có thể chia nhóm chuẩn thành các cột chi tiết:

| Nhóm hiển thị | Category gốc | Cách xác định |
|---|---|---|
| Backlog | `new` | Status name/config thuộc nhóm backlog |
| To Do | `new` | Mặc định cho category `new` |
| In Progress | `indeterminate` | Mặc định cho category đang xử lý |
| In Review | `indeterminate` | Status được project map vào review |
| QA/Test | `indeterminate` | Status được project map vào QA/test |
| Blocked | `new` hoặc `indeterminate` | Status/flag được project map là blocked |
| Done | `done` | Category `done` |

Tên status không được suy đoán bằng keyword trong release gate. Project mapping
được lấy từ Jira workflow và cấu hình project; keyword chỉ được phép dùng cho
UI fallback trong thời gian chuyển đổi.

### 3.3 Trạng thái hoàn thành

Một issue thuộc release được coi là hoàn thành khi và chỉ khi:

1. Jira `statusCategory.key = done`.
2. Issue vẫn truy cập được tại thời điểm check.
3. Dữ liệu issue không vượt freshness SLA.

Các status như `Cancelled`, `Won't Do` hoặc `Duplicate` có thể thuộc category
`done`, do đó được coi là đã đóng về mặt workflow. Release UI phải hiển thị
resolution để release manager nhận biết; chúng không tự trở thành bug blocker
trừ khi có gate khác phát hiện rủi ro.

Issue bị xóa, mất quyền truy cập hoặc thiếu category trả kết quả `unknown`,
không được coi là hoàn thành.

## 4. Release lifecycle

Trạng thái mục tiêu:

```text
draft → checking → blocked/unknown/ready → released
             ↑          │          │
             └──────────┴──────────┘  (re-check khi dữ liệu thay đổi)
```

| Trạng thái | Ý nghĩa |
|---|---|
| `draft` | Release đang được chuẩn bị |
| `checking` | Gate engine đang kiểm tra |
| `blocked` | Có mandatory gate thất bại |
| `unknown` | Không xác minh được ít nhất một mandatory gate |
| `ready` | Tất cả mandatory gate đã pass hoặc override hợp lệ |
| `released` | Jira version đã được release bởi người có quyền |

Quy tắc:

- Release không có task luôn `blocked` với lý do `EMPTY_RELEASE`.
- Release check không tự đánh dấu Jira version là released.
- Bất kỳ thay đổi nào về task, PR, Sentry hoặc CI làm trạng thái `ready` hết
  hiệu lực và yêu cầu re-check.
- Release đã `released` không bị tự động quay về trạng thái trước; regression
  sau release tạo cảnh báo/post-release incident.

## 5. Release gates

### 5.1 Trạng thái gate

Mỗi gate trả một trong bốn trạng thái:

| State | Ý nghĩa |
|---|---|
| `passed` | Đã xác minh và đạt policy |
| `failed` | Đã xác minh và vi phạm policy |
| `unknown` | Không đủ dữ liệu, dữ liệu cũ hoặc integration lỗi |
| `overridden` | Gate failed/unknown nhưng được người có quyền chấp nhận rủi ro |

### 5.2 Mandatory gates

| Gate | Điều kiện pass | Điều kiện failed | Điều kiện unknown |
|---|---|---|---|
| `non_empty_release` | Release có ít nhất một issue | Không có issue | Không đọc được Fix Version |
| `task_status` | Tất cả issue có category `done` | Có issue chưa done | Issue/category không đọc được |
| `critical_bugs` | Không có bug Blocker/Critical đang mở | Có bug chặn đang mở | Jira data cũ/không đọc được |
| `sentry` | Không có fatal unresolved trong scope | Có fatal unresolved trong scope | Sentry lỗi hoặc dữ liệu cũ |
| `pull_requests` | Tất cả PR bắt buộc đã merge đúng base/release branch | Có PR open/closed/declined/chưa tạo | Không map/không đọc được PR bắt buộc |
| `ci` | Build và test của release commit thành công | Build/test failed | Chưa có build hoặc CI không truy cập được |
| `data_freshness` | Jira/Sentry/Bitbucket/CI nằm trong SLA | — | Có source vượt SLA hoặc chưa sync |
| `manual_approval` | Release manager/QA đã approve | Approval bị revoke | Chưa có approval |

Trong Pilot MVP, `ci` chỉ trở thành mandatory sau khi CI webhook được tích hợp.
Trước thời điểm đó, gate phải hiển thị `not_configured` và release manager phải
xác nhận thủ công; không được giả lập `passed`.

### 5.3 Advisory gates

- AI release risk analysis.
- Task thiếu story point.
- Task thiếu acceptance criteria.
- Task/branch stale nhưng đã được xử lý bằng quyết định có ghi nhận.
- Cảnh báo Sentry level `error` không thỏa điều kiện blocker.

Advisory gate có thể khiến release manager xem xét lại nhưng không tự thay đổi
release từ `ready` sang `blocked`.

### 5.4 Cách tổng hợp

```text
Nếu release rỗng                         → blocked
Nếu có mandatory gate = failed          → blocked
Nếu không failed nhưng có unknown       → unknown
Nếu mọi mandatory gate passed/overridden → ready
```

AI lỗi, timeout hoặc trả response không hợp lệ phải là advisory `unknown`.
Không có trường hợp AI fallback làm release `ready`.

## 6. Severity chặn release

### 6.1 Jira bugs

Một Jira issue chặn release khi thỏa tất cả điều kiện:

1. Issue type thuộc nhóm Bug/Defect hoặc được project map là defect.
2. Priority là `Blocker` hoặc `Critical` (so sánh không phân biệt hoa thường).
3. Status category khác `done`.
4. Issue thuộc release hoặc được đánh dấu ảnh hưởng release đó.

Mặc định:

```text
Blocker  → mandatory blocker
Critical → mandatory blocker
Major    → advisory
Minor    → advisory
Trivial  → advisory
Unknown  → advisory + cảnh báo cấu hình
```

Project có tên priority khác phải map về severity chuẩn. Không được tự hạ
`Blocker`/`Critical` xuống advisory chỉ bằng cấu hình UI.

### 6.2 Sentry

| Sentry level | Policy |
|---|---|
| `fatal` unresolved | Chặn release nếu thuộc project/environment/release scope |
| `error` regression | Chặn khi đã link tới Jira Blocker/Critical; nếu chưa link thì advisory khẩn |
| `error` thông thường | Advisory, trừ khi được release manager đánh dấu blocker |
| `warning`, `info`, `debug` | Không chặn; dùng cho quan sát |

Scope Sentry phải khớp tối thiểu một trong các tín hiệu:

- Sentry release/version khớp release đang kiểm tra.
- Environment thuộc tập production/staging được policy chỉ định.
- Sentry issue đã link với Jira issue trong Fix Version.
- Release manager đánh dấu trực tiếp là ảnh hưởng release.

Nếu không xác định được scope, không tự chặn nhưng tạo advisory `scope_unknown`.

## 7. Branch, PR và CI policy

### 7.1 Pull request

- PR phải ở trạng thái `MERGED`.
- `CLOSED` hoặc `DECLINED` không phải merged.
- PR phải merge vào base branch hoặc release branch được cấu hình.
- Task cần code nhưng chưa có branch/PR là `failed`.
- Task được đánh dấu `no-code` không yêu cầu PR, nhưng nhãn/decision phải được
  lưu và audit.

### 7.2 CI

- Dùng commit SHA đã merge hoặc release branch HEAD làm evidence.
- Build và test bắt buộc phải success.
- Job bị cancel, skipped không được tự tính success trừ khi policy CI map rõ.
- Không tìm thấy CI run là `unknown`.
- CI result quá cũ so với commit hiện tại là `unknown`.

## 8. Data freshness policy

SLA mặc định tại thời điểm chạy release check:

| Nguồn | Fresh tối đa |
|---|---:|
| Jira issue/version/comment | 5 phút |
| Bitbucket branch/PR | 5 phút |
| Sentry | 5 phút |
| CI | Event phải khớp current commit; tối đa 15 phút kể từ lần verify |

Nếu source vượt SLA:

1. Gate engine yêu cầu một sync job.
2. Đợi job trong timeout cho phép.
3. Nếu vẫn không fresh, gate trả `unknown`.

Không dùng dữ liệu stale để cho release pass.

## 9. Role và quyền release

### 9.1 Roles

Policy chốt ba role:

- `member`
- `release_manager`
- `admin`

`release_manager` cần được thêm vào Prisma schema trong M3. Trước migration,
chỉ `admin` được thực hiện hành động tương đương release manager.

### 9.2 Permission matrix

| Hành động | Member | Release manager | Admin |
|---|:---:|:---:|:---:|
| Xem release/gate/evidence | ✓ | ✓ | ✓ |
| Chạy lại release check | ✓ | ✓ | ✓ |
| Tạo/sửa draft release | — | ✓ | ✓ |
| Bulk gán Fix Version | Theo quyền Jira | ✓ | ✓ |
| Approve release | — | ✓ | ✓ |
| Override gate | — | ✓ | ✓ |
| Revoke override | — | Own/team policy | ✓ |
| Đánh dấu Jira version released | — | ✓ | ✓ |
| Sửa global/project policy | — | — | ✓ |
| Quản lý integration/credential | — | — | ✓ |
| Gán role | — | — | ✓ |

Mọi hành động vẫn phải qua quyền của Jira/Bitbucket. Application role không
thể cấp quyền mà external system từ chối.

## 10. Override policy

Override chỉ áp dụng cho một gate cụ thể, một release cụ thể và trong thời hạn
cụ thể. Không có override toàn cục vô thời hạn.

Thông tin bắt buộc:

- Người tạo override.
- Gate và blocker được override.
- Lý do chấp nhận rủi ro.
- Owner chịu trách nhiệm.
- Ticket/issue theo dõi nếu có.
- Thời gian hết hạn.

Không được override:

- Release rỗng.
- Không xác định được release/Fix Version.
- Người dùng không có quyền release.
- Credential hoặc audit system không hoạt động.

Override `critical_bugs`, `sentry`, `pull_requests` hoặc `ci` phải được hiển thị
rõ trên release page và release notification.

## 11. Stale policy

### 11.1 Cách tính

Ưu tiên `statusChangedAt` để tính tuổi trong trạng thái. Nếu Jira instance
không cung cấp trường này, dùng thời điểm status change gần nhất từ changelog.
Chỉ khi cả hai không có mới fallback sang `updatedAt` và đánh dấu độ tin cậy
thấp.

Task category `done` không được đưa vào stale report.

### 11.2 SLA mặc định

| Nhóm workflow | Ngưỡng | Mức cảnh báo |
|---|---:|---|
| Backlog | 30 ngày | Info/digest |
| To Do | 14 ngày | Warning |
| In Progress | 5 ngày | Warning |
| In Review | 2 ngày | Warning |
| QA/Test | 2 ngày | Warning |
| Blocked | 3 ngày | High |
| Unknown | 7 ngày | Warning + yêu cầu map workflow |
| Done | Không áp dụng | Không cảnh báo |

### 11.3 Notification cadence

- Gửi khi task lần đầu vượt ngưỡng.
- Gửi lại khi severity tăng hoặc sau 7 ngày chưa thay đổi.
- Không gửi hằng ngày cùng một nội dung.
- Khi task thay đổi trạng thái hoặc có activity hợp lệ, stale timer được tính
  lại theo policy.
- Dashboard hiển thị bottleneck và nguyên nhân; không dùng stale leaderboard
  đơn giản làm chỉ số đánh giá hiệu suất cá nhân.

## 12. Cấu hình đã chốt

Các biến sau là contract cho implementation M1–M3. Chưa thêm vào `.env.example`
cho tới khi `src/lib/env.ts` thực sự đọc và validate chúng.

```env
# Workflow/release
RELEASE_DONE_CATEGORIES=done
RELEASE_BLOCKING_PRIORITIES=Blocker,Critical
RELEASE_REQUIRED_GATES=non_empty_release,task_status,critical_bugs,sentry,pull_requests,data_freshness,manual_approval
RELEASE_REQUIRE_PR_MERGED=true
RELEASE_REQUIRE_CI=true
RELEASE_DATA_FRESHNESS_MINUTES=5

# Sentry
SENTRY_BLOCKING_LEVELS=fatal
SENTRY_BLOCK_ERROR_WITH_CRITICAL_JIRA=true

# Stale SLA
STALE_BACKLOG_DAYS=30
STALE_TODO_DAYS=14
STALE_IN_PROGRESS_DAYS=5
STALE_REVIEW_DAYS=2
STALE_QA_DAYS=2
STALE_BLOCKED_DAYS=3
STALE_UNKNOWN_DAYS=7
STALE_REMINDER_DAYS=7
```

`RELEASE_REQUIRE_CI=true` thể hiện policy cuối. Trong thời gian chưa tích hợp
CI, gate là `not_configured/unknown` và cần manual approval có ghi nhận; không
được hardcode thành pass.

## 13. Project overrides

Project override được phép cho:

- Map status name vào nhóm Backlog/Review/QA/Blocked.
- Map priority tùy chỉnh về severity chuẩn.
- Base/release branch.
- CI required jobs.
- SLA stale nghiêm ngặt hơn hoặc phù hợp workflow riêng.

Project override không được:

- Coi category `new`/`indeterminate` là done.
- Cho dữ liệu stale pass gate.
- Coi PR closed/declined là merged.
- Cho AI thay thế mandatory gate.
- Bỏ audit hoặc permission check.

Mọi override policy phải có owner, lý do và lịch sử thay đổi.

## 14. Audit requirements

Phải audit:

- Tạo/sửa release.
- Chạy release check và snapshot evidence.
- Approval/revoke approval.
- Override/revoke override.
- Đánh dấu released.
- Thay đổi global/project policy.
- Thay đổi role.

Audit record gồm actor, action, target, before/after, timestamp, source và
correlation ID. Không lưu secret trong audit payload.

## 15. Acceptance scenarios

### Scenario 1 — Task chưa hoàn thành

- Release có một task category `indeterminate`.
- `task_status = failed`.
- Release là `blocked`.

### Scenario 2 — Integration lỗi

- Tất cả task done nhưng Bitbucket timeout.
- `pull_requests = unknown`.
- Release là `unknown`, không phải `ready`.

### Scenario 3 — Fatal Sentry issue

- Có fatal unresolved khớp release/environment.
- `sentry = failed`.
- Release là `blocked`.

### Scenario 4 — PR bị đóng

- PR có state `CLOSED` hoặc `DECLINED`.
- `pull_requests = failed`.
- Release là `blocked`.

### Scenario 5 — AI không hoạt động

- Mandatory gates đều pass.
- AI advisory là `unknown`.
- AI không tự chặn hoặc tự cho pass; release readiness do mandatory gates
  quyết định.

### Scenario 6 — Override hợp lệ

- Release manager override một CI failure có lý do, owner và expiry.
- Gate là `overridden` và UI hiển thị cảnh báo rõ.
- Nếu mọi mandatory gate khác pass, release có thể `ready`.

### Scenario 7 — Release rỗng

- Fix Version không có issue.
- `non_empty_release = failed` và không được override.
- Release là `blocked`.

## 16. Implementation gaps

Policy đã được chốt nhưng code hiện tại chưa enforce đầy đủ:

| Gap | Work item |
|---|---|
| Cache đã lưu status category và statusChangedAt; cần staging verification | M1 completed |
| Release checker còn hardcode status names | M2-02/M3-03 |
| Release status chưa có `checking`/`unknown` | M3-01/M3-02 |
| Chưa có `release_manager` role | M3-04/M9-01 |
| Chưa có Sentry release scope | M2-01/M3-03 |
| Chưa có CI integration | M3-03/M5 |
| Stale chỉ dùng một ngưỡng global | M8 |

Cho tới khi các gap P0 được xử lý, release ready-check hiện tại chỉ mang tính
tham khảo và không phải quyền phê duyệt production release.
