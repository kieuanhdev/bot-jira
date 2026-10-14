# Kế hoạch nâng cấp UI — Admin Monitor (`/admin`)

> Phạm vi: trang **Tổng quan hệ thống** (`/admin`) là trọng tâm; trang **Đồng bộ dự án** (`/admin/sync`) là phần phụ.
> Nguồn thiết kế: `design-system/team-task-web/MASTER.md` + tra cứu skill `ui-ux-pro-max` (xem mục 2).
> Tài liệu này chỉ là kế hoạch — chưa sửa code.

---

## 1. Hiện trạng

### File liên quan

| File | Vai trò |
|------|---------|
| `src/app/(app)/admin/layout.tsx` | Gate admin phía server, `PageContainer size="wide"`, nav dạng tab |
| `src/app/(app)/admin/admin-nav.tsx` | 2 tab: Tổng quan · Đồng bộ dự án |
| `src/app/(app)/admin/admin-overview-client.tsx` | Trang monitor: 4 KPI + card Dịch vụ + card Job nền |
| `src/app/(app)/admin/sync/admin-sync-client.tsx` | Bật/tắt đồng bộ Jira theo dự án |
| `src/app/api/health/route.ts` | Ping live DB/Jira/Bitbucket/Sentry/OpenAI/Ollama + worker health |
| `src/app/api/admin/metrics/route.ts` | Snapshot outbox, sentry import, release, gate, AI |
| `src/lib/health/worker-health.ts` | Tính trạng thái worker, job, dự án stale/lỗi |

### Bố cục hiện tại (`/admin`)

```
[Tab: Tổng quan | Đồng bộ dự án]
[PageHeader: Tổng quan hệ thống — "Tự làm mới mỗi 30 giây"]
[KPI Worker] [KPI Đồng bộ Jira cũ nhất] [KPI Job đang lỗi] [KPI Thông báo chờ/lỗi]
[Card Dịch vụ tích hợp (1/3)] [Card Job nền (2/3) — list phẳng 14+ job]
```

### Vấn đề cụ thể đã thấy trong code

| # | Vấn đề | Vị trí | Mức độ |
|---|--------|--------|--------|
| P1 | Khi `/api/health` lỗi, card Dịch vụ render `null` → vùng trống, chỉ KPI hiện `ErrorState` | `admin-overview-client.tsx:152` | Cao |
| P2 | Lỗi job/dịch vụ chỉ xem được qua thuộc tính `title` → không dùng được bằng bàn phím, screen reader, mobile | `admin-overview-client.tsx:148`, `:183`; `sync/admin-sync-client.tsx:312` | Cao |
| P3 | Không có "cập nhật lúc…" hay cảnh báo dữ liệu cũ; chỉ có câu "Tự làm mới mỗi 30 giây" (trang sync đã có `generatedAt`) | `admin-overview-client.tsx:90` | Cao |
| P4 | Badge độ trễ dịch vụ luôn xanh dù 50 ms hay 8 000 ms | `admin-overview-client.tsx:48-52` | Trung bình |
| P5 | Không có tổng trạng thái "Hệ thống ổn / có sự cố" — admin phải tự quét 4 KPI + 6 dịch vụ + 14 job | toàn trang | Trung bình |
| P6 | Job list sắp theo alphabet, job lỗi lẫn giữa job OK; tên job là chuỗi thô (`deliver-notifications`, `stale-detect`…) | `admin-overview-client.tsx:80`, `:175` | Trung bình |
| P7 | KPI outbox nhồi 2 số vào 1 giá trị `"3 / 1"` → khó đọc, tone không rõ | `admin-overview-client.tsx:123` | Trung bình |
| P8 | Danh sách job dùng `GridSkeleton` dù UI là list → layout shift khi load xong | `admin-overview-client.tsx:165` | Thấp |
| P9 | `/api/admin/metrics` trả về `sentryImport`, `releasesByStatus`, `gatesByState`, `ai.decisions`, `worker.jobs[].stats` nhưng UI **không dùng** | `api/admin/metrics/route.ts:76-94` | Cơ hội |
| P10 | `getWorkerHealth()` đã tính `staleProjects`, `failingProjects`, `jiraSyncPaused`, `failingJobs`, `databaseError` nhưng `/api/health` **bỏ đi** | `api/health/route.ts:66-73` | Cơ hội |
| P11 | Trang sync hiển thị `lastError` thô, không qua `maskSecrets` như trang tổng quan | `sync/admin-sync-client.tsx:312` | Cao (bảo mật) |
| P12 | `/api/health` ping thật tới Jira/OpenAI mỗi 30 s → không nên tăng tần suất poll; cần nút làm mới thủ công thay vì poll nhanh hơn | `admin-overview-client.tsx:69` | Lưu ý |

