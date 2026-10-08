# Manual QA Checklist

## Thông tin phiên kiểm tra

| Trường | Giá trị |
|---|---|
| Ngày | |
| Người kiểm tra | |
| Branch/commit | |
| Base URL | |
| Browser | |
| Viewport | |
| Theme | Light / Dark |
| Jira test project | |
| Bitbucket test repo | |

Không dùng issue/release production cho thao tác mutation. Ghi key/id test vào phần Notes.

## 1. Authentication Và Onboarding

- [ ] Token Jira hợp lệ đăng nhập thành công.
- [ ] Token sai/hết hạn hiển thị lỗi đúng, không tạo session.
- [ ] User mới được yêu cầu chọn project.
- [ ] Project selection được lưu sau reload.
- [ ] Logout xóa session và quay về login.
- [ ] Reconnect banner xuất hiện khi credential hết hạn.
- [ ] Không có token trong URL, console hoặc network response.

## 2. App Shell Và Navigation

- [ ] Sidebar/header hiển thị đúng role.
- [ ] Các route chính điều hướng được bằng chuột và bàn phím.
- [ ] Active navigation đúng sau reload/deep link.
- [ ] Notification unread count cập nhật.
- [ ] Global sync indicator xuất hiện/kết thúc đúng.
- [ ] Không layout shift lớn khi dữ liệu tải.

## 3. Board

### Project và dữ liệu

- [ ] Chọn từng project và `All` trả đúng issue scope.
- [ ] Project picker thêm/bỏ project hoạt động.
- [ ] Reload giữ project/board preference.
- [ ] Sync Jira enqueue thành công và trạng thái cập nhật.
- [ ] Freshness banner đúng khi dữ liệu stale/fresh.

### Filter và view

- [ ] Search theo key và summary.
- [ ] Assignee quick switch và multi-filter.
- [ ] Priority/type/label/filter khác kết hợp đúng.
- [ ] Clear filter khôi phục danh sách.
- [ ] Kanban/List switch giữ filter.
- [ ] Hide/collapse/restore columns được lưu.
- [ ] List pagination hoặc `Xem thêm` không trùng/mất item.

### DnD và keyboard

- [ ] Kéo task sang cột transition hợp lệ.
- [ ] Cột không hợp lệ hiển thị blocked và không mutation.
- [ ] Jira failure rollback optimistic update.
- [ ] Keyboard arrows đổi focus đúng.
- [ ] Enter mở quick panel.
- [ ] Escape đóng panel và trả focus.
- [ ] Screen reader label cho button/icon còn đúng.

### Quick panel

- [ ] Summary/status/assignee/priority/labels đúng.
- [ ] Transition, edit, comment và watch hoạt động.
- [ ] Branch/PR section tải và sync được.
- [ ] Deep link issue detail đúng.

## 4. Issue Detail

- [ ] Header và metadata khớp Board.
- [ ] Edit field ghi Jira rồi refresh cache.
- [ ] Transition tải theo context của issue.
- [ ] Add comment hiển thị sau thành công.
- [ ] Log work validate duration/date và xử lý duplicate submit.
- [ ] Versions/labels update đúng.
- [ ] Dependencies hiển thị inward/outward đúng.
- [ ] Branch links, AI tab và comments tab không mất state bất thường.
- [ ] Error state không làm crash toàn trang.

## 5. Bulk Update

### Selection

- [ ] Chọn project, filter và từng issue.
- [ ] Select all chỉ chọn tập đã resolve.
- [ ] URL `?keys=` khôi phục selection.
- [ ] Đổi project không giữ key ngoài scope.

### Configure và preview

- [ ] Từng action: field update, transition, comment, worklog, branch.
- [ ] Validation hiển thị đúng field lỗi.
- [ ] Dependency scope none/direct/recursive đúng.
- [ ] Preview phân loại đúng four states.
- [ ] Cancel preview quay lại cấu hình không mất dữ liệu.

### Execute/history

- [ ] Confirm tạo operation đúng.
- [ ] Progress cập nhật đến terminal state.
- [ ] Partial failure hiển thị từng item.
- [ ] Retry chỉ chạy item hợp lệ.
- [ ] Cancel operation đúng trạng thái cho phép.
- [ ] Return URL standardization hoạt động.

## 6. Bulk Create

- [ ] Chọn project tải đúng metadata.
- [ ] Thêm/xóa/duplicate row.
- [ ] Paste matrix nhiều dòng/cột.
- [ ] Assignee, parent, component, label và custom fields.
- [ ] Defaults áp dụng đúng và không ghi đè row override.
- [ ] CSV import mapping display name sang ID.
- [ ] Excel import/template tải và parse đúng.
- [ ] ParentRef graph hợp lệ được tạo theo thứ tự.
- [ ] Cycle/missing parent bị chặn trước execution.
- [ ] Preview/confirm/progress/retry hoạt động.
- [ ] Reload operation không tạo issue trùng.
- [ ] Fullscreen preference không gây hydration warning.

