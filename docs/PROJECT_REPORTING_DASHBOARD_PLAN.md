# Kế hoạch chi tiết — Báo cáo dự án theo tuần/tháng

> Phiên bản: 2.0  
> Ngày cập nhật: 2026-10-03  
> Trạng thái: Đã hoàn thành triển khai v2 (P0–P4 hoàn tất, Typecheck & Tests pass, Production build pass)  
> Phạm vi chính: Project portfolio, báo cáo theo kỳ, trạng thái task, xu hướng,
> đóng góp và tải công việc của thành viên, Fix Version tùy chọn, export  
> Stack: Next.js App Router, React 19, Tailwind CSS v4, shadcn/ui,
> TanStack Query, Recharts v3, Prisma/PostgreSQL, pg-boss, Jira read model

---

## 1. Bối cảnh và mục tiêu

Implementation hiện tại mang tên báo cáo dự án nhưng đang tự động chọn Fix
Version/Release đang hoạt động làm phạm vi mặc định. Cách này phù hợp với báo
cáo release nhưng không trả lời đầy đủ nhu cầu quản lý dự án theo tuần hoặc
tháng, đặc biệt với:

- task không thuộc Fix Version;
- task được tạo từ kỳ trước nhưng vẫn đang xử lý trong kỳ hiện tại;
- task hoàn thành trong kỳ;
- thay đổi trạng thái và xu hướng tồn đọng;
- đóng góp, tải công việc và tín hiệu cần hỗ trợ của từng thành viên.

Mục tiêu của phiên bản 2.0:

1. Báo cáo mặc định theo **project + kỳ báo cáo**, không phụ thuộc Fix Version.
2. Hỗ trợ tuần, tháng và khoảng ngày tùy chọn.
3. Phân biệt rõ trạng thái tại cuối kỳ với hoạt động phát sinh trong kỳ.
4. Cho phép xem Fix Version như bộ lọc phụ hoặc chế độ phân tích release.
5. Hiển thị trạng thái task, luồng công việc, rủi ro và xu hướng.
6. Đánh giá thành viên bằng tín hiệu minh bạch, phục vụ cân bằng tải và hỗ trợ;
   không quy đổi thành một điểm hiệu suất hoặc bảng xếp hạng.
7. Mọi số liệu lịch sử phải có nguồn dữ liệu và mức tin cậy rõ ràng.

Tính năng có hai lớp:

- **Portfolio:** so sánh tình hình các project trong cùng một kỳ.
- **Project detail:** phân tích tổng quan, task, thành viên và xu hướng của một
  project trong kỳ được chọn.

---

## 2. Quyết định sản phẩm

### 2.1 Project và kỳ báo cáo là phạm vi chính

Thứ tự phạm vi:

1. Project bắt buộc.
2. Kỳ báo cáo bắt buộc, mặc định `Tuần này`.
3. Fix Version tùy chọn, mặc định `Tất cả version`.
4. Assignee, status và loại task là bộ lọc điều tra.

Ví dụ nhãn phạm vi:

`Project ABC / Tuần 40, 2026 / Tất cả version / cập nhật 10:30`.

Không được tự chọn active release khi client không truyền `versionId`.

### 2.2 Hai loại số liệu thời gian

Báo cáo kỳ phải tách hai khái niệm:

- **Snapshot cuối kỳ:** trạng thái của toàn bộ task thuộc project tại thời điểm
  kết thúc kỳ, ví dụ backlog, WIP, blocked, overdue.
- **Flow trong kỳ:** sự kiện xảy ra từ `from` đến `to`, ví dụ task tạo mới,
  task chuyển Done, task đổi trạng thái, throughput.

Không lọc toàn bộ báo cáo bằng `IssueCache.createdAt BETWEEN from AND to`.
Cách lọc đó làm mất task được tạo từ trước nhưng còn hoạt động trong kỳ.

### 2.3 Fix Version là chiều phân tích phụ

- `versionId` rỗng nghĩa là toàn project.
- Chỉ áp dụng filter version khi người dùng chủ động chọn.
- Chế độ release có thể hiển thị progress, deadline và schedule gap.
- Chế độ toàn project không gọi completion ratio là “khả năng kịp release” nếu
  project không có deadline cấp project.

### 2.4 Không đồng nhất task count với khối lượng

