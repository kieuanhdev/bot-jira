# Quality Gates

## 1. Gate Theo Mức Thay Đổi

| Mức | Ví dụ | Gate bắt buộc |
|---|---|---|
| A | Docs, type-only, rename nội bộ | Typecheck, lint, test liên quan |
| B | Pure logic, mapper, validator | A + unit tests + full test |
| C | Route, Prisma repository, provider adapter | B + contract/integration tests + build |
| D | Queue, Jira sync, bulk execution, release mutation | C + failure/race tests + manual QA liên quan |
| E | UI workflow, DnD, optimistic update | C + browser test desktop/mobile/light/dark |

## 2. Lệnh Chuẩn

### Mỗi commit

```bash
npm run typecheck
npm run lint
npm test -- <test-files-lien-quan>
```

### Trước khi kết thúc batch

```bash
npm run typecheck
npm run lint
npm test
```

### Trước khi kết thúc phase hoặc merge

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Sau Phase 0, lint phải được chạy với chính sách zero-warning trong CI.

## 3. Test Pyramid Cho Dự Án

### Unit test

Áp dụng cho:

- Mapping/normalization.
- Validation và policies.
- Metrics và classification.
- Retry/error classification.
- Reducer/view model.

Không mock toàn bộ Prisma khi hàm cần kiểm transaction thật.

### Contract test

Áp dụng cho:

- API status và JSON shape.
- Jira/Bitbucket provider requests.
- Queue payload/options.
- Shared DTO giữa server và client.

Contract test phải kiểm cả failure response, không chỉ happy path.

### Integration test

Áp dụng cho:

- Prisma transaction và unique constraint.
- Lease/fencing/cursor.
- Bulk operation state machine.
- Outbox state transition.
- Release persistence.

Database test phải dùng database riêng, có setup/teardown rõ và không đọc `.env` production/development ngoài ý muốn.

### Browser test/manual QA

Áp dụng cho:

- Board DnD, keyboard và optimistic update.
- Bulk preview/confirm/retry.
- Dialog, focus và state persistence.
- Reports filters/charts/export.
- Release publish và Branch linking.

## 4. Checklist Review Diff

- [ ] Diff chỉ chứa scope đã ghi trong batch.
- [ ] Không có format churn không liên quan.
- [ ] Public export bị di chuyển có facade/re-export.
- [ ] Reusable `components`, `hooks` và `lib` không import route hoặc feature implementation từ `@/app`.
- [ ] Không đổi literal API/queue/env nếu không được chủ ý.
- [ ] Không đổi transaction boundary ngoài kế hoạch.
- [ ] Không thêm fallback credential.
- [ ] Không swallow error mới bằng `.catch(() => null)` thiếu lý do.
- [ ] Không log token, auth header, webhook secret hoặc raw credential.
- [ ] Không dùng `any`, `@ts-ignore` hoặc cast kép mới.
- [ ] Không tạo abstraction chỉ có một caller nếu không làm rõ boundary.
- [ ] Tên mới phản ánh domain, không dùng `utils2`, `helpers-new` hoặc `common` mơ hồ.

## 5. API Contract Checklist

Cho mỗi route bị chạm:

- [ ] Method và path giữ nguyên.
- [ ] Auth failure giữ nguyên status/body.
- [ ] Permission failure giữ nguyên status/body.
- [ ] Validation failure giữ nguyên status/body.
- [ ] Success response giữ nguyên field, nullability và default.
- [ ] Header/cookie/cache control giữ nguyên.
- [ ] External provider error được map như trước.
- [ ] Test không phụ thuộc ngày giờ thật nếu route có period/date.

## 6. Database Checklist

- [ ] Query giữ project/user scope.
- [ ] Soft-deleted rows tiếp tục bị loại đúng chỗ.
- [ ] `select/include` không làm đổi nullable/default behavior.
- [ ] Write order và transaction giữ nguyên.
- [ ] Unique conflict/idempotency có test.
- [ ] Concurrent update/fencing có test nếu liên quan.
- [ ] Không dùng database thật của developer trong unit suite.

## 7. Queue Checklist

- [ ] Job name không đổi.
- [ ] Payload shape không đổi.
- [ ] Singleton/coalesce behavior không đổi.
- [ ] Retry, backoff và expire không đổi.
- [ ] Abort signal được truyền xuyên suốt.
- [ ] Lease được renew/assert ở đúng checkpoint.
- [ ] Skip không ghi `lastSuccessAt`.
- [ ] Failure không advance cursor.
- [ ] Handler idempotent khi chạy lại.

## 8. Frontend Checklist

- [ ] State owner không bị unmount ngoài ý muốn.
- [ ] Hook order không đổi theo điều kiện.
- [ ] Query key/invalidation giữ nguyên.
- [ ] Optimistic update có rollback.
- [ ] Focus quay lại đúng trigger sau dialog.
- [ ] Keyboard navigation còn hoạt động.
- [ ] DnD allowed/blocked state đúng.
- [ ] Không hydration warning.
- [ ] Không overflow/overlap ở mobile.
- [ ] Light/dark contrast đạt yêu cầu.
- [ ] Loading/empty/error state đầy đủ.

## 9. Bằng Chứng Hoàn Thành

Mỗi batch ghi vào tracker:

- Commit SHA.
- Danh sách test mới/sửa.
- Kết quả bốn lệnh gate.
- QA scenarios đã chạy.
- Risk còn mở và quyết định giữ nguyên.
