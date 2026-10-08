# Clean Code PR Checklist

Sao chép phần từ `## PR Description Template` vào PR description.

## PR Description Template

### Mục tiêu

<!-- Boundary/responsibility nào được làm sạch? -->

### Phạm vi

- Module:
- Batch ID:
- File chính:

### Hành vi phải giữ

-

### Thay đổi chính

-

### Ngoài phạm vi

-

### Test và bằng chứng

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Test liên quan:
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Manual QA scenarios:

### Rủi ro và rollback

- Rủi ro:
- Dấu hiệu regression:
- Cách rollback:

### Checklist tác giả

- [ ] PR chỉ chứa một batch hoặc một boundary review được.
- [ ] Không trộn feature/bug fix không liên quan.
- [ ] Không đổi API/DB/queue/auth contract ngoài kế hoạch.
- [ ] Public export được giữ hoặc migration rõ ràng.
- [ ] Không thêm `any`, `@ts-ignore`, cast kép hoặc lint disable thiếu lý do.
- [ ] Failure paths quan trọng có test.
- [ ] Tracker đã cập nhật trạng thái và commit/PR.

## Reviewer Checklist

### Kiến trúc

- [ ] Dependency đi từ controller -> use case -> domain -> adapter/repository.
- [ ] Domain không import Next.js route hoặc UI.
- [ ] Adapter không quyết định business policy.
- [ ] Abstraction mới giải quyết boundary thật, không chỉ di chuyển dòng code.

### Hành vi

- [ ] API status/body/header không đổi ngoài chủ ý.
- [ ] Transaction và side-effect ordering đúng.
- [ ] Credential/permission checks không yếu đi.
- [ ] Retry/idempotency/fencing semantics được giữ.
- [ ] UI state ownership và lifecycle hợp lý.

### Test

- [ ] Test chứng minh hành vi thay vì khóa implementation detail.
- [ ] Mock surface nhỏ và khớp interface thật.
- [ ] Có failure/concurrency test khi cần.
- [ ] Không dùng clock/timezone/database môi trường một cách ngầm định.

### Code quality

- [ ] Tên module/type/function phản ánh domain.
- [ ] Function có một mức abstraction chính.
- [ ] Error được phân loại và map ở boundary.
- [ ] Log có context nhưng không chứa secret.
- [ ] Comment giải thích lý do/bất biến, không kể lại code.
- [ ] Code chết và import thừa trong scope đã được dọn.

## Merge Gate

- [ ] CI xanh hoàn toàn.
- [ ] Không warning mới.
- [ ] Review các file rủi ro cao đã hoàn tất.
- [ ] Manual QA bắt buộc đã có bằng chứng.
- [ ] Không còn comment review P0/P1 chưa xử lý.
- [ ] Tracker chuyển batch sang `DONE`.

