# Kế hoạch & Thực hiện: Cơ chế Tự phục hồi Đồng bộ Jira (Self-Healing Jira Sync)

## 1. Phân loại và Xử lý Sự cố

| Loại sự cố | Nguyên nhân | Cơ chế xử lý |
|---|---|---|
| **1. Job Jira lỗi mạng / timeout / tạm thời** | Jira API ngắt kết nối, timeout, rate limit | Tự động retry tối đa 4 lần với exponential backoff (10s → 20s → 40s → 80s). Giữ nguyên `projectKey`, chế độ `full`/incremental và `source`. Idempotent upsert tránh trùng dữ liệu. |
| **2. Worker restart khi job đang chạy** | Process bị kill đột ngột, container restart | pg-boss tự động giải phóng lock sau `expireInSeconds` (mặc định 15 phút / 900s, cấu hình qua `JIRA_SYNC_EXPIRE_SECONDS`) và chuyển sang retry mà không mất job. Worker heartbeat (mặc định 60s) giám sát tiến trình. |
| **3. Worker process bị kẹt / treo** | Event loop bị block, deadlock, unhandled hang | Container healthcheck truy vấn trực tiếp bảng `IntegrationCursor` liveness heartbeat. Nếu heartbeat > 120s, healthcheck trả về lỗi (unhealthy) để Podman (`health-on-failure: restart`) hoặc Docker Compose (`autoheal` container) tự khởi động lại. |

---

## 2. Cấu hình Retry & Priority theo Dự án

- **Queue riêng từng dự án:** Sử dụng `poll-jira-project` với `singletonKey: normalizedKey`.
- **Thứ tự ưu tiên (Priority):**
  - `Manual / Admin`: **10**
  - `Recovery tự động`: **5**
  - `Worker startup`: **2**
  - `Schedule định kỳ`: **1**
- **Thông số thời gian & retry:**
  - Incremental sync timeout: **15 phút** (900 giây, cấu hình qua env `JIRA_SYNC_EXPIRE_SECONDS`).
  - Worker heartbeat: **60 giây** (cấu hình qua env `JIRA_HEARTBEAT_SECONDS`).
  - Full sync timeout: **15 phút** (900 giây).
  - Retry tối đa: **4 lần**.
  - Backoff: **10s → 20s → 40s → 80s** (`retryDelay: 10`, `retryBackoff: true`).
  - Dedupe recovery: **240 giây** (4 phút) để chống bão job.

---

## 3. Cơ chế Chống Backlog (Anti-Backlog Safeguard)

- **Timestamp chuẩn hóa:** Sử dụng `requestedAt` (ISO string do server tạo ra) làm timestamp chính xác thay vì pg-boss metadata phụ thuộc phiên bản.
- **Chính sách skip:** Chỉ bỏ qua job có `source: "schedule"` hoặc `"startup"` nếu đã chờ trong queue quá 2 phút (`STALE_SCHEDULED_JIRA_JOB_MS = 120_000`).
- **Không bao giờ bỏ qua:** Các yêu cầu `manual`, `admin` hoặc `recovery`.
- **Structured log khi bỏ qua:**
  ```json
  {
    "level": "warn",
    "job": "poll-jira-project",
    "project": "CICM",
    "projectKey": "CICM",
    "ageMs": 180000,
    "ageSeconds": 180,
    "source": "schedule",
    "requestedAt": "2026-09-30T08:00:00.000Z",
    "reason": "Stale scheduled/startup job skipped (> 2 min)",
    "message": "Skipping stale scheduled poll-jira-project job for CICM (queued 180s ago)"
  }
  ```

---

## 4. Watchdog Tự phục hồi (Recovery Watchdog Loop)

- Chạy mỗi **1 phút** (`health-alert` cron `* * * * *`, singletonSeconds 55s, expireInSeconds 60s).
- **Quy trình mỗi chu kỳ:**
  1. Đọc trạng thái từng dự án từ `IntegrationCursor`.
  2. Phát hiện:
     - Dự án không thành công quá `JIRA_FRESHNESS_MINUTES` (`staleProjects`).
     - Dự án có lỗi mới hơn lần thành công gần nhất (`failingProjects`).
  3. Enqueue job phục hồi với `source: "recovery"`, `priority: 5`.
  4. Dedupe theo project trong 4 phút (`singletonSeconds: 240`) tránh bão job.
  5. Tiếp tục thử lại ở các chu kỳ sau nếu dự án vẫn chưa hồi phục.

