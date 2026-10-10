# AutoImprove MVP cho Kilo Code

AutoImprove là workflow cục bộ, mỗi lần chạy chỉ xử lý một cải tiến có bằng
chứng. Luồng chính: audit chỉ đọc → chọn issue đủ giá trị → developer duyệt →
baseline theo mức rủi ro → sửa code → review độc lập → validation cùng phạm vi
→ sửa lỗi có giới hạn → report. Không có dashboard, backend hoặc database riêng.

“Một cải tiến” được tính theo một root cause hoàn chỉnh, không phải một dòng code
hay một ví dụ lỗi. Agent phải kiểm tra abstraction và focused tests lân cận, gom
các biểu hiện có bằng chứng của cùng root cause vào một test matrix, rồi sửa chúng
trong cùng phạm vi đã duyệt. Agent không được gom cleanup không liên quan để làm
diff trông lớn hơn, và phải trả `NO_SUITABLE_FINDING` thay vì chạy một micro-fix
không đủ giá trị.

## Thành phần

- `.kilo/agents/auto-improve.md`: agent điều phối và giới hạn quyền.
- `.kilo/agents/code-auditor.md`: subagent chỉ đọc, tìm và xếp hạng vấn đề.
- `.kilo/agents/code-reviewer.md`: subagent chỉ đọc, trả `PASS` hoặc `FAIL`.
- `.kilo/commands/auto-improve.md`: slash command `/auto-improve`.
- `goal.md`: mục tiêu có thể tùy chỉnh.
- `config.json`: profile validation, cache baseline, retry, timeout và danh sách check.
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
3. Gõ `/auto-improve`. Agent audit nhưng chưa sửa code, sau đó trình bày một đề
   xuất gồm issue, lý do đủ giá trị, causal unit, test matrix, file dự kiến đổi,
   rủi ro và profile validation.
4. Chỉ khi bạn xác nhận đề xuất, agent mới chạy baseline và sửa source. Việc đã
   gọi slash command hoặc bật auto-approve không được xem là duyệt đề xuất.
5. Xem diff, report mới trong `autoimprove/reports/`, và log JSON/text trong
   `autoimprove/logs/`.

## Quy tắc ngôn ngữ

Để giảm token và thời gian xử lý, coordinator, auditor và reviewer dùng tiếng Anh
ngắn gọn cho reasoning, tool call, prompt delegation, review evidence và mọi trao
đổi nội bộ. Code, identifier, path, command và status literal không bị dịch.

Chỉ hai đầu ra dùng tiếng Việt:

- Đề xuất và câu hỏi xin developer xác nhận trước khi sửa source.
- Report cuối cùng và phản hồi trực tiếp cho developer.

Các report cũ không được tự viết lại; quy tắc này áp dụng từ lần chạy tiếp theo.

Không tự bật chế độ approve-all: quyền agent cố ý chặn push, merge,
deploy, migration và lệnh Git phá hủy. Thay đổi package/config/docs nằm ngoài
phạm vi tự động sẽ cần approval hoặc bị chặn.

## Tùy chỉnh

- Mục tiêu: sửa `goal.md` trước lần chạy.
- Số lần sửa lỗi: đổi `retryLimit` trong `config.json` (mặc định 3).
  Đây là số repair sau lần validation đầu, không phải vòng lặp cải tiến.
- Timeout: `timeoutMs` áp dụng cho từng check.
- Cache: `baselineCacheMaxAgeMinutes` là tuổi tối đa của baseline có thể tái sử
  dụng. Cache chỉ hợp lệ khi HEAD, toàn bộ fingerprint workspace, config, profile,
  danh sách file và test đều giống hệt.
- Check tùy chọn: chỉ bật `database-integration` khi có database test riêng
  và `TEST_DATABASE_URL` an toàn. Check `mandatory` bị tắt/skip sẽ làm run thất bại.

### Profile `fast`

