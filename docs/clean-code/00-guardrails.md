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
| R-02 | Lease/fencing bị đổi thứ tự khi tách worker | P0 | Batch 3.4 khóa checkpoint renew; batch 3.6 xác nhận lease takeover/fencing trên PostgreSQL thật, cùng 32 race/integration test mock và 4 DB integration test | Closed |
| R-03 | Bulk retry tạo mutation trùng | P0 | `processWithRetry` khóa idempotency guard: item đã `succeeded` không bao giờ re-run; retry chỉ reset item `failed` với `retryable=true`; 21 unit test trong `retry.test.ts` khóa hành vi | Closed |
| R-04 | Notification chạy trước commit | P1 | Test thứ tự commit/notify | Open |
| R-05 | API error/status đổi khi làm mỏng route | P1 | Dùng inventory `07-api-contract-inventory.md` làm baseline và bổ sung characterization test trước khi refactor route; hiện 18/41 route file ưu tiên có colocated test | Open |
| R-06 | UI state reset sau khi tách component | P1 | Browser test dialog/tab/filter | Open |
| R-07 | Import cycle khi tạo facade | P1 | Contract modules không có import; production scans sạch; ESLint chặn `components/hooks/lib` import từ `@/app`; full test và build pass cuối Phase 1 | Closed |
| R-08 | Mock pass nhưng PostgreSQL thật sai | P1 | `npm run test:db` chỉ nhận `TEST_DATABASE_URL` tách biệt, deploy migration và khóa takeover, transaction rollback, cursor advance, soft delete bằng 4/4 test PostgreSQL | Closed |
| R-09 | Tài liệu cũ và mới cùng được cập nhật | P2 | Chỉ tracker mới là nguồn tiến độ | Open |
| R-10 | Test double lệch Jira/Prisma contract tạo error log giả | P1 | Bổ sung Jira/project catalog/people-field mocks, assert log abort/lease chủ ý; 79/79 test liên quan và full suite pass | Closed |
| R-11 | Warning lint mới lọt qua CI vì ESLint vẫn trả exit code 0 | P2 | `npm run lint` dùng `eslint --max-warnings=0`; xác nhận lint sạch ở cuối Phase 0 | Closed |
| R-12 | Caller abort của Jira search bị trì hoãn khi cold-cache field metadata | P1 | Đã ghi F-007; giữ nguyên behavior trong batch 2.1 và tách bug batch có test riêng trước khi sửa | Open |
| R-13 | Tách Jira resources làm mất method hoặc đổi auth/retry/error behavior | P0 | Snapshot đủ 42 method; resource không import facade; 138 Jira test, full suite và production build pass | Closed |
| R-14 | Tách Board cache policy làm lệch TTL, stale window, request coalescing hoặc cache invalidation | P1 | Policy test khóa fresh/stale/expired boundary, concurrent request, failed refresh và clear; 29 test cache/Board, 142 Jira test, full suite và build pass; F-005 vẫn tách riêng | Closed |
| R-15 | Tách Jira issue/comment/link mapper làm lệch null/default, people field, date hoặc epic/link semantics | P1 | Mapper nhận config/clock tường minh; 37/37 test mapping/cache liên quan và full suite 1.314/1.314 pass; persistence/transaction không đổi | Closed |
| R-16 | Tách issue persistence làm lệch stale-write guard, issue/link transaction, comment unique race hoặc notification ordering | P0 | Repository giữ nguyên conditional update/P2002/transaction; test khóa rollback, stale rejection, unique comment và commit-before-notify; 62/62 test liên quan, full suite 1.316/1.316 và build pass | Closed |
| R-17 | Tách pg-boss connection lifecycle làm tạo nhiều singleton, start trùng hoặc shutdown không graceful | P0 | Lifecycle dùng shared global state, cache start promise và reset khi start lỗi; test khóa concurrent start, retry, graceful stop/timeout và singleton mới sau stop; full suite/build pass | Closed |
| R-18 | Tách queue registry/schedules làm lệch tên job, queue policy, cron, singleton, retry, expire hoặc heartbeat options | P0 | Catalog typed khóa 17 job/queue; contract test snapshot 11 schedule và failure path unschedule legacy; 99 queue test, full suite 1.324/1.324 và build pass | Closed |
| R-19 | Tách enqueue API làm đổi payload/options, nuốt lỗi database hoặc biến job coalesced `null` thành success ID | P0 | `enqueue.ts` giữ nguyên facade exports; test trực tiếp khóa payload/options, `string | null`, send rejection và startup/database failure; 105 queue test, full suite 1.330/1.330 và build pass | Closed |
| R-20 | Tách webhook handler làm lệch source routing, event idempotency/status hoặc rò lỗi thô | P0 | Giữ facade và event lifecycle; characterization khóa 4 provider, already-processed, processed/failed transition và lỗi tối đa 300 ký tự; 38 test liên quan, full suite 1.337/1.337 và build pass | Closed |
| R-21 | Tách bulk contract và validation làm thay đổi validation error message, key normalization hoặc làm lọt payload không hợp lệ | P0 | Tách `contracts.ts` và `validation.ts` thuần; giữ `ops.ts` làm facade; 25 unit test mới bao phủ 15 action kinds, key limit, selector mode và format; 83 bulk test liên quan, full suite 1.362/1.362 và build pass | Closed |
| R-22 | Tách bulk selection và preview policy làm sai lệch filter query, 15 action classification, before/after snapshot hoặc stale detection | P0 | Tách `selection.ts` và `preview.ts` thuần; 40 unit test mới bao phủ 15 action kinds, stale window, transition errors, filter resolution (statuses/priorities/labels/assignees/epics/q); 118 bulk test, full suite 1.402/1.402 và build pass | Closed |
| R-23 | Tách Bulk action executors làm đổi thứ tự Jira cache refresh, provenance propagation hoặc audit log | P0 | Tách `executors.ts` độc lập với typed context; 29 unit test mới kiểm tra 15 action kinds, cache refresh ordering, non-retryable duplicate-worklog timeout, dependency provenance upsert và audit sequence; 278 test bulk, full suite 1.458/1.458 và build pass | Closed |
| R-24 | Tách Bulk retry và notification làm mất idempotency guard, đổi retry attempt/backoff hoặc thất thoát notification | P0 | Tách `retry.ts` và `notification.ts`; test khóa idempotency guard (R-03), attempts count, backoff delays, retryable error classifier và completion notification (full/partial success); 35 unit test mới, 313 test bulk, full suite 1.493/1.493 và build pass | Closed |

## 7. Quy tắc Dừng

Dừng batch và tách issue riêng khi:

- Cần đổi API contract, schema, migration hoặc queue payload.
- Cần sửa hành vi ngoài scope để test pass.
- Không thể mô tả hành vi hiện tại bằng test ổn định.
- Phát hiện dữ liệu production có thể bị ghi/xóa.
- Diff vượt quá khả năng review trong một PR độc lập.
