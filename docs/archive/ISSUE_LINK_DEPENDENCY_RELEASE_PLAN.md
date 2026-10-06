# Kế hoạch hỗ trợ task lớn và task phụ thuộc qua Jira Issue Links

> Trạng thái: Proposed
>
> Phạm vi: Đồng bộ Jira Issue Links, lan truyền Fix Version, bulk operation,
> release scope, release gates và giao diện hiển thị dependency
>
> Quy ước nghiệp vụ chính: Nếu Jira hiển thị `A is blocked by B` thì `A` là
> task lớn và `B` được xem là task con/phần việc phụ thuộc của `A`.

## 1. Mục tiêu

Hệ thống phải hỗ trợ các task lớn được chia thành nhiều task nhỏ thông qua Jira
Issue Links, cụ thể là quan hệ `is blocked by`/`blocks`, thay vì chỉ dựa vào
Parent/Sub-task.

Khi người dùng gán Fix Version cho task lớn, hệ thống phải:

1. Tìm toàn bộ task phụ thuộc trực tiếp và gián tiếp.
2. Cho người dùng xem trước đầy đủ phạm vi ảnh hưởng.
3. Thêm Fix Version thật vào các dependency cùng Jira project.
4. Không ghi sai Fix Version sang issue thuộc project khác.
5. Đưa tất cả dependency vào phạm vi kiểm tra release, kể cả khi việc ghi Fix
   Version xuống Jira chưa thành công.
6. Không cho release vượt qua nếu task lớn hoặc dependency bắt buộc chưa hoàn
   tất.
7. Cho phép retry và sửa dữ liệu lệch mà không chạy lại các issue đã thành công.

## 2. Hiện trạng và khoảng trống

### 2.1 Issue cache chưa lưu Issue Links

`IssueCache` hiện lưu status, assignee, labels, Fix Version, priority và các
metadata khác nhưng chưa có mô hình quan hệ giữa các issue. Vì vậy ứng dụng
không thể trả lời các câu hỏi:

- Task A đang bị block bởi những issue nào?
- Dependency của A có dependency tiếp theo hay không?
- Một issue đang là dependency của bao nhiêu task lớn?
- Có vòng lặp trong đồ thị dependency hay không?

### 2.2 Jira sync chưa yêu cầu field `issuelinks`

Danh sách field dùng trong polling và live refresh chưa có `issuelinks`. Jira
webhook hiện chỉ dùng issue key để tải lại issue, nên dù webhook chạy thành
công thì quan hệ link vẫn chưa được lưu vào read model.

### 2.3 Release scope chỉ dựa trên Fix Version trực tiếp

Release hiện lấy các issue có `fixVersionIds` chứa Jira Version ID. Nếu A có
version nhưng B chỉ liên kết bằng `A is blocked by B`, B không xuất hiện trong
release và không thể chặn release.

### 2.4 Bulk Fix Version chỉ xử lý key được chọn

Bulk worker hiện thêm/xóa version trên từng key trong preview. Worker chưa mở
rộng key theo dependency graph và chưa lưu nguồn gốc vì sao một version được
thêm vào dependency.

## 3. Quy tắc nghiệp vụ đã chọn

### 3.1 Chiều của quan hệ

Với quan hệ Jira:

```text
A is blocked by B
```

Hệ thống diễn giải:

```text
Task lớn:             A
Dependency/task con: B
Luồng phụ thuộc:      B -> A
```

Nếu B tiếp tục `is blocked by D`, D là dependency cấp sâu hơn của A:

```text
A
└── B
    └── D
```

Khi mở rộng từ A, hệ thống chỉ đi theo chiều `is blocked by`. Chiều `A blocks
X` không làm X trở thành task con của A.

### 3.2 Link type được hỗ trợ

Ban đầu chỉ hỗ trợ Jira link type có semantic `Blocks`:

- Inward description: `is blocked by`.
- Outward description: `blocks`.

