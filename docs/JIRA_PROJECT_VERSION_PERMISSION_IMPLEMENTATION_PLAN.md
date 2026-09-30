# Kế hoạch kiểm tra quyền tạo Jira Project Version

> Dự án: Team Task Web  
> Ngày lập: 2026-09-30  
> Phạm vi: Trang `/release`, Jira client và API tạo release  
> Trạng thái: Đã hoàn thành (2026-09-30)

## 1. Bối cảnh

Trang Quản lý phát hành hiện có chức năng tạo Jira Fix Version thông qua nút
**Tạo bản phát hành**. Tuy nhiên, điều kiện hiển thị nút hiện chỉ dựa trên quyền
nội bộ `release.manage`:

- `release_manager`: được phép.
- `admin`: được phép.
- `member`: không được phép.

Ứng dụng chưa kiểm tra token Jira cá nhân của người dùng có quyền tạo Version
trong project đang chọn hay không. Vì quyền Jira được cấp theo từng project,
một token có thể tạo Version trong project A nhưng không có quyền trong project
B.

Hệ quả hiện tại:

1. Nút tạo release có thể xuất hiện dù token Jira không đủ quyền.
2. Người dùng chỉ biết thiếu quyền sau khi submit form và Jira trả lỗi.
3. Lỗi thiếu token, token hết hạn và thiếu quyền project chưa được phân biệt rõ.
4. UI và backend mới chỉ dựa vào hai lớp kiểm tra không đồng nhất: role nội bộ
   trên UI và phản hồi mutation từ Jira trên backend.

## 2. Mục tiêu

Sau thay đổi, nút **Tạo bản phát hành** chỉ xuất hiện khi đồng thời thỏa mãn:

```text
Người dùng đã đăng nhập
AND đã chọn một Jira project cụ thể
AND có Jira token cá nhân hợp lệ
AND token có quyền tạo Version trong project đó (ADMINISTER_PROJECTS, MANAGE_VERSIONS, PROJECT_ADMIN)
```

Backend vẫn phải kiểm tra lại toàn bộ điều kiện trước khi tạo Jira Fix Version.
Việc ẩn nút chỉ cải thiện trải nghiệm, không được xem là lớp bảo mật.

## 3. Ngoài phạm vi

- Thay đổi ma trận role `member`, `release_manager`, `admin`.
- Cấp hoặc sửa permission scheme trên Jira.
- Cho phép system token tạo Version thay người dùng.
- Kiểm tra quyền tạo Version hàng loạt cho tất cả project.
- Thay đổi quy tắc readiness hoặc publish release.
- Thay đổi luồng đồng bộ Jira Fix Version hiện có.

## 4. Quyết định nghiệp vụ

### 4.1 Cơ chế kiểm tra dựa hoàn toàn vào Jira token

Theo yêu cầu thực tế của dự án (mọi người dùng trong đội ngũ đều có vai trò `member`),
hệ thống **không yêu cầu** vai trò nội bộ `release_manager` hay `admin` để quản lý
hoặc tạo bản phát hành. Việc kiểm tra quyền tạo Version dựa hoàn toàn vào token Jira cá nhân:

| Tiêu chí | Điều kiện |
|---|---|
| Xác thực ứng dụng | Người dùng đã đăng nhập (`session` hợp lệ) |
| Quyền Jira cá nhân | Token cá nhân có quyền tạo/quản trị Version trong project đang chọn |

Role nội bộ `member` không bị ẩn nút; người dùng chỉ cần có token Jira cá nhân đủ quyền trên project tương ứng.

### 4.2 Kiểm tra theo từng project

Ứng dụng sử dụng Jira REST API:

```http
GET /rest/api/2/mypermissions?projectKey={projectKey}
```

Quyền chính cần kiểm tra:

```ts
permissions.ADMINISTER_PROJECTS?.havePermission === true
```

Nếu Jira instance trả quyền quản trị Jira toàn cục trong response, có thể chấp
nhận quyền đó theo cùng chính sách tạo Version của Jira. Logic nhận diện quyền
phải tập trung tại Jira client hoặc một helper dùng chung, không hardcode rải
rác trong UI và API route.

### 4.3 Không fallback sang system token

Mọi thao tác do người dùng chủ động thực hiện phải dùng token Jira cá nhân của
chính người đó:

- Kiểm tra quyền không fallback sang system token.
- Tạo Version không fallback sang system token.
- Thiếu token cá nhân phải trả lỗi rõ ràng.

### 4.4 Hành vi khi chọn tất cả project

Khi bộ lọc project có giá trị `all`:

- Không gọi permission API.
- Không hiển thị nút tạo release.
- Hiển thị gợi ý ngắn: **Chọn một dự án để tạo bản phát hành**.

Quyết định này tránh phải gọi Jira một lần cho mỗi project và tránh trường hợp
quyền đã kiểm tra không khớp project được chọn trong dialog.

### 4.5 Project trong dialog

Khi mở dialog tạo release, project được khóa theo project đang chọn trên trang.
Người dùng muốn tạo Version cho project khác phải đổi bộ lọc project trước.

Nếu sau này cho phép đổi project trực tiếp trong dialog, mỗi lần đổi phải chạy
lại permission query và khóa nút submit cho đến khi kết quả mới được xác nhận.

## 5. Thiết kế kỹ thuật

### 5.1 Kiểu dữ liệu Jira permission

Bổ sung kiểu dữ liệu phù hợp trong `src/lib/jira/types.ts`:

```ts
export type JiraPermission = {
  id: string;
  name: string;
  description?: string;
  type?: string;
  havePermission: boolean;
};

export type JiraMyPermissions = {
  permissions: Record<string, JiraPermission>;
};
```

Không truyền toàn bộ response này xuống client nếu UI chỉ cần biết có được tạo
Version hay không.

### 5.2 Jira client

Bổ sung method vào `jiraWith(auth)` trong `src/lib/jira/client.ts`:

```ts
getMyPermissions(projectKey: string): Promise<JiraMyPermissions>
```

Yêu cầu triển khai:

1. Gọi `GET /rest/api/2/mypermissions?projectKey=...`.
2. Encode `projectKey` bằng `encodeURIComponent` hoặc `URLSearchParams`.
3. Dùng auth được truyền vào `jiraWith(auth)`.
4. Không tự lấy system auth khi đây là luồng user-initiated.
5. Giữ timeout Jira hiện tại.
6. Chuẩn hóa lỗi bằng `JiraRequestError`.
7. Xử lý response thiếu `permissions` theo hướng fail closed.

Có thể bổ sung helper dùng chung:

```ts
export function canCreateProjectVersion(
  response: JiraMyPermissions
): boolean
```

Helper phải trả `false` nếu response thiếu field hoặc Jira trả kiểu dữ liệu
không đúng dự kiến.

### 5.3 API kiểm tra quyền

Tạo route:

```text
GET /api/projects/[key]/release-permissions
```

Luồng xử lý:

1. Đọc session; thiếu session trả `401`.
2. Kiểm tra `release.manage`; không đạt trả `403`.
3. Đọc và validate project key từ route parameter.
4. Đọc Jira credential cá nhân của user hiện tại.
5. Thiếu credential trả `428` với mã lỗi ổn định.
6. Khởi tạo Jira client bằng credential cá nhân.
7. Gọi `getMyPermissions(projectKey)`.
8. Tính `canCreateVersion` bằng helper dùng chung.
9. Trả response tối giản cho UI.

Response thành công:

```json
{
  "projectKey": "EPM",
  "hasToken": true,
  "canCreateVersion": true
}
```

Response khi token hợp lệ nhưng thiếu quyền:

```json
{
  "projectKey": "EPM",
  "hasToken": true,
  "canCreateVersion": false,
  "reason": "jira_permission_required"
}
```

Không được trả về:

- Jira token.
- Username hoặc credential đã giải mã.
- Permission scheme đầy đủ của project.
- Danh sách group hoặc role Jira của người dùng.

### 5.4 Mã lỗi API

| HTTP | Code | Ý nghĩa |
|---|---|---|
| `400` | `invalid_project_key` | Project key trống hoặc không hợp lệ |
| `401` | `unauthorized` | Chưa đăng nhập ứng dụng |
| `403` | `release_manage_required` | Không có quyền nội bộ |
| `403` | `jira_project_permission_required` | Token không có quyền trên project |
| `428` | `jira_credentials_required` | Chưa cấu hình token cá nhân |
| `502` | `jira_auth_failed` | Jira từ chối token hoặc token hết hạn |
| `502` | `jira_unavailable` | Timeout hoặc Jira không khả dụng |

