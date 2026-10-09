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
| R-06 | UI state reset sau khi tách component | P1 | Tách controller hooks giữ toàn bộ state ở component root, không di chuyển vào dialog/tab; closed cho Bulk UI | Closed cho Bulk UI (tiếp tục theo dõi các UI phase sau) |
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
| R-25 | Tách bulk create metadata/validation làm lệch field shape normalization, allowed values check hoặc cache invalidation | P0 | Tách `create-metadata.ts`, `create-custom-fields.ts` và `create-normalization.ts`; `create-validator.ts` và `create-ops.ts` giữ facade re-export; 64 unit test mới bao phủ 11 field shapes, scalar conversion, allowed values, parent rules, cache TTL và invalidation; 377 bulk test, full suite 1.557/1.557 và build pass | Closed |
| R-26 | Tách bulk create execution làm lệch marker reconciliation, parent resolution, child unlock/block, hoặc retry/restart idempotency | P0 | Tách `create-parent-resolver.ts`, `create-item-executor.ts` và `create-execution.ts`; `create-ops.ts` giữ facade re-export; 30 unit test mới bao phủ parent resolution, child unlock/block, timetracking fallback, marker reconciliation, status aggregation và credential guard; 403 bulk test, full suite 1.587/1.587 và build pass | Closed |
| R-27 | Tách Bulk UI controller làm đổi basis cache preview, mất selection khi đổi view hoặc unmount dialog | P1 | Tách `use-bulk-selection`, `use-bulk-configure`, `use-bulk-preview`, `use-bulk-operations` giữ nguyên state tại root; 18 unit test khóa computePreviewBasis, pruneUnavailableFields, resolveInitialProject, bucket counts và toggle; 1.605 test và build pass | Closed |
| R-28 | Tách Bitbucket transport/resources làm lệch credential fallback, pagination hoặc mất method/export của client facade | P0 | Tách transport (`transport.ts`), repositories, branches, pull-requests; `client.ts` giữ 100% facade methods và re-exports; 47 unit test mới bao phủ credential fallback, permission errors, pagination bounds, multi-page correlation và PR normalization; 132/132 Bitbucket test và 1.652 full suite pass | Closed |
| R-29 | Tách link discovery khỏi persistence làm lệch priority tiers (manual/explicit > jira_dev_status > branch_name > commit_message > pr_title > comment), phá vỡ stability primary link hoặc tự động revive link đã bị manual_unlinked/rejected | P0 | Tách pure discovery & policy (`link-discovery.ts`) và reconciliation service (`link-reconciliation.ts`); `branch-links.ts` và `link-service.ts` giữ facade tương thích 100%; 30 unit test mới bao phủ priority tiers, stability rule, multi-source discovery, deduplication, explicit link recording và placeholder reconciliation; 162 Bitbucket test, full suite 1.682/1.682 và production build pass | Closed |
| R-30 | Gom branch/PR notification recipient resolver và message model làm sai lệch danh sách người nhận (assignee, watcher, author, reviewer), vô tình gửi thông báo cho chính comment author hoặc thay đổi format message/eventKey | P0 | Tách pure message formatters và recipient policy (`branch-notification-policy.ts`), recipient resolver (`branch-recipient-resolver.ts`) và delivery helper (`branch-notification-delivery.ts`); `notify-pr-comment.ts` và `notify-commit-comment.ts` giữ 100% facade methods và re-exports; bổ sung 34 unit tests mới bao phủ message models, identity matching, candidate mapping, task expansion, author exclusion và delivery error swallowing; 196/196 Bitbucket test, full suite 1.716/1.716 và build pass | Closed |
| R-31 | Tách release context loader, pure gate evaluator và summary builder làm lệch Fix Version task lookup, mất fail-safe semantics (unknown trên unreadable data, non-overridable non_empty_release/ci, AI advisory isolation) hoặc sai lệch format summary/notification payload | P0 | Tách context loader (`context-loader.ts` với DI support), pure evaluator (`gates/evaluator.ts`), delivery data loader (`loadReleaseDeliveryData`) và summary builder (`summary-builder.ts`); `release-context.ts`, `release-summary.ts`, `gates/index.ts` giữ 100% facade methods và re-exports; bổ sung 35 unit tests mới bao phủ Fix Version/snapshot resolution, dependency expansion, Sentry fail-safe error handling, 12 gate evaluations, override active rules, source times snapshot và notification payloads; 185 test releases, full suite 1.751/1.751 và Next.js production build pass | Closed |
| R-32 | Tách release result repository và Jira version mutation service làm mất idempotency guard khi release (đã released trên Jira hoặc DB thì không gọi lại Jira), mất fail-safe chặn mutation khi release không ready hoặc empty, sai lệch permission check (release.manage, release.publish, release.approve, release.check), hoặc làm hỏng audit/notification order | P0 | Tách `repository.ts` (persisting checks, gates, history, overrides, approvals, tasks) và `jira-mutation.ts` (`publishRelease`, `createReleaseWithJira`, `fetchProjectJiraVersions`); các release routes trở thành thin controllers; bổ sung 6 test file mới / 73 test mới bao phủ idempotency, non-overridable gates (`non_empty_release`, `ci`), fail-safe empty/in_progress rejection, Jira timeout/archived handling, RBAC permissions, audit sequence và notifications; 258 test releases, full suite 1.824/1.824 và Next.js production build pass | Closed |
| R-33 | Tách Reports query primitives làm rò rỉ database/Prisma code vào client bundle qua các module dùng chung như `period.ts`, hoặc làm sai lệch ngày giới hạn UTC và logic lọc task theo kỳ | P0 | Tách `query-primitives.ts` làm server-only module; giữ `period.ts` là pure client-safe date helper; 26 unit tests mới trong `query-primitives.test.ts` khóa chặt UTC bounds, `filterIssuesForPeriod`, `resolveScopedProjectKeys` và DB mapping; Next.js 16.3.5 production build, 98 test reports liên quan và full suite 1.850/1.850 test pass | Closed |
| R-34 | Tách metric calculators khỏi Prisma loader làm sai lệch các chỉ số rollup portfolio, health status (delivery vs operational), tỷ lệ completion, timezone boundaries tại nửa đêm hoặc gây crash trên tập dữ liệu rỗng (empty dataset) | P0 | Tách pure calculators (`project-metrics.ts`, `portfolio-metrics.ts`, `history-metrics.ts`, `task-calculator.ts`) và snapshot DB service (`snapshot-service.ts`); 100% metric modules không còn import Prisma; bổ sung 17 tests mới trong `metrics-separation.test.ts` và `query-primitives.test.ts` kiểm thử toàn diện empty dataset (0 tasks, 0 projects, 0 events, empty status distribution), timezone shifts (UTC, Asia/Ho_Chi_Minh, America/New_York, Asia/Tokyo) và date boundaries; 115/115 reports test, full suite 1.867/1.867 test và Next.js production build pass | Closed |




## 7. Quy tắc Dừng

Dừng batch và tách issue riêng khi:

- Cần đổi API contract, schema, migration hoặc queue payload.
- Cần sửa hành vi ngoài scope để test pass.
- Không thể mô tả hành vi hiện tại bằng test ổn định.
- Phát hiện dữ liệu production có thể bị ghi/xóa.
- Diff vượt quá khả năng review trong một PR độc lập.
