# Trạng thái triển khai — REMAINING_IMPLEMENTATION_PLAN

> Cập nhật: 2026-10-03
> Đối chiếu với `docs/archive/REMAINING_IMPLEMENTATION_PLAN.md` và `docs/archive/PROJECT_REPORTING_DASHBOARD_PLAN.md`.
> Nguyên tắc: đánh dấu **DONE** chỉ khi code đã có. Đánh dấu **CONFIG** khi code
> đã sẵn nhưng cần cấu hình/dữ liệu thật để chạy end-to-end. Đánh dấu **TODO**
> khi còn thiếu code.

## Tóm tắt nhanh

| Pha | Trạng thái | Ghi chú |
|---|---|---|
| Pha 1 — Nền tảng (OPS-01/02/03) | DONE | Code đầy đủ, có test |
| Pha 2 — Integration (INT-01/02/03/04) | DONE (code) + CONFIG (runtime) | Chờ token/dữ liệu thật |
| Pha 3 — Release (REL-01/02/03/04/05) | DONE (01–04) + TODO (05) | REL-05 chưa làm (cần PO xác nhận) |
| Pha 4 — AI/Audit/OBS/QA/OPS | DONE code, AI-01 + E2E còn pilot | Chờ dữ liệu pilot |
| Bulk Create Smart V2 | DONE | Components, Epic Link, Cascade Subtask, Custom Fields UI, CSV Export (`docs/archive/BULK_CREATE_LOGIC_IMPROVEMENT.md`) |
| Báo cáo tiến độ dự án (Reporting Dashboard) | DONE | Portfolio, Project detail, KPIs, Recharts (Status/Workload/Bottleneck), Risk task drill-down, CSV export, Snapshot model & Cron (`docs/archive/PROJECT_REPORTING_DASHBOARD_PLAN.md`) |

Quality gate hiện tại: **1,029 unit & contract tests pass (135 test files), typecheck pass (0 error), lint sạch, production build pass.**

## Chạy staging (local dev stack) — đã xác minh 2026-09-23
- Postgres: podman container `teamweb-pg` (port 5433), 19 migration đã apply,
  6913 issue đã sync.
- Đã sửa `compose.yaml`: thêm `env_file: .env` (web + worker) để đọc secret thật,
  khai báo `CRED_ENCRYPTION_KEY` + `RELEASE_REQUIRED_APPROVALS` + `CI_GATE_ENABLED`
  (trước đó compose KHÔNG đọc `.env` và thiếu `CRED_ENCRYPTION_KEY` → worker
  fail-fast/credential crypto bị lỗi khi chạy bằng compose).
- Web (`npm run dev`, port 3000) + worker (`npm run worker`) đang chạy với code mới:
  `worker / liveness` heartbeat đang ghi, `poll-jira` sync 7 project,
  `/api/freshness` + `/api/admin/metrics` đã live (401 = cần đăng nhập).
- Chạy bằng local dev (không phải `podman compose`) vì `.env` đã có config thật;
  compose chỉ dùng khi deploy lên staging server.

---

## Chi tiết từng hạng mục

### Pha 1 — Nền tảng vận hành

#### OPS-01 — Worker liên tục + heartbeat → DONE
- `src/worker.ts`: heartbeat liveness mỗi 30s qua `IntegrationCursor`.
- `src/lib/health/worker-health.ts`: phân loại `healthy/degraded/down/unknown`,
  Jira freshness theo `JIRA_FRESHNESS_MINUTES`, job lỗi mới hơn lần thành công.
- Graceful shutdown giữ nguyên; pg-boss tự đăng ký lại schedule sau restart;
  singleton job không chạy trùng.
- `GET /api/health` (admin) + `GET /api/freshness` (user) đọc từ read model.

#### OPS-02 — Env parity + secret → DONE (code) + CONFIG
- `src/lib/health/config-validation.ts`: worker **fail-fast** khi thiếu
  `DATABASE_URL`/`JIRA_BASE_URL`/`JIRA_USER`/`JIRA_TOKEN` (chỉ log tên biến).
- `compose.yaml`: web và worker có cùng bộ biến; secret để trống để điền ở
  runtime (không hardcode).
- `.env.example` đầy đủ biến mới.
- **Còn CONFIG**: điền secret thật (Jira/Bitbucket/Sentry/Discord/VAPID),
  quy trình rotate — xem RUNBOOK.

#### OPS-03 — Health/freshness alert → DONE
- `src/lib/queue/workers/health-alert.ts`: job `health-alert` mỗi 5 phút, **dedupe**
  (worker down / Jira stale / job lỗi / outbox backlog) + recovery notification.
