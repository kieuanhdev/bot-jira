# Kế hoạch giai đoạn 2 — Admin Monitor: thao tác khắc phục & mở rộng giám sát (`/admin`)

> Tiếp nối `docs/ADMIN_MONITOR_UI_PLAN.md`. Phase 1–3 của plan đó đã làm ở commit `9c16699`
> (banner trạng thái, KPI, bảng job, hàng đợi, nhãn job, mask lỗi).
> Plan này xử lý các phần **còn thiếu**: màn hiện chỉ để *xem*, chưa *xử lý* được, và chưa có dữ liệu theo thời gian.
> **Trạng thái:** Đã hoàn thành triển khai toàn bộ **Phase A** (A1–A5), **Phase B** (B1–B8) và **Phase C** (Xu hướng theo thời gian). Toàn bộ code mới, API endpoints, modular components và test suite đã hoàn tất, vượt qua lint, typecheck và 271 test files (2.538 tests). Không cần Prisma migration, không thêm external dependency.

---

## 1. Hiện trạng & khoảng trống

File chính: `src/app/(app)/admin/admin-overview-client.tsx` (~870 dòng), `src/app/api/admin/metrics/route.ts`, `src/app/api/health/route.ts`, `src/lib/health/worker-health.ts`, `src/lib/queue/boss.ts` (`recordRun`).

| # | Khoảng trống | Bằng chứng trong code | Loại |
|---|--------------|-----------------------|------|
| G1 | `gatesByState` có trong API nhưng UI không hiện | `api/admin/metrics/route.ts` trả về, `admin-overview-client.tsx` không đọc | Dữ liệu bỏ phí |
| G2 | `ai.defaultPoint` không dùng → không tách được điểm AI thật với điểm mặc định khi provider sập | comment trong `metrics/route.ts` | Sai lệch số liệu |
| G3 | Không biết job **đang chạy** hay **bị treo** | `recordRun` không ghi thời điểm kết thúc; run `skipped` không cập nhật `lastSuccessAt` nên `lastStartedAt` không dùng được để suy luận | Thiếu dữ liệu |
| G4 | `durationMs` chỉ được ghi log, không lưu DB | `src/lib/queue/boss.ts` `recordRun` | Thiếu dữ liệu |
| G5 | Stats job hiện dạng `JSON.stringify` thô | khối "Thống kê (stats)" | UX |
| G6 | Không có nút chạy lại job thủ công | — | Thiếu thao tác |
| G7 | Outbox `failed` chỉ có con số, không xem/retry được | KPI "Thông báo lỗi" | Thiếu thao tác |
| G8 | Sentry import lỗi: **API đã có** (`GET` + retry tại `api/admin/sentry-import/route.ts`) nhưng chưa có UI | — | Thiếu UI |
| G9 | Webhook (`IntegrationEvent`) không được giám sát: không biết nguồn nào im lặng, event nào xử lý lỗi | model `IntegrationEvent` có `processedAt`, `processingError` | Thiếu giám sát |
| G10 | Bulk operation đang chạy/lỗi không hiện | model `BulkOperation.state` | Thiếu giám sát |
| G11 | Không thấy hoạt động admin gần đây | model `AuditLog`, helper `audit()` ở `src/lib/audit.ts` | Thiếu giám sát |
| G12 | Không có lịch chạy của job | `src/lib/queue/schedules.ts` `buildScheduleDefinitions` | Thiếu thông tin |
| G13 | Không thấy độ sâu hàng đợi pg-boss (worker sống nhưng nghẽn) | pg-boss 12.37 có `boss.getQueues()` → `queuedCount/activeCount/failedCount` | Thiếu giám sát |
| G14 | Không có xu hướng theo thời gian | mọi API là snapshot | Thiếu dữ liệu |
| G15 | Link banner dùng `<a href="#…">`, nhảy cứng và có thể bị header che | khối `FeedbackBanner` | UX nhỏ |

---

## 2. Thiết kế mục tiêu

### Wireframe (desktop)

