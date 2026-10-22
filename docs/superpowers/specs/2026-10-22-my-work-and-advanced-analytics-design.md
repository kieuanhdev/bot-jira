# Thiết kế Kỹ thuật & Kế hoạch Triển khai: "My Work" Hub & Thống kê Hiệu suất Nâng cao

- **Ngày tạo:** 2026-10-22
- **Tác giả:** Antigravity & Team Lead
- **Mục tiêu:** Tích hợp quản lý nhiệm vụ cá nhân hóa (`/my-work`) và hệ thống đo lường hiệu suất (Personal & Team Analytics)
- **Trạng thái:** Chờ phê duyệt (Draft / In Review)

---

## 1. Bối cảnh & Động lực (Context & Why)

1. **Vấn đề hiện tại:**
   - Người dùng đăng nhập hệ thống hiện phải vào `/board` xem bảng Scrum/Kanban chung của cả dự án, lẫn lộn giữa hàng trăm issue của đồng nghiệp.
   - Không có một "trung tâm điều hành" (Personal Cockpit) để một kỹ sư hay tester biết ngay: *Hôm nay mình cần làm gì? Task nào đến hạn? Ai đang réo mình review/test?*
   - Thiếu các số liệu phản ánh trực tiếp năng suất của chính cá nhân (Velocity cá nhân, Cycle Time, tỷ lệ đóng bug/feature).
   - Phần Báo cáo (`/reports`) mới chỉ có Portfolio/Dự án ở mức vĩ mô, thiếu các biểu đồ Agile kinh điển (Burndown Chart, Cumulative Flow Diagram - CFD, Lead Time / Cycle Time).

2. **Giải pháp tích hợp:**
   - Xây dựng trang **`/my-work`** kết hợp 2 trong 1:
     1. **Personal Task Hub:** Quản lý công việc đa vai trò (Assignee, Reviewer/Approver, Tester, Reporter, Watcher) + Timeline hạn chót (Gantt-style mini).
     2. **Personal Analytics & Performance:** Biểu đồ cá nhân hóa (Velocity tuần, Phân bổ công việc, Lead Time hoàn thành).
   - Bổ sung **Agile Advanced Analytics** (Burndown Chart, CFD) ở cấp độ Release/Sprint có liên kết chặt chẽ từ trang `/my-work`.

---

## 2. Kiến trúc & Phân rã Chức năng (System Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         TRANG ĐIỀU HÀNH CÁ NHÂN: /my-work                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. HEADER & KPI CARDS                                                           │
│    [ Tasks Assignee ]   [ Awaiting My Action ]   [ Overdue/Due Soon ]   [ Velocity ]
├─────────────────────────────────────────────────────────────────────────────────┤
│ 2. TABS NỘI DUNG CHÍNH:                                                         │
│                                                                                 │
│  [📋 Nhiệm vụ của tôi]  [📊 Hiệu suất cá nhân]  [📅 Lộ trình Timeline]  [🕒 Hoạt động] │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────┐   │
│  │ Phân nhóm:        │  │ Personal Velocity │  │ Due Date Timeline │  │ Lịch sử     │   │
│  │ - Đang làm/Cần làm│  │ (Task/Points/tuần)│  │ 14 ngày tới       │  │ thao tác    │   │
│  │ - Cần tôi duyệt/test│ - Cycle & Lead Time│  │ Phân màu theo hạn │  │ gần đây     │   │
│  │ - Tôi báo cáo     │  │ - Task Type Donut │  │ (Gantt mini view) │  │ (Audit Log) │   │
│  │ - Đang theo dõi   │  │ - On-time Rate %  │  │                   │  │             │   │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘  └─────────────┘   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 3. WIDGET SPRINT & DỰ ÁN HIỆN TẠI (Quick Action)                                │
│    - Tiến độ Sprint/Release đang active                                         │
│    - Nút tắt: Xem Burndown Chart & Cumulative Flow Diagram (CFD) chi tiết       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Chi tiết Kỹ thuật (Technical Specifications)

### 3.1. Nguồn dữ liệu & Tận dụng Schema có sẵn
Hệ thống Prisma hiện tại đã có đầy đủ các trường cần thiết trên `IssueCache`:
- `assigneeJira`, `reporterJira`, `approverJira`, `testerJira` -> Lọc theo Jira username của User trong Session.
- `status`, `statusCategory`, `statusChangedAt`, `completedAt` -> Tính toán trạng thái và Cycle Time.
- `priority`, `dueDate`, `points`, `type`, `labels` -> Tính Timeline, Deadline, Work Distribution.
- Quan hệ `Watch` (`userId`, `jiraKey`) -> Lấy danh sách task đang theo dõi.
- Bảng `IssueTransitionEvent` -> Tính thời gian nằm ở từng cột (Lead Time / Cycle Time).
- Bảng `UserActivity` / `AuditLog` -> Lấy lịch sử thao tác gần nhất của user.

### 3.2. Thiết kế API Endpoints mới

1. **`GET /api/my-work/summary`**
   - Trả về 4 KPI cards:
     - `assignedCount` (kèm số lượng `inProgress`, `overdue`, `dueToday`).
     - `waitingActionCount` (số task user đóng vai trò `approverJira` hoặc `testerJira` đang chờ xử lý).
     - `recentDoneCount` (số task hoàn thành trong 7 ngày qua).
     - `onTimeRate` (% task hoàn thành trước hoặc đúng `dueDate`).

2. **`GET /api/my-work/tasks`**
   - Params: `tab = assigned | awaiting_review | awaiting_test | reported | watching`, `statusFilter`, `page`, `limit`.
   - Trả về danh sách issue kèm metadata chi tiết, tags, due date, status badge.

