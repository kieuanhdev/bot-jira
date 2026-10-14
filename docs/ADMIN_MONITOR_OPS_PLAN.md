# Kế hoạch giai đoạn 2 — Admin Monitor: thao tác khắc phục & mở rộng giám sát (`/admin`)

> Tiếp nối `docs/ADMIN_MONITOR_UI_PLAN.md`. Phase 1–3 của plan đó đã làm ở commit `9c16699`
> (banner trạng thái, KPI, bảng job, hàng đợi, nhãn job, mask lỗi).
> Plan này xử lý các phần **còn thiếu**: màn hiện chỉ để *xem*, chưa *xử lý* được, và chưa có dữ liệu theo thời gian.
> **Trạng thái:** Đã hoàn thành triển khai **Phase A** (A1–A5) và **Phase B** (B1–B8). Toàn bộ code mới, API endpoints, modular components và test suite đã hoàn tất, vượt qua lint, typecheck và 269 test files (2.527 tests). Phase C (xu hướng theo thời gian) giữ ở trạng thái đề xuất/cần duyệt riêng.

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

### Phase A — Chỉ UI, dùng dữ liệu/API sẵn có (không đổi API)

| Việc | Chi tiết |
|------|----------|
| A1 · Release gate (G1) | Thêm `StackedBar` cho mỗi gate trong `gatesByState`, đoạn passed/failed/unknown/overridden. Nhãn gate tiếng Việt (`non_empty_release`, `ci`, `data_freshness`…), gate lạ hiện mã gốc. Đếm "gate failed" vào banner khi > 0. |
| A2 · Stats dễ đọc (G5) | Formatter: `durationMs` → "1.2 s", số → `toLocaleString("vi-VN")`, `skipped`/`reason` → badge "Bỏ qua: …", object lồng → key: value một cấp. Ẩn `skipped:false`, `reason:null`. |
| A3 · Sentry import lỗi (G8) | Nút "Xem lỗi" trên thẻ Sentry → Sheet gọi `GET /api/admin/sentry-import?state=failed`, mỗi dòng có nút retry gọi API retry đã có. Invalidate `adminKeys.overview` sau retry. |
| A4 · Copy lỗi | Nút `Copy` (icon `Copy`/`Check`) cạnh khối `<pre>` lỗi job và lỗi dịch vụ; copy chuỗi **đã mask**. |
| A5 · Link banner (G15) | Thay `<a href="#…">` bằng `button` + `scrollIntoView({ behavior: "smooth" })`, tôn trọng `prefers-reduced-motion` (dùng `"auto"`). Link `/admin/sync` giữ `Link`. |

File: `admin-overview-client.tsx`. Nên tách component ra `src/app/(app)/admin/overview/` (`jobs-card.tsx`, `queues-card.tsx`, `error-sheet.tsx`, `lib/format-stats.ts`) vì file đang ~870 dòng.

### Phase B — Bổ sung API (additive, **không migration**)

**B1 · Thời gian chạy & job đang chạy/treo (G3, G4)**
- `recordRun` (`src/lib/queue/boss.ts`): ghi thêm `durationMs` và `finishedAt` vào `stats` (cột JSON, không cần migration) ở cả nhánh thành công và lỗi. Nhánh lỗi hiện **không** ghi `stats` → bổ sung merge `{ ...cursor.stats, durationMs, finishedAt }`.
- `worker-health.ts`: suy ra `running = lastStartedAt > stats.finishedAt` (hoặc chưa có `finishedAt`); `stuck = running && now - lastStartedAt > expireInSeconds` của queue (lấy từ `QUEUE_EXPIRE_SECONDS` trong `job-names.ts`, export ra). Trả thêm `runningJobs`, `stuckJobs` trong `/api/health` (additive).
- UI: badge "Đang chạy · 40 s" (`info`), "Treo · 12 phút" (`danger`); filter "Đang chạy"/"Treo"; cột "Thời gian" với ngưỡng màu (so với `expireInSeconds`: > 50 % warning, > 80 % danger).
- Lưu ý: scope động `poll-jira-project:<KEY>` và `refresh-board-membership:…` map về queue gốc khi tra `expireInSeconds`.
- Test: cập nhật/thêm unit test cho `recordRun` và phân loại running/stuck.