Đơn vị mặc định là `auto`:

1. Story point nếu tối thiểu 80% task trong scope có point.
2. Original estimate nếu tối thiểu 80% task có estimate.
3. Số task nếu hai loại dữ liệu trên không đạt ngưỡng.

API luôn trả coverage. Giá trị thiếu không được âm thầm coi là 0 khi tính tỷ lệ
hoàn thành theo point hoặc estimate.

### 2.5 Đánh giá thành viên có giới hạn

Phần thành viên được gọi là **Đóng góp và tải công việc**, không phải leaderboard.

Được phép hiển thị:

- khối lượng hoàn thành trong kỳ;
- task đang làm tại cuối kỳ;
- task blocked, overdue, quá SLA;
- workload hiện tại;
- xu hướng so với chính thành viên đó ở kỳ trước;
- tín hiệu `Cân bằng`, `Tải cao`, `Cần gỡ nghẽn` hoặc
  `Không đủ dữ liệu`, kèm lý do.

Không được:

- tạo một điểm hiệu suất tổng hợp;
- xếp hạng tốt/xấu giữa các thành viên;
- coi số task hoặc story point là chất lượng;
- kết luận năng lực cá nhân khi thiếu dữ liệu review, độ khó hoặc thời gian tham gia.

### 2.6 Freshness và độ tin cậy

- Dữ liệu Jira stale thì health không được là `healthy`.
- Metric dùng ngày hoàn thành fallback phải trả data-quality warning.
- Export chứa thời điểm sync, timezone, kỳ báo cáo và bộ lọc.
- Không giả lập lịch sử từ `updatedAt`.

---

## 3. Phạm vi chức năng

### 3.1 Bắt buộc cho báo cáo kỳ

- Portfolio theo tuần/tháng/custom range.
- Project detail với bốn tab: Tổng quan, Công việc, Thành viên, Xu hướng.
- Preset: tuần này, tuần trước, tháng này, tháng trước, custom.
- So sánh với kỳ liền trước có cùng độ dài.
- Fix Version mặc định `Tất cả`.
- KPI snapshot cuối kỳ và flow trong kỳ.
- Phân bố trạng thái, throughput, backlog change và task risk.
- Danh sách task có filter trạng thái, assignee, risk và activity.
- Báo cáo đóng góp/tải công việc theo thành viên.
- Export CSV theo đúng project, period và các filter đã chọn.
- Authorization phía server, loading skeleton, empty/error/stale state.

### 3.2 Sau khi đủ dữ liệu lịch sử

- Cumulative Flow Diagram.
- Burn-up toàn project hoặc theo Fix Version.
- Scope added/removed có drill-down.
- Cycle time và lead time theo percentile.
- Forecast deterministic khi đủ mẫu và có deadline rõ ràng.

### 3.3 Ngoài phạm vi

- Timesheet hoặc chi phí tài chính.
- Điểm KPI cá nhân và bảng xếp hạng năng suất.
- Tự động đánh giá chất lượng code từ số task/story point.
- Gantt và quản lý dependency toàn diện.
- Sprint report trước khi có sprint read model.
- LLM tự tạo kết luận không kèm rule/evidence.

---

## 4. Người dùng và quyền

| Vai trò | Portfolio | Project detail | Thành viên | Export | Cấu hình ngưỡng |
|---|:---:|:---:|:---:|:---:|:---:|
| `member` | Có | Trong project được phép | Có | Có | Không |
| `release_manager` | Có | Có | Có | Có | Không |
| `admin` | Có | Có | Có | Có | Có |

Sử dụng `report.view`, `report.export`, `report.configure`. API phải enforce
permission và project scope; ẩn nút trên UI không thay thế authorization.

---

## 5. Định nghĩa kỳ và scope

### 5.1 Period

Contract chuẩn:

```ts
type ReportPeriodPreset =
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "custom";

interface ReportPeriod {
  preset: ReportPeriodPreset;
  from: string; // YYYY-MM-DD, inclusive
  to: string;   // YYYY-MM-DD, inclusive
  timezone: string;
}
```

- Tuần bắt đầu thứ Hai, kết thúc Chủ nhật.
- `from` và `to` được diễn giải theo timezone báo cáo.
- Backend tự tính range cho preset; custom bắt buộc đủ cả hai ngày.
- Khoảng tối đa 24 tháng.
- Kỳ so sánh đứng ngay trước kỳ hiện tại và có cùng số ngày.

