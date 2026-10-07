# Trường người (Reporter / Approver / Tester) + Board cho Leader — kế hoạch chi tiết

> Tạo: 2026-10-07 · Trạng thái: **kế hoạch, chưa triển khai** · Nên làm trên branch riêng từ `main`
> (branch hiện tại `chore/clean-code-20261006` là refactor thuần, không trộn feature vào).

## 0. Mục tiêu

1. Đồng bộ và hiển thị/lọc được **Reporter, Approver, Assignee Tester**.
2. Thêm role **`lead`** (admin gán tay) và chế độ **Team** trên Board cho leader.
3. Bổ sung các trường đã có trong DB nhưng chưa lên UI (due date, estimate, fix version, epic, type, status).

Không làm: màn Leader riêng (dùng chung Board + trang báo cáo sẵn có), ghi ngược Approver/Tester lên Jira (để pha sau).

**Chốt:** Approver chỉ để **leader theo dõi** (hiển thị + lọc), không có luồng duyệt và không có hàng đợi "chờ duyệt" → không cần định nghĩa trạng thái duyệt theo project.

## 1. Dữ kiện đã xác nhận (probe Jira thật ngày 2026-10-07)

| Trường | Field id | Kiểu | Ghi chú |
|---|---|---|---|
| Reporter | `reporter` | user | Trường chuẩn, luôn có. **Không** dò bằng editmeta (một số project không cho sửa nên không hiện). |
| Approver | `customfield_10300` | user picker, 1 người | Cùng id ở mọi project có field |
| Assignee Tester | `customfield_10501` | user picker, **1 người** | Cùng id ở mọi project có field |

Project có field (theo sample 1 issue, cần dò kỹ hơn theo issue type — xem R1):

- Cả hai: **EPM, ECM**
- Chỉ Approver: EDM, ETM, MHRM, EIM, EIMQLHD
- Chỉ Tester: CICM, CIC, SSA, HSMCOR, TMSV2
- Không có: EMA, MR, FAC, HRM, phần còn lại

EPM-4091 (mẫu): reporter `trungnt_ba`, Approver/Tester đang trống.
Probe tái dùng được: `scripts/probe-people-fields.ts` (chỉ GET, credential lấy từ DB qua `getSystemJiraAuth()`).

## 2. Thiết kế

### 2.1 Dữ liệu (Prisma)

`IssueCache` thêm 3 cột (nullable, lưu **Jira username** giống `assigneeJira`):

```
reporterJira  String?
approverJira  String?
testerJira    String?
@@index([reporterJira]) @@index([approverJira]) @@index([testerJira])
```

Bảng mới `ProjectPeopleField` — quyết định project nào hiện cột/bộ lọc nào, và cho admin ghi đè id:

```
model ProjectPeopleField {
  projectKey   String
  role         PeopleRole        // reporter | approver | tester
  jiraFieldId  String            // "reporter" | "customfield_10300" | ...
  source       String            // "detected" | "manual"
  detectedAt   DateTime
  @@id([projectKey, role])
}
```

Enum `Role` thêm `lead`.

Migration chỉ **thêm** cột/bảng/enum, không đổi dữ liệu cũ → rollback an toàn.

### 2.2 Dò field khi thêm project mới (trả lời câu "tương lai thêm dự án thì sao")

- Hàm `detectPeopleFields(projectKey)`: lấy 1 issue mỗi issue type → `getEditMeta` → khớp **theo tên** (`Approver`, `Assignee Tester`) → upsert `ProjectPeopleField` (`source=detected`). Reporter luôn ghi sẵn `reporter`.
- Gọi ở hai chỗ: (a) lúc project được thêm vào catalog / bootstrap (`POST /api/projects`), (b) job định kỳ hằng ngày + nút "Dò lại" cho admin.
- Dòng `source=manual` **không bị job ghi đè**.
- Project không có field → board ẩn cột/bộ lọc đó, không lỗi.

### 2.3 Đồng bộ