Không sử dụng các link type sau để tạo dependency tree:

- `relates to`;
- `duplicates`/`is duplicated by`;
- `clones`/`is cloned by`;
- link type tùy chỉnh khác chưa được cấu hình.

Việc nhận diện phải ưu tiên Jira Issue Link Type ID và direction. Chuỗi hiển
thị chỉ dùng khi backfill hoặc làm fallback, vì Jira có thể đổi tên hoặc bản
địa hóa label.

Đề xuất thêm cấu hình:

```dotenv
JIRA_DEPENDENCY_LINK_TYPE=Blocks
JIRA_DEPENDENCY_INWARD_LABEL=is blocked by
JIRA_DEPENDENCY_MAX_DEPTH=10
JIRA_DEPENDENCY_MAX_ISSUES=500
```

Không đưa ID cố định vào `.env.example` vì ID khác nhau giữa các Jira instance.
Ứng dụng có thể khám phá ID từ payload `issuelinks` hoặc Jira link-type API và
cache lại theo tên cấu hình.

### 3.3 Thêm Fix Version

Khi thêm version V vào task lớn A:

- A được xem là target trực tiếp.
- Tất cả dependency của A được thêm vào preview.
- Dependency cùng project với A được thêm Fix Version V thật trên Jira.
- Các Fix Version hiện có của dependency được giữ nguyên.
- Nếu dependency đã có V, item được đánh dấu `no_change`.
- Dependency khác project không bị mutate.
- Dependency khác project vẫn thuộc release scope và vẫn phải vượt qua các
  release gate áp dụng được.

Ví dụ:

```text
A(PROJ) is blocked by B(PROJ)
A(PROJ) is blocked by C(OTHER)
B(PROJ) is blocked by D(PROJ)

Thêm version 1.5.0 vào A:
- A, B, D: thêm version 1.5.0 trên Jira nếu chưa có.
- C: không ghi version vì thuộc project OTHER.
- Release scope: A, B, C và D.
```

### 3.4 Xóa Fix Version

Xóa version khỏi task lớn không được âm thầm xóa khỏi tất cả dependency.

Quy tắc mặc định:

1. Luôn tạo preview.
2. Xóa version khỏi task lớn được chọn.
3. Chỉ đề xuất xóa khỏi dependency khi có propagation record chứng minh version
   đó đã được ứng dụng thêm từ chính task lớn này.
4. Không xóa nếu dependency vẫn còn được một root khác kéo vào cùng version.
5. Không xóa version được gán trực tiếp/manual trên dependency.
6. Cho phép người dùng bỏ chọn từng dependency trước khi confirm.
7. Có thể bổ sung tùy chọn `force remove`, nhưng mặc định tắt và phải hiển thị
   cảnh báo rõ.

### 3.5 Điều kiện hoàn tất release

Quy tắc mặc định an toàn:

- Task lớn phải ở Jira status category `done`.
- Tất cả dependency trực tiếp và gián tiếp cũng phải `done`.
- Dependency khác project vẫn phải `done`.
- Dependency có status/category không đọc được làm gate thành `unknown`.
- Dependency bị xóa hoặc mất quyền truy cập làm gate thành `unknown`.
- Cycle hoặc đồ thị vượt giới hạn không được bỏ qua; release phải `unknown` hoặc
  `blocked` với lý do rõ ràng.

Không tự động transition task con khi task lớn được transition. Mỗi issue có
workflow, permission và trạng thái công việc riêng.

## 4. Thiết kế dữ liệu

### 4.1 Model `IssueLinkCache`

Đề xuất thêm model Prisma độc lập thay vì thêm `parentKey` vào `IssueCache`, vì
Issue Links tạo thành graph nhiều-nhiều chứ không phải cây một cha.

Thiết kế dự kiến:

```prisma
model IssueLinkCache {
  id            String   @id @default(cuid())
  jiraLinkId    String   @unique
  linkTypeId    String
  linkTypeName  String
  inwardLabel   String
  outwardLabel  String

  // Với link B blocks A:
  // outwardKey = B, inwardKey = A
  outwardKey    String
  inwardKey     String

  lastSyncedAt  DateTime @default(now())
  deletedAt     DateTime?

  @@index([outwardKey, deletedAt])
  @@index([inwardKey, deletedAt])
  @@index([linkTypeId, deletedAt])
}
```

Không bắt buộc foreign key đến `IssueCache`, vì một đầu của link có thể:

- thuộc project chưa được cấu hình;
- người dùng/service account không có quyền đọc;
- chưa được poll lần đầu;
- đã bị xóa khỏi Jira.

### 4.2 Chuẩn hóa hướng lưu

Mọi link `Blocks` được chuẩn hóa thành:

```text
outwardKey blocks inwardKey
```

Do đó, để tìm task con/dependency của A:

```text
IssueLinkCache.inwardKey = A
dependency key = IssueLinkCache.outwardKey
```

Không lưu theo vị trí `inwardIssue`/`outwardIssue` thô của payload mà không
chuẩn hóa, vì payload trả về từ góc nhìn của mỗi issue có thể khác nhau.

### 4.3 Model `FixVersionPropagation`

Cần lưu provenance để xóa version an toàn:

```prisma
model FixVersionPropagation {
  id             String   @id @default(cuid())
  rootKey        String
  dependencyKey  String
  jiraVersionId  String
  projectKey     String
  operationId    String?
  active         Boolean  @default(true)
  appliedAt      DateTime @default(now())
  removedAt      DateTime?
  lastVerifiedAt DateTime?

  @@unique([rootKey, dependencyKey, jiraVersionId])
  @@index([dependencyKey, jiraVersionId, active])
  @@index([rootKey, jiraVersionId, active])
}
```

Propagation record không thay thế Jira. Nó chỉ trả lời câu hỏi: “Ứng dụng đã
thêm version này vào dependency vì root nào?”. Trạng thái Fix Version thực tế
vẫn phải đọc từ Jira.

## 5. Đồng bộ Jira Issue Links

### 5.1 Jira types và fields

Bổ sung kiểu dữ liệu cho `JiraFields.issuelinks`:

```ts
type JiraIssueLink = {
  id: string;
  type: {
    id: string;
    name: string;
    inward: string;
    outward: string;
  };
  inwardIssue?: { id: string; key: string };
  outwardIssue?: { id: string; key: string };
};
```

Thêm `issuelinks` vào danh sách field dùng cho:

- search/poll Jira;
- get issue;
- refresh cache sau mutation;
- Jira webhook processing.

### 5.2 Upsert link

Khi refresh issue A:

1. Đọc toàn bộ `issuelinks` của A.
2. Chuẩn hóa mỗi link thành `outwardKey -> inwardKey`.
3. Upsert theo `jiraLinkId`.
4. Cập nhật metadata và `lastSyncedAt`.
5. Đặt `deletedAt = null` nếu link xuất hiện lại.
6. Các link trước đây có đầu mút là A nhưng không còn xuất hiện trong response
   được đánh dấu deleted sau khi xác nhận response đầy đủ.

Không hard-delete ngay để giữ khả năng audit và tránh race giữa hai webhook của
hai đầu link.

### 5.3 Webhook và reconciliation

- Webhook issue created/updated phải refresh issue và links ngay.
- Nếu changelog báo thay đổi `Link`, refresh cả issue hiện tại.
- Nếu lấy được key của issue đầu bên kia, enqueue refresh cho cả hai đầu.
- Polling tiếp tục là cơ chế sửa sai nếu webhook bị mất.
- Chạy full Jira sync một lần sau migration để backfill graph.

## 6. Dependency graph service

### 6.1 API nội bộ

Đề xuất module `src/lib/issues/dependencies.ts`:

```ts
expandDependencies({
  rootKeys: ["PROJ-100"],
  maxDepth: 10,
  maxIssues: 500,
})
```

Kết quả:

```ts
{
  roots: ["PROJ-100"],
  issues: [
    { key: "PROJ-100", depth: 0, relation: "explicit" },
    { key: "PROJ-101", depth: 1, relation: "dependency", via: "PROJ-100" },
    { key: "PROJ-110", depth: 2, relation: "dependency", via: "PROJ-101" },
  ],
  edges: [
    { root: "PROJ-100", dependency: "PROJ-101" },
    { root: "PROJ-101", dependency: "PROJ-110" },
  ],
  cycles: [],
  truncated: false,
  missingKeys: [],
}
```

### 6.2 Thuật toán

Sử dụng breadth-first search để:

- có depth ổn định;
- dễ áp giới hạn max depth;
- dễ nhóm trực tiếp/cấp sâu trên UI;
- không bị recursion stack overflow.

Mỗi root có `visited` riêng để phát hiện cycle, đồng thời có tập kết quả chung
để tránh mutate cùng issue nhiều lần khi nhiều root hội tụ vào một dependency.

### 6.3 Cycle

Ví dụ:

```text
A is blocked by B
B is blocked by C
C is blocked by A
```

Hệ thống phải:

- dừng traversal tại node đã đi qua;
- không tạo operation item trùng;
- trả thông tin cycle vào preview;
- không cho release trở thành `ready` cho đến khi cycle được xử lý hoặc có
  policy override được audit.

### 6.4 Giới hạn

Giới hạn đề xuất:

- Tối đa 10 cấp dependency.
- Tối đa 500 issue cho một lần mở rộng.
- Dùng batch database query thay vì query từng node.
- Nếu vượt giới hạn, đánh dấu `truncated = true` và không cho phép confirm/release
  theo dữ liệu chưa đầy đủ.

## 7. Tích hợp bulk operation

### 7.1 Request

Mở rộng action Fix Version bằng scope:

```ts
{
  kind: "add-fix-version",
  value: "1.5.0",
  dependencyScope: "recursive"
}
```

Các giá trị dự kiến:

- `none`: chỉ issue được chọn.
- `direct`: chỉ dependency cấp 1.
- `recursive`: toàn bộ dependency; mặc định cho add Fix Version.

Đối với remove, mặc định vẫn mở rộng để preview nhưng chỉ dependency hợp lệ
theo provenance mới được đánh dấu actionable.

### 7.2 Preview

Preview phải là snapshot bất biến gồm:

- key được người dùng chọn;
- key được mở rộng từ dependency;
- root nguồn;
- depth;
- project;
- before/after Fix Version;
- classification;
- lý do skip;
- cycle/truncation warning;
- dependency khác project.

Ví dụ tổng kết:

```text
1 task được chọn
6 dependency được tìm thấy
5 issue sẽ được cập nhật Jira
1 dependency khác project chỉ được kiểm tra release
0 issue không đổi
```

### 7.3 Confirm

- Confirm chỉ chạy đúng snapshot đã preview.
- Dependency mới được tạo sau preview không tự chen vào operation đang chạy.
- UI phải cảnh báo nếu snapshot cũ hơn ngưỡng cho phép hoặc graph đã thay đổi.
- Có thể yêu cầu preview lại nếu root/link metadata thay đổi sau preview.

### 7.4 Worker

Worker tái sử dụng cơ chế hiện tại:

- idempotent từng operation item;
- retry lỗi tạm thời;
- không chạy lại item đã succeeded;
- cập nhật cache sau mutation;
- tổng hợp `completed` hoặc `partially_failed`.

Sau khi thêm version thành công vào dependency, worker upsert
`FixVersionPropagation`. Nếu issue đã có version từ trước preview thì không tạo
record cho việc “thêm”, vì ứng dụng không phải nguồn đã gán version đó.

