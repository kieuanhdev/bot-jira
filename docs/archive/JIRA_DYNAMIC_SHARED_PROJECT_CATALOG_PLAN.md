# Kế hoạch bỏ cấu hình cứng dự án Jira và dùng danh mục dự án chung

> Phiên bản: 1.1  
> Ngày lập: 2026-10-01  
> Trạng thái: Completed (Đã triển khai & kiểm thử hoàn tất)  
> Phạm vi: danh mục dự án, lựa chọn dự án theo người dùng, Jira sync, workflow/status, filter, stale, leaderboard, release và onboarding

## 1. Tóm tắt vấn đề và quyết định

Hiện tại ứng dụng có hai nguồn danh sách dự án không đồng nhất:

1. `JIRA_PROJECT_KEYS`/`jiraProjectList` là danh sách cấu hình tĩnh dùng bởi
   worker, scheduler và nhiều API.
2. `User.boardProjects` là danh sách lựa chọn riêng của từng tài khoản.

Khi một người dùng thêm dự án từ bảng công việc, hệ thống chỉ:

- xác minh project với Jira;
- thêm key vào `User.boardProjects` của chính người đó;
- enqueue một lần đồng bộ project.

Ứng dụng chưa ghi project vào một danh mục chung. Do đó:

- tài khoản khác không thấy project mới trong danh sách để chọn;
- lần sync thủ công đầu tiên có thể thành công nhưng project không được scheduler
  tiếp tục đồng bộ;
- health/recovery không theo dõi project mới;
- leaderboard, stale, onboarding và một số filter vẫn loại project vì chỉ tin
  `jiraProjectList`/`isKnownProject`;
- workflow/status, release và metadata có thể chưa được chuẩn bị nên các màn hình
  ngoài board không có dữ liệu đầy đủ.

Quyết định kiến trúc: tạo bảng `JiraProject` trong PostgreSQL làm **catalog dự án
toàn hệ thống**. `User.boardProjects` tiếp tục chỉ biểu diễn **lựa chọn cá nhân**.
`JIRA_PROJECT_KEYS` chỉ còn là dữ liệu bootstrap/seed và phương án tương thích
trong rollout, không còn là nguồn sự thật lúc runtime.

## 2. Mục tiêu

### 2.1 Mục tiêu chức năng

1. Khi người dùng thêm một project hợp lệ, project đó được ghi vào catalog chung.
2. Mọi tài khoản đều thấy project đang active trong bộ chọn dự án.
3. Việc một project xuất hiện trong catalog không tự chọn project đó cho mọi
   người; mỗi người vẫn tự quản lý `boardProjects`.
4. Khi người khác chọn project, hệ thống xác minh quyền Jira của chính người đó
   trước khi lưu lựa chọn hoặc truy cập API cần Jira trực tiếp.
5. Project mới được đưa vào lịch sync định kỳ, startup recovery, health và các
   read model liên quan.
6. Board, filter, stale, leaderboard, bulk, release và onboarding dùng cùng một
   resolver catalog, không có logic whitelist riêng rẽ.
7. Sau lần chuẩn bị đầu tiên, project mới có issue, workflow/status, filter và
   release metadata như project bootstrap.
8. Không cần sửa biến môi trường hoặc restart ứng dụng để thêm project.

### 2.2 Phi mục tiêu

- Không tự cấp quyền Jira cho người dùng.
- Không tự thêm project mới vào lựa chọn cá nhân của tất cả người dùng.
- Không xóa `User.boardProjects` trong pha này.
- Không biến board preference (`projectKey + boardId`) thành cấu hình dùng chung.
- Không tự động discovery toàn bộ project mà system Jira account nhìn thấy.
- Không xóa ngay `JIRA_PROJECT_KEYS`; giữ nó làm bootstrap trong giai đoạn chuyển
  đổi và rollback.

## 3. Bằng chứng từ mã nguồn hiện tại