---

## 5. Phục hồi khi Worker Restart

- **Ghi heartbeat sau khi sẵn sàng:** Chỉ ghi heartbeat đầu tiên và bật chu kỳ heartbeat sau khi `registerJobs()` hoàn tất thành công, tránh false-positive khi startup bị treo.
- **Tái đăng ký queue & schedule:** Tự động tạo lại queue và schedules trên pg-boss.
- **Startup Reconciliation có chọn lọc:** Hàm `reconcileStartupJiraProjects()` kiểm tra cursor thực tế của các dự án; **enqueue những dự án bị stale hoặc failing** với `source: "startup"` (priority 2), và trên cơ sở dữ liệu mới (chưa có cursor nào) tự động enqueue đầy đủ tất cả các dự án đã cấu hình. Các dự án đang healthy không bị enqueue lại mù quáng.

---

## 6. Xử lý Worker bị Treo (Container Healthcheck)

- **Script kiểm tra:** `scripts/check-worker-health.mjs` chạy nhanh qua Node.js kết nối trực tiếp database:
  - Đọc `lastStartedAt` / `lastSuccessAt` của `IntegrationCursor (integration='worker', scope='liveness')`.
  - Nếu khoảng cách > 120s hoặc không có row: exit code `1` (unhealthy).
  - Nếu <= 120s: exit code `0` (healthy).
- **Cấu hình Compose (`compose.yaml`):**
  ```yaml
  worker:
    labels:
      autoheal: "true"
    healthcheck:
      test: ["CMD", "node", "scripts/check-worker-health.mjs"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  autoheal:
    image: docker.io/willfarrell/autoheal:1.2.0
    restart: unless-stopped
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
      AUTOHEAL_INTERVAL: 10
      AUTOHEAL_START_PERIOD: 60
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
  ```
- **Tự động restart:**
  - Podman: cấu hình `--health-on-failure=restart`.
  - Docker Compose: tích hợp service `autoheal` giám sát nhãn `autoheal=true` của worker.
  - Hàng đợi và trạng thái job lưu trên Postgres volume `pgdata`, bảo toàn 100% dữ liệu khi container restart.

---

## 7. Quan sát và Cảnh báo Phục hồi (Observability & Alerts)

- **Structured Log & Metrics:**
  - `recoveryRequested`, `recoveryQueued`, `recoveryCoalesced`, `recoveryFailed`.
  - `retryCount` theo project job.
  - `queueLagMs` thời gian chờ trong queue.
  - `lastSuccessAt` thời điểm đồng bộ thành công gần nhất.
  - `lastError` lỗi gần nhất của dự án.
- **Luồng cảnh báo tự phục hồi:**
  1. Khi phát hiện dự án stale/failed: gửi cảnh báo `jira-stale:<PROJECT>` hoặc `jira-failed:<PROJECT>` (deduped).
  2. Kích hoạt recovery job.
  3. Khi recovery thành công (condition được giải tỏa): gửi ngay thông báo phục hồi per-project:
     - Tiêu đề: `Đồng bộ Jira đã phục hồi: <PROJECT>`
     - Nội dung: `Dự án <PROJECT> đã đồng bộ thành công trở lại.`
     - Severity: `success`
  4. Nếu recovery vẫn lỗi: giữ cảnh báo và thử lại chu kỳ sau.

---

## 8. Kết quả Kiểm thử (Test Suite Results)

- **Toàn bộ 84 test suites (672 tests) đều PASS 100%.**
- TypeScript typecheck sạch (`tsc --noEmit --incremental false` exit 0).
- Các unit test chuyên biệt:
  - `src/lib/queue/jira-job-policy.test.ts`: Kiểm tra chống backlog, skip schedule/startup quá 2 phút, không skip manual/admin/recovery.
  - `src/lib/queue/jira-queue.test.ts`: Kiểm tra priority (10, 5, 2, 1), retryLimit (4), backoff, expireInSeconds (120/900), startup reconciliation chỉ enqueue project stale/failing.
  - `src/lib/queue/jira-recovery.test.ts`: Kiểm tra dedupe stale/failing projects, xử lý lỗi từng project độc lập.
  - `src/lib/queue/workers/health-alert.test.ts`: Kiểm tra watchdog tự phục hồi, cảnh báo per-project và thông báo phục hồi khi project chuyển sang healthy.
  - `src/lib/health/check-worker-health.test.ts`: Kiểm tra logic heartbeat timeout 120s của container healthcheck.