### 7.5 Khác project

Fix Version ID chỉ có ý nghĩa trong project sở hữu version. Vì vậy:

- Không gửi Jira mutation cho dependency khác project.
- Không tự tìm version cùng tên rồi gán, vì trùng tên không đảm bảo cùng release.
- Đánh dấu item là `external_dependency` thay vì `failed`.
- Dependency vẫn tham gia status/freshness gate.

Nếu tương lai cần multi-project release, phải thiết kế release mapping riêng,
không ghép version chỉ dựa trên tên.

## 8. Release scope và release gates

### 8.1 Xây release context

Với Jira Fix Version release:

1. Lấy tất cả issue có `fixVersionIds` chứa version ID.
2. Coi những issue này là release roots.
3. Mở rộng dependency graph theo `is blocked by`.
4. Hợp nhất roots và dependencies, loại bỏ trùng.
5. Nạp task metadata, branches, PR, freshness và các evidence khác.

Release context cần ghi thêm:

```ts
type TaskInfo = {
  // fields hiện có
  inclusion: "direct" | "dependency";
  rootKeys: string[];
  depth: number;
  sameProject: boolean;
  hasReleaseVersion: boolean;
};
```

### 8.2 Gate `task_status`

Chạy trên toàn bộ roots và dependencies:

- Có bất kỳ task nào chưa done: `failed`.
- Không đọc được status/category: `unknown`.
- Chỉ pass khi toàn bộ graph đã done.

### 8.3 Gate `dependency_version_consistency`

Gate mới áp dụng cho dependency cùng project:

- Có Fix Version: `passed`.
- Thiếu Fix Version: `failed`, kèm action “Đồng bộ version”.
- Jira data cũ hoặc issue mất quyền đọc: `unknown`.
- Dependency khác project: `not_applicable`, không fail vì version.

Gate này bảo đảm Jira và ứng dụng không có hai cách hiểu release khác nhau.

### 8.4 Các gate hiện có

- `critical_bugs`: kiểm tra cả dependency nếu chúng là bug/defect.
- `branches`: chọn branch có key của root hoặc dependency.
- `pull_requests`: yêu cầu PR của các branch trong scope hoàn tất.
- `data_freshness`: kiểm tra freshness của toàn bộ dependency.
- `ci`: áp dụng theo branch/repository evidence đã mở rộng.
- `manual_approval`: giữ nguyên theo release.

### 8.5 Graph integrity gate

Đề xuất thêm gate `dependency_graph_integrity`:

- Pass khi graph đầy đủ, không cycle và không vượt giới hạn.
- Unknown khi endpoint của link không đọc được hoặc dữ liệu stale.
- Failed khi phát hiện cycle hoặc graph vượt giới hạn policy.

Không được âm thầm bỏ node lỗi rồi kết luận release ready.

## 9. Giao diện

### 9.1 Issue detail

Thêm section “Task phụ thuộc”:

- Danh sách/cây các issue mà task hiện tại `is blocked by`.
- Key, summary, project, status và Fix Version.
- Badge `Trực tiếp`, `Cấp 2`, `Project khác`, `Thiếu version`.
- Link mở issue detail.
- Cảnh báo cycle hoặc dữ liệu stale.

Empty state:

- Icon Link từ `lucide-react` trong muted circle.
- Tiêu đề ngắn: “Không có task phụ thuộc”.
- Hint: “Task này không có liên kết is blocked by.”

### 9.2 Board

Không biến toàn bộ board thành tree mặc định vì mật độ hiện tại cao. Trên card
chỉ hiển thị:

- số dependency chưa hoàn tất;
- icon link;
- warning badge khi task đang bị dependency chặn.

Quick panel/detail mới hiển thị cây đầy đủ.

### 9.3 Bulk preview

Mỗi item có badge:

- `Được chọn`;
- `Theo dependency`;
- `Project khác`;
- `Không thay đổi`;
- `Không thể cập nhật`.

Preview phải cho phép expand/collapse theo root. Nút confirm hiển thị số issue
thật sự sẽ bị mutate, không chỉ số key người dùng chọn.

### 9.4 Release page

Nhóm dependency theo root:

```text
PROJ-100 · Task lớn · Done
├── PROJ-101 · Done
├── PROJ-102 · In Progress · Chặn release
└── OTHER-25 · Done · Project khác
```

Nếu một dependency thuộc nhiều root, hiển thị một lần trong danh sách tổng nhưng
có thể xuất hiện dưới nhiều group ở view cây. Các counter phải đếm unique issue.

Thêm action:

- “Đồng bộ version xuống dependency”.
- “Xem task đang chặn”.
- “Chạy lại release check”.

Tất cả loading state dùng `Skeleton`; màu dùng semantic tokens; icon dùng
`lucide-react`; hỗ trợ light/dark và keyboard navigation theo design system.

## 10. API dự kiến

### 10.1 Đọc dependency

```http
GET /api/issues/PROJ-100/dependencies?depth=recursive
```

Response gồm nodes, edges, cycles, truncated, freshness và project boundary.

### 10.2 Preview/confirm Fix Version

Tái sử dụng `/api/issues/bulk` thay vì tạo mutation API riêng. Payload thêm
`dependencyScope`. Response preview thêm dependency metadata.

### 10.3 Repair release version

Có thể dùng cùng bulk API với root keys từ release, không cần endpoint mutation
riêng. Release UI tạo preview trước khi sửa để giữ cùng permission, audit và
retry semantics.

## 11. Permission, audit và an toàn

- User-initiated mutation phải dùng Jira credential cá nhân hiện tại.
- Không fallback sang Jira service account khi user thiếu quyền.
- Service account chỉ đọc/sync Issue Links.
- Preview không được mutate Jira.
- Mỗi operation lưu actor, root, expanded dependencies và version.
- Audit log không lưu token hoặc nội dung nhạy cảm.
- Partial failure phải hiển thị từng issue lỗi.
- Release manager không được override graph bị cắt cụt mà không có audit rõ.

Các audit action đề xuất:

```text
issue.fix_version.propagate
issue.fix_version.propagate_remove
release.dependency_sync
release.dependency_override
```

## 12. Migration và rollout

### Bước 1: Schema và read model

- Thêm `IssueLinkCache` và `FixVersionPropagation`.
- Chạy Prisma migration.
- Deploy code đọc/ghi link cache nhưng chưa thay đổi release behavior.

### Bước 2: Backfill

- Chạy full Jira sync cho các project cấu hình.
- Đếm tổng link, link type và endpoint bị thiếu.
- Xác minh direction trên một số issue thực tế.
- So sánh UI Jira: `A is blocked by B` phải lưu thành `B -> A`.

### Bước 3: Shadow evaluation

- Xây dependency graph trong release check nhưng chưa dùng để block.
- Ghi metrics/log so sánh scope cũ và scope mới.
- Kiểm tra release nào sẽ có thêm dependency/blocker.

### Bước 4: Bật preview propagation

- Bật dependency expansion trên bulk preview.
- Chưa cho confirm nếu graph cycle/truncated.
- Theo dõi kích thước operation và lỗi Jira permission.

### Bước 5: Bật mutation và gates

- Bật confirm propagation.
- Bật `dependency_version_consistency`.
- Bật dependency trong task status/branch/PR gates.
- Cập nhật release policy chính thức.

### Bước 6: Dọn dữ liệu và vận hành

- Thêm metrics cho link freshness, cycle, truncated graph và propagation lỗi.
- Thêm runbook repair/resync.
- Theo dõi partial failure và thời gian worker.

## 13. Test plan

### 13.1 Unit tests

