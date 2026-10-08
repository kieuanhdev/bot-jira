# Guardrails Và Bất Biến

## 1. Phạm vi

Đợt này được phép:

- Tách file, đổi tên nội bộ và thu hẹp trách nhiệm.
- Tách pure function, repository, service, adapter và controller.
- Tạo contract/type dùng chung.
- Bổ sung unit, contract, integration và browser test.
- Loại bỏ code chết sau khi chứng minh không còn tham chiếu.
- Chuẩn hóa error mapping, logging và dependency injection nếu contract bên ngoài không đổi.

Đợt này không tự động bao gồm:

- Feature mới hoặc thay đổi UX.
- Nâng/hạ dependency.
- Thay đổi database schema hoặc migration.
- Đổi URL, HTTP method, status code hay JSON response.
- Đổi tên queue/job, payload hoặc retry policy.
- Đổi auth/session/JWT/credential fallback.
- Tối ưu hiệu năng làm thay đổi consistency hoặc transaction boundary.

Nếu phát hiện bug thật, ghi vào Risk Register ở cuối file và tạo batch sửa lỗi riêng trước hoặc sau refactor.

## 2. Bất biến kiến trúc

Các bất biến lấy từ `docs/architecture.md`:

- Jira là source of truth cho issue, workflow, comment và Fix Version.
- PostgreSQL là shared read model, không âm thầm ghi đè dữ liệu Jira authoritative.
- User mutation sử dụng personal credential; không fallback im lặng sang service account đặc quyền cao hơn.
- Web và worker là hai process độc lập.
- Webhook và polling phải hội tụ về cùng read model.
- Worker handler phải idempotent; event phải được deduplicate.
- Release không được đánh dấu released nếu thiếu authorization và gate bắt buộc.
- Notification failure không được rollback một Jira/cache mutation đã thành công.

## 3. Bất biến kỹ thuật

### API

- Giữ nguyên route, method, query param và request body.
- Giữ nguyên response shape, status code, header và cookie.
- Giữ thứ tự auth, permission, validation và side effect.
- Không trả raw error chứa token hoặc payload nhạy cảm.

### Database

- Không đổi `prisma/schema.prisma` và migrations trong PR refactor.
- Giữ transaction boundary và thứ tự write.
- Giữ điều kiện optimistic/fencing update.
- Không chạy `prisma db push`, `migrate reset` hoặc thao tác dữ liệu thật.

### Queue

- Giữ tên job, schedule, singleton key, payload và retry/expire option.
- Giữ lease renewal, abort signal và fencing checks.
- Không đánh dấu success nếu job bị skip, abort hoặc mất lease.

### UI

- Giữ text, markup có ý nghĩa, a11y attribute và interaction contract.
- Không chuyển state vào component con có vòng đời ngắn nếu làm state reset.
- Không tạo component bên trong component.
- Giữ `data-*`, ref và DOM query đang phục vụ keyboard/DnD.
- Loading dùng `Skeleton`; empty state theo design system.
- Kiểm tra light/dark, mobile và `prefers-reduced-motion` khi chạm UI.

### Type và module

- Không import type từ `src/app/api/**/route.ts` vào UI hoặc lib.
- Shared component không import helper từ feature UI.
- Domain không import từ `src/app`.
- Adapter ngoài hệ thống không chứa business rule.
- Public export đang dùng được giữ qua facade/re-export trong giai đoạn chuyển đổi.

## 4. Definition Of Done Cho Một Batch

- [ ] Scope và hành vi cần giữ đã được ghi rõ.
- [ ] Có characterization test cho đường chính và failure path quan trọng.
- [ ] Không có thay đổi ngoài scope trong diff.
- [ ] `npm run typecheck` pass.
- [ ] `npm run lint` pass với 0 warning mới.
- [ ] Test liên quan pass.
- [ ] Toàn bộ `npm test` pass trước khi merge.
- [ ] `npm run build` pass ở cuối phase.
- [ ] Manual QA liên quan đã được đánh dấu và có ghi chú.
- [ ] Không xuất hiện dependency cycle mới.
- [ ] Tài liệu tiến độ đã được cập nhật.
- [ ] Commit message mô tả boundary được thay đổi, không chỉ ghi “cleanup”.

## 5. Definition Of Done Toàn Chương Trình

- [ ] Typecheck, lint, test và build đều xanh.
- [ ] Lint không còn warning.
- [ ] API route chỉ làm transport/auth/validation/use-case mapping.
- [ ] Không còn UI/lib import contract từ API route.
- [ ] Jira, Bitbucket và AI có transport adapter tách khỏi domain service.
- [ ] Queue registry tách khỏi schedule và worker orchestration.
- [ ] Bulk update/create không còn god module.
- [ ] Các flow quan trọng có integration hoặc browser test.
- [ ] Manual QA cho Board, Bulk, Release, Branches, Reports hoàn tất.
- [ ] README, architecture và runbook khớp code mới.
- [ ] Không có migration/dependency/feature ngoài phạm vi bị trộn vào.

## 6. Risk Register

| ID | Rủi ro | Mức | Cách kiểm soát | Trạng thái |
|---|---|---:|---|---|
| R-01 | Jira sync test đang đỏ do mock thiếu `findMany` | P0 | Đã bổ sung test double theo `where.jiraKey.in`; 22/22 race/integration test và full suite 1.289/1.289 test pass | Closed |
| R-02 | Lease/fencing bị đổi thứ tự khi tách worker | P0 | Characterization + PostgreSQL integration test | Open |
| R-03 | Bulk retry tạo mutation trùng | P0 | Khóa idempotency marker và retry tests | Open |
| R-04 | Notification chạy trước commit | P1 | Test thứ tự commit/notify | Open |
| R-05 | API error/status đổi khi làm mỏng route | P1 | Dùng inventory `07-api-contract-inventory.md` làm baseline và bổ sung characterization test trước khi refactor route; hiện 18/41 route file ưu tiên có colocated test | Open |
| R-06 | UI state reset sau khi tách component | P1 | Browser test dialog/tab/filter | Open |
| R-07 | Import cycle khi tạo facade | P1 | Contract modules không có import; production scans sạch; ESLint chặn `components/hooks/lib` import từ `@/app`; full test và build pass cuối Phase 1 | Closed |
| R-08 | Mock pass nhưng PostgreSQL thật sai | P1 | Integration suite dùng DB test riêng | Open |
| R-09 | Tài liệu cũ và mới cùng được cập nhật | P2 | Chỉ tracker mới là nguồn tiến độ | Open |
| R-10 | Test double lệch Jira/Prisma contract tạo error log giả | P1 | Bổ sung Jira/project catalog/people-field mocks, assert log abort/lease chủ ý; 79/79 test liên quan và full suite pass | Closed |
| R-11 | Warning lint mới lọt qua CI vì ESLint vẫn trả exit code 0 | P2 | `npm run lint` dùng `eslint --max-warnings=0`; xác nhận lint sạch ở cuối Phase 0 | Closed |
| R-12 | Caller abort của Jira search bị trì hoãn khi cold-cache field metadata | P1 | Đã ghi F-007; giữ nguyên behavior trong batch 2.1 và tách bug batch có test riêng trước khi sửa | Open |

## 7. Quy tắc Dừng

Dừng batch và tách issue riêng khi:

- Cần đổi API contract, schema, migration hoặc queue payload.
- Cần sửa hành vi ngoài scope để test pass.
- Không thể mô tả hành vi hiện tại bằng test ổn định.
- Phát hiện dữ liệu production có thể bị ghi/xóa.
- Diff vượt quá khả năng review trong một PR độc lập.