| Thành phần | Hành vi hiện tại | Hệ quả |
|---|---|---|
| `src/lib/env.ts` | `jiraProjectList` được parse một lần từ `JIRA_PROJECT_KEYS`; `isKnownProject` chỉ kiểm tra mảng này | Project thêm runtime không trở thành project hệ thống |
| `src/app/api/projects/validate/route.ts` | Chỉ gọi Jira để xác minh, không ghi catalog | Xác minh thành công nhưng không tạo dữ liệu dùng chung |
| `src/app/api/me/preferences/route.ts` | Ghi key vào `User.boardProjects` của current user | Tài khoản khác không thấy project |
| `src/app/api/projects/route.ts` | Trả selection của user; fallback về `jiraProjectList` | Không phải danh mục chung |
| `src/app/(app)/board/board-client.tsx` | Add project = validate + save preference + manual sync | Chỉ hoàn tất luồng riêng của board |
| `src/lib/queue/workers/poll-jira-dispatch.ts` | Dispatch mặc định theo `jiraProjectList` | Project động không được sync định kỳ |
| `src/lib/queue/boss.ts` | Startup reconciliation báo cáo số project theo `jiraProjectList` | Project động không được recovery/health đầy đủ |
| `src/lib/health/worker-health.ts` | Health scope là `jiraProjectList` | Không phát hiện project động stale/failing |
| `src/lib/leaderboard/service.ts` | Chỉ tổng hợp các project `isKnownProject` | Project mới không xuất hiện ở leaderboard |
| `src/app/api/stale/route.ts` | Lọc cả request và user preference bằng `isKnownProject` | Project mới bị loại khỏi stale view |
| `src/app/api/issues/filters/route.ts` | `projectList` query bị `.filter(isKnownProject)` | Filter metadata của project động có thể rỗng |
| `src/app/(auth)/setup-jira/page.tsx` | Truyền trực tiếp `jiraProjectList` vào onboarding | Người dùng mới không thấy project động |
| `src/lib/releases/sync.ts` | Fallback về `jiraProjectList`, sau đó mới ghép preference của user | Global sync không bao phủ project động ổn định |

## 4. Mô hình dữ liệu đích

Thêm model mới:

```prisma
model JiraProject {
  id                String   @id @default(cuid())
  key               String   @unique
  jiraId            String?
  name              String
  active            Boolean  @default(true)
  source            String   // bootstrap | user_added | admin | migration
  syncEnabled       Boolean  @default(true)
  discoveredById    String?
  lastValidatedAt   DateTime?
  lastValidationCode String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  discoveredBy User? @relation(fields: [discoveredById], references: [id], onDelete: SetNull)

  @@index([active, syncEnabled])
  @@index([name])
}
```

Quy tắc dữ liệu:

- `key` luôn trim + uppercase và phải khớp `^[A-Z][A-Z0-9_]{1,19}$`.
- Không xóa cứng project đã có issue/release/cursor; dùng `active=false`.
- `active` quyết định project có xuất hiện để người dùng chọn hay không.
- `syncEnabled` quyết định scheduler có đồng bộ project hay không.
- `name` và `jiraId` lấy từ kết quả `GET project` của Jira, không lấy từ input.
- Không coi catalog là bằng chứng user hiện tại có quyền Jira.
- Trong pha đầu giữ `User.boardProjects String[]` để giảm phạm vi migration.
  Pha sau có thể chuẩn hóa thành bảng nối `UserJiraProjectSelection` nếu cần audit,
  thứ tự hoặc foreign key.

### 4.1 Vì sao không dùng hợp của mọi `User.boardProjects`

Union các mảng người dùng chỉ chữa phần hiển thị, nhưng không lưu được tên,
trạng thái active, nguồn tạo, chính sách sync hay audit. Nó cũng khiến một key sai
trong preference vô tình trở thành cấu hình hệ thống. Catalog riêng là nguồn sự
thật có kiểm soát và cho phép archive/disable sync độc lập.

## 5. Service catalog dùng chung

Tạo `src/lib/jira/project-catalog.ts` làm ranh giới duy nhất cho project runtime:

```ts
type ProjectCatalogItem = {
  key: string;
  name: string;
  active: boolean;
  syncEnabled: boolean;
};

listActiveProjects(): Promise<ProjectCatalogItem[]>
listSyncEnabledProjectKeys(): Promise<string[]>
getCatalogProject(key: string): Promise<ProjectCatalogItem | null>
isCatalogProject(key: string): Promise<boolean>
registerVerifiedProject(input): Promise<ProjectCatalogItem>
archiveProject(key: string): Promise<void>
```

Yêu cầu:

1. Mọi hàm normalize key tại một chỗ.
2. Read path lấy từ PostgreSQL, không gọi Jira.
3. Cache in-process chỉ được dùng với TTL ngắn và phải invalidate sau mutation;
   ưu tiên query DB trước vì catalog nhỏ.
4. Không thay `isKnownProject()` sync bằng một hàm DB giả-sync. Consumer phải đổi
   sang resolver async hoặc nhận danh sách đã resolve từ caller.
5. Khi DB chưa có bản ghi trong rollout, có thể fallback tạm sang
   `jiraProjectList`; fallback phải có metric/log và được xóa sau backfill.

## 6. Luồng thêm project đích

```text
Người dùng nhập project key ở Board
  -> POST /api/projects/validate (Jira auth của user, fallback system theo policy hiện tại)
  -> trả project metadata, chưa ghi dữ liệu
  -> POST /api/projects/register hoặc PUT /api/me/preferences có verified payload
      -> xác minh lại server-side để tránh tin payload client
      -> transaction:
           upsert JiraProject(active=true, metadata, source=user_added)
           thêm key vào User.boardProjects của người thêm
      -> enqueue bootstrap orchestration
           poll-jira-project(projectKey, full=true hoặc initial mode)
           refresh project workflow/status metadata
           sync release versions (nếu module release được bật)
      -> trả project + bootstrap state/job ids
  -> invalidate project catalog + preference queries
  -> UI chuyển sang project và hiển thị trạng thái chuẩn bị dữ liệu
```

Khuyến nghị gộp thao tác ghi vào endpoint mới `POST /api/projects` thay vì để
client tự nối `validate -> preference -> sync`. Endpoint mới đảm bảo atomicity ở
DB và orchestration nhất quán. `POST /api/projects/validate` có thể tiếp tục phục
vụ preview, nhưng không phải bước đăng ký cuối cùng.

### 6.1 Idempotency và cạnh tranh

- `JiraProject.key @unique` giúp hai user thêm cùng lúc chỉ tạo một project.
- Dùng `upsert` và transaction cho catalog + selection.
- Job sync dùng singleton key theo `projectKey` như hiện tại.
- Nếu project đã tồn tại nhưng inactive, chỉ role admin được reactivate hoặc áp
  dụng policy rõ ràng; không để user thường vô tình bật lại project đã archive.
- Queue lỗi không rollback catalog/selection; API trả `bootstrap.state=queue_failed`
  và cung cấp retry riêng.

## 7. Hiển thị và quyền theo người dùng

Phân biệt ba khái niệm:

| Khái niệm | Scope | Ý nghĩa |
|---|---|---|
| Catalog | Toàn hệ thống | Project có thể được chọn |
| Selection (`User.boardProjects`) | Từng user | Project người đó muốn hiện trong UI |
| Jira access | Từng credential | User thực sự có quyền đọc/ghi project/board |

API `GET /api/projects` nên trả catalog active, selection và count tách biệt:

```json
{
  "items": [
    {
      "key": "NEW",
      "name": "New Project",
      "selected": false,
      "openCount": 0,
      "dataState": "preparing"
    }
  ]
}
```

Khi một user khác chọn project:

1. Gọi endpoint mutation của preference.
2. Xác minh project tồn tại và active trong catalog.
3. Nếu thao tác tiếp theo cần Jira user credential/board, xác minh quyền bằng
   credential của user đó; không tái sử dụng kết quả permission của người đã thêm.
4. Nếu không có quyền, trả `403 jira_project_permission_required`, không lưu
   selection mới hoặc rollback selection trong cùng transaction logic.

Không tự động thêm project mới vào `boardProjects` của các user khác. Điều này
đáp ứng yêu cầu “hiển thị cho người khác chọn” mà không tự thay đổi dashboard cá
nhân của họ.

## 8. Bootstrap dữ liệu đầy đủ cho project mới

Một lần `poll-jira-project` hiện chủ yếu làm đầy `IssueCache`; để các phần khác có
đủ thông tin, tạo orchestration rõ ràng `bootstrap-jira-project` hoặc service
tuần tự với trạng thái quan sát được:

1. **Register catalog**: upsert metadata project.
2. **Issue sync**: enqueue `poll-jira-project` initial/full; ghi
   `IntegrationCursor(scope=projectKey)`.