- Banner in-app `src/app/(app)/freshness-banner.tsx` polling `/api/freshness`.
- Alert gửi in-app + push + Discord (khi có config).

### Pha 2 — Integration

#### INT-01 — Bitbucket sync → DONE (code) + CONFIG
- Client + merged policy đã đúng: **chỉ MERGED vào đúng base branch** mới pass;
  MERGED sai destination / CLOSED / DECLINED / không PR = failed; đọc không được
  Bitbucket = unknown.
- Worker `check-branches` (cron 5 phút) + webhook `process-webhook` (tức thì) +
  fallback `parse-comment-branches` (parse comment Bitbucket trên Jira).
- **Còn CONFIG**: `BITBUCKET_REPOS`, token thật; chạy full sync ban đầu.
- **Còn (nhỏ)**: commit `parse-comment-branches` vào baseline chính thức (hiện
  là untracked trong repo — thuộc phần code chưa commit, không phải thiếu logic).

#### INT-02 — Sentry mapping + idempotency → DONE (code) + CONFIG
- `src/lib/sentry/mapping.ts`: `SENTRY_PROJECT_MAPPINGS` (Sentry project → Jira
  project), có test. Unmapped → `ignored` rõ ràng (không đoán project[0]).
- Idempotency `(sentryProject, sentryIssueId)`; recover qua label `sentry-id-*`
  nếu crash sau khi Jira tạo.
- Webhook `created` seed pending import → worker tạo Jira issue < 2 phút.
- Admin API `GET/POST /api/admin/sentry-import` (xem + retry).
- **Còn CONFIG**: `SENTRY_ORG/PROJECT/TOKEN`, `SENTRY_PROJECT_MAPPINGS`.

#### INT-03 — Discord end-to-end → DONE (code) + CONFIG
- Parser command đầy đủ: `/task /move /assign /watch /unwatch /release <v> check
  /stale /link /unlink /help /confirm`. Input mơ hồ → `unknown` (no-op).
- Signature 401, user chưa link không chạy mutation, Jira 403 → blocked,
  multi-task phải `/confirm`, confirmation hết hạn không chạy, correlation id
  gắn vào `ChatMessage`.