## 7. Branches Và Pull Requests

- [ ] List/card view và filters.
- [ ] Unlinked/review inbox/task delivery views.
- [ ] Link một branch với nhiều Jira task.
- [ ] Primary link được xác định đúng.
- [ ] Sync branch/PR cập nhật trạng thái.
- [ ] Create PR chọn repository/target branch đúng.
- [ ] Target branch tùy chỉnh hoạt động theo rule hiện tại.
- [ ] Jira key được thêm vào title/description theo cấu hình.
- [ ] Bitbucket auth failure hiển thị reconnect/error đúng.

## 8. Releases

- [ ] List release theo project.
- [ ] Create release/link Jira Fix Version.
- [ ] Add/remove tasks.
- [ ] Ready check hiển thị từng gate.
- [ ] Passed/failed/unknown semantics đúng.
- [ ] Approval và revoke approval.
- [ ] Override yêu cầu reason; gate cấm override vẫn bị chặn.
- [ ] Publish/release yêu cầu đúng permission.
- [ ] Jira failure không đánh dấu local released.
- [ ] Released/archived state hiển thị đúng sau reload.

## 9. Reports

- [ ] Portfolio project scope đúng.
- [ ] Period preset/custom dates đúng timezone.
- [ ] Overview KPIs khớp task list mẫu.
- [ ] Status chart: donut/pipeline/table.
- [ ] Toggle Task/SP/giờ.
- [ ] Hover/click status filter.
- [ ] Tasks filters và pagination.
- [ ] Members metrics và modal/detail.
- [ ] Trends/throughput/bottleneck charts không rỗng sai.
- [ ] CSV export đúng filter và encoding.
- [ ] Empty state khi project chưa có data.

## 10. Stale Và Standardization

- [ ] `Việc của tôi` và `Toàn dự án` đúng scope.
- [ ] Tabs/focus sections đúng count.
- [ ] SLA, blocked và overdue classification đúng task mẫu.
- [ ] Scope/filter/search kết hợp đúng.
- [ ] Select multiple và bulk action.
- [ ] Quick edit giữ optimistic/rollback behavior.
- [ ] `Xem thêm` không trùng item.
- [ ] Empty/error/loading state đúng.

## 11. Leaderboard

- [ ] Project/period/realm filters.
- [ ] Summary cards và podium khớp table.
- [ ] Member modal hiển thị breakdown đúng.
- [ ] Personal banner đúng current user.
- [ ] Tie/zero-data/unknown-user cases hiển thị ổn định.

## 12. Notifications Và Watch

- [ ] Watch/unwatch issue.
- [ ] Watched issue xuất hiện đúng danh sách.
- [ ] Notification filters và pagination.
- [ ] Mark one/all read cập nhật unread count.
- [ ] Realtime event không tạo row trùng.
- [ ] Push subscription/unsubscribe.
- [ ] Discord delivery preference lưu và test được.
- [ ] Delivery failure không làm mất notification trong app.

## 13. Settings Và Permissions

- [ ] Jira integration status và reconnect.
- [ ] Bitbucket save/verify/disconnect.
- [ ] Notification preferences.
- [ ] Discord identity/integration linking.
- [ ] Project people fields chỉ role cho phép sửa.
- [ ] User role change chỉ admin thực hiện.
- [ ] Member/lead/release_manager/admin thấy đúng action.
- [ ] Gọi API trực tiếp vẫn bị authorize, không chỉ ẩn UI.

## 14. Cross-Cutting Visual QA

Chạy ít nhất ở desktop 1440x900 và mobile 390x844:

- [ ] Light mode.
- [ ] Dark mode.
- [ ] Không horizontal overflow ngoài vùng table chủ ý.
- [ ] Không text/button overlap.
- [ ] Dialog/sheet không vượt viewport.
- [ ] Long issue key, name, summary và label không phá layout.
- [ ] Focus ring nhìn thấy rõ.
- [ ] Icon button có accessible name/tooltip phù hợp.
- [ ] Animation tôn trọng reduced motion.
- [ ] Contrast text chính/phụ đạt yêu cầu.

## 15. Kết quả

| Scenario lỗi | Route/Module | Bằng chứng | Severity | Issue/Commit |
|---|---|---|---|---|
| | | | | |

### Notes

- Test data:
- Console warnings:
- Network errors:
- Các mục cố ý chưa chạy:

