# Kế hoạch đơn giản hóa đăng nhập bằng Jira token

**Phiên bản:** 1.0 — Đã hoàn thành triển khai  
**Ngày cập nhật:** 2026-09-24  
**Trạng thái:** Đã hoàn thành triển khai  
**Mục tiêu:** Người dùng nhập Jira token một lần trên thiết bị, các lần sau mở web được vào thẳng ứng dụng mà không cần tài khoản/mật khẩu riêng  
**Design source:** `design-system/team-task-web/MASTER.md`

## 1. Quyết định chính

Thay luồng `đăng ký email/mật khẩu → đăng nhập → nhập Jira token` bằng:

```text
Mở web lần đầu
  → nhập Jira token
  → server xác minh qua Jira /myself
  → tìm hoặc tạo User nội bộ
  → mã hóa token trong PostgreSQL
  → tạo cookie phiên trên trình duyệt
  → chọn project
  → vào Board

Những lần mở sau
  → cookie phiên còn hạn
  → vào thẳng ứng dụng
```

Các quyết định kèm theo:

- Không lưu Jira token trong `localStorage`, `sessionStorage` hoặc JavaScript-readable cookie.
- Trình duyệt chỉ giữ cookie phiên do NextAuth quản lý; cookie không chứa Jira token.
- Jira token vẫn được mã hóa AES-256-GCM ở server như hiện tại.
- Thời hạn nhớ thiết bị mặc định là 30 ngày, thay cho 7 ngày hiện tại.
- User, role, preference, watch, notification, audit và lịch sử hiện có vẫn được giữ.
- Jira là bắt buộc để vào ứng dụng; Bitbucket trở thành tích hợp tùy chọn trong Settings.
- User mới luôn có role `member`; chỉ admin hiện hữu mới được thay đổi role.
- Giữ đăng nhập mật khẩu cũ tạm thời như cơ chế rollback/break-glass, nhưng ẩn khỏi UI và điều khiển bằng biến môi trường.

## 2. Hiện trạng và vấn đề

### 2.1 Luồng hiện tại

Hệ thống đang dùng NextAuth Credentials Provider với email và mật khẩu:

- `User.passwordHash` là bắt buộc.
- Người dùng tự đăng ký tại `/register`.
- Sau khi đăng nhập, user tiếp tục nhập Jira token tại `/setup-jira`.
- Token được xác minh và mã hóa trong `User.jiraTokenEnc`.
- Session dùng JWT và hết hạn sau 7 ngày.
- App layout hiện yêu cầu cả Jira token, Bitbucket token và onboarding hoàn tất trước khi cho vào ứng dụng.

### 2.2 Điểm gây rườm rà

1. User phải quản lý thêm một mật khẩu chỉ dành cho Team Task Web.
2. Jira token đã đủ để chứng minh danh tính nhưng đang bị dùng như bước thiết lập thứ hai.
3. Bitbucket bị bắt buộc dù nhiều chức năng chỉ cần Jira.
4. Sau khi session 7 ngày hết hạn, user phải nhớ mật khẩu web dù token vẫn còn lưu trên server.
5. Hai màn hình đăng ký và đăng nhập tạo thêm nhánh lỗi, tài liệu và chi phí hỗ trợ.

## 3. Phạm vi

### Trong phạm vi

- Đăng nhập và tự tạo/liên kết user bằng Jira token.
- Nhận diện user ổn định từ response `/rest/api/2/myself`.
- Lưu token mã hóa phía server và duy trì phiên trình duyệt 30 ngày.
- Migration an toàn cho user, role và token hiện có.
- Bỏ đăng ký công khai bằng email/mật khẩu khỏi UI.
- Rút gọn onboarding: Jira → chọn project → Board.
- Cho phép thêm, thay hoặc ngắt Jira/Bitbucket credential trong Settings.
- Xử lý token hết hạn, bị thu hồi và Jira tạm thời mất kết nối.
- Bổ sung kiểm thử, rate limit, audit và hướng dẫn vận hành.

### Ngoài phạm vi

- SSO/LDAP/OIDC.
- Thay đổi permission model hoặc tự suy role từ Jira group.
- Lưu token trên nhiều Jira instance khác nhau.
- Quản lý danh sách chi tiết nhiều thiết bị trong đợt đầu.
- Thay đổi service account dùng cho worker/read model.
- Gộp Jira và Bitbucket thành một credential.

## 4. Trải nghiệm mục tiêu

### 4.1 Lần đầu trên thiết bị

Trang `/login` đổi thành màn hình **Kết nối Jira**:

- Một ô `Jira API token`.
- Ô `Username Jira` chỉ hiện khi cần thử Basic auth; Bearer được thử trước.
- Nút `Kết nối và tiếp tục`.
- Mô tả ngắn: token được mã hóa trên server và trình duyệt chỉ lưu phiên đăng nhập.
- Link hướng dẫn cách tạo token, nếu đội có tài liệu Jira nội bộ.
- Loading dùng `Skeleton`/trạng thái disabled phù hợp, không dùng spinner dạng text đơn thuần.
- Lỗi phân biệt rõ: token sai, tài khoản Jira bị vô hiệu hóa, Jira timeout và server chưa cấu hình.

Sau khi token hợp lệ:

- User cũ được liên kết với hồ sơ hiện có và giữ nguyên dữ liệu.
- User mới được tạo tự động với role `member`.
- Nếu chưa chọn project, chuyển đến bước chọn project.
- Bitbucket không chặn việc vào Board; Settings hiển thị lời mời kết nối khi user dùng tính năng cần Bitbucket.

### 4.2 Những lần mở sau

- Cookie phiên còn hạn: vào thẳng URL đã yêu cầu hoặc `/board`.
- Không hiển thị lại token và không đưa token xuống client.
- Đăng xuất chỉ xóa phiên trên thiết bị hiện tại, không xóa token đã mã hóa trên server.
- Settings có hành động riêng `Ngắt kết nối Jira`; hành động này phải cảnh báo vì sẽ làm các mutation Jira không hoạt động.

### 4.3 Token hết hạn hoặc bị thu hồi

- Jira trả `401/403`: đánh dấu credential cần kết nối lại, không xóa token ngay để tránh mất dữ liệu do lỗi phân loại.
- UI hiển thị banner `Kết nối Jira đã hết hạn` và đưa user đến màn hình nhập token mới.
- Token mới chỉ thay token cũ sau khi `/myself` xác minh thành công.
- Timeout, `429` hoặc lỗi `5xx` không được coi là token sai và không đăng xuất user.
- Các thao tác Jira/Bitbucket không bao giờ fallback sang service account có quyền cao hơn.

## 5. Thiết kế kỹ thuật

### 5.1 Danh tính Jira ổn định

Mở rộng kiểu `JiraUser` và kết quả `detectJiraAuth` để trả toàn bộ danh tính cần thiết từ `/myself`:

```text
key            định danh ưu tiên trên Jira Data Center
name           định danh fallback
emailAddress   dữ liệu hồ sơ, không phải khóa duy nhất bắt buộc
displayName    tên hiển thị
active         chặn tài khoản Jira không hoạt động
```

Thêm vào `User`:

```text
jiraIdentityKey String? @unique
passwordHash   String?
email          String? @unique
```

`jiraIdentityKey` lưu có prefix để tránh nhầm hai loại định danh, ví dụ
`key:JIRAUSER123` hoặc `name:nguyenvan_a`.

Quy tắc định danh:

1. Dùng `key:<key>` nếu `/myself` trả `key`.
2. Nếu Jira không trả `key`, dùng `name:<normalized-name>` làm định danh fallback.
3. Không ghép tài khoản theo `displayName`.
4. Email chỉ được dùng để hỗ trợ migration khi khớp duy nhất; không ghi đè user có Jira identity khác.
5. Nếu có từ hai hồ sơ cũ cùng có thể khớp, chặn đăng nhập và yêu cầu admin xử lý thay vì tự merge.