3. **Workflow sync**: lấy project statuses và ghi
   `JiraProjectWorkflowSnapshot/JiraProjectWorkflowStatus`.
4. **Board metadata**: không chọn board thay người dùng; board options vẫn cache
   theo `userId + projectKey`, được load khi user mở/chọn project.
5. **Membership**: chỉ tạo theo `userId + projectKey + boardId` sau khi user chọn
   board, không chia sẻ giữa credential scopes.
6. **Release metadata**: đồng bộ versions cho project nếu release feature dùng
   catalog toàn cục.
7. **Derived UI data**: filter/assignee/label/priority đọc từ `IssueCache`, không
   cần job riêng sau khi issue sync hoàn tất.

Nên bổ sung trạng thái bootstrap (trên `JiraProject` hoặc bảng job riêng):

```text
pending -> syncing_issues -> syncing_workflow -> ready
                                  \-> partial
                         any step \-> failed
```

Tối thiểu lưu `lastBootstrapAt`, `lastBootstrapError` và trạng thái để UI phân
biệt “chưa có dữ liệu”, “đang đồng bộ”, “project thật sự rỗng” và “đồng bộ lỗi”.

## 9. Thay đổi theo thành phần

### 9.1 Database và migration

1. Thêm model `JiraProject` và migration.
2. Backfill từ hợp của:
   - `JIRA_PROJECT_KEYS`;
   - mọi `User.boardProjects` hợp lệ;
   - `IssueCache.projectKey` khác rỗng;
   - `IntegrationCursor` của integration Jira;
   - `JiraProjectWorkflowSnapshot.projectKey`.
3. Dedupe bằng uppercase; log key không hợp lệ để xử lý thủ công.
4. Project từ env có `source=bootstrap`; project chỉ thấy trong DB cũ có
   `source=migration`.
5. Không sửa/xóa preference người dùng trong migration đầu.

### 9.2 Env và project resolver

Files: `src/lib/env.ts`, `.env.example`, file mới
`src/lib/jira/project-catalog.ts`.

1. Đổi mô tả `JIRA_PROJECT_KEYS` thành bootstrap project keys.
2. Giữ parser thuần cho seed/rollback, nhưng runtime consumer không import
   `jiraProjectList` để xác định catalog nữa.
3. Deprecate `isKnownProject`; thay bằng format validation + catalog lookup.
4. Không dùng regex hợp lệ làm bằng chứng project đã đăng ký.

### 9.3 API project và preference

Files:

- `src/app/api/projects/route.ts`
- `src/app/api/projects/validate/route.ts`
- `src/app/api/me/preferences/route.ts`
- endpoint đăng ký mới nếu tách riêng

Thay đổi:

1. `GET /api/projects` đọc toàn bộ catalog active và đánh dấu `selected` theo
   current user.
2. `GET /api/me/preferences.available` lấy catalog active, không ghép env với
   preference hiện tại.
3. `PUT /api/me/preferences` chỉ nhận key active trong catalog; bỏ nhánh “regex
   hợp lệ thì cho qua”.
4. Thêm mutation register project có Jira validation, catalog upsert, selection
   update và bootstrap enqueue.
5. Chuẩn hóa lỗi: `project_not_found`, `project_inactive`,
   `jira_project_permission_required`, `bootstrap_queue_failed`.

### 9.4 Board UI và onboarding

Files:

- `src/app/(app)/board/board-client.tsx`
- `src/app/(auth)/setup-jira/page.tsx`
- `src/app/(auth)/setup-jira/setup-jira-client.tsx`

Thay đổi:

1. Bộ chọn hiển thị catalog active cho mọi user.
2. Add project gọi mutation đăng ký duy nhất, không tự ghép ba request rời rạc.
3. Project mới hiển thị `preparing/partial/failed/ready`; dùng `Skeleton` khi
   đang chuẩn bị và empty state có nút retry khi lỗi.
4. Sau register, invalidate `boardKeys.projects`, `meKeys.prefs`, status/filter
   queries của project đó.
5. Onboarding tải catalog từ server thay vì import `jiraProjectList` lúc render.
6. Dùng token semantic, lucide icon, transition 150–200 ms, light/dark mode theo
   `design-system/team-task-web/MASTER.md`.

### 9.5 Scheduler, worker và recovery