---

## 2. Kết quả tra cứu `ui-ux-pro-max` — dùng gì, bỏ gì

Đã chạy: `--design-system "admin ops monitoring dashboard" --density 8 --variance 3 --motion 3`, cùng các truy vấn `--domain ux`, `--domain chart`, `--stack shadcn`.

**Áp dụng:**
- **Density 8/10 (Dense/Dashboard):** thang khoảng cách 8–32 px → card padding `p-4`, gap `gap-3`/`gap-4`, row list `py-2`. Không dùng khoảng cách lớn kiểu landing.
- **Style Minimalism & Swiss:** lưới rõ ràng, phân cấp chữ rõ, hover nhẹ 150–200 ms — khớp với "Flat Design" của MASTER.
- **Quy tắc dữ liệu live:** *chỉ gắn nhãn "live" khi có thời điểm cập nhật và trạng thái stale; có nút tạm dừng/làm mới.* → giải quyết P3, P12.
- **Lỗi phải được thông báo:** dùng `role="alert"`/`aria-live`, không chỉ đổi màu. → giải quyết P1, P2.
- **shadcn Table:** dữ liệu dạng bảng dùng `Table/TableHeader/TableBody`, không dùng div-grid. → áp dụng cho bảng Job nền.
- **Chart "Trend over time":** dưới 4 điểm dữ liệu thì dùng stat card thay vì chart; series không được phân biệt chỉ bằng màu.

**Không áp dụng (xung đột với MASTER / AGENTS.md):**
- Bảng màu slate + xanh lá `#22C55E` và font Fira Code/Fira Sans → giữ **teal primary + Plus Jakarta Sans** theo MASTER. Chỉ dùng `font-mono` (đã có) cho mã job/mã dự án.
- Pattern "Real-Time / Operations Landing" (Hero, How it works, CTA Start trial) → là pattern marketing, không phải console nội bộ.
- Snippet GSAP scroll-reveal → thêm dependency, không cần cho dashboard.
- Streaming Area Chart → không có dữ liệu chuỗi thời gian (mọi API đều là snapshot), xem Phase 4.
- **Không** chạy `--persist` để tránh ghi bảng màu/font xung đột vào `design-system/`. Nếu cần override riêng, xem bản nháp ở mục 6.

---

## 3. Thiết kế mục tiêu — `/admin` Tổng quan

### Wireframe (desktop ≥1024 px)

```
[Tab: Tổng quan | Đồng bộ dự án (badge đỏ "2" nếu có dự án lỗi)]

┌ PageHeader ───────────────────────────────────────────────────────────────┐
│ (Activity) Tổng quan hệ thống           Cập nhật 12 giây trước  [⟳ Làm mới] │
└───────────────────────────────────────────────────────────────────────────┘

┌ StatusBanner (role="status") ─────────────────────────────────────────────┐
│ ● Hệ thống hoạt động bình thường  — 6/6 dịch vụ OK · 14/14 job OK          │
│   hoặc  ▲ 2 vấn đề cần xử lý: Jira chậm 3.2 s · job sentry-import lỗi  [Xem]│
└───────────────────────────────────────────────────────────────────────────┘

[KPI Worker] [KPI Jira freshness] [KPI Job lỗi] [KPI Outbox lỗi]   ← 4 cột

┌ Dịch vụ tích hợp (1/3) ──┐ ┌ Job nền (2/3) ─────────────────────────────────┐
│ ● Cơ sở dữ liệu   12 ms  │ │ [Tất cả 14] [Lỗi 1] [Chưa chạy 2]  (segmented) │
│ ● Jira          3 210 ms │ │ Job              Trạng thái  Thành công  Lỗi   │
│ ○ Bitbucket  Chưa cấu hình│ │ ▸ Nhập Sentry    ● Lỗi       2 giờ      5 phút │
│ ● Sentry          240 ms │ │   └ (mở rộng) thông báo lỗi đã mask + stats    │
│ …                        │ │   Gửi thông báo  ● OK        1 phút     —      │
└──────────────────────────┘ └────────────────────────────────────────────────┘

┌ Hàng đợi & tích hợp (snapshot) ───────────────────────────────────────────┐
│ [Outbox: chờ / đã gửi / lỗi] [Sentry import: chờ/tạo/lỗi/bỏ qua]           │
│ [Release theo trạng thái]    [Release gate: passed/failed/unknown]         │
│ [AI ước lượng: số score + phân bố quyết định]                              │
└───────────────────────────────────────────────────────────────────────────┘
```