### 5.2 Scope toàn project

Một issue thuộc snapshot project khi:

- đúng `projectKey`;
- `deletedAt IS NULL` tại thời điểm truy vấn hiện tại;
- tồn tại trước hoặc tại cuối kỳ nếu có lịch sử đáng tin cậy;
- thỏa `versionId` khi người dùng chủ động chọn version;
- thỏa include/exclude subtask.

Assignee/status/risk filter mặc định chỉ áp dụng cho bảng điều tra. KPI tổng chỉ
đổi scope khi UI ghi rõ “Áp dụng vào toàn báo cáo”.

### 5.3 Chuẩn hóa trạng thái

Mọi workflow được gom về:

- `Backlog`
- `To Do`
- `In Progress`
- `In Review`
- `QA/Test`
- `Blocked`
- `Done`
- `Unknown`

`Unknown` phải hiển thị và làm giảm độ tin cậy; không suy đoán là Done.

### 5.4 Mốc thời gian task

Ưu tiên ngày hoàn thành:

1. Jira Done At đã cấu hình.
2. Jira `resolutiondate`.
3. Transition event đầu tiên đi vào status group `Done`.
4. `statusChangedAt` nếu current status là Done, gắn confidence thấp.

Không dùng `updatedAt` hoặc `createdAt` làm ngày hoàn thành chính thức.

---

## 6. Định nghĩa metric

### 6.1 Snapshot cuối kỳ

- `openAtEnd`: task chưa Done tại cuối kỳ.
- `doneAtEnd`: task ở Done tại cuối kỳ.
- `wipAtEnd`: task thuộc In Progress/In Review/QA.
- `blockedAtEnd`: task blocked tại cuối kỳ.
- `overdueAtEnd`: task chưa Done và due date trước cuối ngày `to`.
- `overSlaAtEnd`: task vượt SLA trạng thái tại cuối kỳ.
- `unassignedAtEnd`: task mở chưa có assignee.
- `statusDistributionAtEnd`: phân bố theo status group.

### 6.2 Flow trong kỳ

- `createdInPeriod`: task được tạo trong kỳ.
- `completedInPeriod`: task lần đầu chuyển Done trong kỳ.
- `reopenedInPeriod`: task từ Done quay lại nhóm chưa Done trong kỳ.
- `statusTransitionsInPeriod`: số lần đổi status group trong kỳ.
- `throughput`: task hoặc khối lượng hoàn thành trong kỳ.
- `netBacklogChange = createdInPeriod - completedInPeriod`.

### 6.3 Completion ratio

```text
Task completion ratio = doneAtEnd / totalAtEnd * 100
Point completion ratio = done points at end / total points at end * 100
Estimate completion ratio = done estimate at end / total estimate at end * 100
```

Ở scope toàn project, UI gọi là **Tỷ lệ hoàn thành hiện tại**, không gọi là
“tiến độ so với kế hoạch”. Chỉ chế độ Fix Version/deadline mới dùng delivery
progress và schedule gap.

### 6.4 So sánh kỳ trước

Mỗi flow metric có thể trả:

- giá trị kỳ hiện tại;
- giá trị kỳ trước;
- chênh lệch tuyệt đối;
- phần trăm thay đổi khi mẫu số kỳ trước khác 0.

Không gắn tăng/giảm là tốt/xấu nếu metric không có ý nghĩa một chiều.

### 6.5 Cycle time và aging

- `cycleTime`: từ lần đầu vào In Progress đến lần đầu Done.
- `stateAge`: business days trong trạng thái hiện tại.
- Hiển thị median và P85 khi có tối thiểu 10 mẫu hợp lệ.
- Không tính cycle time chính xác nếu thiếu transition history.

### 6.6 Workload và tín hiệu thành viên

Mỗi thành viên trả:

- `completedTasks`, `completedPoints` trong kỳ;
- `currentWip`, `currentBlocked`, `currentOverdue`, `currentOverSla`;
- `assignedOpenTasks` tại cuối kỳ;
- `medianCycleTime` nếu đủ dữ liệu;
- delta so với kỳ trước;
- `supportSignal` và `supportReasons[]`.

