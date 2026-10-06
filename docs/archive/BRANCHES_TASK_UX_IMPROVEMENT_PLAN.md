# Kế hoạch cải tiến liên kết Jira Task – Bitbucket Branch

**Phiên bản:** 2.0  
**Ngày cập nhật:** 2026-09-23  
**Phạm vi:** `/branches`, tab Branches của `/issue/[key]`, Board, Bulk create branch, Bitbucket sync và release gate  
**Trạng thái:** Đã có nền tảng và UI ban đầu; cần sửa tính đúng đắn, mô hình nghiệp vụ và chuyển trải nghiệm sang task-centric  
**Design source:** `design-system/team-task-web/MASTER.md`; chưa có page override riêng cho Branches

## 1. Kết luận

Hệ thống đã có các thành phần cơ bản để liên kết Jira task với Bitbucket branch:

- `BranchInfo.jiraKey` và relation tới `IssueCache`.
- Tự nhận diện Jira key từ tên branch.
- Gợi ý Jira key từ PR title.
- Link/relink/unlink thủ công và audit.
- Trang Branches có search, filter, pagination, summary, detail drawer và mobile layout.
- Trang chi tiết Jira task đã hiển thị branch đã link và branch được gợi ý.

Tuy nhiên, trải nghiệm hiện tại vẫn lấy **branch làm trung tâm** và mặc định đưa người dùng vào một danh sách lớn. Với dữ liệu hiện tại, phần lớn branch không có ngữ cảnh Jira hoặc là branch hệ thống, nên danh sách chưa giúp người dùng quyết định phải làm gì tiếp theo.

Hướng sửa chính:

1. Sửa tính đúng đắn của liên kết, filter, sync, quyền và dữ liệu PR.
2. Dùng một source of truth duy nhất cho quan hệ Task–Branch.
3. Chuyển màn hình mặc định sang **task-centric workspace**: task là work item chính, branch và PR là delivery context.
4. Chuyển branch chưa link/gợi ý chưa xác nhận thành một inbox có hành động rõ ràng.
5. Giữ “All branches” như công cụ tra cứu kỹ thuật, không phải màn hình làm việc mặc định.

## 2. Những gì đã làm

### 2.1 Đã có trong hệ thống trước đợt rà soát này

- Đã mở rộng `BranchInfo` để lưu Jira key, commit gần nhất, PR, trạng thái merge, freshness và metadata của liên kết.
- Đã tạo relation từ `BranchInfo.jiraKey` tới `IssueCache.jiraKey`.
- Đã thêm migration `20260923092628_branches_task_linkage` cho các trường và index liên quan.
- Đã viết resolver trích Jira key từ tên branch và PR title.
- Đã validate Jira key nhận diện được bằng dữ liệu trong `IssueCache`.
- Đã tự động link exact Jira key trong tên branch với confidence 95.
- Đã tạo suggestion từ Jira key trong PR title với confidence 80.
- Đã bảo vệ manual/explicit link có Jira key khỏi bị resolver ghi đè.
- Đã viết script backfill liên kết cho dữ liệu `BranchInfo` hiện có.
- Đã cập nhật Bitbucket client để request PR với `state=ALL` và đọc PR title, URL, destination, updated time.
- Đã thêm logic reconcile branch lifecycle bằng `lastSeenAt` và `deletedAt` sau khi repository sync thành công.
- Đã thêm freshness metadata qua `IntegrationCursor`.
- Đã xây API `/api/branches` có search, filter, sort, pagination, summary và task context.
- Đã xây API branch detail và API link/relink/unlink thủ công.
- Đã ghi audit cho thao tác link/unlink thủ công.
- Đã xây endpoint enqueue Bitbucket branch sync có singleton key ở queue.
- Đã thiết kế lại trang `/branches` bản đầu với summary cards, toolbar, table desktop, mobile cards, pagination và detail drawer.
- Đã thêm dialog confirm/manual link Jira task.
- Đã thêm loading skeleton, error state, empty state và freshness warning.
- Đã cập nhật tab Branches trong trang task để hiển thị confirmed branches và suggested branches.
- Đã thêm attention rule ban đầu cho các trường hợp Task Done/PR Open, PR Merged/Task chưa Done, task đang làm/chưa có PR và suggestion chưa review.
- Đã có unit test cho branch linker, Bitbucket client và attention rules.