Mobile (375 px): mọi khối xếp 1 cột; KPI 2×2; bảng job chuyển thành list card (ẩn cột thời gian lỗi, hiện dưới tên job).

### Chi tiết từng khối

**A. Header + độ tươi dữ liệu (P3, P12)**
- `meta` của `PageHeader`: "Cập nhật {timeAgo(dataUpdatedAt)}" lấy từ `health.dataUpdatedAt` của TanStack Query.
- Nếu `Date.now() - dataUpdatedAt > 90 s` (3 chu kỳ poll) → badge `warning` "Dữ liệu cũ".
- Nút `Làm mới` (`Button variant="outline" size="sm"`, icon `RefreshCw`) gọi `refetch()` cho cả health + metrics; icon xoay khi `isFetching`, có `motion-reduce:animate-none`.
- Giữ `refetchInterval: 30_000`; thêm `refetchIntervalInBackground: false` (mặc định) để không ping khi tab ẩn.

**B. StatusBanner — tổng trạng thái (P5)**
- Tính từ dữ liệu sẵn có: số dịch vụ `!ok && error !== "not configured"`, số job lỗi, `worker.status`, outbox `failed`.
- 3 mức: `success` (mọi thứ OK) / `warning` (degraded, dịch vụ chậm, outbox lỗi) / `danger` (worker down, DB lỗi).
- Dùng `FeedbackBanner` hiện có hoặc component mới `StatusBanner` dựa trên token semantic; icon lucide `CheckCircle2` / `AlertTriangle` / `XCircle` + **chữ** (không chỉ dựa vào màu).
- `role="status"` khi OK, `role="alert"` khi có sự cố mới (chỉ announce khi mức thay đổi, không announce mỗi 30 s).
- Liệt kê tối đa 3 vấn đề, mỗi vấn đề là link anchor tới khối tương ứng (`#services`, `#jobs`).

**C. KPI (P7)**
- Worker: giữ nguyên.
- Jira freshness: thêm `description` = "N dự án chậm" khi có `staleProjects` (cần Phase 2); hiển thị "Tạm dừng" khi `jiraSyncPaused`.
- Job lỗi: `MetricCard` có `onClick` → lọc bảng Job về "Lỗi" (component đã hỗ trợ `onClick`/`selected`).
- Outbox: tách — **value** = số `failed` (tone `danger` nếu > 0), **description** = "{pending} chờ · {sent} đã gửi". Số liệu chính không còn là chuỗi "a / b".

**D. Dịch vụ tích hợp (P1, P2, P4)**
- Mỗi dòng: chấm trạng thái (`h-2 w-2 rounded-full`) + tên + badge độ trễ.
- Ngưỡng độ trễ (hằng số trong file): `< 1000 ms` → `success`, `1000–3000 ms` → `warning` "Chậm", `> 3000 ms` hoặc lỗi → `danger`. `not configured` → `secondary`, dòng mờ `text-muted-foreground`.
- Lỗi dịch vụ: thay `title` bằng dòng chữ nhỏ `text-xs text-destructive` dưới tên (đã qua `maskSecrets`), hiển thị trực tiếp — không cần tooltip.
- Khi health lỗi: card hiện `ErrorState` gọn có nút thử lại, không render `null`.

