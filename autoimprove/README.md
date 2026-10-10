# AutoImprove MVP cho Kilo Code

AutoImprove là workflow cục bộ, mỗi lần chạy chỉ xử lý một cải tiến nhỏ.
Luồng chính: baseline → audit độc lập → sửa code → review độc lập →
validation → sửa lỗi có giới hạn → report. Không có dashboard, backend hoặc
database riêng.

## Thành phần

- `.kilo/agents/auto-improve.md`: agent điều phối và giới hạn quyền.
- `.kilo/agents/code-auditor.md`: subagent chỉ đọc, tìm và xếp hạng vấn đề.
- `.kilo/agents/code-reviewer.md`: subagent chỉ đọc, trả `PASS` hoặc `FAIL`.
- `.kilo/commands/auto-improve.md`: slash command `/auto-improve`.
- `goal.md`: mục tiêu có thể tùy chỉnh.
- `config.json`: retry, timeout và danh sách check.
- `validate.sh` + `validate.mjs`: validation engine không cần dependency mới.
- `logs/` và `reports/`: bằng chứng cục bộ, đã gitignore.

## Yêu cầu

1. Mở repository bằng Kilo Code Extension bản hiện hành.
2. Dependencies của project đã có sẵn (`node_modules`); workflow không tự cài.
3. Working tree nên sạch hoặc các thay đổi đang có đã được hiểu rõ.
4. Provider Qwen nội bộ đã được developer kết nối trong Kilo. Workflow
   không chứa API key, URL gateway, model ID hay phiên bản Qwen.

Trong Extension, chọn provider/model Qwen hiện có trong phần model. Không cần
sửa agent file: do không khai báo `model`, Kilo tiếp tục dùng lựa chọn của
developer. Nếu provider chưa kết nối, dùng luồng Connect Provider của Kilo và
lưu credential trong kho cấu hình người dùng, không commit vào repository.

## Chạy trong VS Code

1. Sửa `autoimprove/goal.md` nếu muốn thu hẹp mục tiêu.
2. Mở Kilo chat, chạy `/reload` nếu file mới chưa xuất hiện.
3. Gõ `/auto-improve` và theo dõi các approval nếu Kilo yêu cầu.
4. Xem diff, report mới trong `autoimprove/reports/`, và log JSON/text trong
   `autoimprove/logs/`.

Không tự bật chế độ approve-all: quyền agent cố ý chặn push, merge,
deploy, migration và lệnh Git phá hủy. Thay đổi package/config/docs nằm ngoài
phạm vi tự động sẽ cần approval hoặc bị chặn.

## Tùy chỉnh

- Mục tiêu: sửa `goal.md` trước lần chạy.
- Số lần sửa lỗi: đổi `retryLimit` trong `config.json` (mặc định 3).
  Đây là số repair sau lần validation đầu, không phải vòng lặp cải tiến.
- Timeout: `timeoutMs` áp dụng cho từng check.
- Check tùy chọn: chỉ bật `database-integration` khi có database test riêng
  và `TEST_DATABASE_URL` an toàn. Check `mandatory` bị tắt/skip sẽ làm run thất bại.

Có thể chạy engine thủ công:

```bash
./autoimprove/validate.sh baseline
./autoimprove/validate.sh validate --attempt=0
```

Mỗi check dùng mảng argument, không nối chuỗi shell. Engine kiểm tra npm script,
lưu exit code, timeout, stdout/stderr và phân biệt `PASS`, `FAIL`, `SKIPPED`,
`UNAVAILABLE`. Một run chỉ `PASS` khi tất cả check bắt buộc đã chạy và pass.

## Khôi phục khi lỗi

- Baseline fail: agent không sửa source. Mở `latest-baseline.json`, xem đường
  dẫn log, sửa lỗi nền thủ công rồi chạy lại.
- Validation fail: agent chỉ repair theo bằng chứng và dừng sau `retryLimit`.
  Mọi log cũ vẫn được giữ; source không bị tự revert.
- Permission fail: report sẽ là `BLOCKED`. Developer xem diff và quyết định
  cấp approval cụ thể hay chọn issue khác.
- Thay đổi không mong muốn: không dùng lệnh reset/clean tự động. Xem
  `git diff` và phục hồi thủ công chỉ những file đã xác định.

## Giới hạn bảo mật và vận hành

Permission của Kilo là lớp giảm rủi ro, không phải sandbox hệ điều hành.
Script validation vẫn chạy code của repository với quyền của user hiện tại. Chỉ
dùng repository tin cậy; xem lại script package trước khi chạy. Output có thể
chứa trích đoạn source nên `logs/` và `reports/` được gitignore và tạo mode
riêng tư trên hệ hỗ trợ.

MVP không tự tạo branch/worktree, commit, push, merge, deploy, cài dependency,
chạy migration, điều phối nhiều improvement hay khởi động Kilo CLI session.
Report chỉ chứng minh các check cấu hình đã pass, không chứng minh một
mức tăng hiệu năng/bảo trì định lượng.

## Tương thích CLI trong tương lai

Agent, command, goal, config và validator đều là file trong repository, không phụ
thuộc API VS Code. Kilo CLI hiện hành đọc cùng agent/command này. Controller
tương lai có thể tạo worktree, mở session độc lập, thu thập JSON trong
`logs/` và quản lý nhiều lần chạy; phần đó cố ý chưa nằm trong MVP.

Tham chiếu: [Custom agents](https://kilo.ai/docs/customize/custom-modes),
[subagents](https://kilo.ai/docs/customize/custom-subagents),
[workflows](https://kilo.ai/docs/customize/workflows), và
[permissions](https://kilo.ai/docs/customize/agent-permissions).
