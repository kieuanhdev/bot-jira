# Kế hoạch đơn giản hóa Quản lý phát hành

> Dự án: Team Task Web  
> Phiên bản kế hoạch: 1.1  
> Ngày lập: 2026-09-29  
> Phạm vi: Trang `/release`, API release, đồng bộ Jira Fix Version, quyền và dữ liệu liên quan  
> Định hướng: Jira + trạng thái merge từ Bitbucket; không phụ thuộc CI/CD, Sentry hoặc ký duyệt thủ công  
> Trạng thái: Đề xuất triển khai

## 1. Bối cảnh và vấn đề hiện tại

Trang Quản lý phát hành hiện được xây theo mô hình nhiều quality gate:

- Jira task và critical bug.
- Branch và pull request.
- Sentry.
- Độ mới dữ liệu.
- Dependency.
- AI advisory.
- CI.
- QA/Release Manager sign-off.

Mô hình này không phù hợp với cách team đang vận hành vì Jira là hệ thống chính,
chưa có CI/CD tham gia vào release và không cần quy trình ký duyệt riêng.

Các vấn đề cụ thể:

1. Không cấu hình Sentry hoặc không có PR data vẫn làm kết quả kiểm tra thành
   `unknown`, nên release không thể đạt `ready` dù toàn bộ Jira task đã Done.
2. Nút "Kiểm tra sẵn sàng" yêu cầu role `release_manager` hoặc `admin`, nhưng UI
   vẫn hiển thị cho user không đủ quyền.
3. UI luôn hiển thị hai chữ ký QA và Release Manager dù
   `RELEASE_REQUIRED_APPROVALS` mặc định trống.
4. Hệ thống không có role QA riêng; release manager có thể tự tạo approval loại
   QA nên sign-off không phản ánh một bước kiểm soát độc lập.
5. KPI "Đang chuẩn bị" hiện là nhóm gom `draft`, `checking`, `unknown` và các
   trạng thái còn lại. Nó không dựa vào số task Done, ngày phát hành hoặc trạng
   thái archived của Jira.
6. Tất cả Jira Fix Version được nhập vào KPI, kể cả version rỗng, cũ hoặc
   archived.
7. API tạo release và API sync chưa enforce nhất quán quyền `release.manage`.
8. API publish chạy lại toàn bộ gate cũ; release từng được ready nhờ override có
   thể vẫn bị chặn lúc publish vì publish không nạp override.
9. UI ghi cố định "10 Quality Gates" trong khi số gate thực tế thay đổi theo cấu
   hình.

## 2. Mục tiêu

Sau thay đổi, trang Release phải trả lời nhanh bốn câu hỏi:

1. Jira đang có những Fix Version nào trong project?
2. Mỗi version có bao nhiêu task và bao nhiêu task đã Done?
3. Version nào có toàn bộ task Done và phần Git đã merge?
4. Nếu chưa phát hành được thì task cụ thể nào đang chặn?

Luồng mục tiêu:

```text
Tạo/chọn Jira Fix Version
        ↓
Gán task vào Fix Version trong Jira
        ↓
Ứng dụng tự tính tiến độ Jira + trạng thái merge
        ↓
Release Manager xác nhận "Phát hành trên Jira"
        ↓
Backend đọc lại Jira và đánh dấu Fix Version released
```

Không còn các bước độc lập:

- Chạy "Kiểm tra sẵn sàng".
- QA sign-off.
- Release Manager sign-off.
- Override quality gate.

## 3. Phạm vi và ngoài phạm vi

### 3.1 Trong phạm vi

- Đồng bộ Jira Fix Version và trạng thái `released`/`archived`.
- Tạo mới hoặc liên kết Jira Fix Version.
- Tự động tính tiến độ từ các issue mang Fix Version.
- Readiness dựa trên Jira task và dữ liệu branch/PR đã liên kết từ Bitbucket.
- KPI và bộ lọc mới.
- Phát hành Jira Fix Version có kiểm tra lại dữ liệu ngay trước mutation.
- RBAC, audit, thông báo và xử lý lỗi.
- Ẩn/bỏ UI, API và code path approval/gate không còn sử dụng.
- Giữ dữ liệu lịch sử đủ lâu để rollback an toàn.

### 3.2 Ngoài phạm vi

- Deploy ứng dụng hoặc trigger pipeline CI/CD.
- Xác nhận build/test artifact.
- Quy trình QA ký duyệt.
- Sentry release health.
- Dùng AI quyết định được phép phát hành.
- Trigger hoặc xác nhận pipeline deploy sau khi PR merge.
- Tự động chuyển trạng thái Jira task sang Done.

Sentry, dependency và AI vẫn có thể được hiển thị ở nơi phù hợp dưới dạng thông
tin tham khảo, nhưng không tham gia quyết định publish trong phạm vi kế hoạch
này. Branch/PR là dữ liệu bắt buộc đối với task cần code.

## 4. Quyết định nghiệp vụ mục tiêu

### 4.1 Source of truth

- Jira Fix Version là source of truth cho identity, tên, mô tả, ngày dự kiến,
  archived và released.