```
[Tab: Tổng quan | Đồng bộ dự án]
[PageHeader + Cập nhật X trước + Làm mới]                       (giữ nguyên)
[StatusBanner — thêm: "2 job treo", "3 webhook lỗi", "Hàng đợi tồn 120 job"]
[KPI Worker] [KPI Jira] [KPI Job lỗi/treo] [KPI Thông báo lỗi]   (giữ 4 thẻ)

┌ Dịch vụ (1/3) ─────────┐ ┌ Job nền (2/3) ─────────────────────────────────────┐
│ (giữ nguyên)           │ │ Lọc: Tất cả · Lỗi · Đang chạy · Treo · Chưa chạy   │
│                        │ │ Job          Trạng thái   Lịch      Thời gian  ▶ ▸ │
│                        │ │ Nhập Sentry  ● Treo 12ph  5 phút/lần  1.2 s   [▶] │
└────────────────────────┘ └────────────────────────────────────────────────────┘

┌ Webhook (mới) ─────────────────────┐ ┌ Hàng đợi pg-boss (mới) ─────────────────┐
│ Nguồn     24h   Chưa xử lý  Lỗi  Cuối│ │ Queue            Chờ  Đang chạy  Lỗi   │
│ Jira      812   0           2   1ph │ │ deliver-notif.    0      1        0    │
│ Bitbucket 0     —           —   3 ngày ⚠│ │ process-webhook 120 ⚠  4        3    │
└────────────────────────────────────┘ └─────────────────────────────────────────┘

┌ Hàng đợi & tích hợp ───────────────────────────────────────────────────────────┐
│ [Outbox  … [Xem lỗi]] [Sentry … [Xem lỗi]] [Release] [AI: thật/mặc định]        │
│ [Release gate: mỗi gate một thanh passed/failed/unknown/overridden]  ← mới (G1) │
│ [Bulk operation: đang chạy / lỗi một phần / lỗi]                    ← mới (G10) │
└────────────────────────────────────────────────────────────────────────────────┘

┌ Hoạt động admin gần đây (mới, G11) ────────────────────────────────────────────┐
│ 10:42  anh@…  admin.job.run           sentry-import                            │
│ 10:15  anh@…  project.sync.disable    ABC                                      │
└────────────────────────────────────────────────────────────────────────────────┘
```

Drawer/Sheet "Xem lỗi" (dùng `Sheet` hoặc `Dialog` shadcn đã có, không thêm package):
danh sách bản ghi lỗi (đã `maskSecrets`) + nút **Thử lại** từng dòng + **Thử lại tất cả**.

Mobile: các card xếp 1 cột; bảng webhook/queue chuyển thành list giống bảng job hiện tại.

---

## 3. Lộ trình triển khai

Mỗi phase là một PR nhỏ, kiểm tra độc lập. Thứ tự theo giá trị/chi phí.

### Phase A — Chỉ UI, dùng dữ liệu/API sẵn có (không đổi API) — [ĐÃ HOÀN THÀNH]

| Việc | Chi tiết | Trạng thái & File triển khai |
|------|----------|-------------------------------|
| A1 · Release gate (G1) | Thêm `StackedBar` cho mỗi gate trong `gatesByState`, đoạn passed/failed/unknown/overridden. Nhãn gate tiếng Việt (`non_empty_release`, `ci`, `data_freshness`…), gate lạ hiện mã gốc. Đếm "gate failed" vào banner khi > 0. | `[x]` Đã xong — `src/app/(app)/admin/overview/queues-card.tsx` |
| A2 · Stats dễ đọc (G5) | Formatter: `durationMs` → "1.2 s", số → `toLocaleString("vi-VN")`, `skipped`/`reason` → badge "Bỏ qua: …", object lồng → key: value một cấp. Ẩn `skipped:false`, `reason:null`. | `[x]` Đã xong — `src/app/(app)/admin/overview/format-stats.ts` |
| A3 · Sentry import lỗi (G8) | Nút "Xem lỗi" trên thẻ Sentry → Sheet gọi `GET /api/admin/sentry-import?state=failed`, mỗi dòng có nút retry gọi API retry đã có. Invalidate `adminKeys.overview` sau retry. | `[x]` Đã xong — `src/app/(app)/admin/overview/error-sheet.tsx` |
| A4 · Copy lỗi | Nút `Copy` (icon `Copy`/`Check`) cạnh khối `<pre>` lỗi job và lỗi dịch vụ; copy chuỗi **đã mask**. | `[x]` Đã xong — Component `CopyButton` trong `jobs-card.tsx` và `error-sheet.tsx` |
| A5 · Link banner (G15) | Thay `<a href="#…">` bằng `button` + `scrollIntoView({ behavior: "smooth" })`, tôn trọng `prefers-reduced-motion` (dùng `"auto"`). Link `/admin/sync` giữ `Link`. | `[x]` Đã xong — `src/app/(app)/admin/admin-overview-client.tsx` |

