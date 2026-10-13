# Role Leader theo project + cảnh báo "merge không phải leader" — kế hoạch chi tiết

> Tạo: 2026-10-13 · Trạng thái: **đã triển khai hoàn tất** (Phần A & Phần B đã hoàn thành và có test coverage).

## 0. Mục tiêu

Khi một PR được **merge bởi người không phải leader của project**, hệ thống gửi thông báo cho **leader của project đó**.

Việc này gồm 2 phần, làm theo thứ tự:

1. **Phần A — Chia role:** có khái niệm "leader của từng project" (hiện chưa có).
2. **Phần B — Thông báo merge:** webhook Bitbucket nhận `pr:merged`, xác định người merge và project, nếu người merge không phải leader thì báo leader.

Không làm trong kế hoạch này: chặn merge (việc đó phải cấu hình *merge check / branch permission* bên Bitbucket, bot chỉ **báo**, không ngăn được), tự revert, ghi ngược gì lên Jira.

## 1. Hiện trạng (đã đọc code)

### 1.1 Role hiện có là role **toàn hệ thống**, không theo project

- `enum Role { member, lead, release_manager, admin }` trên `User.role` ([schema.prisma](../prisma/schema.prisma)).
- Admin gán tay ở Settings ([settings-client.tsx](../src/app/(app)/settings/settings-client.tsx)).
- `lead` hiện chỉ có 2 tác dụng thật: nằm trong `DEFAULT_BROADCAST_ROLES` ([notify/policy.ts](../src/lib/notify/policy.ts)) để nhận thông báo broadcast. Ở [permissions.ts](../src/lib/permissions.ts) mọi quyền `release.*`, `branch.*`, `board.team` đều trả `true` cho mọi user đăng nhập, nên `lead` không phân biệt gì về quyền.
- Vì vậy **không thể dùng `Role.lead` để biết "ai là leader của project X"**: một user `lead` sẽ là leader của mọi project, và không có chỗ gán leader riêng cho từng project.

### 1.2 Webhook Bitbucket hiện không đọc người thực hiện

- [bitbucket.ts](../src/lib/queue/workers/webhooks/bitbucket.ts) chỉ xử lý comment (PR/commit) có thông báo; mọi event PR khác (kể cả `pr:merged`) chỉ upsert `BranchInfo` (`prState`, `merged`), **không đọc `actor`** và không gửi thông báo.
- Type payload trong worker chưa có trường `actor`.

### 1.3 Hạ tầng tái dùng được

| Cần | Đã có | Vị trí |
|---|---|---|
| So khớp user Bitbucket ↔ user nội bộ | `isSameUser`, `userMatchesCandidates`, `isUserAuthor` | [branch-notification-policy.ts](../src/lib/bitbucket/branch-notification-policy.ts) |
| Tìm Jira key từ PR (tên nhánh, tiêu đề PR, BranchInfo) | `discoverPrJiraKeys` | [branch-recipient-resolver.ts](../src/lib/bitbucket/branch-recipient-resolver.ts) |
| Gửi thông báo nhiều người, nuốt lỗi từng người | `deliverBranchNotifications` | [branch-notification-delivery.ts](../src/lib/bitbucket/branch-notification-delivery.ts) |
| Dedupe theo event | `eventKey` trong `notifyUser` (dedupe theo `userId + type + eventKey`) | [notify/index.ts](../src/lib/notify/index.ts) |
| Webhook idempotency | `bbExternalId` = `eventKey:repo:pr-<id>-<state>` | [api/webhooks/bitbucket/route.ts](../src/app/api/webhooks/bitbucket/route.ts) |
| Danh sách project | `JiraProject` | schema |

## 2. Phần A — Chia role

### 2.1 Quyết định thiết kế: thêm bảng role **theo project**, giữ nguyên `Role` toàn hệ thống

Không đổi ý nghĩa `Role` hiện tại (tránh ảnh hưởng broadcast, auth, chat identity). Thêm lớp role mới, theo project:

```prisma
enum ProjectRole {
  leader
  member   // dự phòng, cho phép mở rộng sau; bước đầu chỉ dùng leader
}

model ProjectMember {
  projectKey String
  userId     String
  role       ProjectRole @default(leader)
  assignedById String?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([projectKey, userId])
  @@index([projectKey, role])
  @@index([userId])
}
```