3. **`GET /api/my-work/analytics`**
   - Params: `weeks = 8` (mặc định lấy 8 tuần gần nhất).
   - Trả về:
     - `velocityByWeek`: `[{ weekLabel: "W41", tasksDone: 6, pointsDone: 18 }, ...]`.
     - `typeDistribution`: `[{ type: "Bug", count: 12 }, { type: "Story", count: 18 }, { type: "Task", count: 7 }]`.
     - `cycleTimeStats`: `{ avgLeadTimeHours: 42, avgCycleTimeHours: 18 }`.
     - `statusBreakdown`: Phân bổ số lượng task theo cột.

4. **`GET /api/my-work/timeline`**
   - Params: `days = 14`.
   - Trả về danh sách task có `dueDate` sắp tới, gom nhóm theo Ngày (Today, Tomorrow, Later this week, Next week, Overdue).

5. **`GET /api/analytics/burndown` & `GET /api/analytics/cfd`** (Cấp độ Release/Sprint)
   - Lấy dữ liệu ngày bắt đầu, ngày kết thúc và dữ liệu burn điểm theo từng ngày để vẽ Burndown Chart (Ideal Line vs Actual Line).
   - Lấy số lượng task ở từng status category qua thời gian để vẽ Cumulative Flow Diagram (CFD).

---

## 4. Giao diện Người dùng (UI/UX) theo Design System

Tuân thủ nghiêm ngặt quy chuẩn tại `design-system/team-task-web/MASTER.md`:
- **Font & Palette:** Font Plus Jakarta Sans, màu chủ đạo Teal (`#0D9488` / `hsl(var(--primary))`), hỗ trợ mượt mà cả Light Mode và Dark Mode.
- **Thư viện Biểu đồ:** Sử dụng `Recharts` kết hợp component chuẩn `src/components/ui/chart.tsx`.
- **States:**
  - Loading: Sử dụng `Skeleton` card và table skeletons, không dùng text spinner.
  - Empty: Hiển thị icon vòng tròn mờ + tiêu đề ngắn + gợi ý rõ ràng khi không có task nào.
- **Tương tác:** Hover transitions 150-200ms, filter tabs tức thì với TanStack Query caching.

---

## 5. Lộ trình Triển khai (Execution Plan)

### Giai đoạn 1: Backend Services & API Endpoints (Core Data Layer)
- [ ] **Bước 1.1:** Tạo service `src/lib/my-work/service.ts`:
  - Hàm `getMyWorkSummary(user)`
  - Hàm `getMyWorkTasks(user, filter)`
  - Hàm `getMyWorkAnalytics(user, weeks)`
  - Hàm `getMyWorkTimeline(user, days)`
- [ ] **Bước 1.2:** Viết các Unit Tests cho `my-work` service (`src/lib/my-work/service.test.ts`) kiểm thử logic tính toán (due dates, velocity, role filters).
- [ ] **Bước 1.3:** Tạo Route Handlers:
  - `src/app/api/my-work/summary/route.ts`
  - `src/app/api/my-work/tasks/route.ts`
  - `src/app/api/my-work/analytics/route.ts`
  - `src/app/api/my-work/timeline/route.ts`

### Giai đoạn 2: UI Trang `/my-work` (Personal Cockpit)
- [ ] **Bước 2.1:** Thêm query keys vào `src/lib/query-keys.ts` (`myWorkKeys`).
- [ ] **Bước 2.2:** Xây dựng component KPI Cards: `src/app/(app)/my-work/components/my-work-kpi-cards.tsx`.
- [ ] **Bước 2.3:** Xây dựng Tab Công việc: `src/app/(app)/my-work/components/my-tasks-tab.tsx` (phân nhóm Accordion hoặc Card list với urgency tags).
- [ ] **Bước 2.4:** Xây dựng Tab Hiệu suất cá nhân: `src/app/(app)/my-work/components/my-analytics-tab.tsx` (Velocity Chart, Workload Donut, Cycle Time gauge).
- [ ] **Bước 2.5:** Xây dựng Tab Lộ trình: `src/app/(app)/my-work/components/my-timeline-tab.tsx` (Gantt-style deadline calendar).
- [ ] **Bước 2.6:** Xây dựng Tab Hoạt động: `src/app/(app)/my-work/components/my-activity-tab.tsx`.
- [ ] **Bước 2.7:** Lắp ráp trang chính `src/app/(app)/my-work/page.tsx` và thêm link "My Work" lên thanh điều hướng chính (`app-shell.tsx`).

### Giai đoạn 3: Advanced Agile Charts (Burndown & CFD cấp độ Release/Sprint)
- [ ] **Bước 3.1:** Service tính toán Burndown và CFD (`src/lib/reports/agile-analytics.ts`).
- [ ] **Bước 3.2:** Component biểu đồ Burndown (`burndown-chart.tsx`) với Ideal line vs Actual remaining points.
- [ ] **Bước 3.3:** Component biểu đồ CFD (`cfd-chart.tsx`) dạng Area Chart nhiều tầng phân bổ trạng thái theo thời gian.
- [ ] **Bước 3.4:** Tích hợp tab hoặc widget "Agile Insights" vào trang Reports & liên kết từ trang My Work.

### Giai đoạn 4: Kiểm thử, Thẩm định & Tối ưu
- [ ] **Bước 4.1:** Chạy bộ kiểm thử tự động `npm run test` và `npm run typecheck`.
- [ ] **Bước 4.2:** Kiểm tra giao diện thực tế cả trên Light Mode & Dark Mode.
- [ ] **Bước 4.3:** Hoàn thiện tài liệu thuyết minh tính năng để hỗ trợ báo cáo đồ án.