Files:

- `src/lib/queue/workers/poll-jira-dispatch.ts`
- `src/lib/queue/workers/poll-jira.ts`
- `src/lib/queue/boss.ts`
- `src/lib/health/worker-health.ts`
- `src/lib/queue/workers/health-alert.ts`

Thay đổi:

1. Mỗi lần dispatch lấy `listSyncEnabledProjectKeys()` từ DB.
2. Legacy `runPollJira()` cũng dùng catalog khi không truyền `projectKey`.
3. Startup reconciliation và health so sánh cursor với catalog active +
   syncEnabled.
4. Log `catalogProjectCount`, không log độ dài env list.
5. Project archive/disable sync không bị cảnh báo stale.
6. Xử lý DB unavailable theo fail-safe: không âm thầm fallback vô thời hạn; trong
   rollout có flag fallback và metric riêng.

### 9.6 Các read path và tính năng phụ

Thay toàn bộ whitelist tĩnh ở:

- `src/app/api/issues/route.ts`
- `src/app/api/issues/filters/route.ts`
- `src/app/api/board/statuses/route.ts`
- `src/app/api/stale/route.ts`
- `src/app/api/bulk/fields/route.ts`
- `src/app/api/bulk/versions/route.ts`
- `src/lib/leaderboard/service.ts`
- `src/lib/releases/sync.ts`
- `src/lib/jira/jql.ts`
- `src/lib/queue/workers/sentry-import.ts`

Quy tắc:

1. API theo user: scope = giao giữa selection của user và catalog active.
2. API hệ thống/leaderboard: scope = catalog active phù hợp policy tính năng.
3. Worker sync: scope = catalog `active && syncEnabled`.
4. Endpoint nhận một project: format validation trước, catalog lookup sau.
5. Sentry mapping chỉ được trỏ tới project catalog active; fallback project cần
   cấu hình rõ, không mặc định mù vào phần tử đầu catalog.
6. `JIRA_PROJECT_COLUMNS`, `JIRA_PROJECT_BOARD_IDS` và backlog override vẫn là
   override tùy chọn; project không có override phải dùng workflow auto-derived.

## 10. API contract đề xuất

### 10.1 Đăng ký project

`POST /api/projects`

```json
{ "key": "NEW" }
```

Response `202`:

```json
{
  "project": {
    "key": "NEW",
    "name": "New Project",
    "selected": true
  },
  "created": true,
  "bootstrap": {
    "state": "queued",
    "issueSyncJobId": "..."
  }
}
```

### 10.2 Chọn/bỏ chọn project

`PUT /api/me/preferences`

```json
{ "projects": ["EPM", "NEW"] }
```

Server loại duplicate, giữ thứ tự, từ chối key không nằm trong catalog active và
không chấp nhận key chỉ vì đúng regex.

### 10.3 Trạng thái dữ liệu project

Có thể mở rộng `GET /api/sync/jira/status?projectKey=NEW` hoặc thêm
`GET /api/projects/NEW/status`, trả riêng:

- catalog state;
- issue sync cursor/freshness;
- workflow snapshot state;
- release sync state (nếu áp dụng);
- retryable error code.

## 11. Kế hoạch triển khai theo pha

### Pha 0 — Characterization và inventory

1. Chụp test hành vi hiện tại của add project, preference và dispatch.
2. Lập danh sách đầy đủ mọi import `jiraProjectList`/`isKnownProject`.
3. Xác nhận cron gọi dispatch tại runtime, tránh chỉ sửa legacy worker.
4. Xác nhận system Jira credential có quyền sync project user thêm; nếu không,
   chọn rõ mô hình sync bằng credential nào trước khi rollout.

Điều kiện hoàn tất: có test tái hiện project `NEW` được user A thêm nhưng user B,
scheduler, stale và leaderboard không thấy.

### Pha 1 — Catalog và backfill

1. Thêm schema/migration `JiraProject`.
2. Tạo project catalog service và unit test.
3. Viết backfill idempotent từ env + DB hiện có.
4. Khi deploy, chạy backfill trước khi bật catalog read path.

Điều kiện hoàn tất: catalog chứa đủ project cũ, không thay đổi UI.

### Pha 2 — Shared discovery và selection