### 2.2 Kết quả dữ liệu đã đạt được

Tại thời điểm rà soát 2026-09-23:

| Kết quả | Số lượng |
|---|---:|
| Tổng branch đã nhập vào `BranchInfo` | 2.485 |
| Branch đã được auto-link với Jira task | 828 |
| Branch có suggested Jira task | 155 |
| Branch chưa có Jira context | 1.502 |
| PR `OPEN` đã lưu | 59 |

Toàn bộ 828 confirmed link hiện được tạo từ exact Jira key trong tên branch với `linkSource=branch_name`.

### 2.3 Đã thực hiện trong đợt rà soát và lập kế hoạch này

- Đã đọc và đối chiếu Prisma schema, migrations, Bitbucket worker/client, branch resolver, branch query service, API routes và UI Task/Branches.
- Đã kiểm tra dữ liệu thật trong database thay vì chỉ dựa vào giao diện.
- Đã phát hiện lỗi ghép filter `OR/AND`, manual unlink không bền vững, label fallback mơ hồ và permission chưa được enforce.
- Đã xác định attention đang trộn lỗi freshness cấp hệ thống với bất thường nghiệp vụ từng branch.
- Đã xác định dữ liệu thật chưa có PR `MERGED/DECLINED/CLOSED` và chưa có Bitbucket sync cursor.
- Đã xác định repo facets mới lấy top 20, task status counts đang hardcode và assignee facets còn rỗng.
- Đã đề xuất chuyển trải nghiệm từ branch-centric sang task-centric.
- Đã đề xuất source of truth dài hạn gồm `TaskBranchLink` và `PullRequestInfo`.
- Đã lập kế hoạch triển khai từ BR-100 đến BR-704, kèm dependency, quality gate, test plan, rollout và Definition of Done.
- Đã chạy kiểm tra kỹ thuật hiện tại: typecheck pass, lint pass, 36 test files với 362 tests pass.

### 2.4 Chưa làm trong đợt này

- Chưa sửa mã nguồn hoặc API.
- Chưa tạo migration mới ngoài migration đã có sẵn.
- Chưa chạy Bitbucket sync hoặc backfill lại dữ liệu.
- Chưa thay đổi quyền của người dùng.
- Chưa triển khai task-centric workspace.
- Chưa commit các thay đổi trong working tree.

## 3. Baseline đã kiểm tra

### 3.1 Dữ liệu hiện tại

| Chỉ số | Giá trị | Nhận định |
|---|---:|---|
| Tổng `BranchInfo` | 2.485 | Dataset đủ lớn để cần server-side query |
| Branch active | 2.485 | Chưa có branch nào được reconcile thành deleted |
| Branch đã link task | 828 | Nguồn hiện tại đều là `branch_name` |
| Branch có suggestion | 155 | Cần workflow confirm/reject |
| Branch chưa có Jira context | 1.502 | Không nên trộn vào work view mặc định |
| PR đã lưu | 59 | Tất cả hiện là `OPEN` |
| PR `MERGED/DECLINED/CLOSED` | 0 | Chưa đủ dữ liệu cho attention/release đáng tin |
| Bitbucket sync cursor | Chưa có | Freshness hiện bị coi là stale |

Các tên branch lặp lại trên nhiều repository, ví dụ `master` xuất hiện ở 80 repo. Vì vậy, mọi quan hệ dựa riêng vào tên branch đều có nguy cơ sai repository.

### 3.2 Chất lượng kỹ thuật hiện tại

- `npm run typecheck`: pass.
- `npm run lint`: pass.
- `npm test`: 36 test files, 362 tests pass.
- Chưa có test đầy đủ cho tổ hợp filter, permission của branch mutations, manual unlink qua lần sync tiếp theo và task-centric aggregation.