Rule gợi ý:

- `insufficient_data`: dữ liệu stale hoặc thiếu mapping/transition.
- `needs_unblock`: có blocked quá SLA hoặc nhiều task blocked kéo dài.
- `high_load`: WIP cao hơn ngưỡng cấu hình và có aging tăng.
- `balanced`: không có tín hiệu trên.

Không tạo signal “low performance”. Thành viên hoàn thành 0 task nhưng không có
task được giao phải là `insufficient_data`, không phải đánh giá tiêu cực.

### 6.7 Project health

Có hai chế độ:

**Operational health** cho toàn project theo kỳ:

1. `unknown` nếu stale hoặc thiếu dữ liệu nền.
2. `at_risk` nếu blocker nghiêm trọng quá SLA, overdue cao hơn ngưỡng hoặc
   backlog tăng mạnh trong nhiều kỳ.
3. `attention` nếu có blocked/overdue hoặc throughput giảm liên tiếp.
4. Còn lại `healthy`.

**Delivery health** khi chọn Fix Version có deadline:

- bổ sung deadline passed, deadline imminent và schedule gap;
- `completed` khi toàn bộ scope Done;
- luôn trả `healthReasons[]`.

---

## 7. Thiết kế trải nghiệm

### 7.1 Điều hướng và URL

- `/reports/projects`: portfolio.
- `/reports/projects/[projectKey]`: project detail.
- URL lưu toàn bộ scope:
  `?period=this_week&from=2026-09-28&to=2026-10-04&versionId=all&unit=auto`.

### 7.2 Filter bar

Thứ tự:

1. Project.
2. Kỳ báo cáo.
3. Nút lùi/tiến một kỳ.
4. Custom date range.
5. Fix Version, mặc định `Tất cả version`.
6. Unit.
7. Export và refresh.

Header luôn hiển thị timezone, thời điểm sync và nhãn scope đang áp dụng.

### 7.3 Portfolio

Summary:

- tổng project;
- healthy/attention/at risk/unknown;
- tổng completed trong kỳ;
- tổng blocked tại cuối kỳ.

Bảng project:

| Cột | Nội dung |
|---|---|
| Project | Tên + key |
| Kỳ | Tuần/tháng/custom |
| Hoàn thành trong kỳ | Task và đơn vị được chọn |
| Tồn cuối kỳ | Open/WIP |
| Blocked | Tại cuối kỳ |
| Overdue | Tại cuối kỳ |
| Backlog change | Created trừ completed |
| Health | Badge + lý do chính |
| Freshness | Thời điểm sync |

Không hiển thị active version như scope mặc định. Có thể thêm release gần nhất
như thông tin tham khảo, không dùng nó để lọc số liệu.

### 7.4 Project detail

#### Tab Tổng quan

- Health summary.
- KPI: tồn đầu kỳ, tạo mới, hoàn thành, tồn cuối kỳ, WIP, blocked, overdue.
- So sánh kỳ trước.
- Phân bố trạng thái cuối kỳ.
- Throughput trong kỳ.
- Danh sách rủi ro nổi bật.

#### Tab Công việc

- Bảng toàn bộ task liên quan đến scope.
- Filter status, assignee, risk, activity và Fix Version.
- Nhãn phân biệt `Tạo trong kỳ`, `Hoàn thành trong kỳ`, `Đang tồn`,
  `Không thay đổi`.
- Click KPI hoặc chart mở đúng filter và giữ nguyên period.

#### Tab Thành viên

| Cột | Nội dung |
|---|---|
| Thành viên | Tên + Jira username |
| Hoàn thành trong kỳ | Task/point/estimate |
| WIP hiện tại | Số task đang xử lý |
| Blocked | Số task và tuổi lớn nhất |
| Overdue/Over SLA | Tín hiệu cần hỗ trợ |
| So với kỳ trước | Delta có ngữ cảnh |
| Trạng thái hỗ trợ | Balanced/High load/Needs unblock/Insufficient data |

Cho phép mở drawer chi tiết task của một thành viên. Không có rank, top 1 hoặc
điểm tổng hợp.

#### Tab Xu hướng

- Throughput theo ngày/tuần.
- Backlog created vs completed.
- Cumulative Flow khi đủ snapshot.
- Burn-up và scope change.
- Data sufficiency message khi chưa đủ lịch sử.