- `projectKey` là Jira project key (khớp `JiraProject.key`, `IssueCache.projectKey`). Không dùng FK cứng vì project có thể bị deactivate; kiểm tra tồn tại ở tầng API.
- Một project có **nhiều leader** được; một user là leader của **nhiều project** được.
- Migration chỉ **thêm** enum + bảng, không sửa dữ liệu cũ → rollback an toàn. Tên migration theo mẫu hiện có: `20261013xxxxxx_project_member_roles`.

### 2.2 Service

`src/lib/projects/roles.ts` (mới):

- `getProjectLeaders(projectKey): Promise<User[]>`
- `isProjectLeader(projectKey, userId): Promise<boolean>`
- `setProjectLeaders(projectKey, userIds, actorId)` — thay toàn bộ danh sách trong 1 transaction.
- `listProjectsLedBy(userId)` (dùng cho UI "project tôi là leader").

Có test đơn vị (Vitest, theo kiểu các `*.test.ts` hiện có).

### 2.3 API

- `GET /api/projects/[key]/members` — mọi user đăng nhập xem được.
- `PUT /api/projects/[key]/members` — body `{ leaderUserIds: string[] }`. **Chỉ admin** (thêm permission `project.roles.manage` vào [permissions.ts](../src/lib/permissions.ts), cùng nhóm với `admin.users`).
- Ghi `AuditLog` (bảng đã có, action ví dụ `project.leader.set`) mỗi lần đổi.
- Test route: 401 chưa đăng nhập, 403 không phải admin, 400 user không tồn tại / project không tồn tại, thành công.

### 2.4 UI

Trong Settings (khu admin đã có quản lý user): thêm khối **"Leader theo project"**.

- Danh sách project, mỗi dòng có multi-select user để chọn leader.
- Theo convention của repo: dùng `Skeleton` khi tải, empty state có icon + tiêu đề + gợi ý, token màu semantic, hỗ trợ light/dark (đọc `design-system/team-task-web/MASTER.md` trước khi làm).
- Người không phải admin: chỉ xem (hoặc ẩn).

### 2.5 Điều kiện hoàn thành phần A

- Admin gán/gỡ leader cho project được và lưu bền.
- `isProjectLeader` đúng cho 1 leader / nhiều leader / không có leader.
- Chưa có hành vi nào thay đổi ở webhook (phần B mới dùng).

## 3. Phần B — Thông báo "merge không phải leader"

### 3.1 Luồng xử lý

```
Bitbucket pr:merged
   └─ route.ts (verify chữ ký, lưu event, enqueue)         [không đổi]
       └─ worker bitbucket.ts
            ├─ đọc actor (người bấm merge) + pullRequest
            ├─ xác định projectKey (mục 3.2)
            ├─ lấy leaders của project (Phần A)
            ├─ actor là leader?  → dừng, không báo
            ├─ không có leader nào được cấu hình? → bỏ qua + log (mục 3.5)
            └─ báo cho từng leader (trừ chính actor)
```

Chỉ nhánh `eventKey === "pr:merged"` mới chạy logic này. Các event khác giữ nguyên hành vi cũ.

### 3.2 Xác định project của PR

Bitbucket project key (`PROJ` trong `PROJ/slug`) **không** trùng Jira project key, nên không dùng trực tiếp. Thứ tự:

1. `discoverPrJiraKeys(repo, pr)` (tên nhánh, tiêu đề PR, BranchInfo) → lấy tiền tố project của Jira key (`EPM-123` → `EPM`).
2. Nếu có nhiều key khác project → coi là nhiều project, kiểm tra từng project (mỗi project báo leader của nó).
3. Nếu không tìm được key nào → bỏ qua, ghi log `reason: "no jira project"` (không báo bừa). Phương án mở rộng ở câu hỏi 8.2: bảng ánh xạ repo → project.

### 3.3 Xác định "người merge" và "có phải leader không"

- Lấy từ `actor` trong payload `pr:merged`. **Cần xác nhận bằng payload thật** trước khi code (tôi chưa thấy payload thật trong repo): dựa vào bảng event đã lưu qua `ingestEvent` để xem một `pr:merged` thực tế, hoặc dùng `diagnostics`.
- Nếu payload thiếu `actor`: fallback gọi `listPullRequestActivities` và lấy activity `MERGED` (helper này đã có, dùng trong `resolvePrCommentThread`). Vẫn không ra → bỏ qua + log.
- So khớp actor với user nội bộ bằng `isSameUser` / `userMatchesCandidates` (theo `jiraUsername` alias và email), rồi `isProjectLeader`. Actor không khớp được user nội bộ nào (ví dụ tài khoản bot, người ngoài hệ thống) → **vẫn coi là "không phải leader"** và báo, vì đúng tinh thần cảnh báo; nội dung ghi tên Bitbucket của actor.