- Chuẩn hóa inward/outward Jira payload.
- Chỉ nhận link type Blocks.
- BFS một cấp và nhiều cấp.
- Hai root dùng chung dependency.
- Cycle detection.
- Max depth và max issues.
- Dependency khác project.
- Giữ các Fix Version có sẵn khi add.
- Provenance quyết định remove đúng.

### 13.2 Integration tests

- Poll Jira tạo/update/delete link cache.
- Webhook cập nhật link ngay.
- Preview mở rộng đúng dependencies.
- Confirm chỉ chạy snapshot đã preview.
- Worker retry một dependency thất bại.
- Operation kết thúc `partially_failed` đúng.
- Cache refresh sau mutation.
- Release context hợp nhất direct và dependency tasks.

### 13.3 Release gate tests

- Root done, dependency chưa done: blocked.
- Root chưa done, dependencies done: blocked.
- Tất cả done: passed.
- Dependency status unknown: unknown.
- Dependency khác project chưa done: blocked.
- Dependency cùng project thiếu version: consistency failed.
- Cycle: graph integrity failed.
- Graph truncated: không ready.

### 13.4 UI tests

- Dependency tree render đúng depth.
- Shared dependency không làm counter tăng hai lần.
- Preview phân biệt explicit/dependency/external.
- Partial failure hiển thị key và retry action.
- Empty/loading/error states.
- Keyboard navigation.
- Light/dark mode và responsive widths.

## 14. Tiêu chí nghiệm thu

Feature được coi là hoàn thành khi:

1. `A is blocked by B` được đồng bộ và hiển thị đúng chiều.
2. Quan hệ nhiều cấp được mở rộng đúng, không lặp vô hạn.
3. Gán Fix Version cho A tạo preview gồm A và toàn bộ dependencies.
4. Dependencies cùng project nhận Fix Version thật trên Jira.
5. Fix Version cũ của dependency không bị mất.
6. Dependency khác project không bị ghi version sai.
7. Release không thể ready nếu A hoặc bất kỳ dependency nào chưa done.
8. Cycle, graph bị cắt hoặc issue không đọc được không bị bỏ qua.
9. Xóa version không làm mất version được gán thủ công.
10. Partial failure có thể retry theo từng item.
11. Audit xác định được ai đã propagate version, từ root nào và operation nào.
12. Polling và webhook hội tụ về cùng một dependency graph.

## 15. Chia ticket triển khai đề xuất

| Mã | Ticket | Phụ thuộc |
|---|---|---|
| DEP-01 | Prisma models và migration cho issue links/provenance | — |
| DEP-02 | Jira types, `issuelinks` field và normalizer | DEP-01 |
| DEP-03 | Poll/webhook sync và full backfill | DEP-02 |
| DEP-04 | Dependency graph traversal, cycle và limits | DEP-03 |
| DEP-05 | Dependency read API và issue detail UI | DEP-04 |
| DEP-06 | Bulk add-version preview expansion | DEP-04 |
| DEP-07 | Bulk worker propagation và provenance | DEP-06 |
| DEP-08 | Safe remove-version behavior | DEP-07 |
| DEP-09 | Release context dependency expansion | DEP-04 |
| DEP-10 | Graph integrity/version consistency gates | DEP-09 |
| DEP-11 | Release UI dependency grouping và repair action | DEP-07, DEP-10 |
| DEP-12 | Metrics, audit, runbook và rollout controls | DEP-03–DEP-11 |

## 16. Ngoài phạm vi phiên bản đầu

- Tự động transition task con theo task lớn.
- Tự động gán assignee/priority/story point cho dependency.
- Suy diễn task con từ mọi Issue Link type.
- Tự ghép Fix Version cùng tên giữa nhiều project.
- Thay Jira hierarchy chuẩn bằng Issue Links.
- Tự sửa cycle trong Jira.

Các mục này chỉ nên được xem xét sau khi luồng Fix Version và release dependency
đã vận hành ổn định.