- **Còn CONFIG**: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`,
  `DISCORD_WEBHOOK_SECRET`, link user Discord ↔ user web.

#### INT-04 — Web Push + Watch → DONE (code) + CONFIG
- `notify-watchers.ts`: dedupe theo Jira comment id (webhook + poll không trùng),
  bỏ qua chính tác giả khi map được identity.
- `deliver-notifications`: outbox retry/backoff, **clear push subscription khi
  provider trả 404/410**.
- **Còn CONFIG**: `VAPID_PUBLIC_KEY/PRIVATE_KEY` (production), **serve qua HTTPS**
  (bắt buộc cho Web Push), user đăng ký subscription thật.

### Pha 3 — Release management

#### REL-01 — `release_manager` RBAC → DONE
- Migration `..._add_release_manager_role` (enum `Role` + `release_manager`).
- `src/lib/permissions.ts`: permission matrix, test đầy đủ. Enforce server-side
  (ready-check trả 403 cho member).
- Role API + UI accept `release_manager`.

#### REL-02 — Release Fix Version API/UI → DONE
- `POST /api/releases/[id]/release`: idempotent, **re-run gates ngay trước Jira
  mutation**, 409 khi blocked/unknown, không flip DB nếu Jira lỗi, RBAC +
  audit + notify. Có test (5 cases).
- UI: nút "Release version" + confirm dialog + hiển thị released.

#### REL-03 — Approval + override → DONE
- Model `ReleaseApproval` + `ReleaseGateOverride` (migration).
- API `POST/DELETE /api/releases/[id]/approvals` và `.../overrides`.
- Gate `manual_approval` (bắt buộc khi `RELEASE_REQUIRED_APPROVALS` != empty);
  override có actor + lý do, hết hạn/revoked thì vô hiệu; `non_empty_release` và
  `ci` **không thể override**.

#### REL-04 — CI read model + gate → DONE (code) + CONFIG
- Model `CiBuildStatus` (migration); webhook CI upsert theo `(provider, externalId)`.
- Gate `ci`: success đúng commit = passed; failed = failed; pending / không có /
  commit cũ = unknown. **Mandatory + không override** khi `CI_GATE_ENABLED=true`
  (mặc định tắt).
- **Còn CONFIG**: `CI_WEBHOOK_SECRET`, payload chuẩn của CI provider, bật
  `CI_GATE_ENABLED`.

#### REL-05 — "Task lớn" (Epic/Initiative) → TODO (cần PO xác nhận)
- **Chưa làm.** Release readiness hiện tính theo Jira Fix Version. Nếu "task
  lớn" = Epic/Initiative cần: sync parent/epic relation vào `IssueCache`,
  hiển thị readiness theo Epic, tổng hợp child, cảnh báo Epic có child chưa
  thuộc Fix Version. **Chờ product owner xác nhận** (quyết định #15.1).

### Pha 4 — AI / Audit / Observability / QA / Ops

#### AI-01 — Pilot AI estimation → DONE (code) + PILOT
- `ai-score` worker: chỉ score issue chưa có estimate, **provider lỗi không ghi
  estimate giả** (catch `AiUnavailableError`, skip). `AI_AUTO_SCORE=false`
  mặc định (tắt) đúng như plan — không bật toàn bộ ngay.
- Decision API (Accept/Edit/Reject) + metrics endpoint đã có.
- **Còn PILOT**: chọn 1 project, 30–50 task, tech lead review, theo dõi
  accept/edit/reject + MAD, điều chỉnh prompt, mới bật auto-score.

#### SEC-01 — Audit log → DONE (code)
- Model `AuditLog` (migration); `src/lib/audit.ts` append-only, **redact
  secret**, long-text → prefix + hash, best-effort (không phá mutation).
- Wired vào: release publish/approve/override + fail. Có test.
- **Còn (mở rộng)**: wire audit vào các mutation khác (issue transition, bulk,
  branch create, chat command, integration credential) — hiện mới audit luồng
  release.

#### OBS-01 — Metrics + alert → DONE (code)
- `GET /api/admin/metrics`: worker, outbox, sentry import, release by status,
  gate by state, AI decisions.
- Alert: reuse `health-alert` (OPS-03) — worker down, Jira stale, job lỗi,
  outbox backlog.

#### QA-01 — Quality gate → DONE (code)
- `npm run lint` scope `src scripts prisma` (đã chạy sạch, 0 error 0 warning).
- Quality gate: test + typecheck + lint + build đều pass.
- **Còn**: thêm bước CI (nếu có pipeline) + quality gate + migration-on-snapshot.

#### OPS-04 — Backup/restore/runbook → DONE (docs)
- `docs/RUNBOOK.md`: xử lý worker down, Jira/Bitbucket/Sentry/AI unavailable,
  outbox backlog, job stuck, rotate credential.
- `docs/BACKUP_RESTORE.md`: pg_dump hằng ngày + **restore đã có quy trình test**
  (scratch container).
- **Còn (runtime)**: bật cron backup, chạy restore test thật 1 lần, xác nhận
  RPO/RTO.

---

### Báo cáo tiến độ theo dự án (Project Reporting Dashboard)

Đối chiếu với `docs/archive/PROJECT_REPORTING_DASHBOARD_PLAN.md`. Đã hoàn thành các pha MVP (P0–P3) và nền tảng Snapshot lịch sử (P4: RPT-401, RPT-402, RPT-403).

#### 1. Quyền hạn & Navigation (RPT-103, RPT-201) → DONE
- `src/lib/permissions.ts`: Bổ sung 3 permissions chuẩn: `report.view`, `report.export`, `report.configure`. Có unit test suite 11 cases (`src/lib/permissions.test.ts`).
- Navigation Sidebar: Thêm mục **"Báo cáo"** với icon `ChartNoAxesCombined`, trỏ tới `/reports/projects` (`src/app/(app)/app-shell.tsx`).
- TanStack Query Keys: `src/lib/query-keys.ts` bổ sung `reportsKeys` (`portfolio`, `project`, `risks`).

#### 2. Pure Domain Engine (`src/lib/reports/`) → DONE
- `status.ts`: Chuẩn hóa trạng thái Jira sang 8 nhóm cố định (`Backlog`, `To Do`, `In Progress`, `In Review`, `QA/Test`, `Blocked`, `Done`, `Unknown`). Khắc phục triệt để lỗi substring match (dùng word boundary `\bpr\b`).
- `metrics.ts`:
  - Tính tiến độ theo tasks / story points / estimate seconds.
  - Áp dụng quy tắc ngưỡng coverage ≥ 80% để tự động đề xuất đơn vị tính (`recommendedUnit`).
  - Phân tích workload theo assignee mà **không tạo bảng xếp hạng/điểm năng suất cá nhân** (tuân thủ nguyên tắc văn hóa kỹ thuật lành mạnh).
  - Phân tích bottleneck: đếm số task over SLA theo trạng thái và tính tuổi trạng thái trung bình theo ngày làm việc (`businessDaysBetween`).
- `health.ts`: Rule engine đánh giá sức khỏe dự án theo 5 thứ tự ưu tiên nghiêm ngặt (1. Source stale / empty scope → `unknown`; 2. 100% Done → `completed`; 3. Quá hạn / nguy cơ chậm tiến độ > 20% / blocker quá SLA → `at_risk`; 4. Có blocker / trễ 10-20% → `attention`; 5. `healthy`). Trả về kèm mã lý do (`reasonCodes`) và câu kết luận tự nhiên.
- `scope.ts`: Kiểm soát phân quyền truy cập dự án (`user.boardProjects`), bảo đảm người dùng không cấu hình project chỉ xem được project thuộc danh mục active, chặn truy cập trái phép với `403 Forbidden`.
- `freshness.ts`: Tích hợp trực tiếp với `getWorkerHealth()` và `isJiraFresh()` từ Worker liveness model.
- `risk-query.ts`: Đánh giá rủi ro đa yếu tố (`blocked`, `overdue`, `over_sla`, `unassigned`) và sắp xếp ưu tiên xử lý.
- `export.ts`: Xuất dữ liệu CSV định dạng RFC 4180 có UTF-8 BOM (`\uFEFF`) và escape ký tự đặc biệt, tương thích hoàn toàn với Excel/Google Sheets.

#### 3. API Endpoints → DONE
- `GET /api/reports/projects`: Lấy danh sách portfolio dự án, tổng hợp health, progress, blocked/overdue count và độ tươi dữ liệu.
- `GET /api/reports/projects/[projectKey]`: Lấy dữ liệu chi tiết hiện tại của dự án theo Fix Version hoặc toàn dự án (KPIs, health banner, phân bố trạng thái, workload, bottlenecks).
- `GET /api/reports/projects/[projectKey]/risks`: API phân trang danh sách task rủi ro (hỗ trợ lọc theo loại rủi ro, trạng thái, assignee).
- `GET /api/reports/projects/[projectKey]/export`: Xuất báo cáo CSV với đầy đủ timestamp độ tươi dữ liệu, summary KPIs và danh sách task.
- `POST /api/reports/projects/snapshot`: Endpoint thủ công dành cho Admin (`report.configure`) để trigger snapshot aggregate.

#### 4. Giao diện người dùng & Recharts Charts (RPT-201 — RPT-209) → DONE
- Cài đặt `recharts@3.10.1`, cấu hình bảng màu semantic CSS tokens `--chart-1` đến `--chart-5` cho cả Light và Dark mode trong `src/app/globals.css`.
- `src/components/ui/chart.tsx`: Xây dựng ChartContainer, ChartTooltip, ChartLegend tương thích Recharts v3 và shadcn design system.
- `/reports/projects`: Màn hình Portfolio với thanh tìm kiếm, filter pills theo trạng thái sức khỏe, thẻ tóm tắt tổng quan (Total, At Risk, Attention, On Track, Completed), bảng dự án semantic có thanh tiến độ trực quan và nhãn freshness.
- `/reports/projects/[projectKey]`: Màn hình chi tiết dự án với:
  - Header tích hợp bộ chọn Fix Version, bộ chọn đơn vị (Tasks / Points / Estimate / Auto), nút Tải CSV.
  - Banner sức khỏe dự án nổi bật kèm huy hiệu semantic và danh sách lý do chi tiết có thể mở rộng.
  - 6 thẻ KPI tương tác (Tiến độ, Done/Total, WIP, Blocked, Overdue, Over SLA) cho phép click để lọc bảng task rủi ro.
  - Biểu đồ phân bố trạng thái (Recharts horizontal stacked BarChart) có thể click từng phân đoạn để lọc.
  - Biểu đồ Workload theo Assignee (Recharts stacked BarChart) kèm ghi chú định hướng hỗ trợ nhóm.
  - Biểu đồ Bottleneck (Recharts BarChart) thể hiện số lượng task vượt SLA kèm số ngày làm việc trung bình.
  - Bảng Task rủi ro phân trang với liên kết trực tiếp tới trang chi tiết Jira issue.
- Tuân thủ toàn diện Design System: Sử dụng `Skeleton` cho trạng thái tải (không dùng spinner văn bản), empty states có biểu tượng trong vòng tròn muted, đầy đủ fallback bảng dữ liệu cho trợ năng (screen readers).

#### 5. Cơ sở dữ liệu & Snapshot Worker (RPT-401 — RPT-403) → DONE
- Prisma Model `ProjectReportSnapshot` được khai báo trong `prisma/schema.prisma` và triển khai migration `20261003022206_add_project_report_snapshot` vào Postgres database.
- Service `captureProjectReportSnapshots` (`src/lib/reports/snapshot.ts`) lưu trữ aggregate snapshot ngày một cách idempotent theo `(snapshotDate, projectKey, jiraVersionId)`.
- Đăng ký cron job `capture-project-report-snapshots` chạy tự động vào 00:15 hằng ngày thông qua pg-boss trong `src/lib/queue/boss.ts`.

---

## Phần CHƯA làm được / còn thiếu

### 1. Cần cấu hình + dữ liệu thật (chưa thể pilot) — blocking pilot
| Biến | Dùng cho | Trạng thái |
|---|---|---|
| `BITBUCKET_REPOS` + token | INT-01 (branch/PR thật) | trống |
| `SENTRY_ORG/PROJECT/TOKEN` + `SENTRY_PROJECT_MAPPINGS` | INT-02 | trống |
| `DISCORD_BOT_TOKEN/CHANNEL_ID/WEBHOOK_SECRET` | INT-03 | trống |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY` + HTTPS | INT-04 (Web Push) | trống |
| `CI_WEBHOOK_SECRET` + `CI_GATE_ENABLED=true` | REL-04 | trống/tắt |
| `RELEASE_REQUIRED_APPROVALS` | REL-03 | trống (tắt) |
| Jira thật (đã có config cơ bản) | mọi sync | có, cần xác minh |