### 3.4 Nội dung thông báo

Thêm hàm `formatUnauthorizedMergeNotification` cạnh các hàm format hiện có trong `branch-notification-policy.ts`:

- `type`: thêm `NotifyType` mới **`"pr"`** (không dùng `"system"` vì mặc định bị tắt, không dùng `"comment"` vì sai nghĩa và sẽ bị user đã tắt comment làm mất cảnh báo). `DEFAULT_DISABLED_NOTIFICATION_TYPES` chỉ gồm `ai`, `system` nên `pr` mặc định bật.
- `severity`: `"warning"`.
- Tiêu đề: `PR #<id> vừa được merge bởi <tên actor> (không phải leader) — <repo>`.
- Nội dung: `<tiêu đề PR>: <nhánh nguồn> → <nhánh đích>`, kèm Jira key nếu có.
- `link`: `pr.url`, fallback `/branches?q=<branch>` như comment PR.
- `eventKey`: `bb-pr-merged-nonleader:<repo>:<prId>` → mỗi leader chỉ nhận **1 lần** cho mỗi PR dù webhook bị gửi lại.
- `chatDigestGroup`: **không đặt** ở bước đầu (cảnh báo nên đến ngay, không gộp batch Discord). Nếu sau này nhiều quá thì mới gộp.

Việc gửi dùng nguyên `deliverBranchNotifications` (nuốt lỗi từng người).

### 3.5 Các trường hợp biên

| Trường hợp | Hành vi |
|---|---|
| Người merge **là leader** | Không báo |
| Project chưa có leader nào | Không báo, log `no leaders configured`; admin thấy ở Settings (có thể thêm cờ cảnh báo "project chưa có leader") |
| Leader tự merge PR của chính mình | Không báo (là leader) |
| Người merge không phải leader nhưng **cũng là chính leader nhận** | Loại khỏi danh sách nhận (không tự báo mình) |
| PR chỉ liên quan project không có Jira key | Bỏ qua + log |
| Webhook gửi lại / event trùng | `eventKey` + dedupe của `ingestEvent` chặn trùng |
| `pr:merged` đến trước khi user nội bộ được liên kết | Vẫn báo, hiển thị tên Bitbucket của actor |
| Merge bởi tài khoản bot / auto-merge | Mặc định coi là không phải leader → báo. Có thể cần danh sách ngoại lệ (câu hỏi 8.3) |
| Nhánh đích không quan trọng (feature → feature) | Mặc định báo mọi merge; có thể giới hạn theo nhánh đích (câu hỏi 8.4) |

### 3.6 File dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `prisma/schema.prisma` + migration mới | Enum `ProjectRole`, bảng `ProjectMember` |
| `src/lib/projects/roles.ts` (+ test) | Service leader |
| `src/app/api/projects/[key]/members/route.ts` (+ test) | API GET/PUT |
| `src/lib/permissions.ts` | Permission `project.roles.manage` |
| `src/app/(app)/settings/...` | UI gán leader |
| `src/lib/notify/index.ts` | `NotifyType` thêm `"pr"` (kiểm tra mọi chỗ `switch`/map theo type, ví dụ cấu hình preference, push, chat) |
| `src/lib/bitbucket/branch-notification-policy.ts` (+ test) | `formatUnauthorizedMergeNotification` |
| `src/lib/bitbucket/notify-pr-merged.ts` (mới, + test) | `notifyUnauthorizedMerge` (giống `notify-pr-comment.ts`) |
| `src/lib/queue/workers/webhooks/bitbucket.ts` (+ test) | Thêm `actor` vào type, nhánh `pr:merged` gọi notifier |
| `docs/WEBHOOK_SETUP.md` | Ghi rõ event **Pull request: Merged** phải được tick (hiện đã hướng dẫn tick toàn bộ) và mô tả cảnh báo mới |

Không động tới các vùng bảo vệ của AutoImprove trừ khi bạn duyệt: `AGENTS.md`, dependency manifests, env, deployment, và **migration Prisma** (migration ở đây là thay đổi cần bạn duyệt trước khi áp dụng).

## 4. Kiểm thử