## 4. Trạng thái triển khai thực tế

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Prisma relation Task–Branch | Đã có | Một branch có tối đa một task; một task có nhiều branch |
| Link từ branch name | Đã có | Exact Jira key và validate bằng `IssueCache` |
| Suggestion từ PR title | Đã có | Chưa có reject/dismiss bền vững |
| Manual link/relink/unlink | Có nhưng chưa hoàn chỉnh | Unlink có thể bị auto-link lại sau sync |
| Link provenance/confidence | Có một phần | Bulk/comment writer chưa ghi nhất quán |
| Full PR states | Code đã yêu cầu `state=ALL` | Dữ liệu thật chưa được sync lại để xác minh |
| Deleted branch reconciliation | Đã có code | Dữ liệu thật chưa phản ánh; cần integration test |
| Paginated Branch API | Đã có | Có lỗi ghép filter và attention vẫn load toàn bộ candidates |
| Facets | Có một phần | Repo chỉ lấy top 20; status/assignee chưa có dữ liệu thật |
| Branches workspace UI | Đã có bản đầu | Vẫn branch-centric |
| Task detail integration | Đã có | Fallback Jira label vẫn có thể match sai repo |
| Permission | Chưa đạt | Mọi user đăng nhập đều có thể sync/link/unlink |
| Board integration | Chưa có | Chưa có aggregate branch/PR trên task card |
| Release integration | Một phần | Không nên tin cậy trước khi full PR states/freshness đúng |

## 5. Các vấn đề phải sửa

### P0 — Tính đúng đắn và an toàn

#### BR-001 — Filter đang ghép sai điều kiện

Search và project cùng nối vào một `OR`; filter `pr=merged` tiếp tục ghi đè `OR`. Kết quả có thể thỏa search **hoặc** project thay vì phải thỏa cả hai, hoặc làm mất điều kiện đã thiết lập trước đó.

Yêu cầu sửa:

- Xây từng nhóm điều kiện riêng.
- Ghép các nhóm bằng `AND`.
- Chỉ dùng `OR` bên trong một nhóm, ví dụ search trên nhiều field hoặc project match Jira project/repo prefix.
- Thêm test cho mọi tổ hợp quan trọng.

#### BR-002 — Manual unlink không bền vững

Unlink hiện lưu `jiraKey=null`, `linkSource=manual`. Resolver chỉ bảo vệ manual link khi vẫn có `existingJiraKey`, nên lần sync sau có thể tự link lại từ tên branch.

Yêu cầu sửa:

- Có trạng thái quyết định rõ: `confirmed`, `suggested`, `rejected`, `manual_unlinked`.
- Manual unlink/reject phải thắng auto resolver cho tới khi người dùng đổi quyết định.
- Lưu actor, reason và thời điểm review.

#### BR-003 — Các writer không ghi provenance nhất quán

Bulk create và Jira comment parser có thể ghi `jiraKey` nhưng không luôn ghi `linkSource`, confidence và review metadata.

Yêu cầu sửa:

- Bulk create: `linkSource=explicit`, confidence 100.
- Manual confirm: `linkSource=manual`, confidence 100.
- Branch-name exact match: `branch_name`, confidence 95.
- PR title/comment: suggestion, không tự biến thành confirmed link.
- Mọi writer dùng cùng một service thay vì tự cập nhật `BranchInfo` rải rác.

#### BR-004 — Fallback theo tên branch có thể link sai repo

Endpoint task vẫn đọc label `branch:<name>` và tìm theo tên branch trên mọi repository.

Yêu cầu sửa:

- Source of truth là quan hệ đã xác nhận trong database.
- Trong giai đoạn migration, label fallback chỉ được dùng khi xác định được repository.
- Nếu nhiều candidate trùng tên, tạo suggestion “ambiguous”, không tự link.
- Sau rollout, bỏ label fallback.

#### BR-005 — Permission chưa được enforce

Hiện user đăng nhập có thể sync, link, relink và unlink.

Khuyến nghị mặc định:

- Member: xem dữ liệu; confirm suggestion nếu được cho phép theo policy của team.
- Release manager/admin: relink, unlink, reject candidate và chạy sync.
- API phải enforce; không chỉ ẩn button ở UI.