**E. Job nền (P2, P6, P8)**
- Chuyển sang bảng ở Phase 3 bằng cách thêm `src/components/ui/table.tsx` (shadcn Table, markup thuần, không phụ thuộc Radix → không cần dependency mới). Trước Phase 3 vẫn giữ `<ul>`.
- Sắp xếp: job lỗi lên đầu → chưa chạy → OK; trong mỗi nhóm theo `lastSuccessAt` cũ nhất trước.
- `SegmentedControl` (đã có trong `src/components/shared/segmented-control.tsx`): Tất cả / Lỗi / Chưa chạy, kèm số đếm.
- Nhãn tiếng Việt cho job, giữ mã gốc dạng `font-mono text-xs text-muted-foreground` bên dưới:

  | Mã job | Nhãn |
  |--------|------|
  | `ai-score` | Chấm điểm AI |
  | `capture-project-report-snapshots` | Chụp snapshot báo cáo |
  | `check-branches` | Kiểm tra nhánh |
  | `deliver-notifications` | Gửi thông báo |
  | `detect-people-fields` | Dò trường người dùng |
  | `health-alert` | Cảnh báo sức khỏe |
  | `notify-unmerged-prs` | Nhắc PR chưa merge |
  | `parse-comment-branches` | Đọc nhánh từ comment |
  | `poll-pr-comments` | Lấy comment PR |
  | `poll-watched-issues` | Theo dõi issue |
  | `reconcile-deleted-issues` | Đối soát issue đã xoá |
  | `sentry-import` | Nhập Sentry |
  | `stale-detect` | Phát hiện issue đứng |
  | `sync-dev-status` | Đồng bộ trạng thái dev |

  Job không có trong map → hiển thị mã gốc (không vỡ khi thêm job mới).
- Lỗi job: dòng lỗi bấm được (`button` với `aria-expanded`, icon `ChevronRight` xoay 90°, 150 ms) → mở vùng hiển thị đầy đủ lỗi đã mask trong `<pre className="whitespace-pre-wrap text-xs">` + `stats` (nếu có, dạng key: value). Không cần Radix Collapsible — dùng state cục bộ.
- Loading: thay `GridSkeleton` bằng `ListSkeleton rows={6}`.

**F. Hàng đợi & tích hợp (P9) — mới, chỉ UI**
- Khối dùng dữ liệu đã có trong `/api/admin/metrics`:
  - Outbox (`outbox`): pending / sent / failed.
  - Sentry import (`sentryImport`): pending / created / failed / ignored.
  - Release (`releasesByStatus`).
  - Release gate (`gatesByState`): mỗi gate một dòng, thanh xếp chồng passed/failed/unknown/overridden.
  - AI (`ai.scores`, `ai.decisions`).
- Hình thức: mỗi nhóm là một card nhỏ với **stacked bar ngang** (một thanh 100%, các đoạn theo tỉ lệ) + chú thích số bên dưới. Ít điểm dữ liệu nên **không** dùng chart lớn; có thể dùng `src/components/ui/chart.tsx` (recharts, đã cài) hoặc thanh CSS thuần — khuyến nghị CSS thuần cho nhẹ.
- Màu đoạn: token semantic (success/warning/danger/muted), **luôn kèm nhãn chữ + số**, không phân biệt chỉ bằng màu.
- Empty state khi tổng = 0: icon trong vòng tròn muted + "Chưa có dữ liệu" + gợi ý một dòng.

---

## 4. Thiết kế mục tiêu — `/admin/sync` (phụ)

| # | Đề xuất | Chi phí |
|---|---------|---------|
| S1 | Mask `lastError` bằng cùng hàm `maskSecrets` (chuyển hàm vào `src/lib/admin/` để dùng chung) | UI-only, **làm trước** |
| S2 | 4 KPI (Dự án / Đang bật / Đã tắt / Đang lỗi) thành bộ lọc: `MetricCard onClick + selected` — component đã hỗ trợ | UI-only |
| S3 | Lỗi dự án: thay `title` bằng disclosure giống bảng job | UI-only |
| S4 | Nhóm nút hành động mỗi dòng ("Đồng bộ", "Toàn bộ") vào `DropdownMenu` (đã có) trên mobile, giữ nút rời trên desktop | UI-only |
| S5 | Sắp xếp: lỗi → đang chạy → chưa đồng bộ → ổn định → đã tắt | UI-only |
| S6 | Badge số dự án lỗi trên tab "Đồng bộ dự án" trong `admin-nav.tsx` (dùng chung query `adminKeys.projects`) | UI-only |

---

## 5. Lộ trình triển khai

Mỗi phase là một PR nhỏ, kiểm tra được độc lập.

### Phase 1 — Sửa lỗi UX & a11y (chỉ UI) — ưu tiên cao
- P1, P2, P8, P11/S1: ErrorState cho card dịch vụ; disclosure lỗi thay `title`; `ListSkeleton`; mask lỗi ở trang sync.
- P3, P12: "Cập nhật … trước", badge "Dữ liệu cũ", nút Làm mới.
- P4: ngưỡng độ trễ.
- P7: tách KPI outbox.
- File: `admin-overview-client.tsx`, `sync/admin-sync-client.tsx`, (mới) `src/lib/admin/mask-secrets.ts`.