- **Unit:** `isProjectLeader`; `formatUnauthorizedMergeNotification` (tiêu đề, `eventKey`, link fallback); `notifyUnauthorizedMerge` với các case: actor là leader (0 báo), actor không phải leader (báo mọi leader), không có leader (0 báo), actor trùng người nhận (loại ra), nhiều project.
- **Worker:** `bitbucket.ts` với payload `pr:merged` giả lập (có `actor`, thiếu `actor` → fallback activities, repo thiếu → skip); đảm bảo nhánh comment cũ không bị ảnh hưởng (test hiện có phải vẫn xanh).
- **API:** như mục 2.3.
- **Thủ công (theo [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md) mục 4):** ký HMAC và POST payload `pr:merged` giả lập vào `/api/webhooks/bitbucket`, kiểm tra thông báo xuất hiện ở leader và **không** xuất hiện khi actor là leader.
- Chạy `lint`, `typecheck`, `test` đầy đủ trước khi coi là xong.

## 5. Thứ tự triển khai (đề xuất, mỗi bước là 1 commit riêng)

1. Xác nhận cấu trúc payload `pr:merged` thật (đặc biệt `actor`) — không cần code.
2. Schema + migration `ProjectMember` (chờ duyệt trước khi áp dụng migration).
3. Service `roles.ts` + test.
4. API members + permission + test.
5. UI Settings gán leader.
6. `NotifyType "pr"` + hàm format + notifier + test.
7. Nối vào worker `bitbucket.ts` + test.
8. Cập nhật tài liệu, chạy thử thủ công.

Bước 2–5 (Phần A) có thể merge độc lập, an toàn vì chưa đổi hành vi nào. Bước 6–7 chỉ bật tính năng khi đã có dữ liệu leader.

## 6. Rủi ro

| # | Rủi ro | Giảm thiểu |
|---|---|---|
| R1 | Payload `pr:merged` không có `actor` ở phiên bản Bitbucket DC đang dùng | Xác nhận ở bước 1; fallback activities |
| R2 | Không suy ra được project từ PR (nhánh/tiêu đề không có Jira key) → bỏ sót cảnh báo | Log rõ lý do; cân nhắc bảng ánh xạ repo → project (8.2) |
| R3 | So khớp user Bitbucket ↔ nội bộ sai (username khác nhau) → báo nhầm leader là "không phải leader" | Dùng `isSameUser` (alias + email) đã được kiểm chứng; thêm test; leader nên liên kết tài khoản Bitbucket |
| R4 | Spam khi project có nhiều người merge hợp lệ | Phạm vi nhánh đích (8.4), danh sách ngoại lệ (8.3) |
| R5 | Thêm `NotifyType` mới làm hỏng chỗ switch/preference/push | Rà soát mọi chỗ dùng `NotifyType` khi làm bước 6; typecheck bắt được phần lớn |
| R6 | Bot chỉ báo chứ không ngăn merge, người dùng hiểu nhầm là có kiểm soát | Ghi rõ trong tài liệu; muốn chặn thật thì bật merge check bên Bitbucket |

## 6.1 Rollback

Phần B tắt được bằng cách gỡ nhánh gọi notifier trong worker (hoặc thêm cờ env `PR_MERGE_ALERT_ENABLED`). Phần A chỉ thêm bảng, để nguyên không ảnh hưởng gì.

## 8. Câu hỏi cần bạn quyết định trước khi code

1. **Ai được gán leader?** Mặc định kế hoạch: chỉ **admin**. Có muốn leader hiện tại được phép tự thêm leader khác không?
2. **Cách xác định project của PR:** chỉ dựa vào Jira key trong tên nhánh/tiêu đề PR (mặc định), hay thêm bảng ánh xạ `repo → project` cho các repo không đặt tên nhánh theo Jira key?
3. **Ngoại lệ:** có tài khoản/nhóm nào được phép merge mà không bị báo (bot, release manager, admin)? Mặc định: **chỉ leader** được miễn, kể cả admin.
4. **Phạm vi nhánh:** báo mọi merge, hay chỉ khi merge vào nhánh quan trọng (`main`, `master`, `release/*`, `develop`)? Khuyến nghị: chỉ nhánh quan trọng, cấu hình được, để tránh spam.
5. **Project chưa có leader:** chỉ log (mặc định), hay fallback báo cho admin?
6. **Role `lead` toàn hệ thống hiện có:** giữ nguyên (mặc định), hay muốn dọn/đổi nghĩa sau khi có role theo project?