- `BASE_ISSUE_FIELDS` ([client.ts:28](../src/lib/jira/client.ts#L28)) thêm `reporter`, `customfield_10300`, `customfield_10501`. Id **không** cứng trong logic đọc: `issueCacheData` đọc theo `ProjectPeopleField` của project, mặc định rơi về 2 id trên.
- `issueCacheData` ([cache.ts:25](../src/lib/issues/cache.ts#L25)) map ra 3 cột; lấy `.name` của user object (cùng kiểu với `assignee`).
- Các đường ghi cùng đi qua `issueCacheData`: `poll-jira`, `process-webhook`, `poll-watched-issues`, `live.ts` → chỉ cần sửa một chỗ, nhưng phải kiểm tra từng nơi gọi `getIssue(key, extraFields)` có truyền đủ field.
- **Backfill**: upsert dùng `updatedAt <= incoming` nên re-sync issue không đổi vẫn ghi đè được. Cần một lần sync **full** (poll hiện tại tăng dần theo `updated`) → thêm cờ `full` trong job hoặc script `scripts/backfill-people-fields.ts`, chạy theo từng project, có rate limit (`JIRA_POLL_CONCURRENCY`).

### 2.4 Danh tính người dùng

Jira username có hậu tố `_mb` ở một số tài khoản; đã có `jiraUsernameAliases` ([user-creds.ts:23](../src/lib/user-creds.ts#L23)). Lọc "tôi là Approver/Tester/Reporter" phải dùng đúng alias này như lọc assignee hiện tại. Hiển thị tên: dùng map username → displayName lấy từ bảng `User` + danh sách assignee (pha sau: cache displayName từ chính payload Jira).

### 2.5 API

`GET /api/issues` ([route.ts](../src/app/api/issues/route.ts)):

- Param mới: `reporter`, `approver`, `tester` (nhiều giá trị, hỗ trợ `me` / `unassigned`), `role=assignee|reporter|approver|tester` (bộ lọc "Vai trò của tôi"), `type`, `epic` (hiện **chưa được đọc** dù UI có), `overdue=1`, `dueBefore`.
- Tách helper dựng điều kiện assignee thành hàm dùng chung cho 4 vai trò (tránh nhân bản code).
- Response `IssueItem` thêm: `reporterJira`, `approverJira`, `testerJira`, `dueDate`, `timeSpent`, `originalEstimateSeconds`, `storyPoints` giữ nguyên.
- Epic hiện lọc bằng `extractEpicKey(raw)` quét JSON (chậm). Giải pháp: thêm cột `epicKey String?` + index ngay trong migration này, điền khi sync.

`GET /api/issues/filters`: trả thêm `types`, `fixVersions`, `reporters`, `approvers`, `testers`. Thay việc đọc toàn bộ `raw` bằng `unnest(labels)` / `DISTINCT` qua `$queryRaw`.

`GET /api/projects/[key]/people-fields` (đọc) và `PUT` (admin ghi đè) cho `ProjectPeopleField`.

### 2.6 Phân quyền — role `lead`

- `permissions.ts`: thêm `lead` vào `Role`, `ROLES`, `isKnownRole`; thêm permission `board.team` (xem toàn đội, thao tác hàng loạt trên board). Ma trận: `lead`, `release_manager`, `admin` = có; `member` = không.
- `lead` **không** tự động có quyền release (giữ tách biệt). Cập nhật bảng ma trận trong comment + test.
- `PATCH /api/users/[id]/role` ([route.ts](../src/app/api/users/[id]/role/route.ts)): kiểu `data.role` đang hard-code union 3 giá trị → dùng `Role` chung.
- UI gán role: kiểm tra màn settings/admin hiện có cho đổi role; nếu chưa có thì thêm danh sách user + dropdown role (admin-only).
- Kiểm tra `session.user.role` ở next-auth (`src/types/next-auth.d.ts`, `auth.ts`) có kiểu role cứng không.
- Quyền kiểm ở **server** (route), UI chỉ ẩn nút.

### 2.7 Board

**Bộ lọc** ([issue-filter-bar.tsx](../src/components/issues/issue-filter-bar.tsx), `issue-filters.ts`):

- `IssueFilters` thêm `roles`/`reporters`/`approvers`/`testers`, `types`, `fixVersions`, `overdue`; cập nhật `serialize/parse/count/normalize` (hiện 4 hàm lặp từng facet → refactor thành bảng facet để thêm trường không phải sửa 4 chỗ).
- Bật `status`, `epic` ở board; `label`/`priority` chuyển sang `multi`.
- Bộ lọc **"Vai trò"**: Tôi được giao / Tôi báo cáo / Tôi cần test; riêng leader có thêm **Tôi là Approver** (theo dõi). Ngoài ra lọc được theo tên Approver bất kỳ.
- Ô lọc chỉ hiện khi project đang chọn có field tương ứng (đọc `ProjectPeopleField`).

**Card & quick panel**: badge quá hạn (từ `dueDate`), avatar nhỏ Reporter/Approver/Tester, `timeSpent/estimate`. Quick panel hiện đủ 3 người; pha sau cho sửa Approver/Tester (dùng `searchAssignableUsers` đã có).

**List view**: thêm cột Type, Points, Due, Epic, Fix version, Reporter, Approver, Tester, Created; ẩn/hiện qua menu cột đã có. Mặc định ẩn cột người không áp dụng cho project.

**Chế độ Team** (chỉ hiện với `lead`/`release_manager`/`admin`):

- Công tắc Cá nhân / Team cạnh `SegmentedControl` chế độ xem; Team → assignee mặc định "ALL", nhớ lựa chọn theo project trong `board-storage`.
- **Swimlane theo người**: nhóm hàng theo `assigneeJira`, mỗi hàng thu gọn được, kèm số task/points.
- **Workload strip**: mỗi người một chip (số task đang làm, points, quá hạn); bấm để lọc.
- **Bộ lọc nhanh**: Quá hạn · Chưa assign · Chưa có estimate · Stale 7d+ · Chờ test · Thiếu Approver/Tester (với project có field).
- WIP limit theo người (cấu hình sau); giữ `WIP_LIMIT=8` theo cột như cũ ở pha này.
- Liên kết nhanh sang `/reports/projects/[key]` (Members/Risk) và `/stale`, không viết lại.
- Thao tác hàng loạt trên board (đổi assignee/priority nhiều thẻ) gate bằng `board.team`.

**Hàng đợi "Chờ tôi test"** (chỉ Tester): tab trong `/inbox` hoặc `/stale`, `testerJira = tôi` và status ở nhóm test (`ToDo Test` / `To Do Test` / `READY FOR TEST`). Dùng chung `/api/issues?role=tester`. Approver **không** có hàng đợi.

## 3. Các pha triển khai

| Pha | Nội dung | Phụ thuộc | Rủi ro |
|---|---|---|---|
| **P1** Nền dữ liệu | Migration (3 cột, `epicKey`, `ProjectPeopleField`, role `lead`); `detectPeopleFields`; sửa `BASE_ISSUE_FIELDS` + `issueCacheData`; backfill script; test cache | — | Trung bình (migration + load Jira) |
| **P2** API | Param lọc mới, helper điều kiện người dùng chung, response mới, `filters` bằng SQL distinct, endpoint people-fields | P1 | Thấp |
| **P3** Role | `lead` trong permissions + route role + UI gán role + test | P1 | Thấp |
| **P4** Board cho mọi người | Lọc status/epic/type/fixVersion/multi, bộ lọc Vai trò, due badge, cột list, avatar người | P2 | Thấp |
| **P5** Chế độ Team | Công tắc, swimlane, workload, lọc nhanh, gate `board.team` | P3, P4 | Trung bình (UI lớn) |
| **P6** Hàng đợi + ghi ngược | "Chờ tôi test"; sửa Approver/Tester từ quick panel | P4 | Thấp–TB |

Mỗi pha là một PR độc lập, merge được riêng. P1+P2 chưa đổi UI nên deploy an toàn.

## 4. Kiểm thử

- Unit: `issueCacheData` với user object / null / thiếu field; `detectPeopleFields` (khớp tên, không ghi đè `manual`); helper điều kiện người dùng (me, alias `_mb`, unassigned); `permissions` ma trận cho `lead`; `issue-filters` serialize/parse vòng khứ hồi với facet mới.
- Route test: `/api/issues` với `role`, `approver`, `epic`, `overdue`; `/api/users/[id]/role` nhận `lead`, từ chối non-admin.
- Cập nhật test `create-validator` / `create-ops` đang giả định Assignee Tester là multi-user.
- Chạy `npm run typecheck`, `lint`, `test`, `build`.
- Thủ công (cả sáng/tối, ≥4.5:1): board Cá nhân vs Team trên EPM (có cả hai field), MHRM (chỉ Approver), MR (không có field); thêm một project mới và xác nhận tự dò; leader gán role xong thấy công tắc Team, member thì không.

## 5. Rủi ro & câu hỏi mở

- **R1** editmeta theo issue type: sample một issue có thể thiếu field của loại khác → dò mỗi issue type, lấy hợp.
- **R2** Backfill kéo toàn bộ issue: chạy ngoài giờ cao điểm, từng project, theo dõi rate limit Jira.
- **R3** Username không khớp `User.jiraUsername` (hậu tố `_mb`, hoa/thường): dùng `jiraUsernameAliases` nhất quán; thêm log đếm số username không map được.
- **R4** Hiệu năng `/api/issues/filters` và `epic`: xử lý bằng `epicKey` + SQL distinct (mục 2.5) trước khi bật thêm facet.
- **R5** `lead` chưa gắn với project cụ thể: ở pha này là role toàn hệ thống. Nếu cần "lead của project X" thì thêm bảng `ProjectLead` sau.
- **Hỏi:** (a) Có cần `lead` chỉ thấy project mình phụ trách không? (b) Ghi ngược Approver/Tester lên Jira có nằm trong phạm vi không?

## 6. Việc dọn kèm theo (ngoài phạm vi feature)

- `scripts/backfill-done-at.mjs` đang commit khóa mã hóa, token đã mã hóa và chuỗi kết nối DB → xoay khóa/token, chuyển sang biến môi trường.
