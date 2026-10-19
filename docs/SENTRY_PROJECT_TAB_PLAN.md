# Plan: chuyển Sentry ra tab "Lỗi Sentry", xem theo dự án, task tạo bằng tài khoản của người bấm

## Quyết định đã chốt

| Câu hỏi | Lựa chọn |
|---|---|
| Ai được thao tác | Ai chọn dự án đó đều được xem, tạo task, từ chối và mở lại |
| Duyệt hàng loạt | Đi qua bulk-create bằng token Jira của user (không còn "approve → worker") |
| Trang `/admin/sentry` | Gỡ hẳn, admin dùng tab mới (có thêm tab "Bỏ qua" và retry) |
| Vị trí và assignee | Mục menu chính riêng "Lỗi Sentry" (`/sentry`); reporter = người tạo; mặc định không gán assignee |

## Kết quả cần đạt

- Thêm mục menu chính **"Lỗi Sentry"** ở `/sentry`, có tab dự án giống Board. Mỗi user chỉ thấy lỗi của các dự án mình đã chọn.
- Ai chọn dự án đó đều được xem, tạo task, từ chối và mở lại.
- **Mọi task tạo từ UI đều dùng token Jira của người bấm**, nên reporter là người đó. Mặc định không gán assignee, người tạo tự chọn trong form.
- Gỡ hẳn trang `/admin/sentry`. Admin dùng tab mới, thấy mọi dự án, có thêm tab "Bỏ qua" và nút retry.

## Hiện trạng

- Trang Sentry ở `/admin/sentry`, mọi API `/api/admin/sentry-import/*` chỉ cho admin.
- Có 2 cách tạo task:
  1. **Duyệt (kể cả hàng loạt)** → worker `sentry-import` tạo bằng token Jira của bot/server, nên reporter là bot.
  2. **Form tạo 1 task** (`/[id]/create`) → tạo bằng token Jira của admin, nên reporter là admin.
- Mỗi lỗi Sentry đã có `targetProject` (project Jira), nên lọc theo dự án được ngay, **không cần migration**.

## Lưu ý trước khi làm

1. **"Dự án đã chọn" là `User.boardProjects`.** Nếu user chưa chọn gì thì được thấy **tất cả** dự án đang active (theo `resolveUserProjectScope`). Board cũng cho user tự thêm bất kỳ key nào. Vì vậy thực tế là ai cũng xem được lỗi của mọi dự án, chỉ cần thêm dự án đó vào Board. Đây là hệ quả của lựa chọn "ai chọn dự án đều làm được". Nếu muốn chặt hơn thì phải lọc theo `ProjectMember`.
2. **Bot vẫn tạo task trong 2 trường hợp:**
   - Chế độ tự duyệt (`SENTRY_IMPORT_REQUIRE_APPROVAL=false`).
   - Các row `approved` hoặc `failed` còn sót lại, do worker `sentry-import` tạo.

   UI mới **bỏ hành động "approve → worker"**. Không cần migration DB.

## Bước 0: đọc tài liệu trước khi code

- Đọc `node_modules/next/dist/docs/` để nắm quy ước route và page của phiên bản Next này.
- Đọc `design-system/team-task-web/MASTER.md` để làm UI đúng design system.

## Bước 1: kiểm tra quyền theo dự án (rủi ro bảo mật lớn nhất)

- Thêm `src/lib/sentry/scope.ts`:
  - `sentryScopeFor(session)`: trả về `{ all: true }` cho admin, `{ projects: allowedProjects }` cho user thường (lấy từ `resolveUserProjectScope`).
  - `assertSentryRowAccess(rowId, scope)`: load row, trả 404 nếu `targetProject` nằm ngoài scope. Trả 404 thay vì 403 để không lộ là id có tồn tại.
- `listSentryImports(state, scope, projectKey?)` (chuyển từ `src/lib/admin/sentry.ts` sang `src/lib/sentry/list.ts`):
  - Lọc `targetProject IN scope`, và lọc thêm theo tab dự án nếu có.
  - **Lọc cả `groupBy` counts theo scope.** Hiện counts tính trên toàn bộ dữ liệu.
  - User thường không thấy state `ignored`.
- Row có `targetProject = null` (dữ liệu cũ): tính target thực tế bằng `resolveJiraProject` khi lọc. Nếu vẫn ra null thì chỉ admin thấy.
- **Mọi endpoint đều phải gọi `assertSentryRowAccess`**, không chỉ endpoint list. Gồm create, ai-summary, reject và reopen.

## Bước 2: API mới ở `/api/sentry/*`, dành cho user đã đăng nhập

| Route | Thay cho | Ghi chú |
|---|---|---|
| `GET /api/sentry?state=&project=` | `GET /api/admin/sentry-import` | Đã lọc theo scope |
| `POST /api/sentry/review` | `/api/admin/sentry-import/review` | Chỉ còn `reject` và `reopen`, kiểm tra scope từng id |
| `POST /api/sentry/[id]/create` | `/api/admin/sentry-import/[id]/create` | Giữ logic hiện tại, thêm check scope |
| `POST /api/sentry/[id]/ai-summary` | `/api/admin/sentry-import/[id]/ai-summary` | Thêm check scope |
| `POST /api/sentry/bulk-create` | (mới) | Xem Bước 3 |
| `POST /api/sentry/retry` | `POST /api/admin/sentry-import` | **Chỉ admin** |