#### BR-006 — Sync fallback có thể block HTTP request

Nếu queue không hoạt động, `/api/branches/sync` chạy quét toàn bộ repo ngay trong request.

Yêu cầu sửa:

- API chỉ enqueue và trả `202`.
- Queue unavailable phải trả lỗi vận hành rõ ràng.
- Không fallback sang long-running sync trong web request.
- Dedupe/singleton để tránh nhiều sync chạy đồng thời.

### P1 — Dữ liệu chưa đủ thông minh

#### BR-007 — Full PR states chưa được xác minh trên dữ liệu thật

Code đã request `state=ALL`, nhưng database vẫn chỉ có PR `OPEN`.

Yêu cầu sửa:

- Chạy sync staging/production có kiểm soát.
- Xác minh pagination và response thực tế của Bitbucket Data Center.
- Lưu đầy đủ OPEN/MERGED/DECLINED/CLOSED, title, URL, destination và updated time.
- Nếu một branch có nhiều PR, không được mất lịch sử quan trọng.

#### BR-008 — Base branch đang là cấu hình global

Một giá trị global không đủ cho repo dùng `main`, `master`, `dev` hoặc `develop` khác nhau.

Yêu cầu sửa:

- Cấu hình base branch theo repository.
- Đánh dấu branch type: `work`, `base`, `release`, `system`, `unknown`.
- Mặc định không đưa base/system branch vào work view.

#### BR-009 — Attention trộn lỗi hệ thống với lỗi nghiệp vụ

Freshness stale/error hiện được gắn vào từng branch. Khi sync chưa chạy, mọi branch có thể trở thành “high risk”, trong khi summary dùng công thức khác.

Yêu cầu sửa:

- Freshness là banner/status cấp hệ thống.
- Attention per branch/task chỉ chứa bất thường nghiệp vụ.
- Summary và list phải dùng cùng một rule engine/source of truth.
- Không tải toàn bộ 2.485+ branch vào memory để filter/sort attention.

#### BR-010 — Facet và summary chưa đầy đủ

- Repository facet chỉ lấy top 20 trong khi hệ thống có 82 repo.
- Task status đang hardcode count 0.
- Assignee facet đang rỗng.
- Summary đang là global count, không phản ánh rõ phạm vi filter hiện tại.

Yêu cầu sửa:

- Trả đủ facet hoặc có endpoint search facet riêng.
- Counts phải lấy từ dữ liệu thật.
- Phân biệt `globalSummary` và `filteredSummary` nếu cần cả hai.

## 6. Mô hình nghiệp vụ mục tiêu

### 6.1 Giả định đề xuất cho pha đầu

- Một Jira task có thể có nhiều branch trên nhiều repository.
- Một branch có một **primary Jira task**.
- Exact Jira key trong branch name và tồn tại trong `IssueCache` được auto-link.
- Candidate từ PR title/comment chỉ là suggestion.
- Manual link/unlink/reject luôn thắng resolver tự động.

Nếu nghiệp vụ yêu cầu một branch chứa nhiều Jira task, phải chuyển từ `BranchInfo.jiraKey` sang junction table `TaskBranchLink`. Không nên cố nhồi nhiều key vào một cột.

### 6.2 Source of truth

Khuyến nghị tách quan hệ khỏi snapshot của branch:

```text
BranchInfo
  id, repo, branch, lifecycle, latest commit, timestamps

TaskBranchLink
  id
  branchId
  jiraKey
  role                 // primary, related
  state                // confirmed, suggested, rejected, unlinked
  source               // explicit, branch_name, pr_title, jira_label, comment, manual
  confidence
  reason
  reviewedById
  reviewedAt
  createdAt, updatedAt

PullRequestInfo
  provider, repo, externalId
  branchId
  title, state, source, destination, url
  createdAt, updatedAt, mergedAt
```

Lợi ích:

- Không mất lịch sử PR khi một branch có nhiều PR.
- Suggestion/reject không làm bẩn quan hệ confirmed.
- Manual unlink được giữ bền vững.
- Có thể mở rộng multiple related tasks sau này mà không phá `BranchInfo`.