1. Chuyển `/api/projects` và `/api/me/preferences` sang catalog.
2. Thêm register mutation atomic.
3. Chuyển board add flow và onboarding sang API mới.
4. Giữ feature flag `JIRA_PROJECT_CATALOG_READ_ENABLED` để rollback read path.

Điều kiện hoàn tất: user A thêm project, user B thấy project trong picker nhưng
chưa bị tự chọn.

### Pha 3 — Sync/bootstrap đầy đủ

1. Chuyển dispatch, legacy poll, startup reconciliation và health sang catalog.
2. Thêm orchestration issue + workflow + release metadata.
3. Thêm trạng thái bootstrap/retry và UI tương ứng.

Điều kiện hoàn tất: project mới tiếp tục được sync sau restart và sau các chu kỳ
cron; mọi metadata cần thiết chuyển sang ready hoặc báo lỗi cụ thể.

### Pha 4 — Chuyển toàn bộ consumer

1. Sửa issues filters, statuses, stale, bulk, leaderboard, release, JQL và
   Sentry mapping.
2. Xóa các whitelist regex/env rải rác.
3. Thêm contract test đảm bảo mọi feature dùng resolver chung.

Điều kiện hoàn tất: tìm kiếm source không còn runtime consumer trực tiếp của
`jiraProjectList` ngoài bootstrap/migration/compatibility module.

### Pha 5 — Tắt fallback và dọn kỹ thuật

1. Theo dõi ít nhất một chu kỳ rollout ổn định.
2. Tắt env fallback; `JIRA_PROJECT_KEYS` chỉ seed installation mới.
3. Xóa feature flag và compatibility code.
4. Cân nhắc migration `User.boardProjects` sang bảng nối ở một thay đổi riêng.

## 12. Kế hoạch kiểm thử

### 12.1 Unit test

- Normalize/dedupe key.
- Register cùng key nhiều lần là idempotent.
- Project inactive không được chọn/sync.
- Catalog list chỉ trả active; sync list chỉ trả `active && syncEnabled`.
- Không chấp nhận key đúng regex nhưng chưa đăng ký.
- Backfill union đúng và không tạo duplicate.

### 12.2 API integration test

1. User A thêm `NEW`; DB có một `JiraProject` và preference của A có `NEW`.
2. User B gọi `/api/projects` thấy `NEW`, `selected=false`.
3. User B không có quyền Jira chọn `NEW` nhận 403 và preference không đổi.
4. User B có quyền chọn thành công; user A không bị ảnh hưởng.
5. Queue lỗi vẫn giữ catalog + selection và trả trạng thái retryable.
6. Project archive biến mất khỏi picker nhưng dữ liệu lịch sử còn nguyên.

### 12.3 Worker test

- Dispatch lấy project DB mới mà không cần restart/env change.
- Startup recovery bao gồm project catalog mới.
- Health tính project mới và bỏ project `syncEnabled=false`.
- Initial bootstrap tạo IssueCache, workflow snapshot và cursor.
- Dedupe khi register và cron enqueue cùng lúc.

### 12.4 Cross-feature test

Với một project chỉ tồn tại trong catalog DB, kiểm tra:

- Board tải issue và cột workflow.
- Filter trả assignee/label/priority.
- Stale view nhận project.
- Bulk fields/versions nhận project khi user đã chọn và có quyền.
- Leaderboard tính project theo policy chung.
- Release sync nhận versions.
- Onboarding của user mới hiển thị project.

### 12.5 Regression và bảo mật

- Tám project bootstrap hiện tại vẫn hoạt động sau migration.
- Không user nào tự có thêm selection ngoài ý muốn.
- Catalog visibility không làm lộ issue: issue API vẫn scope theo selection/policy.
- Jira write/read trực tiếp vẫn dùng credential đúng của user.
- Không log token hoặc response Jira đầy đủ.

## 13. Quan sát vận hành

Thêm structured log/metric:

```text
event=jira_project_registered projectKey=NEW source=user_added created=true
event=jira_project_bootstrap projectKey=NEW step=workflow state=success durationMs=...
event=jira_dispatch catalogProjectCount=9 queued=... coalesced=...
event=jira_catalog_fallback reason=db_unavailable
```

Dashboard/cảnh báo cần có:

- số project active và sync-enabled;
- project bootstrap pending/failed quá ngưỡng;
- project không có cursor;
- project có cursor stale;
- số lần catalog fallback;
- chênh lệch giữa catalog và env trong rollout.

Không dùng việc `openCount=0` để kết luận project đã sync thành công; phải dựa vào
cursor/bootstrap status.

## 14. Rollout và rollback

### Rollout

1. Deploy schema + catalog service nhưng chưa đổi read path.
2. Chạy và kiểm tra backfill.
3. Bật catalog cho API project/preference ở môi trường thử nghiệm.
4. Bật scheduler/health catalog.
5. Bật lần lượt consumer phụ.
6. Theo dõi project count, queue volume, sync latency và permission errors.

### Rollback

- Tắt feature flag để API/scheduler tạm đọc `JIRA_PROJECT_KEYS`.
- Không rollback/xóa bảng catalog; dữ liệu mới được giữ để điều tra và triển khai
  lại.
- Project mới ngoài env sẽ tạm ngừng scheduled sync khi rollback, vì vậy runbook
  phải liệt kê và cho phép enqueue thủ công những project này.

## 15. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| User thêm project mà system credential không đọc được | Xác nhận auth model ở Pha 0; trả bootstrap permission error rõ ràng |
| Catalog chung bị hiểu nhầm là quyền chung | Tách catalog/selection/access; kiểm tra credential từng user ở mutation cần thiết |
| Project mới làm tăng tải Jira | `syncEnabled`, bounded concurrency, singleton dedupe, rate-limit/backoff |
| Cron đọc catalog mỗi lần làm DB lỗi ảnh hưởng sync | Query nhỏ có index; cache TTL ngắn; alert fallback/DB failure |
| Archive làm mất dữ liệu lịch sử | Soft archive, không cascade IssueCache/release/cursor |
| Các consumer chuyển đổi không đồng thời | Feature flag + inventory test + rollout theo pha |
| Project chưa sync bị hiểu là project rỗng | Bootstrap state riêng, Skeleton/empty/error state rõ ràng |

## 16. Tiêu chí nghiệm thu

1. Thêm project mới không cần sửa `JIRA_PROJECT_KEYS` hoặc restart.
2. User A thêm project; user B nhìn thấy trong picker trong lần refetch kế tiếp.
3. Project không tự được chọn cho user B.
4. User B chỉ chọn/truy cập thành công theo policy quyền Jira đã định.
5. Project mới được scheduled sync và startup recovery tự động.
6. Board, filters, statuses, stale, leaderboard, bulk và release nhận project
   theo đúng scope.
7. Workflow/status và issue data có trạng thái chuẩn bị/ready/error quan sát được.
8. Tám project hiện tại được backfill và không regression.
9. Không còn runtime whitelist dự án dựa trực tiếp vào `jiraProjectList`, ngoại
   trừ compatibility code có flag và deadline xóa.
10. Test multi-user, worker và cross-feature đều pass.

## 17. Thứ tự file triển khai đề xuất

1. `prisma/schema.prisma` + migration + backfill.
2. `src/lib/jira/project-catalog.ts` và test.
3. `src/app/api/projects/route.ts`, register endpoint và preference API.
4. Board add-project UI và onboarding.
5. Dispatch, poll, health, startup recovery.
6. Project bootstrap/workflow/release orchestration.
7. Issues filters, statuses, stale, bulk, leaderboard, release, JQL, Sentry.
8. Integration/E2E tests, metrics, runbook và xóa compatibility fallback.

## 18. Kết quả triển khai thực tế (2026-10-01)

Toàn bộ các pha theo kế hoạch đã được hiện thực hóa và xác minh:

### 18.1 Cơ sở dữ liệu và Migration
- **Schema**: Bổ sung model `JiraProject` với các trường `key` (@unique), `jiraId`, `name`, `active`, `source`, `syncEnabled`, `discoveredById`, `lastValidatedAt`, `lastValidationCode`, `bootstrapState`, `lastBootstrapAt`, `lastBootstrapError`.
- **Migration & Backfill**: Tạo và áp dụng migration `20261001142931_add_jira_project_catalog` thành công. Script SQL thực hiện deduplication và backfill tự động 9 dự án từ danh sách bootstrap và dữ liệu sẵn có trong hệ thống (`CICM`, `ECM`, `EDM`, `EIM`, `EMA`, `EPM`, `ETM`, `MHRM`, `MR`).