### 7.5 Trạng thái UI và visual system

- Loading dùng `Skeleton`.
- Empty state có icon Lucide trong vòng tròn muted, title và một dòng hướng dẫn.
- Dùng semantic tokens, không hardcode màu chart.
- Teal cho dữ liệu chính; badge success/warning/danger/info cho health.
- Mọi chart có legend, tooltip và bảng dữ liệu thay thế.
- Clickable element có `cursor-pointer`, focus rõ và transition 150–200ms.
- Tôn trọng reduced motion, light/dark contrast tối thiểu 4.5:1.
- Kiểm tra 375, 768, 1024 và 1440px.

---

## 8. Kiến trúc dữ liệu

### 8.1 Dữ liệu hiện có

`IssueCache` cung cấp current state, assignee, status, points, estimate, due
date, Fix Version và raw Jira fields. `ProjectReportSnapshot` hiện đã lưu
aggregate hằng ngày cho project và version.

### 8.2 Giới hạn

Current-state read model không đủ để tái dựng chính xác:

- status của từng task tại một ngày quá khứ;
- lần đầu task chuyển Done;
- reopen;
- assignee thay đổi trong kỳ;
- task nào làm scope tăng/giảm;
- cycle time lịch sử.

Aggregate snapshot hiện tại đủ cho xu hướng cấp project nhưng chưa đủ cho
drill-down task hoặc member history.

### 8.3 Mô hình dữ liệu bổ sung

Ưu tiên lưu event chuẩn hóa:

```prisma
model IssueTransitionEvent {
  id              String   @id @default(cuid())
  eventKey        String   @unique
  jiraKey         String
  projectKey      String
  occurredAt      DateTime
  fromStatus      String?
  toStatus        String
  fromStatusGroup String?
  toStatusGroup   String
  assigneeJira    String?
  source          String
  capturedAt      DateTime @default(now())

  @@index([projectKey, occurredAt])
  @@index([jiraKey, occurredAt])
  @@index([assigneeJira, occurredAt])
}
```

Nếu Jira webhook/changelog không đảm bảo đầy đủ, bổ sung snapshot item hằng ngày:

```prisma
model ProjectReportScopeItem {
  id              String   @id @default(cuid())
  snapshotDate    DateTime
  projectKey      String
  jiraVersionId   String   @default("")
  jiraKey         String
  statusGroup     String
  assigneeJira    String?
  points          Int?
  estimateSeconds Int?
  dueDate         DateTime?

  @@unique([snapshotDate, projectKey, jiraVersionId, jiraKey])
  @@index([projectKey, snapshotDate])
  @@index([projectKey, assigneeJira, snapshotDate])
}
```

Event là nguồn ưu tiên cho flow; snapshot item là nguồn cho “as of date” và
đối chiếu. Aggregate snapshot tiếp tục dùng cho chart nhanh.

### 8.4 Retention và backfill

- Aggregate: tối thiểu 24 tháng.
- Transition event: tối thiểu 24 tháng.
- Scope item: 180 ngày trước khi archive/aggregate.
- Không suy diễn lịch sử trước ngày bắt đầu thu thập.
- Backfill từ Jira changelog là job riêng, rate-limited và gắn
  `source=changelog_backfill`.

---

## 9. API contract

### 9.1 Portfolio

`GET /api/reports/projects`

Query:

- `period=this_week|last_week|this_month|last_month|custom`
- `from`, `to`, `timezone`
- `projects=ABC,XYZ`
- `health=at_risk,attention`
- `unit=auto|tasks|points|estimate`
- `versionId` chỉ khi người dùng chủ động phân tích cùng một version hợp lệ.

Không còn `versionMode=active` mặc định.

### 9.2 Project detail

`GET /api/reports/projects/[projectKey]`

Query:

- period/from/to/timezone;
- `versionId` optional, vắng mặt nghĩa là toàn project;
- unit;
- `includeSubtasks=true|false`;
- `comparePrevious=true|false`.

Response:

```ts
interface ProjectPeriodReport {
  project: { key: string; name: string };
  period: ReportPeriod;
  comparisonPeriod: ReportPeriod | null;
  scope: {
    versionId: string | null;
    versionName: string | null;
    unit: "tasks" | "points" | "estimate";
    includeSubtasks: boolean;
  };
  snapshotAtEnd: ProjectSnapshotMetrics;
  flow: ProjectFlowMetrics;
  comparison: MetricComparison | null;
  health: ProjectHealth;
  statusDistribution: StatusDistributionItem[];
  topRisks: RiskTaskItem[];
  dataQuality: DataQualityWarning[];
  freshness: ReportFreshness;
}
```

### 9.3 Task list

`GET /api/reports/projects/[projectKey]/tasks`

- Cùng period/scope với detail.
- Filter: status group, assignee, risk, activity type, version.
- Cursor pagination; sort whitelist.
- `activity=created|completed|reopened|changed|current_open|stale`.

Risk endpoint cũ có thể giữ tương thích và chuyển dần sang task endpoint.

### 9.4 Members

`GET /api/reports/projects/[projectKey]/members`

- Cùng period/version/unit.
- Trả contribution, current load, risk signals, previous-period delta và task
  preview.
- Không trả `rank`, `score`, `tier` trong contract báo cáo dự án.

### 9.5 History và export

- `GET /api/reports/projects/[projectKey]/history`
- `GET /api/reports/projects/[projectKey]/export?format=csv`

History downsample theo tuần khi range dài. Export chứa metadata, summary, task
và member sections; không chứa description/comment/raw Jira.

### 9.6 Validation

- Validate project trong allowed scope.
- Validate date theo timezone và giới hạn 24 tháng.
- Validate version thuộc đúng project.
- Trả `400/401/403/404` đúng ngữ nghĩa.
- Nếu thiếu lịch sử, trả warning và metric `null`, không dựng số giả.

---

## 10. Backend và frontend structure

```text
src/lib/reports/
  period.ts
  scope.ts
  status.ts
  current-metrics.ts
  flow-metrics.ts
  member-metrics.ts
  health.ts
  data-quality.ts
  portfolio-query.ts
  project-query.ts
  task-query.ts
  member-query.ts
  history-query.ts
  snapshot.ts
  export.ts
```

```text
src/app/(app)/reports/projects/
  project-portfolio-client.tsx
  report-period-filter.tsx
  project-report-table.tsx
  [projectKey]/
    project-report-client.tsx
    overview-tab.tsx
    tasks-tab.tsx
    members-tab.tsx
    trends-tab.tsx
    project-kpis.tsx
    status-distribution-chart.tsx
    throughput-chart.tsx
    backlog-flow-chart.tsx
    cumulative-flow-chart.tsx
```

Query key phải chứa project, normalized period, timezone, version, unit và các
filter thực sự ảnh hưởng response. Giữ previous data khi chuyển kỳ hợp lệ.

---

## 11. Migration từ implementation hiện tại

### 11.1 Những phần giữ lại

- Permission và project scope.
- Status normalization.
- Coverage/unit selection.
- Risk evaluation, stale/SLA utilities.
- Freshness banner.
- Aggregate snapshot service.
- CSV escaping.
- Skeleton, empty/error states và chart primitives.

### 11.2 Những phần phải thay đổi

| Hiện tại | Mục tiêu |
|---|---|
| Tự chọn active release | Toàn project mặc định |
| Chỉ có Version + Unit | Period + Project + optional Version + Unit |
| Date filter theo `createdAt` | Snapshot cuối kỳ + flow event trong kỳ |
| Portfolio theo active release | Portfolio theo cùng một kỳ |
| Workload current state | Contribution trong kỳ + current load |
| Chỉ có risk task table | Task explorer theo activity/status/risk |
| Health dựa release deadline | Operational health; delivery health khi có release |
| History API chưa có | History API từ snapshot/event |

### 11.3 Tương thích

- Có thể tiếp tục nhận `versionId`; chỉ bỏ hành vi tự chọn khi thiếu param.
- API response v1 nên được đổi version hoặc migrate atomically với UI.
- Link cũ chỉ có `versionId` được diễn giải là release scope trong kỳ mặc định.
- Không đánh dấu P1–P3 cũ là chưa từng hoàn thành; ghi nhận là implementation
  v1 cần refactor theo contract v2.

---

## 12. Kế hoạch triển khai & Trạng thái hoàn thành