Nếu muốn giảm phạm vi triển khai, có thể giữ `BranchInfo.jiraKey` ở pha đầu nhưng bắt buộc thêm `linkState` và sửa tất cả writer. Junction table vẫn là hướng dài hạn được khuyến nghị.

### 6.3 Resolver thống nhất

Thứ tự ưu tiên:

1. Manual confirmed/manual unlinked/rejected: giữ nguyên.
2. Explicit link do hệ thống tạo branch: confirmed, confidence 100.
3. Exact Jira key trong branch name, tồn tại và không ambiguous: confirmed, confidence 95.
4. Exact key trong PR title: suggested, confidence 80.
5. Jira label có repository rõ: suggested hoặc confirmed theo migration policy.
6. Jira comment: suggested, confidence 60.
7. Không có bằng chứng: unlinked.

## 7. Trải nghiệm mục tiêu: task-centric workspace

### 7.1 Màn hình mặc định

Thay vì một row cho mỗi branch, một row/card chính đại diện cho Jira task:

```text
EPM-3395 · Fix payment timeout
In Progress · anhnk · High

├─ payment-service / EPM-3395     PR #159 OPEN
├─ mobile-app / EPM-3395          PR #82 MERGED
└─ admin-web / EPM-3395           Chưa có PR

Attention: Có PR đã merge nhưng task chưa Done
Next action: Mở task / Mở PR / Xem delivery detail
```

Task row cần trả lời ngay:

1. Task đang ở trạng thái nào và ai phụ trách?
2. Có bao nhiêu repository/branch liên quan?
3. PR nào đang mở, đã merge hoặc thất bại?
4. Có mâu thuẫn workflow nào cần xử lý?
5. Hành động tiếp theo là gì?

### 7.2 Các view chính

1. **Công việc của tôi:** task được assign cho user và có branch/PR đang hoạt động.
2. **Cần xử lý:** bất thường Task–Branch–PR có next action rõ ràng.
3. **Chờ xác nhận:** suggestion cần confirm/reject/relink.
4. **Chưa liên kết:** work branch chưa tìm được Jira task.
5. **Tất cả branch:** bảng kỹ thuật phục vụ tìm kiếm/điều tra.

Mặc định đề xuất là `Công việc của tôi`; nếu sản phẩm phục vụ release manager nhiều hơn developer, có thể dùng `Cần xử lý`.

### 7.3 Attention và next-action rules

| Điều kiện | Mức | Next action |
|---|---|---|
| Task Done nhưng PR OPEN | Cao | Mở PR hoặc kiểm tra lại trạng thái task |
| PR MERGED nhưng task chưa Done | Trung bình | Mở task để cập nhật workflow |
| Task ở review nhưng chưa có PR | Trung bình | Tạo/tìm PR hoặc sửa liên kết |
| Suggestion chưa review | Thấp | Confirm, reject hoặc relink |
| Work branch chưa link task | Info | Link Jira task |
| Branch không hoạt động quá N ngày | Theo SLA | Kiểm tra/đóng công việc cũ |
| Sync stale/error | Hệ thống | Hiển thị banner; không nhân lên từng row |

Không tự động transition Jira trong pha đầu. Hệ thống chỉ giải thích và đưa next action; mọi mutation quan trọng cần permission và confirm.

### 7.4 Task detail

Tab Branches trên `/issue/[key]` cần:

- Nhóm theo repository.
- Hiển thị branch lifecycle, commit, PR history và freshness.
- Tách `Confirmed links` và `Suggestions`.
- Cho phép confirm/reject/relink theo quyền.
- Không dùng label fallback sau migration.

### 7.5 Board

Board card chỉ hiển thị aggregate nhỏ:

- Số work branch.
- PR state tổng hợp.
- Attention indicator có tooltip/text accessible.

Không query branch riêng cho từng card; board API phải trả aggregate cùng issue để tránh N+1.

## 8. Kế hoạch triển khai

### Pha 0 — Chốt nghiệp vụ và bảo vệ rollout

#### BR-100 — Chốt cardinality và quyền