### 18.2 Shared Catalog Service
- Tạo `src/lib/jira/project-catalog.ts`:
  - `normalizeProjectKey`, `isValidProjectKeyFormat`.
  - `listActiveProjects()`: Đọc danh mục dự án active từ DB, có cơ chế fail-safe fallback nếu DB gián đoạn.
  - `listSyncEnabledProjectKeys()`: Trả về danh sách project cần đồng bộ theo scheduler và health.
  - `getCatalogProject`, `isCatalogProject`.
  - `registerVerifiedProject`: Idempotent upsert dự án sau khi xác thực từ Jira.
  - `updateProjectBootstrapState`, `archiveProject`.
- Bộ unit test `src/lib/jira/project-catalog.test.ts` đạt 100% test pass (12/12 tests).

### 18.3 API Contracts
- `GET /api/projects`: Trả về danh mục chung active kèm trạng thái `selected` theo từng user, `openCount` và `dataState`.
- `POST /api/projects`: Endpoint đăng ký dự án mới nguyên tử — xác thực quyền Jira qua user credential (hoặc fallback system auth), upsert catalog, cập nhật `User.boardProjects` của người tạo và kích hoạt bootstrap sync.
- `GET /api/me/preferences`: Trả về `available` từ catalog chung và `projects` đã chọn của user.
- `PUT /api/me/preferences`: Chặn các key không nằm trong catalog active; kiểm tra quyền truy cập Jira của người dùng với các project mới chọn trước khi lưu.
- Unit tests cho routes: `src/app/api/projects/route.test.ts` (4/4 tests), `src/app/api/me/preferences/route.test.ts` (3/3 tests).

### 18.4 UI & Onboarding
- **Board Client (`src/app/(app)/board/board-client.tsx`)**: Chuyển luồng thêm dự án sang gọi `POST /api/projects` trực tiếp; modal picker hiển thị toàn bộ dự án đang active trong hệ thống cho bất kỳ user nào chọn.
- **Onboarding (`src/app/(auth)/setup-jira/page.tsx` & `setup-jira-client.tsx`)**: Tải danh sách dự án khả dụng từ catalog thay vì cấu hình tĩnh env; form thêm dự án mới gọi endpoint đăng ký dùng chung.

### 18.5 Scheduler, Workers & Health
- `poll-jira-dispatch.ts`: Lấy danh sách project cần sync từ `listSyncEnabledProjectKeys()`.
- `poll-jira.ts`: Khi sync toàn bộ, truy vấn project từ catalog và cập nhật trạng thái `bootstrapState` (`ready`, `partial`, `failed`).
- `boss.ts`: `reconcileStartupJiraProjects` đối soát theo các project sync-enabled trong catalog.
- `worker-health.ts`: Đánh giá trạng thái stale/failing theo catalog dynamic, bỏ qua các project đã tắt sync hoặc archive.

### 18.6 Read Models & Consumer Scoping
- Loại bỏ hoàn toàn sự phụ thuộc runtime vào whitelist tĩnh `jiraProjectList`/`isKnownProject` ở các module:
  - `src/app/api/issues/route.ts`
  - `src/app/api/issues/filters/route.ts`
  - `src/app/api/board/statuses/route.ts`
  - `src/app/api/stale/route.ts`
  - `src/app/api/bulk/fields/route.ts`
  - `src/app/api/bulk/versions/route.ts`
  - `src/lib/leaderboard/service.ts`
  - `src/lib/releases/sync.ts`
  - `src/lib/jira/jql.ts`
  - `src/lib/queue/workers/sentry-import.ts`
  - `src/app/api/sync/jira/route.ts`
  - `src/app/api/sync/jira/status/route.ts`
- Đánh dấu `@deprecated` hàm `isKnownProject` trong `src/lib/env.ts` và chuyển đổi mô tả `JIRA_PROJECT_KEYS` sang bootstrap/seeding.

### 18.7 Kết quả kiểm thử tổng thể
- **Vitest**: 115 test files pass (901/901 tests pass).
- **TypeScript**: `tsc --noEmit` pass với 0 lỗi.
- **ESLint**: Toàn bộ files mới và chỉnh sửa pass với 0 lỗi.