Đã tái cấu trúc tách component sang thư mục mô-đun: `src/app/(app)/admin/overview/` (`jobs-card.tsx`, `queues-card.tsx`, `error-sheet.tsx`, `webhooks-card.tsx`, `pg-boss-card.tsx`, `audit-card.tsx`, `format-stats.ts`).

### Phase B — Bổ sung API (additive, **không migration**) — [ĐÃ HOÀN THÀNH]

**B1 · Thời gian chạy & job đang chạy/treo (G3, G4) — [x] Đã xong**
- `recordRun` (`src/lib/queue/boss.ts`): ghi thêm `durationMs` và `finishedAt` vào `stats` (cột JSON, không cần migration) ở cả nhánh thành công và lỗi.
- `worker-health.ts`: suy ra `running = lastStartedAt > stats.finishedAt` (hoặc chưa có `finishedAt`); `stuck = running && now - lastStartedAt > expireInSeconds` của queue (lấy từ `QUEUE_EXPIRE_SECONDS` trong `job-names.ts`, helper `getJobExpireSeconds`). Trả thêm `runningJobs`, `stuckJobs` trong `/api/health`.
- UI: badge "Đang chạy · 40 s" (`info`), "Treo · 12 phút" (`danger`); filter "Đang chạy"/"Treo"; cột "Thời gian" với ngưỡng màu (> 50 % warning, > 80 % danger).
- Scope động `poll-jira-project:<KEY>` và `refresh-board-membership:…` map về queue gốc khi tra `expireInSeconds`.
- Unit test: `src/lib/health/worker-health.test.ts`.

**B2 · Lịch chạy (G12) — [x] Đã xong**
- Hàm `getJobSchedules` và `formatCronSchedule` tại `src/lib/queue/schedules.ts` trả lịch chạy tiếng Việt ("mỗi phút", "5 phút/lần", "hằng ngày 17:20", "Theo sự kiện") và xuất qua `/api/health`.
- Hiển thị cột "Lịch" cả trên desktop bảng và mobile list. Unit test: `src/lib/queue/registry-schedules.test.ts`.

**B3 · Nút "Chạy ngay" (G6) — [x] Đã xong**
- `POST /api/admin/jobs/[name]/run`, admin-only (`isAdmin`).
- **Allowlist** = các job trong `SCHEDULE_DEFINITIONS` (job không tham số).
- `boss.send(name, {}, { singletonKey: \`${name}:manual\`, singletonSeconds: 30, retryLimit: 0 })`. Trả `409` khi trùng singleton.
- Ghi `audit({ action: "admin.job.run", target: name, source: "web" })`.
- UI: nút icon `Play` ở cột thao tác, disabled khi đang chạy; xác nhận bằng `ConfirmDialog` cho job nặng (`poll-pr-comments`, `reconcile-deleted-issues`, `capture-project-report-snapshots`, `detect-people-fields`); toast kết quả; tự động refetch overview sau 2s.
- Route test: `src/app/api/admin/jobs/[name]/run/route.test.ts` (kiểm tra 401/403/400/200/409).

**B4 · Outbox lỗi + retry (G7) — [x] Đã xong**
- `GET /api/admin/outbox?state=failed&limit=100`: `id, channel, userId (email), title, attemptCount, lastError (mask), updatedAt`.
- `POST /api/admin/outbox/retry` body `{ ids?: string[] }`: đặt `state = pending`, `attemptCount = 0`, `scheduledAt = null`, `lastError = null` rồi `enqueueNotificationDelivery()`. Audit `admin.outbox.retry` với số lượng.
- UI: Dùng chung `ErrorSheet` với nút retry từng dòng hoặc retry toàn bộ (tối đa 500 bản ghi).
- Route test: `src/app/api/admin/outbox/route.test.ts`.