Chỉ dùng cho thay đổi cục bộ, rủi ro thấp, tối đa ba file hiện có và có focused
test chạy được cả trước lẫn sau thay đổi. Profile chạy typecheck, ESLint đúng các
file được duyệt và focused tests. Nó không chứng minh full test/build đã pass.
Trên repository hiện tại, lần kiểm thử mẫu cho `src/lib/utils.ts` hoàn tất khoảng
11 giây; đây chỉ là số đo tham khảo, không phải cam kết thời gian cho lần sau.
Profile chỉ quyết định validation; thời gian model còn phụ thuộc audit và review.
Để giảm phần này, auditor và reviewer có step budget 6, auditor chỉ khảo sát tối đa
tám file liên quan và dừng ngay khi có một finding đạt value gate. Report tách thời
gian validator khỏi thời gian audit, chờ duyệt, triển khai, review và tổng workflow
khi có timestamp; giai đoạn không có số đo phải ghi `không đo được`.

### Profile `full`

Dùng cho API, auth/permission, database, queue/worker, shared config, file test
mới, thay đổi nhiều module, security hoặc khi chưa chắc rủi ro. Profile chạy
typecheck, full lint, toàn bộ unit tests và production build. DB integration vẫn
là optional cho tới khi có môi trường test riêng.

Mỗi run phải khai báo `--category`. Các category `security`, `auth`, `database`,
`queue` và `config` bị validator ép dùng `full`; chỉ `general` có thể dùng `fast`.
Đây là kiểm soát thực thi, không chỉ là hướng dẫn trong prompt.

Có thể chạy engine thủ công:

```bash
./autoimprove/validate.sh baseline \
  --profile=fast \
  --category=general \
  --file=src/lib/utils.ts \
  --file=src/lib/utils.test.ts \
  --test=src/lib/utils.test.ts

./autoimprove/validate.sh validate \
  --profile=fast \
  --category=general \
  --file=src/lib/utils.ts \
  --file=src/lib/utils.test.ts \
  --test=src/lib/utils.test.ts \
  --attempt=0
```

Mỗi check dùng mảng argument, không nối chuỗi shell. Engine kiểm tra npm script,
lưu exit code, timeout, stdout/stderr và phân biệt `PASS`, `FAIL`, `SKIPPED`,
`UNAVAILABLE`, `BLOCKED`. Một run chỉ `PASS` khi tất cả check bắt buộc của profile
đã chạy và pass. Validation bị `BLOCKED` nếu HEAD/config/profile/scope khác
baseline, không có source change, hoặc có file đổi ngoài phạm vi developer duyệt.

## Khôi phục khi lỗi

- Baseline fail: agent không sửa source. Mở `latest-baseline.json`, xem đường
  dẫn log, sửa lỗi nền thủ công rồi chạy lại.
- Approval bị từ chối hoặc không hỏi được: agent không sửa source và report
  `BLOCKED`; slash command không tự cấp approval nghiệp vụ.
- HEAD hoặc scope đổi sau baseline: validation dừng `BLOCKED`. Không commit giữa
  baseline và validation; chạy lại workflow/baseline với scope đúng.
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
Report chỉ chứng minh các check của profile đã pass, không chứng minh một mức tăng
hiệu năng/bảo trì định lượng. Report phải ghi rõ `fast`/`full`, cache, HEAD, scope,
thời gian validator và các check không chạy.

## Tương thích CLI trong tương lai

Agent, command, goal, config và validator đều là file trong repository, không phụ
thuộc API VS Code. Kilo CLI hiện hành đọc cùng agent/command này. Controller
tương lai có thể tạo worktree, mở session độc lập, thu thập JSON trong
`logs/` và quản lý nhiều lần chạy; phần đó cố ý chưa nằm trong MVP.

Tham chiếu: [Custom agents](https://kilo.ai/docs/customize/custom-modes),
[subagents](https://kilo.ai/docs/customize/custom-subagents),
[workflows](https://kilo.ai/docs/customize/workflows), và
[permissions](https://kilo.ai/docs/customize/agent-permissions).
