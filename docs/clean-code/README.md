# Clean Code Program

> Trang điều hướng cho đợt clean code toàn dự án Team Task Web.
>
> Baseline ghi nhận: 2026-10-08, branch `main`, commit `10401ab`.
>
> Mục tiêu: giảm độ phức tạp và tăng khả năng kiểm thử mà không thay đổi hành vi sản phẩm.

## Cách dùng bộ tài liệu

Đọc và thực hiện theo thứ tự:

1. [00-guardrails.md](00-guardrails.md): phạm vi, bất biến và quy tắc an toàn.
2. [01-module-audit.md](01-module-audit.md): hiện trạng và đích đến của từng module.
3. [02-execution-plan.md](02-execution-plan.md): thứ tự phase, batch và dependency.
4. [03-quality-gates.md](03-quality-gates.md): kiểm tra bắt buộc cho từng commit/PR.
5. [04-manual-qa.md](04-manual-qa.md): checklist kiểm tra trên trình duyệt.
6. [05-progress-tracker.md](05-progress-tracker.md): bảng tiến độ duy nhất được cập nhật khi triển khai.
7. [06-pr-checklist.md](06-pr-checklist.md): mẫu kiểm tra cho từng PR clean code.

Không dùng đồng thời nhiều bảng tiến độ. `05-progress-tracker.md` là nguồn sự thật cho tiến độ mới. File [`../CLEAN_CODE_PLAN.md`](../CLEAN_CODE_PLAN.md) được giữ làm lịch sử của đợt refactor trước.

## Baseline hiện tại

| Gate | Kết quả | Ghi chú |
|---|---|---|
| TypeScript | Pass | `npm run typecheck` |
| ESLint | Pass với 3 warning | 1 import test thừa, 2 import route thừa |
| Vitest | Fail | 4 test fail trong 2 file Jira sync race/integration |
| Build | Chưa chạy lại | Chỉ chạy sau khi test về xanh |
| Git worktree trước khi tạo tài liệu | Sạch | Không có code change |

Các failure hiện tại phải được xử lý trong Phase 0 trước khi refactor production code.

## Nguyên tắc điều hành

- Mỗi batch chỉ xử lý một trách nhiệm hoặc một boundary rõ ràng.
- Refactor và sửa hành vi không nằm trong cùng một commit.
- File gốc được giữ làm facade/re-export khi đang di chuyển API công khai.
- Pure logic được tách trước; code chạm Jira, Prisma hoặc queue chỉ tách khi có characterization test.
- Không lấy số dòng làm mục tiêu duy nhất. Boundary, dependency direction và khả năng kiểm thử quan trọng hơn.
- Mọi checkbox chỉ được đánh dấu sau khi có bằng chứng: test, output lệnh hoặc QA record.

## Nhịp làm việc đề xuất

1. Chọn một batch ở `05-progress-tracker.md` và chuyển sang `IN_PROGRESS`.
2. Ghi baseline riêng của batch.
3. Bổ sung characterization test nếu hành vi chưa được khóa.
4. Refactor theo lát nhỏ, không đổi contract.
5. Chạy quality gates theo `03-quality-gates.md`.
6. Chạy QA liên quan trong `04-manual-qa.md`.
7. Ghi kết quả, commit và chuyển batch sang `DONE`.

## Trạng thái hợp lệ

| Trạng thái | Ý nghĩa |
|---|---|
| `TODO` | Chưa bắt đầu |
| `READY` | Đã đủ test và dependency để làm |
| `IN_PROGRESS` | Đang có người thực hiện |
| `BLOCKED` | Có blocker được mô tả rõ |
| `VERIFY` | Code xong, đang chạy gate/QA |
| `DONE` | Đạt toàn bộ Definition of Done |
| `SKIPPED` | Chủ ý không làm và đã ghi lý do |

