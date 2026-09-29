# Leaderboard Page Overrides

> **PROJECT:** Team Task Web
> **Generated:** 2026-09-29
> **Page Type:** Gamification / Leaderboard / Performance Dashboard

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Visual Hierarchy & Gamification Philosophy

- **Goal:** Tạo động lực tích cực, ghi nhận nỗ lực (recognition & achievement), minh bạch điểm số task (Story Points).
- **Primary Metric:** Story Points hoàn thành (`completedPoints`) trong khoảng thời gian đã chọn (Tháng, Quý, Năm, hoặc Toàn bộ).
- **Secondary Metrics:** Điểm đang thực hiện (`inProgressPoints`), số lượng task hoàn thành (`completedTasks`), và tỷ lệ đóng góp (% contribution).

### Time Filtering

- **Time Granularity:**
  - **Theo Tháng:** Tháng hiện tại (mặc định) và các tháng trước.
  - **Theo Quý:** Quý hiện tại (Q1..Q4) và các quý trước.
  - **Theo Năm:** Năm hiện tại và các năm trước.
  - **Tất cả:** Toàn bộ lịch sử từ trước đến nay.
- **Project Filter:** Hỗ trợ lọc theo từng dự án (EPM, CICM, MR...) hoặc xem "Tất cả dự án" được phân quyền.

### Component Structure

1. **Header & Period Bar:**
   - Tiêu đề trang, icon Cúp (`Trophy`), mô tả ngắn truyền cảm hứng.
   - Tabs thời gian (Tháng / Quý / Năm / Tất cả) + Dropdown chọn mốc cụ thể + Dropdown lọc dự án.
2. **Team KPI Overview:**
   - 4 thẻ thống kê: Tổng điểm toàn đội, Tổng task hoàn thành, Điểm trung bình/người, Thành viên tích cực nhất (MVP).
3. **Personal Performance Banner ("Thành tích của bạn"):**
   - Vị trí xếp hạng của user hiện tại, số điểm đã đạt, khoảng cách tới người xếp trên / cấp tiếp theo, thanh tiến độ trực quan.
4. **Top 3 Podium (Bục Vinh Quang):**
   - Thiết kế 3 bục: Bục giữa (Hạng 1 - Vàng, cao nhất, vương miện/cúp vàng), Bục trái (Hạng 2 - Bạc), Bục phải (Hạng 3 - Đồng).
   - Tên thành viên, avatar, huy hiệu cấp bậc, tổng điểm nổi bật.
5. **Leaderboard Ranking Table:**
   - Danh sách toàn bộ thành viên sắp xếp từ cao xuống thấp.
   - Thứ hạng (badge huy chương cho top 3, số cho các vị trí còn lại).
   - Thông tin cá nhân (Avatar, tên hiển thị, username Jira, danh hiệu Tier).
   - Cột điểm hoàn thành (`completedPoints`), điểm đang làm (`inProgressPoints`), số task.
   - Thanh tỷ lệ % đóng góp trực quan.
   - Nút xem chi tiết các task đã đóng góp điểm của thành viên (mở Dialog/Modal danh sách task).
6. **Task Contribution Dialog:**
   - Modal hiển thị chi tiết các task có story point của thành viên trong kỳ: Jira key, Tiêu đề, Trạng thái, Điểm số, ngày hoàn thành, link đến bảng việc.

### Tier System (Cấp Bậc & Danh Hiệu)

| Cấp bậc | Khoảng điểm | Màu sắc / Icon |
|---------|-------------|----------------|
| **Huyền Thoại (Legend)** | ≥ 50 pts | Purple/Indigo gradient, `Sparkles` |
| **Kim Cương (Diamond)** | 30 – 49 pts | Cyan/Sky, `Zap` |
| **Vàng (Gold)** | 20 – 29 pts | Amber/Yellow, `Trophy` |
| **Bạc (Silver)** | 10 – 19 pts | Slate/Silver, `Medal` |
| **Đồng (Bronze)** | 1 – 9 pts | Orange/Bronze, `Award` |
| **Tân Binh (Rookie)** | 0 pts | Muted gray, `Star` |

### Accessibility & Interaction Specs

- Sử dụng icon Lucide chuẩn SVG (`Trophy`, `Medal`, `Crown`, `Sparkles`, `Award`, `TrendingUp`, `Flame`, `Zap`), không dùng emoji thuần làm icon hệ thống.
- Loading states dùng `Skeleton` (`src/components/ui/skeleton.tsx`).
- Responsive: Co giãn mượt mà từ Mobile (<768px), Tablet (768-1024px) đến Desktop (>1024px). Trên Mobile, chuyển Podium thành dạng thẻ gọn gàng.
- Hiệu ứng hover nhẹ (150-200ms ease), tôn trọng `prefers-reduced-motion`.
- Tương thích 100% cả Light Mode và Dark Mode qua semantic tokens (`bg-card`, `bg-muted`, `border-border`, `text-primary`...).