**B5 · Giám sát webhook (G9) — [x] Đã xong**
- Thêm vào `/api/admin/metrics` khối `webhooks`: thống kê theo `source` → `count24h`, `unprocessed` (`processedAt IS NULL` > 5 phút), `errors24h`, `lastReceivedAt`.
- UI: `src/app/(app)/admin/overview/webhooks-card.tsx` dạng bảng; nguồn `lastReceivedAt` > 24h hiện badge warning "Im lặng"; xem lỗi qua `ErrorSheet`.

**B6 · Độ sâu hàng đợi pg-boss (G13) — [x] Đã xong**
- `/api/admin/metrics` gọi `boss.getQueues()` → mỗi queue: `queuedCount`, `readyCount`, `activeCount`, `failedCount`.
- Bọc try/catch: nếu lỗi pg-boss trả `queues: null`, UI hiển thị `ErrorState` cục bộ không làm hỏng toàn trang.
- UI: `src/app/(app)/admin/overview/pg-boss-card.tsx` cảnh báo khi `readyCount` > 50 hoặc `failedCount` > 0. Banner tổng quan hiển thị cảnh báo tồn hàng đợi.

**B7 · Bulk operation (G10) + AI fallback (G2) — [x] Đã xong**
- `/api/admin/metrics` bổ sung `bulkOps` theo `state` trong 7 ngày gần nhất → `StackedBar` trong `queues-card.tsx`.
- Thống kê AI tách biệt "Điểm AI thật" và "Điểm mặc định (fallback)", cảnh báo khi tỷ lệ mặc định > 50% trong 24h.

**B8 · Hoạt động admin gần đây (G11) — [x] Đã xong**
- `GET /api/admin/audit?limit=20` (admin-only): `id, createdAt, actorEmail, action, target, source`.
- UI: `src/app/(app)/admin/overview/audit-card.tsx` với nhãn tiếng Việt dễ hiểu cho action chính, thời gian tương đối ("X phút trước"), chỉ tải khi mở trang/bấm làm mới.
- Route test: `src/app/api/admin/audit/route.test.ts`.

### Phase C — Xu hướng theo thời gian (G14) — [ĐÃ HOÀN THÀNH]

Triển khai hoàn tất theo **Hướng 1** (Native pg-boss + cursor JSON history + memory ring buffer), **không cần Prisma migration**, không thêm external package:

1. **pg-boss Queue Stats Persistence**:
   - Bật `persistQueueStats: true` và `queueStatRetentionDays: 7` trong `src/lib/queue/connection.ts`. pg-boss tự phân vùng/lưu trữ và dọn dẹp lịch sử 7 ngày trong schema của nó.
   - Thêm tests kiểm tra cấu hình trong `src/lib/queue/connection.test.ts`.

2. **Job Run Latency History (`recordRun`)**:
   - `recordRun` (`src/lib/queue/boss.ts`): ghi nhận `recentRuns: Array<{ durationMs: number; ok: boolean; finishedAt: string }>` (tối đa 20 lần chạy gần nhất) vào cột JSON `stats` của `IntegrationCursor` ở cả nhánh thành công và lỗi.
   - `getWorkerHealth` (`src/lib/health/worker-health.ts`): trích xuất và trả về `recentRuns` cho từng `JobState`.
   - Unit tests: `src/lib/queue/jira-queue.test.ts` và `src/lib/health/worker-health.test.ts`.

3. **Service Ping Latency Ring Buffer**:
   - `/api/health` (`src/app/api/health/route.ts`): duy trì ring buffer in-memory 20 mẫu cho từng dịch vụ tích hợp (`history: number[]`).
   - Route test: `src/app/api/health/route.test.ts`.

4. **pg-boss Queue Throughput History**:
   - `/api/admin/metrics` (`src/app/api/admin/metrics/route.ts`): gọi `boss.getQueueStats(q.name, { from: oneDayAgo, maxDataPoints: 24, aggregate: 'max' })` trả về chuỗi snapshot throughput (`completed`, `failed`, `active`, `ready`).
   - Route test: `src/app/api/admin/metrics/route.test.ts`.