- Chốt một branch có một hay nhiều task.
- Chốt ai được confirm/relink/unlink/reject/sync.
- Chốt default view: `Công việc của tôi` hay `Cần xử lý`.
- Chốt ngưỡng cảnh báo “chưa có PR” và inactive branch.

**Done khi:** có decision record ngắn và permission matrix được duyệt.

#### BR-101 — Backup và baseline

- Backup database trước migration/backfill.
- Export counts theo link source/state/PR state/repository.
- Lấy sample tối thiểu 50 branch để đối chiếu thủ công với Jira/Bitbucket.

**Done khi:** có rollback path và bộ dữ liệu mẫu để so sánh trước/sau.

### Pha 1 — Data correctness và source of truth (P0)

#### BR-201 — Sửa query builder

- Refactor filter thành các nhóm `AND`.
- Validate enum/page/pageSize/sort/order bằng schema chung.
- Thêm unit/integration test cho filter combinations.

**Done khi:** search + project + repo + PR + link + task status cho kết quả giao nhau đúng.

#### BR-202 — Hoàn thiện link state

- Thêm `linkState` hoặc triển khai `TaskBranchLink`.
- Manual unlink/reject không bị sync ghi đè.
- Candidate ambiguous không được auto-link.
- Audit before/after/reason cho mọi thay đổi.

**Done khi:** unlink một branch rồi sync lại vẫn giữ nguyên quyết định.

#### BR-203 — Hợp nhất các writer

- Tạo service duy nhất để create/update link.
- Bulk create ghi explicit link confidence 100.
- Comment parser chỉ tạo suggestion nếu chưa có confirmed link.
- Worker không ghi đè manual/explicit decisions.

**Done khi:** không còn code path cập nhật `jiraKey` trực tiếp ngoài link service/migration.

#### BR-204 — Bỏ liên kết mơ hồ

- Fallback Jira label phải kèm repository.
- Duplicate branch name trả ambiguous candidate.
- Có migration window và metric theo dõi label fallback.
- Bỏ fallback sau khi backfill hoàn tất.

**Done khi:** task detail chỉ hiển thị branch đúng repository và đúng confirmed relation.

### Pha 2 — Bitbucket sync và PR lifecycle (P0/P1)

#### BR-301 — Sync đầy đủ PR

- Xác minh `state=ALL` với Bitbucket đang dùng.
- Lưu các PR state và timestamps đầy đủ.
- Nếu giữ nhiều PR, triển khai `PullRequestInfo` và unique provider/external ID.
- Chọn latest/current PR cho summary nhưng giữ history trong detail.

**Done khi:** dữ liệu thật có OPEN/MERGED/DECLINED/CLOSED phù hợp với Bitbucket sample.

#### BR-302 — Repository configuration

- Lưu base branch theo repo.
- Phân loại branch type.
- Không hiển thị base/system branch trong default work view.

**Done khi:** `master/dev/main/develop` không còn làm nhiễu danh sách công việc trừ khi người dùng mở All branches.

#### BR-303 — Lifecycle reconciliation

- Upsert `lastSeenAt` theo sync run.
- Chỉ mark deleted sau khi repo sync thành công.
- Không cleanup khi upstream timeout/auth error.
- Có test partial failure và branch restore.

**Done khi:** branch bị xóa trên Bitbucket không còn xuất hiện active sau sync thành công.

#### BR-304 — Queue-only manual sync

- Permission gate.
- Queue singleton/dedupe.
- Trả job ID và status.
- UI poll freshness/job result.
- Không chạy worker trực tiếp trong HTTP request.

**Done khi:** request sync trả nhanh và không tạo hai job trùng nhau.

### Pha 3 — Query, aggregation và attention engine (P1)

#### BR-401 — Task-centric query API

API trả task aggregate:

```ts
type DeliveryTaskRow = {
  task: JiraTaskSummary;
  branches: BranchSummary[];
  branchCount: number;
  repositories: string[];
  prSummary: {
    open: number;
    merged: number;
    declined: number;
    closed: number;
    none: number;
  };
  attention: AttentionSignal[];
  nextActions: NextAction[];
};
```