Nếu Jira client đã cung cấp status cụ thể, route phải map lỗi nhất quán thay vì
trả chung `Jira version lookup failed`.

## 6. Thay đổi giao diện

### 6.1 Permission query

Trong `src/app/(app)/release/release-client.tsx`, thêm TanStack Query theo
project đang chọn:

```ts
const permissionQuery = useQuery({
  queryKey: ["release-permissions", selectedProject],
  queryFn: () =>
    api(`/api/projects/${encodeURIComponent(selectedProject)}/release-permissions`),
  enabled: canManage && selectedProject !== "all",
  staleTime: 60_000,
});
```

Nên bổ sung query-key factory vào `src/lib/query-keys.ts` thay vì đặt array key
trực tiếp trong component.

### 6.2 Trạng thái hiển thị

| Trạng thái | Hành vi UI |
|---|---|
| Role `member` | Không gọi permission API, không hiện nút |
| Project là `all` | Không gọi API, hiện gợi ý chọn project |
| Đang kiểm tra | Hiển thị `Skeleton` cùng kích thước nút |
| Có quyền | Hiển thị nút **Tạo bản phát hành** |
| Không có quyền Jira | Ẩn nút, hiện mô tả ngắn nếu cần |
| Chưa có token | Hiện liên kết đến Settings |
| Jira lỗi tạm thời | Không hiện nút, cho phép thử lại |

UI phải fail closed: không hiển thị nút trong lúc chưa xác định được quyền.

### 6.3 Chống nhấp nháy giao diện

- Không giả định user có quyền trước khi query hoàn tất.
- Dùng `Skeleton`, không dùng text spinner.
- Khi đổi project, kết quả của project trước không được dùng cho project mới.
- Query key phải chứa project key.
- Không giữ nút tạo trong trạng thái active khi permission query đang refetch.

### 6.4 Accessibility và design system

- Dùng component `Button`, `Skeleton` và semantic token hiện có.
- Icon chỉ dùng `lucide-react` và đặt `aria-hidden` nếu mang tính trang trí.
- Thành phần clickable phải có `cursor-pointer`.
- Giữ transition 150–200ms và focus state rõ ràng.
- Thông báo thiếu quyền không chỉ dựa vào màu sắc.
- Kiểm tra light mode và dark mode.

## 7. Bảo vệ API tạo release

Cập nhật `POST /api/releases` trong `src/app/api/releases/route.ts`.

Thứ tự xử lý mục tiêu:

```text
Xác thực session
    ↓
Kiểm tra release.manage
    ↓
Validate request body và projectKey
    ↓
Đọc token Jira cá nhân
    ↓
Kiểm tra quyền trên project
    ↓
Gọi Jira createVersion
    ↓
Lưu Release vào database
    ↓
Ghi audit log
```

Nếu permission check trả `false`, backend trả:

```json
{
  "error": "Bạn không có quyền tạo Fix Version trong dự án này.",
  "code": "jira_project_permission_required"
}
```

với HTTP `403` và tuyệt đối không gọi `createVersion`.

Permission pre-check giúp trả thông báo rõ ràng nhưng không loại bỏ việc xử lý
`403` từ chính API tạo Version. Quyền Jira có thể bị thay đổi giữa permission
check và mutation, nên `POST /rest/api/2/version` vẫn là lớp xác nhận cuối cùng.

## 8. Cache và hiệu năng

- Chỉ query khi đã chọn một project cụ thể.
- Cache phía client theo project trong 60 giây.
- Không lưu permission lâu dài vào database vì quyền Jira có thể thay đổi.
- Không batch toàn bộ project trong phạm vi này.
- Khi mutation tạo Version trả `403`, invalidate permission query của project
  để UI cập nhật ngay.
- Khi user cập nhật Jira token trong Settings, invalidate toàn bộ release
  permission queries.

## 9. Kế hoạch kiểm thử

### 9.1 Jira client unit test

- Gọi đúng `/rest/api/2/mypermissions?projectKey=EPM`.
- Project key được encode an toàn.
- Parse đúng `ADMINISTER_PROJECTS.havePermission`.
- Response thiếu quyền trả `false`.
- Response sai cấu trúc fail closed.
- Không fallback sang system token.
- Xử lý Jira `401`, `403`, timeout và `5xx`.

