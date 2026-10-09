# Audit Theo Module

## Cách đọc

- `P0`: phải xử lý trước mọi refactor khác.
- `P1`: boundary lõi, rủi ro hoặc độ phức tạp cao.
- `P2`: cải thiện maintainability sau khi nền đã ổn định.
- `P3`: polish, docs hoặc tối ưu không cấp thiết.

Số dòng là snapshot ngày 2026-10-08 và chỉ dùng để định hướng.

## 1. Core, Auth Và Shared Infrastructure

**Phạm vi:** `auth.ts`, `session.ts`, `permissions.ts`, `crypto.ts`, `user-creds.ts`, `env.ts`, `prisma.ts`, `audit.ts`, `api-client.ts`, `query-keys.ts`.

**Hiện trạng**

- Module nhỏ, có test cho permission, crypto, credential và audit.
- Error contract giữa route/client chưa thống nhất.
- Helpers dùng chung chưa có vị trí contract rõ ràng.

**Đích đến**

- `src/lib/contracts/`: request/response DTO thuần, không import Next/Prisma.
- `src/lib/errors/`: error code nội bộ và mapper sang HTTP.
- Guard auth/permission dùng chung nhưng vẫn cho phép route tùy biến response hiện tại.

**Checklist**

- [ ] Lập inventory response lỗi hiện tại theo status/code.
- [ ] Tạo type contract dùng chung cho các response được UI sử dụng.
- [ ] Di chuyển `ActiveJiraSyncResponse` khỏi API route.
- [ ] Di chuyển bulk template DTO khỏi API route.
- [ ] Không đổi cookie/session/JWT shape.
- [ ] Test credential không log raw token.

## 2. Jira

**Phạm vi:** `src/lib/jira/`.

**Hiện trạng**

- 33 file, khoảng 7.929 dòng.
- `client.ts` 1.244 dòng chứa auth detection, request/retry và nhiều resource API.
- Board config/membership có cache và stale-while-revalidate riêng.
- Project catalog, access, workflow và people fields phụ thuộc Prisma trực tiếp.

**Đích đến**

```text
jira/
  transport.ts
  errors.ts
  auth.ts
  resources/issues.ts
  resources/boards.ts
  resources/projects.ts
  resources/versions.ts
  resources/worklogs.ts
  resources/permissions.ts
  client.ts                 # facade tương thích
```

**Checklist**

- [ ] Characterize retry, timeout, `Retry-After`, abort và error body.
- [ ] Tách request transport không chứa business rule.
- [ ] Tách resource methods theo API Jira.
- [ ] Giữ `jiraWith`, `jira` và `JiraClient` qua facade.
- [ ] Tách cache policy khỏi fetch Board config/membership.
- [ ] Sửa SWR promise type trong batch bug riêng nếu được duyệt.
- [ ] Contract test cho Basic/Bearer và personal/system credential.
- [ ] Không thay đổi Jira fields hoặc JQL trong commit tách file.

## 3. Issues Read Model

**Phạm vi:** `src/lib/issues/`.

**Hiện trạng**

- Cache mapping, transaction, link sync và notification nằm gần nhau.
- `cache.ts` 535 dòng, được queue và API dùng chung.
- Dependency, standardization và filter đã có unit test tương đối tốt.

**Đích đến**

```text
issues/
  mapping.ts
  repository.ts
  cache-service.ts
  comment-service.ts
  dependency-service.ts
  notification-policy.ts
```

**Checklist**

- [ ] Tách Jira payload mapper thành pure functions.
- [ ] Định nghĩa repository interface ở mức use case cần dùng.
- [ ] Giữ issue + links trong cùng transaction.
- [ ] Chỉ notify sau commit thành công.
- [ ] Test stale update không ghi đè dữ liệu mới.
- [ ] Test comment idempotency và unique conflict.
- [ ] Giữ soft-delete semantics theo project/full scan.

## 4. Queue Và Worker

**Phạm vi:** `src/lib/queue/`, `src/worker.ts`.

**Hiện trạng**

- Khoảng 7.207 dòng.
- `boss.ts` 577 dòng chứa connection, enqueue, schedule, registration và startup reconciliation.
- `poll-jira.ts` 570 dòng; race/integration test đang lệch mock contract.
- `process-webhook.ts` dispatch bốn provider trong một file.

**Đích đến**