### Phase 2 — Tổng trạng thái & dùng dữ liệu sẵn có
- P5: `StatusBanner`.
- P6: nhãn job tiếng Việt, sắp xếp, filter `SegmentedControl`, KPI "Job lỗi" bấm để lọc.
- P9: khối "Hàng đợi & tích hợp".
- P10: **sửa API nhỏ, additive** — trả thêm `staleProjects`, `failingProjects`, `jiraSyncPaused`, `failingJobs` trong `/api/health` (field `worker`). Không đổi field cũ.
- S2, S3, S5, S6 cho trang sync.

### Phase 3 — Bảng job chuẩn
- Thêm `src/components/ui/table.tsx` (shadcn Table, markup thuần, không cần package mới).
- Chuyển Job nền sang bảng, có responsive card ở mobile.
- *(Tuỳ chọn)* ghi `durationMs` vào `stats` trong `recordRun` (`src/lib/queue/boss.ts:52`) — hiện tại `durationMs` **chỉ được ghi log**, chưa lưu DB; `stats` là cột JSON nên không cần migration. Sau đó thêm cột "Thời gian chạy" với ngưỡng màu.

### Phase 4 — Lịch sử & xu hướng (cần duyệt riêng)
- Sparkline độ trễ dịch vụ, uptime 24 h, số lần job lỗi theo ngày đều cần **bảng lịch sử mới → Prisma migration** (file được bảo vệ theo `AGENTS.md`).
- Chỉ làm khi developer duyệt rõ ràng. Khi có ≥4 điểm dữ liệu mới dùng line/area chart (recharts đã cài); dưới ngưỡng đó giữ stat card.

### Không đề xuất
- Tooltip/Collapsible của Radix → cần thêm package (`package.json` là file bảo vệ); disclosure tự viết bằng state là đủ.
- Tăng tần suất poll `/api/health` → mỗi lần là ping thật tới Jira/OpenAI.

---

## 6. Bản nháp override thiết kế (chưa ghi vào `design-system/`)

Nếu muốn lưu thành `design-system/team-task-web/pages/admin.md`, nội dung đề xuất:

```md
# Admin console — override

- Density: dashboard (8–32 px). Card `p-4`, section gap `gap-4`, row `py-2`.
- Cards: không hover lift trừ khi card bấm được (MetricCard có onClick).
- Status: chấm tròn 8 px + badge chữ; không bao giờ chỉ dùng màu.
- Latency: <1000 ms success · 1000–3000 ms warning · >3000 ms/lỗi danger.
- Live data: luôn hiển thị "Cập nhật X trước" + badge "Dữ liệu cũ" khi > 3 chu kỳ poll.
- Errors: hiển thị inline (đã mask), mở rộng bằng disclosure; không dùng `title` làm kênh duy nhất.
- Mono: `font-mono` chỉ cho mã job / mã dự án / thông báo lỗi.
- Giữ teal primary + Plus Jakarta Sans của MASTER.
```

---

## 7. Checklist nghiệm thu (mỗi phase)

- [ ] Loading dùng `Skeleton`/`ListSkeleton` đúng hình dạng nội dung, không spinner chữ.
- [ ] Mọi khối có empty state (icon trong vòng tròn muted + tiêu đề + gợi ý một dòng) và error state có nút thử lại — không có vùng trống.
- [ ] Chỉ dùng token semantic (`bg-muted`, `text-muted-foreground`, `border-border`…), không hex cứng.
- [ ] Icon lucide-react, decorative có `aria-hidden`; không emoji.
- [ ] Phần tử bấm được có `cursor-pointer`, focus ring nhìn thấy, transition 150–200 ms, `motion-reduce` được tôn trọng.
- [ ] Trạng thái luôn có chữ đi kèm màu; tương phản chữ ≥ 4.5:1 ở **cả light và dark mode**.
- [ ] Lỗi mới được announce (`role="alert"`) nhưng không announce lặp mỗi lần poll.
- [ ] Mọi thông báo lỗi hiển thị đều đã qua `maskSecrets`.
- [ ] Responsive: 375 / 768 / 1024 / 1440 px, không cuộn ngang trên mobile.
- [ ] Không thêm dependency, không migration (trừ Phase 4 đã được duyệt).
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass.