5. **Component `Sparkline` UI**:
   - `src/app/(app)/admin/overview/sparkline.tsx`: SVG vector sắc nét, đường cong mượt, gradient area, dot ở điểm mới nhất, interactive hover tooltip chi tiết (giá trị, min, max).
   - Tôn trọng triệt để quy tắc: **dưới 4 điểm dữ liệu thì không vẽ chart** (hiển thị `—` hoặc fallback text).
   - Hỗ trợ các tone màu ngữ nghĩa (`teal`, `emerald`, `amber`, `rose`), tương phản cao light/dark, tuân thủ `prefers-reduced-motion` và `aria-label`/`role="img"`.
   - Unit tests: `src/app/(app)/admin/overview/sparkline.test.ts` (5 tests).

6. **Tích hợp UI Dashboard**:
   - **Card Job nền** (`src/app/(app)/admin/overview/jobs-card.tsx`): thêm cột "Xu hướng" cho thời gian chạy gần nhất trên desktop bảng và mobile list.
   - **Card Hàng đợi pg-boss** (`src/app/(app)/admin/overview/pg-boss-card.tsx`): thêm cột "Xu hướng (24h)" hiển thị throughput completed/failed.
   - **Card Dịch vụ tích hợp** (`src/app/(app)/admin/admin-overview-client.tsx`): hiển thị sparkline độ trễ (ms) bên cạnh badge độ trễ khi có đủ ≥ 4 lần ping.

### Không đề xuất
- Tăng tần suất poll `/api/health` (ping thật tới Jira/OpenAI).
- Thêm package (`cron-parser`, Radix mới…): `package.json` là file bảo vệ.
- Cho chạy job tuỳ ý theo tên: luôn qua allowlist.

---

## 4. Bảo mật & vận hành

- Mọi route mới: `getSession` + `isAdmin`, 401/403 như `api/admin/projects/[key]/route.ts`.
- Mọi lỗi trả về UI đi qua `maskSecrets` (`src/lib/admin/mask-secrets.ts`); ưu tiên mask ở server cho endpoint mới.
- Mọi thao tác ghi (chạy job, retry outbox, retry Sentry) phải ghi `audit()`.
- Retry hàng loạt có giới hạn (≤ 500 bản ghi/lần) để không làm ngập queue.
- Card dữ liệu nặng (audit, webhook lỗi) không poll 30 s.

---

## 5. Checklist nghiệm thu (mọi phase)

- [x] Loading dùng `Skeleton`/`ListSkeleton`; mỗi card mới có empty state (icon trong vòng tròn muted + tiêu đề + gợi ý) và error state có nút thử lại.
- [x] Token semantic, không hex cứng; trạng thái luôn có chữ đi kèm màu; tương phản ≥ 4.5:1 ở light + dark.
- [x] Icon lucide, decorative `aria-hidden`; nút icon có `aria-label`; `cursor-pointer`; transition 150–200 ms; `motion-reduce`.
- [x] Thao tác ghi có xác nhận khi cần, có toast kết quả, có audit log.
- [x] Responsive 375 / 768 / 1024 / 1440 px, không cuộn ngang.
- [x] Không thêm dependency, không Prisma migration.
- [x] Test route mới (auth, validate, happy path); test `recordRun` + phân loại running/stuck.
- [x] `npm run lint`, `npm run typecheck`, `npm test` pass (271 test files, 2.538 tests).

---

## 6. Ước lượng & Trạng thái

| Phase | Nội dung | Ước lượng | Trạng thái |
|-------|----------|-----------|------------|
| A | Gate, stats, Sentry UI, copy, banner | ~0.5–1 ngày | **Đã hoàn thành** |
| B1–B3 | Running/stuck, lịch, Chạy ngay | ~1–1.5 ngày | **Đã hoàn thành** |
| B4–B8 | Outbox retry, webhook, pg-boss queue, bulk/AI, audit | ~1.5–2 ngày | **Đã hoàn thành** |
| C | Xu hướng theo thời gian (pg-boss + job runs + service latency) | ~1 ngày | **Đã hoàn thành** |