```text
queue/
  connection.ts
  job-names.ts
  enqueue.ts
  registry.ts
  schedules.ts
  run-recording.ts
  workers/jira-sync/
  workers/webhooks/
```

**Checklist**

- [ ] P0: thêm `issueCache.findMany` vào test doubles.
- [ ] P0: khôi phục toàn bộ Jira sync tests về xanh.
- [ ] Loại log lỗi giả do mock thiếu method.
- [ ] Tách connection lifecycle khỏi registration.
- [ ] Tách enqueue APIs khỏi schedule definitions.
- [x] Tách Jira fetch-page, persist-page và finalize-sync.
- [x] Giữ renew lease trước fetch, sau fetch và trước finalize.
- [x] Tách handler webhook theo Jira/Bitbucket/Sentry/CI.
- [x] Thêm PostgreSQL integration suite cho fencing/rollback.
- [ ] Test SIGTERM và graceful shutdown.

## 5. Bulk Update Và Bulk Create

**Phạm vi:** `src/lib/bulk/`, `src/app/(app)/bulk/`, `src/app/api/bulk/`.

**Hiện trạng**

- Module lib lớn nhất: khoảng 10.783 dòng.
- `ops.ts` 1.919 dòng; `create-ops.ts` 1.139 dòng; validator 815 dòng.
- Contract, validation, preview, persistence và execution bị trộn.
- UI vẫn có nhiều state và handler tập trung trong client lớn.

**Đích đến**

```text
bulk/
  contracts/
  validation/
  selection/
  preview/
  operations/
  executors/
  retry/
  create/
  import/
```

**Checklist**

- [ ] Khóa request/response contract bằng route tests.
- [ ] Tách action schema và validation khỏi execution.
- [ ] Tách key selection/filter resolution.
- [ ] Tách preview classification thành pure policy.
- [ ] Tách operation repository khỏi executor.
- [ ] Mỗi action kind có executor riêng.
- [ ] Giữ retry count, backoff và terminal states.
- [ ] Giữ bulk-create marker/idempotency reconciliation.
- [ ] Tách parent dependency graph khỏi Jira create loop.
- [ ] Test partial success, retry và parent blocked.
- [ ] UI: tách controller hook khỏi table/configuration views.
- [ ] Browser test preview, confirm, cancel và retry.

## 6. Bitbucket Và Branches

**Phạm vi:** `src/lib/bitbucket/`, `src/app/(app)/branches/`, API branches.

**Hiện trạng**

- 25 file, khoảng 5.397 dòng.
- `client.ts` 682 dòng; link service và task delivery query lớn.
- Notification commit/PR có logic recipient và message gần giống nhau.
- Branch-task là many-to-many và có nhiều nguồn phát hiện link.

**Đích đến**

- Transport/pagination tách khỏi branch và PR domain services.
- Một link reconciliation service xử lý explicit, inferred và primary link.
- Notification policy dùng chung recipient resolver.

**Checklist**

- [x] Tách transport, pagination và error normalization.
- [x] Tách branches, pull requests và repositories resources.
- [x] Chuẩn hóa branch link source/priority.
- [x] Giữ many-to-many linkage và primary link rules.
- [x] Gom recipient resolution commit/PR.
- [ ] Test pagination, permission fallback và duplicate link.
- [ ] Browser test link branch, sync PR và create PR.

## 7. Releases

**Phạm vi:** `src/lib/releases/`, release UI/API.

**Hiện trạng**

- Gate modules đã được tách tương đối tốt.
- Readiness orchestration vẫn tải context, evaluate, persist và summarize cùng luồng.
- Release routes chứa nhiều permission và Jira mutation logic.

**Đích đến**

- Gate giữ pure và độc lập IO.
- Context loader, evaluator, result repository và Jira mutation là bốn boundary riêng.

**Checklist**

- [x] Characterize tất cả mandatory/advisory gate states. (Batch 5.4)
- [x] Tách context loading khỏi gate evaluation. (Batch 5.4)
- [x] Tách result persistence khỏi summary calculation. (Batch 5.5)
- [x] Giữ `unknown` fail-safe semantics. (Batch 5.5)
- [x] Giữ non-empty gate không thể override. (Batch 5.5)
- [x] Contract test approval, override và release responses. (Batch 5.5)
- [ ] Browser test create, ready check, override và publish.

## 8. Reports, Stale Và Leaderboard

**Phạm vi:** `src/lib/reports/`, `src/lib/stale/`, `src/lib/leaderboard/` và UI tương ứng.