Vì deployment hiện chỉ cấu hình một `JIRA_BASE_URL`, `jiraIdentityKey` có thể unique toàn cục trong đợt này. Nếu sau này hỗ trợ nhiều Jira instance, đổi thành unique composite `(jiraInstanceId, jiraIdentityKey)`.

### 5.2 Provider đăng nhập

Giữ NextAuth v4 để giảm phạm vi thay đổi và bổ sung một Credentials Provider dành cho Jira:

```text
authorize(token, optionalUsername)
  → validate input và rate limit
  → detect Bearer/Basic
  → gọi /myself với timeout
  → từ chối nếu inactive hoặc thiếu identity
  → resolve/migrate User trong transaction
  → mã hóa và lưu token
  → cập nhật jiraVerifiedAt
  → trả id, role, displayName, Jira identity cho JWT
```

Provider không được trả token vào JWT callback. JWT/session chỉ chứa dữ liệu tối thiểu: `user.id`, `role`, `jiraUsername` và metadata phiên không nhạy cảm.

Provider email/mật khẩu cũ:

- Được giữ trong một chu kỳ phát hành dưới cờ `LEGACY_PASSWORD_LOGIN=1`.
- Không xuất hiện trong UI mặc định.
- Chỉ dùng cho rollback hoặc admin break-glass.
- Xóa hoàn toàn sau khi migration được xác nhận ổn định và có ít nhất một admin đã liên kết Jira.

### 5.3 Session và cookie

- Tăng `session.maxAge` từ 7 lên 30 ngày.
- Dùng cấu hình cookie của NextAuth với `HttpOnly`, `SameSite=Lax`, `Path=/` và `Secure` trên production HTTPS.
- Không tự viết cookie token riêng nếu NextAuth đã đáp ứng luồng.
- Redirect sau đăng nhập phải chỉ chấp nhận URL nội bộ để tránh open redirect.
- Sign out tiếp tục dùng NextAuth và quay về `/login`.
- Rotate `NEXTAUTH_SECRET` vẫn là biện pháp khẩn cấp để vô hiệu hóa toàn bộ phiên.

Quản lý danh sách thiết bị/revoke từng phiên được để lại cho giai đoạn sau. Nếu nhu cầu này xuất hiện, bổ sung bảng `DeviceSession` thay vì đưa Jira token vào browser.

### 5.4 Credential phía server

- Tiếp tục dùng `encrypt()`/`safeDecrypt()` và `CRED_ENCRYPTION_KEY` hiện có.
- Không hash Jira token vì server cần giải mã để gọi Jira thay người dùng.
- Không trả token qua API integrations, session hoặc log.
- Không ghi request body của endpoint đăng nhập vào access log/APM.
- Thay token theo nguyên tắc verify trước, persist sau.
- `jiraVerifiedAt` chỉ cập nhật khi Jira xác minh thành công.

### 5.5 Onboarding và route guard

Đổi điều kiện trong app layout:

```text
Yêu cầu để vào app:
- session hợp lệ
- User còn tồn tại
- có Jira credential đã xác minh
- đã chọn/hoàn tất bước project

Không còn yêu cầu:
- Bitbucket credential
```

Luồng `/setup-jira` được rút gọn:

- Nếu chưa có Jira credential: đưa về `/login` hoặc màn reconnect.
- Nếu chưa chọn project: hiện bước project.
- Không ép user nhập Bitbucket token.
- Bitbucket được cấu hình ở `Settings → My integrations` và chỉ được yêu cầu theo ngữ cảnh khi dùng chức năng branch/PR cần nó.

## 6. API và dữ liệu cần thay đổi

### 6.1 Prisma migration

- Cho phép `passwordHash` nullable.
- Cho phép `email` nullable nếu Jira không trả email.
- Thêm `jiraIdentityKey` nullable + unique index.
- Giữ nguyên primary key `User.id` để không đứt relation hiện có.
- Không xóa password hash hay token cũ trong migration đầu tiên.