**B2 · Lịch chạy (G12)**
- Export `buildScheduleDefinitions` vào `/api/health` (hoặc một map tĩnh dùng chung) → cột "Lịch".
- Formatter cron tự viết cho đúng các mẫu đang dùng (`* * * * *`, `*/N * * * *`, `M H * * *` + `tz`) → "mỗi phút", "5 phút/lần", "hằng ngày 17:20". Mẫu khác hiện cron gốc. **Không** thêm `cron-parser`.
- Job không có lịch (`poll-watched-issues`, `process-webhook`, `bulk-op`…) → "Theo sự kiện".
- Có thể thêm cảnh báo "trễ lịch": `now - lastSuccessAt > 3 × chu kỳ`.

**B3 · Nút "Chạy ngay" (G6)**
- `POST /api/admin/jobs/[name]/run`, admin-only (`isAdmin`).
- **Allowlist** = các job trong `buildScheduleDefinitions` (job không tham số). Không cho chạy `bulk-op`, `process-webhook`, `poll-jira-project` (đã có ở `/admin/sync`).
- `boss.send(name, {}, { singletonKey: \`${name}:manual\`, singletonSeconds: 30, retryLimit: 0 })`, tương tự `enqueueCheckBranches` trong `src/lib/queue/enqueue.ts`. Trả `409` khi trùng singleton (job đã được xếp hàng).
- Ghi `audit({ action: "admin.job.run", target: name, source: "web" })`.
- UI: nút icon `Play` ở cột cuối, disabled khi đang chạy (B1); xác nhận bằng `AlertDialog` cho job nặng (`poll-pr-comments`, `reconcile-deleted-issues`, `capture-project-report-snapshots`, `detect-people-fields`); toast kết quả; refetch health sau 2–3 s.
- Test: route test cho 401/403/400 (job ngoài allowlist)/200/409.

**B4 · Outbox lỗi + retry (G7)**
- `GET /api/admin/outbox?state=failed&limit=100`: `id, channel, userId (email), title, attemptCount, lastError (mask), updatedAt`.
- `POST /api/admin/outbox/retry` body `{ ids?: string[] }` (không có `ids` = tất cả failed, giới hạn 500): đặt `state = pending`, `attemptCount = 0`, `scheduledAt = null`, `lastError = null` rồi `enqueueNotificationDelivery()`. Audit `admin.outbox.retry` với số lượng.
- Kiểm tra lại logic backoff trong `src/lib/queue/workers/deliver-notifications.ts` để chắc reset `attemptCount` không vi phạm `NOTIFY_MAX_ATTEMPTS`.
- UI: Sheet dùng chung component với A3.

**B5 · Giám sát webhook (G9)**
- Thêm vào `/api/admin/metrics` khối `webhooks`: theo `source` → `count24h`, `unprocessed` (`processedAt IS NULL` và cũ hơn 5 phút), `errors24h` (`processingError` không rỗng), `lastReceivedAt`. Dùng `groupBy` + index `[source, receivedAt]` sẵn có.
- UI: card "Webhook" dạng bảng; nguồn có `lastReceivedAt` > 24h → badge warning "Im lặng"; lỗi > 0 → có thể xem 20 lỗi gần nhất (mask) trong Sheet.