- Server-side pagination ở cấp task.
- Filter theo project, assignee, task status, repository, PR state và attention.
- Không N+1.
- URL-driven state.

#### BR-402 — Attention engine thống nhất

- Pure rules có unit test.
- Summary count và rows dùng cùng rule source.
- Tách system freshness khỏi business attention.
- Đưa phần có thể tính bằng SQL xuống database hoặc materialized aggregate.

**Done khi:** số “Cần xử lý” luôn bằng tập rows tương ứng và không cần load toàn dataset vào memory.

#### BR-403 — Facets và freshness

- Repo/project/status/assignee facet từ dữ liệu thật.
- Không giới hạn im lặng top 20.
- Freshness theo integration và theo repo khi cần.
- Phân biệt global summary và filtered summary.

### Pha 4 — Core UX task-centric (P1)

#### BR-501 — Workspace navigation

- Các view: My work, Needs attention, Pending review, Unlinked, All branches.
- Default view theo quyết định BR-100.
- Search/filter/sort giữ trong URL.
- Loading dùng Skeleton; error/empty state có hành động rõ.

#### BR-502 — Task delivery rows/cards

- Desktop: compact expandable rows.
- Mobile: card list, không horizontal scroll.
- Expand task để xem branch theo repo và PR.
- Next action hiển thị bằng text, không chỉ bằng màu/icon.

#### BR-503 — Review inbox

- Confirm suggestion.
- Reject/dismiss suggestion bền vững.
- Relink với Jira task khác.
- Bulk confirm chỉ khi tất cả candidate cùng rule và có preview.

#### BR-504 — Technical All branches view

- Giữ bảng hiện tại nhưng sửa filter và permission.
- Cho phép điều tra từng branch/detail drawer.
- Mặc định ẩn base/system/deleted branches.
- Có toggle rõ để xem toàn bộ.

### Pha 5 — Tích hợp Task, Board và Release (P1/P2)

#### BR-601 — Task detail

- Đọc confirmed relation duy nhất.
- Hiển thị suggestions riêng.
- Repository + branch + PR history + external links.
- Invalidate query đúng khi link thay đổi.

#### BR-602 — Board aggregate

- Branch count, aggregate PR state và attention trên task card.
- Không fetch riêng theo card.
- Tooltip/label accessible.

#### BR-603 — Release gate hardening

- Chỉ đánh giá khi PR data fresh và repo sync thành công.
- Base branch theo repo.
- Stale/unknown trả `unknown`, không âm thầm pass/fail.
- Gate details trỏ được về task/branch/PR gây blocker.

### Pha 6 — Hardening và rollout (P2)

#### BR-701 — Performance

- Test 2.500, 10.000 và 50.000 branches.
- Mục tiêu list API page 25 dưới 500 ms trên môi trường gần production.
- Kiểm tra query plan và indexes.
- Không gửi toàn bộ branch dataset về browser.

#### BR-702 — Accessibility và responsive

- Keyboard flow: toolbar → row → detail → dialog → restore focus.
- Screen reader names/states cho controls.
- Light/dark contrast ≥ 4.5:1.
- Kiểm tra 375/768/1024/1440 px.
- Tôn trọng reduced motion.

#### BR-703 — Observability

- Metrics: repo success/failure, branch seen/deleted, PR state counts, links confirmed/suggested/rejected/unlinked.
- Alert khi sync stale hoặc lỗi liên tiếp.
- Log không chứa token/authorization.

#### BR-704 — Rollout

- Chạy migration/backfill ở staging.
- So sánh sample 50 branch với Jira/Bitbucket.
- Bật task-centric workspace cho admin/release manager trước.
- Theo dõi mismatch và rollback nếu cần.
- Mở cho toàn team sau khi qua quality gates.

## 9. Thứ tự ưu tiên đề xuất