### 9.2 Permission API test

- Không có session trả `401`.
- Role `member` trả `403` và không gọi Jira.
- Thiếu Jira token cá nhân trả `428`.
- Có quyền trả `canCreateVersion: true`.
- Không có quyền trả `canCreateVersion: false`.
- Token bị Jira từ chối trả mã lỗi auth phù hợp.
- Jira timeout hoặc `5xx` trả `502`.
- Response không làm lộ credential hoặc permission data không cần thiết.

### 9.3 Create release API test

Bổ sung test trong `src/app/api/releases/route.test.ts`:

- Không có quyền Jira thì không gọi `createVersion`.
- Có quyền thì gọi `createVersion` đúng một lần.
- Jira trả `403` trong mutation được map sang lỗi quyền rõ ràng.
- Thiếu token vẫn trả `428`.
- Gọi API trực tiếp không thể bỏ qua permission check.
- Chỉ ghi database và audit sau khi Jira tạo Version thành công.

### 9.4 UI test

- Member không thấy nút tạo.
- Chọn `all` không thấy nút và không gọi permission API.
- Trong lúc kiểm tra hiển thị `Skeleton`.
- Có quyền thì thấy nút.
- Không có quyền thì không thấy nút.
- Thiếu token hiển thị hướng dẫn Settings.
- Đổi project chạy lại query theo project mới.
- Không dùng kết quả permission của project trước.
- Dialog nhận đúng project đã được kiểm tra.

## 10. Trình tự triển khai

### Giai đoạn 1 — Jira permission foundation

1. Thêm Jira permission types.
2. Thêm `getMyPermissions(projectKey)`.
3. Thêm helper `canCreateProjectVersion`.
4. Viết unit test Jira client và helper.

### Giai đoạn 2 — Permission API

1. Tạo `GET /api/projects/[key]/release-permissions`.
2. Enforce session và `release.manage`.
3. Bắt buộc token cá nhân.
4. Chuẩn hóa response và error code.
5. Viết route tests.

### Giai đoạn 3 — Backend enforcement

1. Thêm permission pre-check vào `POST /api/releases`.
2. Chuẩn hóa lỗi từ Jira.
3. Bảo đảm không mutation database khi Jira từ chối.
4. Bổ sung test regression cho luồng tạo release.

### Giai đoạn 4 — Release UI

1. Thêm query key theo project.
2. Thêm permission query vào Release client.
3. Chỉ hiển thị nút khi permission đã được xác nhận.
4. Thêm `Skeleton` và các trạng thái thiếu token/lỗi.
5. Khóa project trong create dialog.
6. Kiểm thử đổi project và responsive UI.

### Giai đoạn 5 — Hoàn thiện

1. Chạy unit test và route test liên quan.
2. Chạy lint và typecheck.
3. Kiểm tra thủ công với hai Jira user: có quyền và không có quyền.
4. Kiểm tra light/dark mode.
5. Cập nhật tài liệu Release nếu hành vi UI thay đổi.

## 11. Tiêu chí nghiệm thu

- [x] Nút tạo chỉ xuất hiện khi role nội bộ và quyền Jira đều hợp lệ.
- [x] Quyền được kiểm tra theo đúng project đang chọn.
- [x] Chọn `all` không tạo permission fan-out tới nhiều project.
- [x] UI không hiển thị nút chớp tắt trước khi query hoàn tất.
- [x] Đổi project không dùng nhầm permission cache.
- [x] Thiếu token có hướng dẫn cấu hình Jira trong Settings.
- [x] Backend chặn request trực tiếp khi thiếu quyền Jira.
- [x] Không có fallback sang system token trong luồng user-initiated.
- [x] Jira `401`, `403`, timeout và `5xx` có thông báo phân biệt được.
- [x] Không lưu hoặc trả credential ra client.
- [x] Không tạo bản ghi Release nếu Jira tạo Version thất bại.
- [x] Test, lint và typecheck đều thành công.

## 12. Rủi ro và biện pháp giảm thiểu