- Xóa thư mục `src/app/api/admin/sentry-import/` và chuyển test sang route mới.
- Sửa comment ở `src/app/api/bulk/create/route.ts:12` cho trỏ tới route mới.
- Khi user chưa có token Jira, `jiraCredentialsRequired()` trả lỗi. UI phải hiện thông báo kèm link sang Cài đặt. User thường sẽ gặp trường hợp này nhiều hơn admin trước đây.

## Bước 3: tạo nhiều task trong một bulk op, bằng token của user

Pipeline hiện tại giả định **mỗi op chỉ có 1 row Sentry**. Có 4 chỗ phải sửa:

1. **`BulkCreateSource`** (`src/lib/bulk/create-types.ts:66`):
   - Thêm dạng mới `{ type: "sentry", sentryImportIds: string[] }`, mỗi item có `clientRef = "sentry-<rowId>"`.
   - Vẫn đọc được dạng cũ `sentryImportId` cho các op đang nằm trong queue lúc deploy.
   - Sửa validator ở `src/lib/bulk/create-validator.ts:150`.
   - Thêm helper `sentryImportIdsOfPayload()` trả về mảng id, đọc được cả hai dạng.
2. **`hasInflightSentryOp`** (`src/lib/sentry/create-from-form.ts`): tìm theo JSON path cũ `source.sentryImportId` **hoặc** `source.sentryImportIds array_contains id`.
3. **`confirmSentryCreate`**: khóa **tất cả** row bằng `FOR UPDATE` theo thứ tự id đã sort, để hai user không deadlock nhau. Kiểm tra từng row còn ở state open và không có op nào đang chạy cho nó.
4. **Lúc chạy op** (`src/lib/bulk/create-execution.ts:208`):
   - `sentryRowTakenElsewhere` hiện hủy **cả op** khi row đã được tạo ở luồng khác. Sửa lại để chỉ fail **item đó** (`SENTRY_ALREADY_FILED`), các item khác vẫn chạy. Op chỉ có 1 row thì kết quả vẫn như cũ.
   - `markSentryRowFromBulkOp` (`src/lib/sentry/bulk-completion.ts`): ghép từng item với row qua `clientRef` rồi cập nhật `created`/`jiraKey` hoặc `lastError` cho từng row.

Route `bulk-create`:

- **Preview:** nhận `ids[]` (tối đa ~50), kiểm tra scope, dựng các dòng từ `buildSentryTaskDraft` + `draftSummary`/`draftDescription`. Mỗi lần chỉ một `targetProject`, không cần chặn riêng vì UI đã chia theo tab dự án. Sau đó gọi `previewBulkCreate`.
- **Confirm:** gọi `confirmSentryCreate` (bản nhiều row), rồi `enqueueBulkOperation`.

Test cần viết: payload dạng cũ, 1 row đã bị tạo ở luồng khác giữa chừng, hai user confirm cùng lúc.

## Bước 4: UI `/sentry`

- Chuyển các component trong `src/app/(app)/admin/sentry/*` sang `src/app/(app)/sentry/*`: row, filter tabs, AI summary, approve dialog (đổi tên thành create dialog), bulk bar.
- **Tab dự án:** lấy cùng nguồn dữ liệu với `BoardProjectTabs` để danh sách tab khớp đúng với Board. Có thêm tab "Tất cả".
- **Bulk bar:**
  - "Tạo task (N)": mở dialog preview rồi confirm.
  - "Từ chối".
  - Bỏ nút "Duyệt".
- **Admin có thêm:** filter "Bỏ qua" (`ignored`), nút "Thử lại" trên row `failed`.
- Query keys: thêm `sentryKeys.list(state, project)` và đổi chỗ invalidate ở `src/components/task-create/use-single-task-create.ts:136`.
- Menu: thêm `{ href: "/sentry", label: "Lỗi Sentry", icon: Bug }` vào `src/app/(app)/app-shell.tsx`. Badge đếm số lỗi chờ xử lý trong scope là tùy chọn.
- `page.tsx`: prefetch có truyền scope của session.
- Theo AGENTS.md: dùng Skeleton khi loading, empty state có icon kèm hint, chạy đúng ở cả light/dark, có `cursor-pointer`.

## Bước 5: gỡ trang admin

- Xóa `src/app/(app)/admin/sentry/`.
- Bỏ mục menu và prefetch Sentry trong `src/app/(app)/admin/admin-nav.tsx:15` và `src/app/(app)/admin/layout.tsx:32`.
- `src/app/(app)/admin/overview/error-sheet.tsx:87` (danh sách failed và retry ở trang tổng quan): trỏ sang `GET /api/sentry?state=failed` và `POST /api/sentry/retry`.
- Rà link notification, nếu còn chỗ nào trỏ `/admin/sentry` thì đổi thành `/sentry`.
- Xóa `adminKeys.sentry*` và sửa `src/lib/query-keys.test.ts`.

## Bước 6: kiểm tra

- Chạy `tsc`, `eslint` và các test vitest liên quan đến sentry, bulk và query-keys.
- Test tay:
  - User A chỉ chọn EPM thì không thấy lỗi MHRM, và gọi API với id của MHRM thì nhận 404.
  - Tạo 1 task và nhiều task: trên Jira, reporter là user A.
  - User chưa có token Jira thấy thông báo kèm link sang Cài đặt.
  - Admin thấy tab "Bỏ qua" và retry được.

## Thứ tự commit

1. Scope và list (có test).
2. Bulk nhiều row ở backend (có test).
3. API `/api/sentry/*`.
4. UI `/sentry` và menu.
5. Gỡ trang và route admin.

Mỗi bước chạy được độc lập, nên review từng bước được.