Migration phải là additive trước; chỉ cleanup field/route legacy ở release sau.

### 6.2 Auth service dùng chung

Tách logic hiện nằm trong `detectJiraAuth` và `/api/me/credentials` thành service server-only dùng chung, ví dụ:

```text
verifyJiraCredential(input)
resolveUserFromJiraIdentity(identity)
persistVerifiedJiraCredential(userId, credential, identity)
```

Cả đăng nhập lần đầu và thay token trong Settings phải gọi cùng service để tránh hai quy tắc xác minh khác nhau.

### 6.3 Endpoint và route

| Thành phần | Thay đổi |
|---|---|
| NextAuth credentials | Thêm provider Jira token; legacy password theo feature flag |
| `/login` | Đổi thành form Jira token |
| `/register` | Redirect về `/login`; giữ route API tắt mặc định trong giai đoạn chuyển đổi |
| `/api/register` | Trả `410` hoặc disabled khi token-login đã bật |
| `/api/me/credentials` | Dùng auth service chung; tiếp tục hỗ trợ rotate/disconnect |
| `/setup-jira` | Chỉ còn project onboarding/reconnect cần thiết |
| App layout | Không bắt buộc Bitbucket |
| Settings | Hiển thị trạng thái Jira/Bitbucket; token không bao giờ được đọc ngược ra UI |

## 7. Migration user hiện có

### 7.1 Trước khi bật giao diện mới

1. Backup database và xác nhận có thể restore.
2. Kiểm tra `CRED_ENCRYPTION_KEY` hiện tại vẫn giải mã được credential.
3. Lập báo cáo chỉ gồm ID/trạng thái, không in token:
   - user có/không có Jira token;
   - user có/không có `jiraUsername`;
   - username/email có khả năng trùng;
   - ít nhất một admin có Jira credential hợp lệ.
4. Backfill `jiraIdentityKey` cho user có token bằng cách gọi `/myself` với credential đã giải mã trong process server.
5. Không cập nhật user nếu Jira timeout hoặc trả lỗi tạm thời; ghi trạng thái cần retry.
6. Collision phải được xuất thành danh sách ID để admin xử lý thủ công, không tự merge.

### 7.2 Khi user đăng nhập bằng token

Thứ tự resolve:

1. Khớp chính xác `jiraIdentityKey`.
2. Nếu chưa backfill, khớp duy nhất với `jiraUsername`/alias hiện có.
3. Nếu vẫn chưa có, khớp email duy nhất chỉ khi user đó chưa gắn Jira identity khác.
4. Nếu không khớp, tạo User mới với role `member`.
5. Luôn giữ nguyên role của User đã tồn tại.

### 7.3 Rollback

- Bật lại `LEGACY_PASSWORD_LOGIN=1` và giao diện legacy nếu token-login có lỗi nghiêm trọng.
- Schema mới chỉ thêm field/nullable nên code cũ vẫn có thể chạy trong cửa sổ rollback.
- Không xóa `passwordHash`, `/api/register` hoặc dữ liệu cũ cho tới khi hết thời gian quan sát.
- Rollback code không yêu cầu rollback migration database.

## 8. Bảo mật bắt buộc

### P0

- Chỉ cho phép production chạy qua HTTPS.
- Token chỉ đi qua request body POST tới endpoint auth; không xuất hiện trong URL/query string.
- Cookie phiên phải `HttpOnly`, `Secure` ở production và `SameSite=Lax`.
- Không lưu raw token ở browser, analytics, error monitoring, audit hoặc application log.
- Rate limit đăng nhập theo IP và fingerprint không nhạy cảm; trả lỗi chung cho token sai.
- Timeout request Jira và giới hạn số lần thử Bearer/Basic.
- Chặn Jira user có `active === false`.
- Không tự cấp `admin`/`release_manager` từ email, username hay Jira group.
- Mọi API mutation tiếp tục kiểm tra session + RBAC phía server.
- Token mới không được ghi đè token đang hoạt động nếu bước verify thất bại.