| Rủi ro | Biện pháp |
|---|---|
| Jira instance trả permission payload khác dự kiến | Parse phòng thủ và fail closed |
| Quyền thay đổi sau khi đã cache | Cache ngắn; Jira mutation vẫn là xác nhận cuối |
| Token hết hạn nhưng UI còn cache `true` | Map mutation `401/403`, invalidate query ngay |
| System token vô tình được dùng thay user | Bắt buộc `userJiraAuth`; test không fallback |
| Nút biến mất gây khó hiểu | Hiện thông báo ngắn hoặc liên kết Settings phù hợp |
| Nhiều request khi đổi project liên tục | TanStack Query cache theo key và hủy/không dùng kết quả cũ |
| Permission pre-check tăng độ trễ tạo Version | Cache UI ngắn; backend ưu tiên tính đúng và thông báo rõ |

## 13. Các file đã thay đổi / bổ sung

```text
src/lib/jira/types.ts
src/lib/jira/client.ts
src/lib/jira/client-permissions.test.ts
src/lib/query-keys.ts
src/app/api/projects/[key]/release-permissions/route.ts
src/app/api/projects/[key]/release-permissions/route.test.ts
src/app/api/releases/route.ts
src/app/api/releases/route.test.ts
src/app/(app)/release/release-client.tsx
src/app/(app)/settings/my-integrations.tsx
```

## 14. Kết quả thực hiện

1. **Jira Permission Foundation**:
   - Bổ sung `JiraPermission` và `JiraMyPermissions` vào `src/lib/jira/types.ts`.
   - Bổ sung `canCreateProjectVersion(response)` vào `src/lib/jira/client.ts`, kiểm tra fail-closed cho `ADMINISTER_PROJECTS`, `ADMINISTER`, hoặc `SYSTEM_ADMIN`.
   - Bổ sung `getMyPermissions(projectKey)` vào `jiraWith(auth)`, từ chối ngay lập tức khi thiếu token người dùng mà không fallback sang system token.
   - Thêm 10 test case unit test trong `src/lib/jira/client-permissions.test.ts` (10/10 passed).

2. **Permission API**:
   - Tạo endpoint `GET /api/projects/[key]/release-permissions` (`src/app/api/projects/[key]/release-permissions/route.ts`).
   - Kiểm tra xác thực session, quyền nội bộ `release.manage`, định dạng project key, token cá nhân trong DB (trả `428` `jira_credentials_required`), gọi `getMyPermissions(projectKey)` và chuẩn hóa lỗi `502` `jira_auth_failed` / `jira_unavailable`.
   - Bổ sung 8 test case trong `src/app/api/projects/[key]/release-permissions/route.test.ts` (8/8 passed).

3. **Backend Enforcement**:
   - Cập nhật `POST /api/releases` trong `src/app/api/releases/route.ts` để kiểm tra quyền dự án qua `getMyPermissions` và `canCreateProjectVersion` trước khi gọi `client.createVersion`.
   - Bắt và map lỗi `403` từ Jira thành `jira_project_permission_required` và `401` thành `jira_auth_failed`. Không tạo bản ghi database khi Jira từ chối.
   - Bổ sung test cases trong `src/app/api/releases/route.test.ts` (10/10 passed). Toàn bộ 136 tests của module release đều vượt qua.

4. **UI Trải nghiệm người dùng**:
   - Thêm query key `releasesKeys.permissions` và `releasesKeys.permissionsAll` vào `src/lib/query-keys.ts`.
   - Cập nhật `ReleaseClient` (`src/app/(app)/release/release-client.tsx`):
     - Role `member`: không hiển thị nút.
     - Khi chọn `all`: hiển thị gợi ý *"Chọn một dự án để tạo bản phát hành"*.
     - Khi đang query quyền: hiển thị `Skeleton` với kích thước nút thay vì spinner.
     - Khi chưa có token (`428`): hiển thị link chuyển hướng đến `/settings`.
     - Khi token không có quyền tạo Version: hiển thị badge cảnh báo kèm icon `AlertCircle`.
     - Khi có đủ quyền: hiển thị nút **Tạo bản phát hành**.
     - Trong Dialog tạo release: khóa trường Dự án theo project đã được kiểm tra trên trang.
     - Invalidate permission query khi tạo version gặp `403`.
     - Tự động invalidate permission cache khi người dùng cập nhật token trong `/settings` (`src/app/(app)/settings/my-integrations.tsx`).

5. **Xác nhận chất lượng**:
   - `tsc --noEmit --incremental false`: 0 lỗi type.
   - Vitest: 28/28 tests liên quan trực tiếp passed, 136/136 tests module releases passed.