- Jira issue có Fix Version tương ứng là source of truth cho phạm vi công việc.
- `statusCategory.key = done` là tiêu chí hoàn thành duy nhất của task.
- Bitbucket là source of truth cho branch, pull request, destination branch và
  trạng thái merge.
- Chỉ liên kết branch có `linkState = confirmed` mới được dùng để quyết định
  readiness; suggestion chưa xác nhận không được coi là bằng chứng Git hợp lệ.
- PostgreSQL chỉ là read model/cache và nơi lưu audit/notes riêng của ứng dụng.

### 4.2 Task được tính vào release

Một task trực tiếp thuộc release khi:

- Cùng `projectKey` với Fix Version.
- `fixVersionIds` chứa `jiraVersionId` tương ứng.
- Task chưa bị đánh dấu `deletedAt` trong cache.

Task dependency không có Fix Version đó không được cộng vào mẫu số tiến độ.
Dependency chỉ hiện cảnh báo tham khảo để tránh làm readiness thay đổi khó hiểu.

### 4.3 Phân loại task cần code

Mặc định mọi task trong release được coi là cần code. Task không cần thay đổi mã
nguồn phải có Jira label `no-code` (so sánh không phân biệt hoa thường). Label
này là quyết định nghiệp vụ có thể nhìn thấy và audit được trên Jira, tránh việc
"không tìm thấy branch" bị hiểu nhầm là "không cần branch".

| Loại task | Điều kiện Git |
|---|---|
| Task có label `no-code` | Không yêu cầu branch/PR; chỉ cần Jira Done |
| Task không có `no-code` | Bắt buộc có ít nhất một branch liên kết confirmed và toàn bộ PR liên quan đã merge |

Không tự suy đoán `no-code` từ issue type, tên task hoặc việc không tìm thấy
branch. Nếu team muốn dùng label khác, bổ sung cấu hình
`RELEASE_NO_CODE_LABELS=no-code` thay vì hardcode rải rác.

### 4.4 Quy tắc Git delivery complete

Một task cần code chỉ đạt `gitComplete = true` khi:

1. Có ít nhất một `BranchInfo` đang hoạt động (`deletedAt = null`).
2. Branch được liên kết đúng task bằng `jiraKey` và `linkState = confirmed`.
3. Mỗi branch liên quan có pull request.
4. Mọi pull request có `prState = MERGED` và `merged = true`.
5. PR merge vào destination branch được phép của repository.
6. Dữ liệu branch/PR còn trong freshness SLA.

Với nhiều branch hoặc nhiều repository cho một task, tất cả branch confirmed
đang hoạt động đều phải đạt. Không dùng quy tắc "chỉ cần một PR đã merge".

| Trường hợp | Blocker code |
|---|---|
| Task cần code nhưng không có branch confirmed | `NO_CONFIRMED_BRANCH` |
| Chỉ có branch suggestion, chưa xác nhận link | `BRANCH_LINK_UNCONFIRMED` |
| Branch chưa có PR | `NO_PULL_REQUEST` |
| PR OPEN | `PR_NOT_MERGED` |
| PR CLOSED/DECLINED nhưng không merged | `PR_NOT_MERGED` |
| PR merged vào destination không được phép | `WRONG_MERGE_DESTINATION` |
| Branch/PR data quá cũ hoặc Bitbucket không đọc được | `GIT_DATA_STALE` / `GIT_UNAVAILABLE` |

`prState = CLOSED` không bao giờ được suy ra là merged. Field `merged` chỉ được
set true khi Bitbucket xác nhận merge hợp lệ; Jira comment parser có thể làm
fallback hiển thị nhưng không phải bằng chứng bắt buộc nếu thiếu destination
hoặc timestamp đáng tin cậy.

### 4.5 Readiness tự động

Readiness là dữ liệu suy ra, không phải bước workflow do người dùng bấm:

| Readiness | Điều kiện |
|---|---|
| `empty` | Version chưa released và không có task trực tiếp |
| `in_progress` | Version chưa released, có task và còn task chưa Done hoặc Git chưa complete |
| `ready` | Version chưa released, có ít nhất một task; mọi task trực tiếp đã Done và Git complete hoặc được miễn bằng label `no-code` |
| `released` | Jira Fix Version có `released = true` |

Các điều kiện không được tự tính là Done:

- Status name chứa chữ `Done` nhưng category không phải `done`.
- Task thiếu status category.
- Task bị mất quyền truy cập hoặc dữ liệu không còn tồn tại.

```text
taskReady = jiraDone AND (noCode OR gitComplete)
releaseReady = taskCount > 0 AND every(taskReady)
```

Nếu cache Jira hoặc Bitbucket quá cũ:

- Vẫn hiển thị tiến độ gần nhất kèm nhãn nguồn dữ liệu cũ.
- Không cho publish task code dựa trên Git cache cũ.
- Khi người dùng bấm publish, backend phải refresh/đọc lại Jira và Bitbucket có
  phạm vi trước khi quyết định, thay vì yêu cầu chạy một bước check thủ công.

### 4.6 Điều kiện publish bắt buộc

Backend chỉ đánh dấu Jira Fix Version released khi tất cả điều kiện sau đúng:

1. User có role `release_manager` hoặc `admin`.
2. Release có `projectKey` và `jiraVersionId` hợp lệ.
3. Jira Fix Version tồn tại, chưa archived và chưa released.
4. Có ít nhất một task trực tiếp trong release.
5. Mọi task trực tiếp có `statusCategory.key = done` từ dữ liệu vừa được đọc lại.
6. Mọi task cần code có branch confirmed và toàn bộ PR liên quan đã merge hợp lệ.
7. Dữ liệu Bitbucket vừa được refresh hoặc vẫn nằm trong freshness SLA.
8. Jira mutation thành công.

Không bắt buộc:

- CI.
- Sentry.
- QA/RM approval.
- AI advisory.
- Gate override.

Publish phải idempotent: nếu Jira đã released thì API trả thành công và đồng bộ
lại local state, không gọi mutation lần hai.

## 5. KPI và bộ lọc mới

### 5.1 Phạm vi KPI mặc định

- Theo project đang chọn; chọn "Tất cả" thì tổng hợp các project user được phép
  xem.
- Mặc định loại version `archived = true`.
- Không loại version rỗng khỏi dữ liệu: version rỗng cần được nhìn thấy để người
  dùng sửa hoặc archive, nhưng phải nằm trong nhóm riêng.

### 5.2 Năm KPI loại trừ nhau

| KPI | Công thức |
|---|---|
| Tổng phiên bản đang hoạt động | `archived = false` |
| Đang thực hiện | `released = false AND taskCount > 0 AND deliveryReadyCount < taskCount` |
| Sẵn sàng | `released = false AND taskCount > 0 AND deliveryReadyCount = taskCount` |
| Chưa có task | `released = false AND taskCount = 0` |
| Đã phát hành | `released = true` |

Bất biến cần được test:

```text
totalActive = inProgress + ready + empty + released
```

`released` trong công thức trên chỉ tính version không archived để giữ tổng
khớp với `totalActive`. Version archived xem qua bộ lọc riêng và không tham gia
KPI mặc định.

### 5.3 Bộ lọc

- Tất cả đang hoạt động.
- Đang thực hiện.
- Sẵn sàng.
- Chưa có task.
- Đã phát hành.
- Đã lưu trữ (archived).

Search tiếp tục hỗ trợ tên version, project và mô tả. Khi có search, KPI vẫn
phản ánh phạm vi project chứ không thay đổi theo chuỗi search, trừ khi sau này
product quyết định rõ khác đi.

## 6. Trải nghiệm UI mục tiêu

Thiết kế phải tuân theo `design-system/team-task-web/MASTER.md`, dùng semantic
tokens, Lucide icons, loading bằng `Skeleton`, hỗ trợ light/dark mode và mobile.

### 6.1 Header và hành động chính

- Giữ nút "Đồng bộ từ Jira".
- Giữ nút "Tạo bản phát hành".
- Chỉ user có `release.manage` mới thấy hai mutation action này.
- Member chỉ xem dữ liệu.

### 6.2 Release card/list

Mỗi release hiển thị tối thiểu:

- Tên version và project.
- Badge: Đang thực hiện / Sẵn sàng / Chưa có task / Đã phát hành / Archived.
- Ngày dự kiến nếu Jira có `releaseDate`.
- Tiến độ Jira `doneCount/taskCount` và tiến độ delivery `deliveryReadyCount/taskCount`.
- Trạng thái Git theo task: Không cần code / Chưa có branch / Chưa có PR / PR mở / Đã merge.
- Danh sách task chưa Done hoặc Git chưa complete.
- Cảnh báo dữ liệu Jira hoặc Bitbucket cũ nếu có.
- Nút "Phát hành trên Jira" chỉ dành cho release manager/admin.

Không hiển thị:

- Stepper 4 bước Scope → Gates → Sign-off → Publish.
- Tab "Cổng chất lượng".
- Tab "Ký duyệt".
- Nút "Kiểm tra sẵn sàng".
- Nút/lịch sử override gate.
- Số lượng gate đạt.

Các tab còn lại đề xuất:

1. `Công việc`: task trực tiếp, trạng thái Jira, branch/PR, merge destination, assignee và points.
2. `Dependency`: chỉ hiện khi có dependency; tất cả cảnh báo là advisory.
3. `Changelog & Ghi chú`.

### 6.3 Publish dialog

Thay `window.confirm` bằng `Dialog` có nội dung rõ ràng:

- Project và tên version.
- Tổng task, số Done và số task có Git delivery complete.
- Ngày dự kiến.
- Cảnh báo đây chỉ là đánh dấu Fix Version released trên Jira, không deploy phần
  mềm.
- Nút hủy và nút "Xác nhận phát hành".

Nếu API trả `409`, dialog hoặc banner hiển thị danh sách task chặn với Jira key,
summary, status Jira, branch/PR và blocker code hiện tại. Không hiển thị lỗi chung chung "release not ready".

### 6.4 Empty, loading và error state

- Loading dùng `Skeleton`.
- Không có release: icon Package/Rocket trong vòng tròn muted, title ngắn và
  gợi ý tạo hoặc đồng bộ Jira Fix Version.