### P0 — Chốt contract v2 → DONE
- [x] Period semantics, timezone và previous-period comparison (`src/lib/reports/period.ts`, `period.test.ts`).
- [x] Phân biệt snapshot metric cuối kỳ với flow metric trong kỳ (`current-metrics.ts`, `flow-metrics.ts`).
- [x] Audit Done At/resolution date/changelog trên dữ liệu thật (`completion-date.ts` multi-tier priority + confidence).
- [x] Chốt ngưỡng support signal theo project config (`member-metrics.ts`: balanced, high_load, needs_unblock, insufficient_data).

### P1 — Sửa scope hiện tại → DONE
- [x] Bỏ auto-select active release ở detail và portfolio (`portfolio-query.ts`, `project-query.ts`).
- [x] Thêm period parser/validation (`src/lib/reports/period.ts`).
- [x] Thêm period filter và URL state (`report-period-filter.tsx`, `project-portfolio-client.tsx`, `project-report-client.tsx`).
- [x] Đổi label “tiến độ” thành “tỷ lệ hoàn thành” ở project scope (`overview-tab.tsx`, `project-report-table.tsx`, `export.ts`).
- [x] Sửa export metadata và filename theo period (`src/lib/reports/export.ts`, `/api/reports/projects/[projectKey]/export`).

### P2 — Dữ liệu lịch sử đáng tin cậy → DONE
- [x] Lưu/normalize `completedAt` (`src/lib/reports/completion-date.ts`).
- [x] Ingest transition event từ webhook/changelog (`IssueTransitionEvent` model, `process-webhook.ts`).
- [x] Snapshot aggregate model và cron capture hằng ngày (`ProjectReportSnapshot` model, `boss.ts`, `snapshot.ts`).
- [x] Data-quality/confidence contract (`src/lib/reports/data-quality.ts`).
- [x] Retention, idempotency, metrics và alert (`boss.ts`, worker health integration).

### P3 — Flow và task report → DONE
- [x] API current snapshot/flow/comparison (`GET /api/reports/projects/[projectKey]`).
- [x] Created/completed/reopened/throughput/backlog change (`flow-metrics.ts`, `project-kpis.tsx`).
- [x] Task explorer và drill-down từ KPI/chart (`tasks-tab.tsx`, `GET /api/reports/projects/[projectKey]/tasks`).
- [x] History API và throughput/backlog charts (`history-query.ts`, `trends-tab.tsx`, `GET /api/reports/projects/[projectKey]/history`).

### P4 — Member report → DONE
- [x] Member aggregation theo kỳ (`member-metrics.ts`, `member-query.ts`).
- [x] Current workload/risk signals (`member-metrics.ts` workload + risks).
- [x] Previous-period comparison (`member-metrics.ts`, `member-query.ts` delta completed).
- [x] Members tab và member task drawer (`members-tab.tsx`, `GET /api/reports/projects/[projectKey]/members`).
- [x] Kiểm thử alias/assignee changes và unassigned work.

### P5 — Historical analytics nâng cao (Roadmap tiếp theo)
- [ ] Cumulative Flow (kích hoạt sau khi tích lũy đủ chuỗi snapshot lịch sử).
- [ ] Burn-up/scope change.
- [ ] Cycle time median/P85.
- [ ] Forecast với data sufficiency.

---

## 13. Kiểm thử

### 13.1 Unit

- Period bounds theo tuần/tháng/timezone/DST.
- Previous period có cùng số ngày.
- Task tạo trước kỳ vẫn xuất hiện trong snapshot cuối kỳ.
- Completed chỉ tính khi completion event nằm trong kỳ.
- Reopen không bị đếm như completed lần đầu mới.
- Toàn project không tự áp version.
- Coverage, status normalization, overdue và SLA.
- Member support signal và insufficient-data behavior.

### 13.2 API

- Authorization và project scope.
- Custom range thiếu một đầu trả 400.
- Version không thuộc project trả 404/400.
- Metric thiếu lịch sử trả null + warning.
- Task pagination ổn định.
- Project/member response không chứa rank hoặc score.
- Export phản ánh đúng kỳ và filter.

### 13.3 Component và E2E

- URL khôi phục đúng period/version/unit.
- Chuyển tuần/tháng không làm mất project.
- KPI drill-down mở đúng task.
- Tab thành viên hiển thị support reason.
- Loading dùng Skeleton; empty state đúng chuẩn.
- Chart có accessible data table và reduced motion.
- Light/dark và responsive 375/768/1024/1440.
- Đối chiếu số completed với Jira JQL/changelog mẫu.