**Hiện trạng**

- Reports khoảng 5.422 dòng với query gần giống nhau theo project/member/task.
- `api/stale/route.ts` 577 dòng.
- Metric functions nhìn chung có test tốt.
- Leaderboard type file lớn hơn service file.

**Đích đến**

- Query repository dùng chung scope/period/filter primitives.
- Metric calculation thuần, không biết Prisma.
- Route chỉ parse, authorize và serialize.

**Checklist**

- [x] Tách filter/period parsing dùng chung. (Batch 6.1)
- [x] Tách Prisma selection và domain mapping. (Batch 6.1)
- [x] Gom project/member/task query primitives khi semantics giống nhau. (Batch 6.1)
- [ ] Tách stale route thành query service + mapper.
- [ ] Chia leaderboard DTO theo request/response/view model.
- [x] Test timezone, period boundary và empty dataset. (Batch 6.2)
- [ ] Browser test filters, charts và export.

## 9. Notification, Events Và Chat

**Phạm vi:** `src/lib/notify/`, `src/lib/events/`, `src/lib/chat/`.

**Hiện trạng**

- Outbox/realtime tương đối gọn.
- Chat executor chứa parse result, authorization, command flow và Jira mutation.
- Webhook signature/store đã có test tốt.

**Đích đến**

- Notification delivery adapters đứng sau một delivery contract.
- Chat command handler theo từng command, dùng chung authorization context.

**Checklist**

- [x] Chuẩn hóa delivery result và retry classification.
- [x] Giữ outbox idempotency và delivery state transitions.
- [x] Tách từng chat command handler.
- [x] Tách preview/confirmation khỏi mutation handler.
- [x] Test command authorization và expired confirmation.
- [x] Test push/chat partial failure không làm mất outbox item.

## 10. AI, Sentry Và Worklogs

**Phạm vi:** `src/lib/ai/`, `src/lib/sentry/`, `src/lib/worklogs/`.

**Hiện trạng**

- AI OpenAI/Ollama có flow HTTP/parsing tương tự.
- Sentry nhỏ, mapping/idempotency đã có test.
- Worklog schema là module thuần và đã có test tốt.

**Đích đến**

- Provider AI dùng cùng contract và normalized error.
- Sentry giữ độc lập, không mở rộng abstraction khi chưa cần.
- Worklogs giữ nguyên dạng pure module.

**Checklist**

- [ ] Tách shared LLM response parsing nếu thực sự trùng semantics.
- [ ] Giữ provider-specific transport riêng.
- [ ] Test malformed/empty/unavailable AI response.
- [ ] Giữ Sentry external ID idempotency.
- [ ] Không refactor Worklogs nếu không có pain point mới.

## 11. API Routes

**Hiện trạng**

- 101 route, 73 route import Prisma trực tiếp.
- 15 route vượt 150 dòng.
- Route lớn nhất: stale, releases, Jira avatar, issues và credentials.

**Đích đến**

```text
route = parse request -> authenticate -> authorize -> validate -> call use case -> map response
```

**Checklist**

- [ ] Inventory status/shape trước khi làm mỏng từng route.
- [ ] Không tạo generic route framework khó đọc.
- [ ] Chỉ gom guard khi response semantics giống nhau.
- [ ] Di chuyển business query/mutation vào domain service.
- [ ] Route tests giữ nguyên status và JSON.
- [ ] Không export DTO từ route để UI import.

## 12. Frontend

**Hiện trạng**

- `board-client.tsx`: 969 dòng, 49 hook calls.
- `bulk-client.tsx`: 751 dòng, 41 hook calls.
- Một số màn hình đã tách view nhưng controller vẫn quá lớn.
- Shared `JiraAvatar` import helper từ Board, sai dependency direction.

**Đích đến**

- Feature controller hook quản lý workflow.
- View components nhận typed props và không biết API details.
- Shared visual helpers nằm trong shared/lib phù hợp.

**Checklist**

- [ ] Di chuyển avatar helpers khỏi Board feature.
- [ ] Tách Board filters, selection, sync, DnD và optimistic update hooks.
- [ ] Tách Bulk selection, configuration, preview và operation hooks.
- [ ] Giữ state ownership ở component sống đủ lâu.
- [ ] Test pure reducer/model trước khi tách JSX.
- [ ] Kiểm keyboard, focus, DnD và dialog lifecycle.
- [ ] Kiểm light/dark và mobile theo design system.