- Project không có quyền đọc: error riêng, không giả thành empty.
- Sync lỗi một project: hiển thị project và lý do rút gọn.
- Action đang chạy phải disable đúng release, không khóa toàn trang.

## 7. Thiết kế backend mục tiêu

### 7.1 Service readiness dùng chung

Tạo service thuần, ví dụ:

```text
src/lib/releases/release-readiness.ts
```

Interface đề xuất:

```ts
type ReleaseReadiness = {
  state: "empty" | "in_progress" | "ready" | "released";
  taskCount: number;
  doneCount: number;
  gitCompleteCount: number;
  deliveryReadyCount: number;
  blockers: Array<{
    code: "TASK_NOT_DONE" | "NO_CONFIRMED_BRANCH" | "BRANCH_LINK_UNCONFIRMED"
      | "NO_PULL_REQUEST" | "PR_NOT_MERGED" | "WRONG_MERGE_DESTINATION"
      | "JIRA_DATA_STALE" | "GIT_DATA_STALE" | "GIT_UNAVAILABLE";
    jiraKey: string;
    summary: string;
    status: string;
    repo?: string;
    branch?: string;
    prUrl?: string;
  }>;
  jiraDataFresh: boolean;
  gitDataFresh: boolean;
  lastJiraSyncedAt: string | null;
  lastGitSyncedAt: string | null;
};
```

Service này phải được dùng bởi:

- API danh sách release.
- API chi tiết release.
- API publish.
- Logic KPI/filter của UI.

Không để UI và API publish tự viết hai công thức readiness khác nhau.

### 7.2 API danh sách

`GET /api/releases` trả mỗi item với:

- `jiraReleased`.
- `archived`.
- `taskCount`.
- `doneCount`.
- `gitCompleteCount`.
- `deliveryReadyCount`.
- `readiness`.
- `incompleteTasks` dạng rút gọn hoặc `incompleteCount`.
- `lastJiraSyncedAt` và `lastGitSyncedAt`.
- `jiraDataFresh` và `gitDataFresh`.

Trả thêm `summary` từ server để KPI không phụ thuộc vào logic gom nhóm tại
client:

```json
{
  "summary": {
    "totalActive": 45,
    "inProgress": 20,
    "ready": 8,
    "empty": 5,
    "released": 12,
    "archived": 7
  },
  "items": []
}
```

Với dữ liệu lớn, pagination là hạng mục P2; chưa cần làm chỉ để xử lý 45 version.

### 7.3 API publish

Refactor `POST /api/releases/[id]/release`:

1. Kiểm tra session và `release.publish`.
2. Đọc release local.
3. Nếu local/Jira đã released, đồng bộ và trả idempotent success.
4. Dùng credential Jira cá nhân của actor.
5. Đọc lại Fix Version và danh sách issue thuộc Fix Version từ Jira hoặc chạy
   refresh có phạm vi cho version đó.
6. Nạp các branch confirmed của task; nếu dữ liệu Git stale thì refresh có phạm
   vi các repository/branch liên quan từ Bitbucket.
7. Tính readiness Jira + Git bằng service dùng chung.
8. Nếu empty, còn task chưa Done hoặc PR chưa merge, trả `409` với mã lỗi có cấu trúc:

```json
{
  "error": "RELEASE_NOT_READY",
  "readiness": "in_progress",
  "taskCount": 10,
  "doneCount": 10,
  "gitCompleteCount": 8,
  "deliveryReadyCount": 8,
  "blockers": [
    {
      "jiraKey": "EPM-123",
      "summary": "...",
      "status": "Done",
      "repo": "employee-web",
      "branch": "feature/EPM-123",
      "prUrl": "https://bitbucket.example/pr/123",
      "reason": "PR_NOT_MERGED"
    }
  ]
}
```

9. Gọi Jira release version đúng một lần.
10. Chỉ cập nhật local `released` sau khi Jira xác nhận.
11. Ghi audit và gửi notification.

Không gọi `runGates`, AI, Sentry, CI hoặc manual approval từ endpoint publish
mới. Endpoint vẫn phải đọc Bitbucket vì merge là điều kiện bắt buộc.

### 7.4 API create và sync

- `POST /api/releases` phải enforce `release.manage`.
- `POST /api/releases/sync` phải enforce `release.manage` hoặc tạo permission
  riêng `release.sync` và chỉ cho release manager/admin.
- Create phải chống trùng bằng `(projectKey, jiraVersionId)` như hiện tại.
- Nếu tạo Jira thành công nhưng ghi database lỗi, lần sync sau phải phục hồi
  version, không tạo Jira version trùng.
- Sync phải mirror Jira theo cả hai chiều:
  - Jira `released=true` → local released.
  - Jira `released=false` → local draft/unreleased.
  - Jira `archived` → local archived.
- Sync không xóa release local khi Jira tạm thời lỗi hoặc user mất quyền.
- Sync task tiếp tục thêm/xóa `ReleaseTask` theo Fix Version hiện tại.

## 8. Thay đổi database và tương thích

### 8.1 Migration cần thiết

Thêm vào model `Release`:

```prisma
archived     Boolean   @default(false)
jiraUpdatedAt DateTime?
lastSyncedAt DateTime?
```

Tên field cuối cùng có thể điều chỉnh theo convention hiện tại, nhưng phải phân
biệt:

- Thời điểm Jira version thay đổi.
- Thời điểm ứng dụng đồng bộ thành công.

### 8.2 Xử lý `ReleaseStatus`

Giai đoạn 1 giữ enum hiện tại để rollout an toàn, nhưng chỉ ghi:

- `draft` cho version chưa released.
- `released` cho version đã released.

`ready` được suy ra, không ghi vào `Release.status`.

Backfill:

- `checking`, `ready`, `blocked`, `unknown` → `draft`, trừ record Jira đã
  released.
- `released` giữ nguyên và được Jira sync xác minh lại.

Sau ít nhất một chu kỳ vận hành ổn định mới cân nhắc migration thu gọn enum còn
`draft | released`. Không cần drop enum ngay trong cùng đợt UI refactor.

### 8.3 Dữ liệu gate/approval cũ

Không drop ngay các bảng:

- `ReleaseCheck`.
- `ReleaseGateResult`.
- `ReleaseApproval`.
- `ReleaseGateOverride`.
- `CiBuildStatus`.

Giai đoạn chuyển tiếp:

- Ngừng tạo record mới từ UI release.
- Không trả các quan hệ này trong API list/detail mới.
- Giữ dữ liệu lịch sử ít nhất một chu kỳ backup/retention.
- Tạo migration drop riêng sau khi xác nhận không còn chat command, API ngoài
  hoặc báo cáo nào sử dụng.

`CiBuildStatus` có thể vẫn được giữ nếu hệ thống khác dùng webhook CI; việc bỏ
khỏi release readiness không đồng nghĩa phải xóa dữ liệu CI.

## 9. Kế hoạch triển khai theo pha

### Pha 0 — Chốt baseline và quyết định

**Ưu tiên:** P0  
**Ước lượng:** 0,5 ngày

#### REL-S01 — Chụp baseline dữ liệu

- Export số lượng release theo project, `status`, released và task count.
- Đối chiếu tối thiểu 10 Fix Version với Jira, gồm released, unreleased, empty
  và archived.
- Xác nhận Jira API hiện tại trả field `archived`, `released`, `releaseDate`.
- Backup database trước migration.

**Done khi:** có baseline để so sánh trước/sau và khôi phục được database.

#### REL-S02 — Chốt policy Jira + Git merge

- Xác nhận chỉ task trực tiếp có Fix Version tham gia readiness.
- Xác nhận không cho publish release rỗng.
- Xác nhận mọi task phải thuộc category `done`.
- Xác nhận task cần code phải có toàn bộ PR merged.
- Xác nhận label `no-code` là cách miễn yêu cầu Git.
- Xác nhận destination branch hợp lệ theo repository.
- Xác nhận archived bị ẩn mặc định.

**Done khi:** các quyết định trên được ghi vào `docs/release-policy.md` hoặc ADR
ngắn và không còn câu chữ yêu cầu approval/CI cho rollout này.

### Pha 1 — Readiness và sync backend

**Ưu tiên:** P0  
**Ước lượng:** 1–1,5 ngày

#### REL-S03 — Thêm Jira version metadata

- Migration thêm `archived`, `jiraUpdatedAt`, `lastSyncedAt`.
- Mở rộng `JiraVersion` mapping nếu Jira client chưa map đủ field.
- Cập nhật `syncReleasesFromJira` để mirror released/archived hai chiều.
- Backfill từ một lần sync Jira có kiểm soát.

**File dự kiến:**

- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_simplify_release_state/migration.sql`
- `src/lib/jira/types.ts`
- `src/lib/jira/client.ts`
- `src/lib/releases/sync.ts`

#### REL-G01 — Chuẩn hóa dữ liệu Git bắt buộc

- Chỉ dùng branch `deletedAt = null`, `jiraKey` khớp task và
  `linkState = confirmed`.
- Chuẩn hóa `prState` về OPEN/MERGED/DECLINED/CLOSED.
- Xác minh field `merged` chỉ true khi merge vào destination được phép.
- Chốt cấu hình base/release branch theo repository; không dùng một base branch
  global cho mọi repo nếu thực tế khác nhau.
- Lưu/đọc `checkedAt` và `prUpdatedAt` để đánh giá freshness.
- Tạo query theo danh sách Jira key để tránh đọc toàn bộ `BranchInfo`.
- Khi chỉ có suggestion, trả blocker `BRANCH_LINK_UNCONFIRMED`; không tự confirm.
- Nếu Bitbucket chưa cấu hình hoặc timeout, chỉ task `no-code` được miễn; task
  cần code phải trả `GIT_UNAVAILABLE`.

**File dự kiến:**

- `src/lib/bitbucket/task-delivery-query.ts` hoặc service query mới.
- `src/lib/bitbucket/client.ts`.
- `src/lib/queue/workers/check-branches.ts`.
- `src/lib/releases/release-readiness.ts`.
- test query/sync tương ứng.

#### REL-S04 — Tạo readiness service

- Viết hàm thuần tính `empty | in_progress | ready | released`.
- Tính task readiness từ Jira Done và Git delivery complete.
- Chỉ đọc branch active + confirmed; bỏ suggestion/rejected/manual_unlinked.
- Hỗ trợ label `no-code`.
- Không tính dependency vào taskCount.
- Trả blocker Jira/Git có cấu trúc và freshness theo từng nguồn.
- Dùng cùng service cho list/detail/publish.

**File dự kiến:**

- `src/lib/releases/release-readiness.ts`
- `src/lib/releases/release-readiness.test.ts`

#### REL-S05 — Refactor API list/detail

- Bỏ include approvals, gate overrides và latest gate check khỏi payload mặc
  định.
- Trả readiness và summary từ server.
- Hỗ trợ filter `projectKey`, `readiness`, `includeArchived`.
- Giữ response tương thích tạm thời nếu cần rollout UI và API ở hai commit.

**File dự kiến:**

- `src/app/api/releases/route.ts`
- `src/app/api/releases/[id]/route.ts`
- `src/lib/releases/release-summary.ts`
- test route/service tương ứng.

### Pha 2 — Publish và quyền

**Ưu tiên:** P0  
**Ước lượng:** 1 ngày

#### REL-S06 — Refactor publish

- Bỏ `runGates` khỏi publish endpoint.
- Refresh Jira và Bitbucket có phạm vi trong request hoặc qua service có timeout rõ ràng.
- Nếu Bitbucket không khả dụng cho task cần code, fail-safe và không publish.
- Trả blocker Jira/Git có cấu trúc.
- Giữ idempotency, audit và notify.
- Phân biệt lỗi credential, Jira permission, timeout, task chưa Done, thiếu branch và PR chưa merge.

**File dự kiến:**

- `src/app/api/releases/[id]/release/route.ts`
- `src/lib/releases/publish.ts` nếu tách service.
- `src/app/api/releases/[id]/release/route.test.ts`

#### REL-S07 — Chuẩn hóa RBAC

Ma trận mục tiêu:

| Hành động | Member | Release manager | Admin |
|---|---:|---:|---:|
| Xem release | Có | Có | Có |
| Tạo/liên kết Fix Version | Không | Có | Có |
| Đồng bộ Jira release | Không | Có | Có |
| Sửa notes/description local | Không | Có | Có |
| Publish Jira version | Không | Có | Có |

- API bắt buộc enforce, không chỉ ẩn nút.
- UI nhận role/capability để ẩn hoặc disable hành động phù hợp.
- Ghi audit cho create, sync, update và publish.

**File dự kiến:**

- `src/lib/permissions.ts`
- `src/app/api/releases/route.ts`
- `src/app/api/releases/sync/route.ts`
- `src/app/api/releases/[id]/route.ts`
- route tests.

### Pha 3 — UI release mới

**Ưu tiên:** P0  
**Ước lượng:** 1,5–2 ngày

#### REL-S08 — KPI và filter

- Dùng summary server trả về.
- Thay `Đang chuẩn bị` bằng `Đang thực hiện`.
- Thêm `Chưa có task`.
- Thêm filter archived.
- Bảo đảm các KPI loại trừ nhau và cộng lại đúng tổng.

#### REL-S09 — Đơn giản hóa release card

- Bỏ gate tab, approval tab, stepper và lịch sử check.
- Đưa danh sách task/progress thành nội dung chính.
- Hiển thị task chưa Done hoặc có Git blocker trước.
- Dependency đưa thành advisory section tùy chọn.
- Giữ changelog/notes.
- Thêm trạng thái freshness rõ nhưng không làm KPI nhập nhằng.

#### REL-S10 — Publish dialog và lỗi có thể hành động

- Dùng shadcn `Dialog` thay `window.confirm`.
- Hiển thị rõ "không deploy phần mềm".
- Render blocker từ response `409`.
- Link từng Jira key sang issue detail/Jira khi URL có sẵn.

**File dự kiến cho Pha 3:**

- `src/app/(app)/release/release-client.tsx`
- Có thể tách:
  - `release-summary-cards.tsx`
  - `release-card.tsx`
  - `release-publish-dialog.tsx`
  - `release-task-list.tsx`
- `src/lib/query-keys.ts` nếu query shape/filter thay đổi.

Không tiếp tục để toàn bộ trang trong một component hơn 2.000 dòng nếu refactor
đã chạm sâu; tách theo trách nhiệm để test và review dễ hơn.

### Pha 4 — Gỡ luồng cũ có kiểm soát

**Ưu tiên:** P1  
**Ước lượng:** 0,5–1 ngày

#### REL-S11 — Ngừng API gate/approval

Sau khi UI mới ổn định:

- Xóa hoặc trả `410 Gone` có thông báo migration cho:
  - `POST /api/releases/[id]/ready`
  - approval mutation routes
  - override mutation routes
- Giữ `GET checks` tạm thời nếu cần đọc lịch sử vận hành.
- Kiểm tra chat command `/release ... check`; đổi thành trả readiness Jira + Git tự
  động hoặc đánh dấu deprecated.
- Xóa import và UI code không còn dùng.

#### REL-S12 — Cập nhật cấu hình và tài liệu

- Đánh dấu `RELEASE_REQUIRED_APPROVALS` deprecated rồi xóa sau rollout.
- Bổ sung `RELEASE_NO_CODE_LABELS=no-code`.
- Tài liệu hóa freshness của branch/PR và destination branch hợp lệ theo repo.
- `CI_GATE_ENABLED` có thể giữ cho module CI khác nhưng không mô tả là điều kiện
  publish Jira.
- Cập nhật:
  - `.env.example`
  - `docs/release-policy.md`
  - `docs/IMPLEMENTATION_STATUS.md`
  - `docs/REMAINING_IMPLEMENTATION_PLAN.md`
  - `README.md` nếu có hướng dẫn release.

### Pha 5 — Xác minh và rollout

**Ưu tiên:** P0  
**Ước lượng:** 0,5–1 ngày cộng thời gian theo dõi

#### REL-S13 — Backfill và đối chiếu

- Chạy migration staging.
- Sync lại từng project.
- So KPI mới với Jira.
- Kiểm tra tổng bất biến.
- Lấy mẫu ít nhất 10 version và đối chiếu task count/done count thủ công.
- Đối chiếu branch/PR của các task code với Bitbucket, gồm nhiều repo và nhiều branch.

#### REL-S14 — Pilot publish

- Dùng một Fix Version test hoặc project pilot.
- Test release rỗng bị chặn.
- Test còn task chưa Done bị chặn và trả đúng Jira key.
- Test task Done nhưng PR OPEN vẫn bị chặn.
- Test task Done nhưng không có branch confirmed vẫn bị chặn.
- Test nhiều branch, chỉ một PR chưa merge vẫn bị chặn.
- Test task `no-code` Done không cần branch.
- Test toàn bộ task Done và toàn bộ PR merge đúng destination thì publish thành công.
- Test bấm lại trả idempotent success.
- Test user member bị từ chối.
- Test Jira mutation lỗi không làm local thành released.

#### REL-S15 — Rollout production

- Deploy migration trước hoặc cùng phiên bản backend tương thích.
- Chạy sync Jira sau deploy.
- Theo dõi audit/error trong ít nhất một chu kỳ release thật.
- Chỉ gỡ bảng dữ liệu cũ ở release sau, không làm trong lần rollout đầu.

## 10. Kế hoạch kiểm thử

### 10.1 Unit test

- 0 task → `empty`.
- 1/3 Done → `in_progress`.
- 3/3 Done nhưng một PR OPEN → `in_progress`.
- 3/3 Done và toàn bộ task code có PR merged → `ready`.
- Task Done + `no-code` → ready ở cấp task mà không cần branch.
- Task Done nhưng không có branch confirmed → `NO_CONFIRMED_BRANCH`.
- Suggested branch không được tính là confirmed.
- PR CLOSED/DECLINED không được tính merged.
- Nhiều branch: tất cả phải merged.
- Merge sai destination → `WRONG_MERGE_DESTINATION`.
- Git data stale/unavailable → không ready đối với task code.
- Missing/unknown status category không được tính Done.
- Jira released luôn → `released`.
- Dependency không làm thay đổi taskCount trực tiếp.
- KPI groups không overlap và tổng luôn khớp.
- Archived bị loại khỏi total active.
- Freshness tạo cảnh báo hiển thị; publish bắt buộc refresh Jira và Git có phạm vi.

### 10.2 API test

- Member không create/sync/update/publish được.
- Release manager/admin thực hiện được action hợp lệ.
- Create trùng Fix Version không tạo row trùng.
- Sync mirror released và archived đúng hai chiều.
- Publish empty trả `409 EMPTY_RELEASE`.
- Publish incomplete trả blocker đầy đủ.
- Publish task Done nhưng PR OPEN trả `409 PR_NOT_MERGED`.
- Publish task code thiếu branch trả `409 NO_CONFIRMED_BRANCH`.
- Publish task `no-code` không đòi Bitbucket.
- Publish Done + Git complete gọi Jira đúng một lần.
- Jira lỗi không cập nhật DB.
- Already released trả success không gọi mutation.
- Thiếu Jira credential trả `428 jira_credentials_required`.

### 10.3 UI test/thủ công

- KPI đúng ở All projects và từng project.
- Filter đúng với mọi nhóm.
- Card hiển thị đúng `done/total` và `deliveryReady/total`.
- Task Done nhưng PR OPEN hiển thị Git blocker, không hiện release ready.
- Task `no-code` hiển thị trạng thái miễn Git rõ ràng.
- Archived ẩn mặc định và xem được khi bật filter.
- Member không thấy mutation controls.
- Loading dùng Skeleton; empty state không trống.
- Publish dialog và blocker dễ hiểu.
- Responsive tại 375, 768, 1024 và 1440 px.
- Light/dark contrast đạt tối thiểu 4.5:1.
- Keyboard focus rõ, icon trang trí có `aria-hidden`.
- `prefers-reduced-motion` được tôn trọng.

## 11. Quan sát, audit và vận hành

Các audit action cần giữ hoặc bổ sung:

- `release.create`
- `release.sync`
- `release.update`
- `release.publish`
- `release.publish_failed`

Audit không ghi token hoặc raw Jira response nhạy cảm. Với publish failure, lưu:

- Actor.
- Release ID/Jira version ID.
- Error code đã chuẩn hóa.
- Số task và số blocker.
- Correlation/request ID nếu hệ thống đã hỗ trợ.

Metric tối thiểu:

- Sync success/failure theo project.
- Publish attempt/success/failure.
- Publish blocked theo lý do `EMPTY_RELEASE`, `TASK_NOT_DONE`, `JIRA_PERMISSION`, `JIRA_ERROR`, `JIRA_DATA_STALE`, `NO_CONFIRMED_BRANCH`,
  `NO_PULL_REQUEST`, `PR_NOT_MERGED`, `WRONG_MERGE_DESTINATION`,
  `GIT_DATA_STALE`, `GIT_UNAVAILABLE`.
- Thời gian sync và publish.

## 12. Rủi ro và cách giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Cache báo tất cả Done nhưng Jira vừa thay đổi | Publish luôn đọc/refresh Jira ngay trước mutation |
| PR vừa thay đổi nhưng cache Bitbucket còn cũ | Refresh có phạm vi hoặc chặn publish khi Git data stale |
| Branch link nhầm task | Chỉ dùng confirmed link; suggestion không tham gia readiness |
| Task không cần code bị chặn | Dùng Jira label `no-code` rõ ràng và hiển thị trên release UI |
| Một task có nhiều branch nhưng chỉ một PR merge | Yêu cầu mọi active confirmed branch đều merge |
| Bỏ gate làm mất lịch sử cũ | Giữ bảng check/approval trong giai đoạn chuyển tiếp |
| KPI thay đổi gây hiểu nhầm | Hiển thị tooltip/copy công thức và đối chiếu baseline Jira |
| Jira API chậm khi publish | Timeout rõ ràng, không mutation nếu refresh thất bại |
| Sync sai làm released quay về draft | Test hai chiều trên staging và Jira luôn là source of truth |
| Version archived biến mất khỏi màn hình | Có filter archived riêng, không xóa dữ liệu |
| Client và server rollout lệch phiên bản | API giữ field cũ tạm thời hoặc deploy backend tương thích trước |
| Chat command còn gọi gate cũ | Search toàn repo và migrate/deprecate trước khi xóa endpoint |

## 13. Rollback

Nếu rollout gặp lỗi:

1. Rollback UI sang bản cũ.
2. Backend mới trong giai đoạn đầu vẫn giữ schema và bảng gate cũ.
3. Không drop cột/bảng trong release đầu nên rollback code không mất dữ liệu.
4. Khôi phục database chỉ khi migration/backfill làm sai dữ liệu; ưu tiên sync lại
   từ Jira vì Jira là source of truth.
5. Không tự động unrelease Jira version trong rollback. Việc đảo trạng thái Jira
   là mutation riêng, cần người có quyền quyết định.

## 14. Definition of Done

Hạng mục chỉ hoàn thành khi:

1. Trang Release không còn nút check, gate stepper hoặc ký duyệt.
2. KPI dùng năm nhóm loại trừ nhau và tổng luôn khớp.
3. Archived ẩn mặc định nhưng vẫn truy cập được.
4. Readiness tự động khớp task trực tiếp trong Jira và branch/PR confirmed trong Bitbucket.
5. Publish phụ thuộc Jira Done + Git merged và kiểm tra lại dữ liệu trước mutation.
6. Member không thực hiện được create/sync/update/publish ở cả UI và API.
7. Release manager/admin publish được một version pilot thành công.
8. Release rỗng, còn task chưa Done, thiếu branch/PR hoặc PR chưa merge bị chặn với lý do cụ thể.
9. Không có CI, Sentry hoặc approval vẫn có thể đạt `ready`; Bitbucket chỉ được miễn cho task `no-code`.
10. Unit, route và test thủ công bắt buộc đều pass.
11. Audit/notification không bị mất.
12. Tài liệu release policy và cấu hình được cập nhật theo luồng Jira + Git merge.

## 15. Ước lượng và thứ tự đề xuất

| Pha | Nội dung | Ước lượng |
|---|---|---:|
| 0 | Baseline và chốt policy | 0,5 ngày |
| 1 | Schema, Jira sync, Git delivery, readiness, list/detail API | 2–2,5 ngày |
| 2 | Publish và RBAC | 1 ngày |
| 3 | UI release mới | 1,5–2 ngày |
| 4 | Deprecate gate/approval và cập nhật docs | 0,5–1 ngày |
| 5 | Test, backfill, pilot, rollout | 0,5–1 ngày + theo dõi |
| **Tổng** | | **6–8 ngày công** |

Thứ tự bắt buộc:

```text
Baseline/backup
  → schema + sync metadata
  → readiness service + API summary
  → publish Jira + Git merge + RBAC
  → UI mới
  → pilot
  → deprecate endpoint/code cũ
  → cân nhắc drop dữ liệu cũ ở release sau
```