---

## 14. Hiệu năng, bảo mật và observability

Mục tiêu:

- Portfolio p95 dưới 800 ms với 20 project/10.000 issue.
- Project detail p95 dưới 500 ms.
- Task/member list p95 dưới 400 ms cho page size 50.

Biện pháp:

- Đọc history từ aggregate/event table, không tái dựng từ raw mỗi request.
- Index `projectKey + occurredAt`, `jiraKey + occurredAt`,
  `projectKey + assignee + snapshotDate`.
- Cache portfolio 30–60 giây theo allowed scope + period + unit.
- Không log raw task, comment, token hoặc PII không cần thiết.

Metrics:

- API count/duration/error theo endpoint.
- Snapshot và transition ingestion lag.
- Last successful snapshot/event sync.
- Số report trả data-quality warning.
- Số project health unknown do stale/thiếu lịch sử.

Alert khi snapshot quá 26 giờ, transition lag vượt ngưỡng, error rate tăng hoặc
p95 vượt mục tiêu liên tục.

---

## 15. Acceptance criteria

Contract v2 hoàn thành khi:

1. Mặc định mở báo cáo toàn project của tuần hiện tại.
2. Không tự động giới hạn theo active Fix Version.
3. Người dùng chuyển tuần/tháng/custom range và copy URL được.
4. Báo cáo phân biệt snapshot cuối kỳ với flow trong kỳ.
5. Task tạo trước kỳ nhưng còn mở không bị loại.
6. Completed trong kỳ dựa trên completion/transition date có confidence rõ.
7. Có trạng thái task, throughput, backlog change và drill-down.
8. Fix Version hoạt động như filter tùy chọn.
9. Thành viên có contribution, current load, risk và support reasons.
10. Không có rank/score cá nhân trong báo cáo dự án.
11. Dữ liệu stale/thiếu lịch sử không tạo kết luận chắc chắn.
12. Export, authorization, accessibility và quality gates đều pass.

---

## 16. Rủi ro và giảm thiểu

| Rủi ro | Tác động | Giảm thiểu |
|---|---|---|
| Thiếu transition history | Flow/cycle time sai | Event ingestion + warning + không dựng số |
| Completion date fallback | Completed sai kỳ | Normalize Done At/resolution; confidence |
| Assignee đổi giữa kỳ | Gán đóng góp sai người | Lưu assignee tại event/snapshot |
| Backlog toàn project biến động | Completion ratio dao động | Tách ratio hiện tại khỏi flow và delivery progress |
| Story point thiếu | So sánh sai | Coverage + auto fallback |
| Workflow khác nhau | Status sai | Project mapping + Unknown |
| Người dùng hiểu member metric là KPI | Đánh giá thiếu công bằng | Không rank/score, luôn có context/reasons |
| Timezone lệch | Sai boundary | Timezone explicit và test DST |
| Snapshot phình | Tăng storage | Aggregate + retention scope item |

---

## 17. Pilot

Pilot ít nhất hai project trong bốn tuần:

- một project có Fix Version/deadline;
- một project vận hành liên tục, task không phụ thuộc version.

Đối chiếu hằng tuần:

- created/completed/reopened với Jira;
- status distribution cuối kỳ;
- task tạo từ trước nhưng còn tồn;
- member attribution khi đổi assignee;
- data-quality warning;
- health/support signal đúng hay gây hiểu nhầm;
- API latency và filter được sử dụng.

Chỉ bật forecast hoặc dùng member signal trong trao đổi quản lý sau khi pilot
xác nhận dữ liệu đủ tin cậy.

---

## 18. Definition of Done

- Code, migration và test tương ứng.
- API có session, permission, project scope và validation.
- Metric có định nghĩa, nguồn dữ liệu và confidence.
- UI có loading, empty, error, stale và insufficient-data state.
- Dùng semantic token, Lucide, visible focus và reduced motion.
- Không hardcode project/status/user.
- Không log secret hoặc PII không cần thiết.
- Typecheck, lint, unit/API/component tests và production build pass.
- Tài liệu này được cập nhật khi contract hoặc metric thay đổi.