| Thứ tự | Hạng mục | Ưu tiên | Phụ thuộc |
|---:|---|---|---|
| 1 | BR-100/101: quyết định, backup, baseline | P0 | Không |
| 2 | BR-201: sửa query/filter | P0 | Không |
| 3 | BR-202/203: link state + unified writer | P0 | Quyết định cardinality |
| 4 | BR-204: bỏ fallback mơ hồ | P0 | Link source of truth |
| 5 | BR-301/302/303/304: sync, PR, base branch, lifecycle | P0/P1 | Data model ổn định |
| 6 | BR-401/402/403: task aggregation + attention | P1 | Dữ liệu đúng |
| 7 | BR-501–504: task-centric UX | P1 | Query API |
| 8 | BR-601–603: Task/Board/Release integration | P1/P2 | Core UX và data |
| 9 | BR-701–704: hardening/rollout | P2 | Toàn bộ pha trước |

## 10. Kiểm thử bắt buộc

### Unit

- Jira key boundary và ambiguous candidates.
- Link precedence/state transition.
- Manual unlink/reject persistence.
- Attention rules và next actions.
- PR state/base destination rules.
- Query validation và AND/OR composition.

### Integration

- Bitbucket pagination + `state=ALL`.
- Multiple PRs trên một branch.
- Sync success/partial failure/auth failure/timeout.
- Reconcile deleted branch chỉ sau successful repo sync.
- Bulk/comment/worker đều dùng unified link service.
- Permission cho link/relink/unlink/reject/sync.

### Component

- Task-centric loading/error/empty/data states.
- Search debounce và URL back/forward.
- Expand/collapse task rows.
- Review suggestion dialog.
- Mobile cards và keyboard navigation.

### E2E

1. Tạo branch từ task → explicit link → xuất hiện ngay trong task workspace.
2. Sync branch có exact Jira key → auto-link đúng task/repo.
3. PR title candidate → suggestion → confirm → xuất hiện trong task detail.
4. Reject/unlink → sync lại → quyết định vẫn được giữ.
5. PR merged → task chưa Done → attention và next action đúng.
6. Bitbucket lỗi → dữ liệu cũ vẫn đọc được, có system freshness warning.
7. User không đủ quyền không thể gọi mutation trực tiếp qua API.

## 11. Definition of Done

- Màn hình mặc định không còn là danh sách 2.485 branch rời rạc.
- Người dùng nhìn theo task và hiểu ngay delivery state cùng next action.
- Branch hệ thống/base branch không làm nhiễu work view.
- Task detail, Branch workspace, Board và Release dùng cùng source of truth.
- Manual link/unlink/reject không bị worker ghi đè.
- Filter combinations trả kết quả chính xác.
- PR lifecycle có dữ liệu thật và freshness rõ ràng.
- Attention summary khớp hoàn toàn với danh sách.
- Sync/link mutations được permission-gate và audit.
- Không N+1, không tải toàn dataset vào client/memory để paginate.
- Unit/integration/component/E2E quan trọng đều pass.
- Desktop/mobile, keyboard, light/dark và reduced motion đã được kiểm tra.

## 12. Ngoài phạm vi pha đầu

- Không merge/decline PR trực tiếp từ dashboard.
- Không tự động transition Jira theo PR state.
- Không xóa/đổi tên branch từ UI.
- Không xây graph visualization phức tạp.
- Không tải full commit timeline cho mọi branch.

## 13. Các quyết định cần người dùng chốt

1. **Cardinality:** một branch chỉ có một primary Jira task, hay có thể liên quan nhiều task?
2. **Default workspace:** `Công việc của tôi` hay `Cần xử lý`?
3. **Auto-link:** exact Jira key trong tên branch được link ngay hay vẫn cần confirm?
4. **Permission:** member có được confirm suggestion không? Ai được relink/unlink và chạy sync?
5. **No-PR rule:** cảnh báo ngay khi task In Progress chưa có PR, hay chỉ sau N ngày/đến trạng thái Review?

Khuyến nghị mặc định:

- Một task có nhiều branch; một branch có một primary task.
- Default là `Công việc của tôi`, có tab `Cần xử lý` cạnh bên.
- Exact Jira key hợp lệ được auto-link; PR title/comment chỉ tạo suggestion.
- Member được confirm suggestion; release manager/admin được relink, unlink, reject và sync.
- “No PR” chỉ thành warning sau 2 ngày hoặc khi task đã vào trạng thái Review.