### 2. Code còn thiếu (TODO)
- **REL-05**: Epic/Initiative readiness — chưa làm, chờ PO xác nhận.
- **SEC-01 (mở rộng)**: audit cho issue transition / bulk / branch / chat /
  credential — hiện chỉ audit luồng release.
- **INT-01 (nhỏ)**: `parse-comment-branches` cần commit vào baseline (logic đã có).
- **QA-01 (CI)**: thêm pipeline CI + quality gate (nếu repo chưa có).

### 3. Cần pilot / vận hành thật (code đã sẵn)
- AI-01: pilot 30–50 task, thu thập accept/edit/reject, mới bật auto-score.
- E2E (mục 9.3): 12 kịch bản end-to-end cần môi trường staging thật.
- OPS-04: bật cron backup, restore test thật.
- Shadow mode 1–2 tuần trước pilot release thật.

---

## Cần làm gì để hoàn thành (theo thứ tự)

**Bước 0 — Quyết định sản phẩm (blocker cho REL-05):** xác nhận 10 mục ở
`REMAINING_IMPLEMENTATION_PLAN.md §15` (quan trọng nhất: #1 "task lớn" = Epic
hay Fix Version, #3 CI provider, #7 freshness SLA, #8 project pilot).

**Bước 1 — Môi trường staging + cấu hình thật (mở khóa mọi CONFIG):**
1. Deploy staging (web + worker + db) qua `podman compose up -d --build`.
2. Điền secret thật vào `.env.production` / podman secret: Jira, Bitbucket
   (`BITBUCKET_REPOS`), Sentry (`SENTRY_PROJECT_MAPPINGS`), Discord, VAPID key,
   CI webhook secret.
3. Serve qua HTTPS (bắt buộc cho Web Push).
4. Xác minh `/api/health` = healthy, Jira sync chạy, Bitbucket branch/PR về DB.

**Bước 2 — E2E kiểm thử (mục 9.3, 12 kịch bản):** chạy từng kịch bản trên
staging, sửa lỗi phát hiện.

**Bước 3 — Pilot AI (AI-01):** chọn project, 30–50 task, tech lead review, đo
chất lượng, bật `AI_AUTO_SCORE` khi đạt ngưỡng.

**Bước 4 — Bật release gates theo rollout:**
- `RELEASE_REQUIRED_APPROVALS` (nếu cần approval).
- `CI_GATE_ENABLED=true` khi CI webhook đã chạy.
- Shadow mode: gate kết luận nhưng không release thật, 1–2 tuần.

**Bước 5 — Pilot release thật (1 project):** 1 nhóm release_manager, theo dõi
metrics + audit, bật mở rộng dần.

**Bước 6 — Hoàn thiện code còn thiếu:**
- REL-05 (nếu PO xác nhận cần Epic).
- Mở rộng audit (SEC-01) sang các mutation còn lại.
- Thêm pipeline CI + quality gate (QA-01).
- Bật cron backup + restore test (OPS-04).