**B6 · Độ sâu hàng đợi pg-boss (G13)**
- `/api/admin/metrics` gọi `boss.getQueues()` → mỗi queue: `queuedCount`, `readyCount`, `activeCount`, `failedCount`.
- Cảnh báo khi `readyCount` vượt ngưỡng (vd. > 50) hoặc `failedCount` > 0. Banner thêm "Hàng đợi X tồn N job".
- Bọc try/catch: lỗi pg-boss không được làm hỏng cả endpoint metrics; trả `queues: null` + UI hiện `ErrorState` riêng cho card.

**B7 · Bulk operation (G10) + AI fallback (G2)**
- Metrics thêm `bulkOps` theo `state` (chỉ 7 ngày gần nhất) → `StackedBar`.
- AI: đếm `aiScore` có `points = defaultPoint` và `confidence` thấp/null (xác nhận lại quy tắc heuristic trong worker `ai-score`) → tách "AI thật" / "Mặc định" trên thẻ AI; cảnh báo khi tỉ lệ mặc định > 50 % trong 24h.

**B8 · Hoạt động admin gần đây (G11)**
- `GET /api/admin/audit?limit=20` (admin-only): `createdAt, actorEmail, action, target, source`. Không trả `before/after` ở danh sách.
- UI: card list gọn, nhãn action tiếng Việt cho các action admin chính, action lạ hiện mã gốc. Không poll 30 s, chỉ tải khi mở trang/làm mới.

### Phase C — Xu hướng theo thời gian (G14), cần duyệt riêng

Hai hướng, ưu tiên hướng 1:

1. **Bật `persistQueueStats` của pg-boss** (`src/lib/queue/connection.ts`, `new PgBoss({...})`), kèm `queueStatRetentionDays: 7`. pg-boss tự quản lý bảng thống kê trong schema của nó (không phải Prisma migration), sau đó `boss.getQueueStats(name, { from, maxPoints })` cho sparkline 24h: completed/failed theo queue. Cần developer duyệt vì đổi cấu hình runtime của pg-boss và tạo thêm dữ liệu trong DB.
2. **Bảng lịch sử riêng** (`JobRunHistory`, `ServicePingHistory`) cho độ trễ dịch vụ, uptime: cần **Prisma migration** (file được bảo vệ theo `AGENTS.md`), chỉ làm khi được duyệt rõ ràng.

UI: sparkline nhỏ trong bảng job và card dịch vụ (recharts đã cài, `src/components/ui/chart.tsx`); dưới 4 điểm dữ liệu thì không vẽ chart.

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

## 5. Checklist nghiệm thu (mỗi phase)

- [ ] Loading dùng `Skeleton`/`ListSkeleton`; mỗi card mới có empty state (icon trong vòng tròn muted + tiêu đề + gợi ý) và error state có nút thử lại.
- [ ] Token semantic, không hex cứng; trạng thái luôn có chữ đi kèm màu; tương phản ≥ 4.5:1 ở light + dark.
- [ ] Icon lucide, decorative `aria-hidden`; nút icon có `aria-label`; `cursor-pointer`; transition 150–200 ms; `motion-reduce`.
- [ ] Thao tác ghi có xác nhận khi cần, có toast kết quả, có audit log.
- [ ] Responsive 375 / 768 / 1024 / 1440 px, không cuộn ngang.
- [ ] Không thêm dependency, không Prisma migration (trừ Phase C đã duyệt).
- [ ] Test route mới (auth, validate, happy path); test `recordRun` + phân loại running/stuck.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` pass.

---

## 6. Ước lượng

| Phase | Nội dung | Ước lượng |
|-------|----------|-----------|
| A | Gate, stats, Sentry UI, copy, banner | ~0.5–1 ngày |
| B1–B3 | Running/stuck, lịch, Chạy ngay | ~1–1.5 ngày |
| B4–B8 | Outbox retry, webhook, pg-boss queue, bulk/AI, audit | ~1.5–2 ngày |
| C | Xu hướng | tuỳ hướng được duyệt |

Đề xuất làm trước: **A → B1 → B3 → B4** (giá trị cao, không migration).