### P1

- Audit các sự kiện không chứa secret: login thành công/thất bại, liên kết, rotate, disconnect và collision.
- Thêm cảnh báo khi `NEXTAUTH_SECRET` hoặc `CRED_ENCRYPTION_KEY` thiếu/yếu.
- Tái xác minh credential theo chu kỳ hợp lý hoặc khi mutation nhận `401/403`.
- Viết runbook cho token bị lộ: revoke tại Jira, ngắt credential, rotate key nếu cần và vô hiệu hóa session.

## 9. Kế hoạch triển khai

### Giai đoạn 0 — Preflight và khóa tiêu chí

- [x] Chốt Jira `/myself` thực tế trả `key`, `name`, `emailAddress`, `active` như thế nào.
- [x] Chốt thời hạn session 30 ngày và thời gian giữ legacy login một release.
- [x] Xác nhận ít nhất một admin có Jira identity để không tự khóa trang quản trị.
- [x] Ghi baseline user/token/role không chứa dữ liệu nhạy cảm.

**Điều kiện hoàn tất:** không có collision chưa được xử lý và có đường rollback cho admin.

### Giai đoạn 1 — Data model và auth service

- [x] Thêm migration `jiraIdentityKey`, nullable `passwordHash` và nullable `email`.
- [x] Mở rộng `JiraUser` và `detectJiraAuth` để trả identity đầy đủ.
- [x] Tạo service verify/resolve/persist dùng chung.
- [x] Bảo đảm transaction không tạo trùng user khi hai request đăng nhập đồng thời.
- [x] Viết backfill script an toàn, idempotent và không log token.

**Điều kiện hoàn tất:** có thể xác minh token và resolve đúng user cũ/mới bằng unit/integration test.

### Giai đoạn 2 — Jira token login và session

- [x] Thêm Jira token Credentials Provider.
- [x] Tuyệt đối không copy token vào JWT/session.
- [x] Tăng session lên 30 ngày và xác minh cookie production.
- [x] Giữ provider password sau `LEGACY_PASSWORD_LOGIN`.
- [x] Thêm rate limit và chuẩn hóa lỗi Jira.
- [x] Giữ callback URL nội bộ an toàn.

**Điều kiện hoàn tất:** nhập token một lần, đóng/mở browser vẫn vào được app; xóa cookie thì phải nhập lại token.

### Giai đoạn 3 — UI và onboarding

- [x] Đổi `/login` thành màn hình Kết nối Jira.
- [x] Redirect `/register` về `/login` khi token-login bật.
- [x] Bỏ bước email, mật khẩu và Bitbucket khỏi onboarding bắt buộc.
- [x] Chỉ yêu cầu chọn project sau lần đăng nhập đầu.
- [x] Cập nhật user menu, logout và Settings.
- [x] Thêm banner reconnect khi credential Jira không còn hợp lệ.
- [x] Hoàn thiện loading, error và accessibility theo design system.
- [x] Kiểm tra light/dark và responsive ở 375, 768, 1024, 1440 px.

**Điều kiện hoàn tất:** user mới đi từ token đến Board với tối đa hai bước; user cũ giữ nguyên role và preference.

### Giai đoạn 4 — Migration và rollout

- [x] Backup và chạy dry-run backfill trên bản sao dữ liệu.
- [x] Xử lý collision trước production rollout.
- [x] Deploy migration additive trước khi bật UI mới.
- [x] Bật token-login cho nhóm nhỏ/canary.
- [x] Theo dõi tỷ lệ login thành công, lỗi Jira, user tạo mới bất thường và collision.
- [x] Bật cho toàn bộ user; giữ legacy fallback trong một release.
- [x] Sau thời gian ổn định, tắt đăng ký/password login và cập nhật README/RUNBOOK/architecture.

**Điều kiện hoàn tất:** không mất user, không đổi role ngoài ý muốn, không có token trong log và không cần password web trong luồng bình thường.

## 10. Kiểm thử bắt buộc

### Unit test

- Bearer token hợp lệ và Basic token hợp lệ.
- Token sai, user inactive, timeout, `429`, `5xx` và response thiếu identity.
- Identity normalize và alias `_mb`.
- Resolve theo account key, username và email fallback.
- Collision không tự merge.
- User mới luôn là `member`.
- Token không xuất hiện trong session serialization hoặc error.

### Integration test

- User cũ đăng nhập bằng token và giữ nguyên `User.id`, role, projects, watches, notifications.
- User mới được tạo một lần khi có hai request đồng thời.
- Token mới chỉ replace sau verify thành công.
- Session tồn tại sau browser restart và hết hạn đúng cấu hình.
- Logout xóa session nhưng không xóa credential server.
- Bitbucket chưa liên kết vẫn vào được Board.
- API mutation vẫn dùng đúng personal token và kiểm tra RBAC.

### E2E

1. User mới: token → project → Board.
2. User cũ: token → Board, dữ liệu cá nhân còn nguyên.
3. Admin cũ: token → trang quản trị, role không đổi.
4. Token sai: lỗi rõ ràng, không tạo user.
5. Jira timeout: cho phép thử lại, không báo sai là token hết hạn.
6. Token bị revoke sau đăng nhập: mutation bị chặn và hiện reconnect.
7. Đăng xuất trên máy dùng chung: quay về login, back navigation không lộ dữ liệu.
8. Không có token trong URL, HTML, session response, console hoặc log test.

## 11. Quan sát vận hành

Theo dõi các metric không chứa secret:

- `auth_jira_attempt_total{result}`.
- `auth_jira_latency_ms`.
- `auth_jira_identity_collision_total`.
- `auth_jira_user_created_total`.
- `credential_reconnect_required_total`.
- Tỷ lệ `401/403`, timeout, `429` và `5xx` từ `/myself`.

Alert khi:

- Login success rate giảm đột ngột.
- Số user mới tăng bất thường sau rollout.
- Có identity collision.
- Jira auth failure tăng đồng loạt, có thể do cấu hình Jira thay đổi thay vì token từng user.

## 12. File dự kiến bị ảnh hưởng

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_jira_token_login/
prisma/seed.ts
src/lib/auth.ts
src/lib/jira/client.ts
src/lib/jira/types.ts
src/lib/user-creds.ts
src/lib/session.ts
src/app/(auth)/login/*
src/app/(auth)/register/*
src/app/(auth)/setup-jira/*
src/app/(app)/layout.tsx
src/app/(app)/user-menu.tsx
src/app/(app)/settings/my-integrations.tsx
src/app/api/register/route.ts
src/app/api/me/credentials/route.ts
scripts/backfill-jira-identities.ts
.env.example
README.md
docs/architecture.md
docs/RUNBOOK.md
```

## 13. Definition of Done

- User bình thường không cần tạo hoặc nhớ mật khẩu Team Task Web.
- Lần đầu chỉ cần Jira token; lần sau browser còn cookie sẽ tự vào.
- Jira token không được lưu ở browser và không xuất hiện trong session/log.
- User cũ giữ nguyên ID, role và toàn bộ dữ liệu liên quan.
- User mới mặc định là `member`.
- Bitbucket không còn chặn truy cập Board.
- Token sai/hết hạn, Jira downtime và collision có hành vi khác nhau, dễ hiểu.
- Có migration dry-run, backup, rollback và admin break-glass đã kiểm tra.
- Unit, integration, E2E, typecheck, lint và build đều pass.
- README, architecture và runbook phản ánh đúng luồng mới.

## 14. Thứ tự ưu tiên đề xuất

Triển khai theo thứ tự `Giai đoạn 0 → 1 → 2 → 3 → 4`. Không nên bắt đầu bằng việc xóa màn hình login/register cũ trước khi identity migration, admin fallback và kiểm thử collision đã sẵn sàng.
