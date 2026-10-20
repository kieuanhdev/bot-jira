# Thay code tự viết bằng thư viện, sửa lỗi múi giờ và bảo mật — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Phân vai:** Claude chỉ lập kế hoạch và review. Worker **agy** làm phần triển khai. Sau mỗi task, một worker Claude review commit local. Không push, không mở PR.

**Goal:** Thay các đoạn code tự viết bằng thư viện chuẩn hoặc API có sẵn ở những chỗ có lợi rõ. Đồng thời sửa các lỗi thật mà đợt rà soát tìm ra: lệch múi giờ, CSV formula injection, tên branch mất dấu tiếng Việt, và cache không giới hạn.

**Architecture:** Chia 6 phase, mỗi phase release được riêng. Phase 1 (bảo mật) và Phase 2 (múi giờ) sửa lỗi thật nên làm trước. Phase 3–5 là refactor và phải giữ nguyên hành vi. Mọi phần không có DOM test (UI) đều tách logic thuần ra file `.ts` để unit test, phần còn lại QA tay.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Prisma 7, pg-boss 12, TanStack Query 5, Radix/shadcn (new-york), vitest 2 (environment `node`, test `.test.ts` cùng thư mục với code), Node 22 (Dockerfile `node:22-slim`).

**Quyết định đã chốt với developer (2026-10-19):**

| Câu hỏi | Lựa chọn |
|---|---|
| Phạm vi | **Toàn bộ, chia phase.** Mỗi phase release riêng được. |
| Thư viện mới được phép | `zod`, `@radix-ui/react-popover`, `cmdk`, `date-fns`, `@date-fns/tz`, `lru-cache`, `papaparse` (+ `@types/papaparse`), `isomorphic-dompurify` |
| Múi giờ chuẩn | **`Asia/Ho_Chi_Minh` cố định** cho mọi mốc ngày/tuần/tháng, không phụ thuộc `TZ` của server. |

**Ngoài phạm vi (chưa được duyệt thư viện):** radio-group, sonner, tw-animate-css, @tanstack/react-virtual, @tanstack/react-table, react-hook-form, ky, p-retry. Radio gốc, `BoardToast`, `use-windowed-rows` giữ nguyên.

---

## 1. Hiện trạng (đo trên code, commit `a38eaf0`)

### 1.1 Lỗi thật

| Lỗi | Vị trí | Hậu quả |
|---|---|---|
| Đầu tuần lệch 1 ngày | `src/lib/stale/calculator.ts:37` `getIsoWeekStart` đặt 0h giờ local rồi `toISOString().slice(0,10)` | Ở múi +7 trả về Chủ nhật thay vì thứ Hai, bucket trend 8 tuần sai |
| Kỳ leaderboard lệch 7 giờ | `src/lib/leaderboard/period.ts` `computePeriodBounds` dùng mốc UTC và `now.getMonth()` local | Task xong lúc 00:00–07:00 ngày 1 (giờ VN) bị tính sang tháng trước |
| Ngày theo giờ local của server | `src/lib/due-date.ts:5`, `src/lib/stale/business-days.ts`, `src/lib/reports/health.ts:117-128` | Kết quả khác nhau giữa máy dev (+7) và prod (UTC, Docker không đặt `TZ`) |
| Khoá theo ngày UTC | `queue/workers/health-alert.ts:139,159,172,184,201`, `jira/resources/versions.ts:42`, `reports/query-primitives.ts:409`, `app/(app)/reports/report-period-filter.tsx:60` | Ngày "hôm nay" đổi lúc 07:00 VN. Release lúc 00:00–07:00 VN nhận ngày hôm trước |
| Cron không có `tz` | `src/lib/queue/schedules.ts:29-30` | Snapshot chạy 07:15 VN chứ không phải 00:15 như nhãn ghi |
| "Quá hạn" không thống nhất | `src/lib/bulk/selection.ts:160,168` dùng `lt: new Date()` | Task đến hạn hôm nay bị coi là quá hạn, trong khi board thì không |
| CSV formula injection | `src/lib/reports/export.ts:7`, `src/app/(app)/bulk/create/lib/export-operation-csv.ts:16,25` | Ô bắt đầu bằng `=`, `+`, `@` (lấy từ summary Jira) chạy như công thức khi mở bằng Excel |
| Tên branch mất dấu | `src/lib/bulk/branch-name.ts:23` | "Đang làm" thành `ang-lm` |
| Cache không giới hạn | `jira/board-options.ts` (`optionsCache`), `jira/avatar-route-service.ts` (`userAvatarUrlCache`) | Bộ nhớ tăng theo số user × project |
| HTML wiki không qua lọc | `src/lib/wiki.ts` → `dangerouslySetInnerHTML` ở `components/issues/wiki-content.tsx:88` | Hiện có vẻ an toàn, nhưng chỉ dựa vào regex |

### 1.2 Code trùng hoặc tự viết

- **Body API:** 37 route và 4 route-service ép kiểu `(await req.json()) as {...}` mà không kiểm tra lúc chạy. Chỉ 5 route dùng `readJsonBody`, và guard của cả 5 chỉ kiểm tra `typeof v === "object"`.
- **`env.ts`:** 386 dòng. `jiraBoardMembershipMode` chỉ được ép kiểu (dòng 99), không kiểm tra. Có 3 hàm parse `KEY:val` giống nhau. Có 98 file import `env`, trong đó 54 file test dùng `vi.mock("@/lib/env")`.
- **Timeout và retry:** có 3 bản AbortController viết tay (`http/fetch-with-timeout.ts`, `jira/client.ts:302`, `jira/dev-status.ts:104,208`), 2 vòng retry và 2 hàm parse `Retry-After`.
- **Cache:** `board-options.ts` viết lại logic của `createBoardCachePolicy`. `getInFlight` ép một promise `void` thành `Promise<T>` (đã ghi chú F-005).
- **Chạy song song:** có 2 worker pool viết tay (`bulk/ops.ts:564`, `bulk/create-execution.ts:345`) dù đã có `mapWithConcurrency`.
- **Che secret:** 4 bản khác nhau, mỗi bản che một bộ mẫu khác nhau.
- **ISO date:** 4 hàm kiểm tra khác nhau, trong đó 2 hàm trùng tên `isValidIsoDate`. Mẹo `Intl.DateTimeFormat("en-CA")` bị chép ở 4 nơi.
- **UI:**
  - 6 combobox tự viết (khoảng 1.100 dòng), không dùng portal, xử lý phím mỗi cái một kiểu.
  - 2 popup chọn project không đóng khi bấm Esc hay bấm ra ngoài.
  - `ui/sheet.tsx` tự viết, không có focus trap.
  - `QuickPanel` dùng `useFocusTrap` riêng.
  - 14 checkbox và 2 `<select>` dạng thẻ HTML gốc.
  - 2 thanh tab tự làm.

---

## 2. Quy ước cho module ngày giờ (đọc trước Phase 2)

Có **hai loại giá trị** và module phải đặt tên tách bạch:

1. **Date key** (`DateKey` = chuỗi `YYYY-MM-DD`). Đây là ngày lịch, không có giờ.
   - Cách lưu DB (giữ nguyên, không đổi): `dueDate`, `releaseDate`, `snapshotDate` được lưu là **UTC midnight** của ngày đó, ví dụ `2026-10-07T00:00:00.000Z`.
   - Chuyển đổi: `dateKeyToUtcMidnight` và `utcMidnightToDateKey`.
2. **Instant** (`Date` là một thời điểm thật, ví dụ `createdAt`, `now`).
   - Muốn biết "ngày nào ở VN" thì gọi `toDateKey(instant)`.
   - Mốc truy vấn khoảng thời gian (leaderboard) là **instant lúc 0h giờ VN**: `startOfDayInTz`, `zonedMidnight`.

Không bao giờ gọi `toISOString().slice(0, 10)` trên một instant. Chỉ được dùng trên giá trị UTC-midnight, và nên thay bằng `utcMidnightToDateKey`.

---

## 3. Global Constraints (áp dụng cho mọi task)

- Lệnh kiểm tra:
  - `npm run typecheck`
  - `npm run lint` (`--max-warnings=0`)
  - `npm test`
  - Từ Phase 2 trở đi chạy thêm `npm run test:tz`.
  - Task chạm vào wiki, sheet hoặc combobox chạy thêm `npm run build`.
- **Không sửa assertion test hiện có**, trừ những chỗ plan liệt kê rõ giá trị cũ → mới. Nếu một test cũ fail mà plan không nói trước thì dừng lại và báo, không tự sửa test.
- Giữ nguyên chữ ký export công khai, trừ khi task nói khác. Người gọi không phải sửa.
- Timezone viết đúng một hằng `APP_TIMEZONE` trong `src/lib/date/index.ts`. Không chép chuỗi `"Asia/Ho_Chi_Minh"` ra chỗ khác.
- UI:
  - Tuân theo `design-system/team-task-web/MASTER.md` và quy ước trong `AGENTS.md`: token màu ngữ nghĩa, `cursor-pointer`, transition 150–200ms, `prefers-reduced-motion`.
  - `src/lib/design-guard.test.ts` phải xanh, tức là không dùng `text-[10/11/13px]` và không dùng màu palette thô.
  - QA tay ở cả light và dark, độ rộng 1280px và 375px.
- Chỉ Task 0.1 được sửa `package.json` và `package-lock.json`. Không task nào thêm khoá mới vào object `env`, vì 54 file test mock nó và key mới sẽ thành `undefined`.
- Trước khi sửa `next.config.ts` hoặc dùng API Next, đọc hướng dẫn tương ứng trong `node_modules/next/dist/docs/` (theo `AGENTS.md`).
- Mỗi task một commit, message theo Conventional Commits và kết thúc bằng dòng `Plan-Task: <id>`.
- Chạy tự động bằng `scripts/agent/run-plan.sh`: mỗi task một session agy mới, sau đó script tự kiểm tra rồi cho Claude review. Ghi chú bàn giao giữa các task nằm ở `.agent_run/HANDOFF.md`.

### Giới hạn an toàn cho worker agy (worker chạy bypass-permissions)

- Không `git push`, không mở PR, không merge, không `git reset --hard`, không `git checkout -- .`, không xoá branch.
- Không chạy `prisma migrate`, `db:deploy` hay `db:seed`. Plan này **không có migration**.
- Không sửa `.env*`, `Dockerfile`, `compose.yaml`, `AGENTS.md`, `CLAUDE.md`, `autoimprove/`, `.kilo/`.
- Không cài thêm package ngoài danh sách đã duyệt.
- Không xoá hay bỏ qua (`.skip`) test để cho xanh.
- Nếu gặp tình huống ngoài plan thì dừng lại và báo, không tự quyết.

---

## 4. Review Focus

Năm trường hợp dễ gây lỗi nhất mà test theo từng task dễ bỏ sót. Mỗi dòng đã có test tương ứng trong task sở hữu.

1. **Thời điểm 00:00–07:00 giờ VN.** Mọi phép tính ngày phải cho ra cùng kết quả khi `TZ=UTC` và khi `TZ=Asia/Ho_Chi_Minh`. Test: Task 2.1, 2.3, 2.4, 2.5, 2.6, và `npm run test:tz`.
2. **Branch đã tạo theo tên cũ.** Chạy lại "tạo branch" cho task có status tiếng Việt không được tạo branch thứ hai. Test: Task 1.3.
3. **Số âm trong CSV export.** `-3` vẫn phải là `-3`, chỉ chuỗi công thức mới bị vô hiệu hoá. Test: Task 1.1.
4. **Body rỗng ở route có body tuỳ chọn** (`reports/projects/snapshot`, `admin/outbox/retry`). Body rỗng vẫn phải được nhận như cũ. Test: Task 3.1 (`allowEmpty`) và Task 3.4.
5. **Phím Escape lồng nhau.**
   - Esc trong ô sửa inline của QuickPanel chỉ huỷ việc sửa.
   - Esc trong lightbox chỉ đóng lightbox.
   - Esc trong combobox nằm trong sheet chỉ đóng combobox.
   - Test: QA checklist của Task 5.1, 5.3 và 5.8.

---

## 5. Các phase và task

### Phase 0: Chuẩn bị

#### Task 0.1: Cài thư viện và đo baseline

**Files:** `package.json`, `package-lock.json`, phụ lục B của file plan này.

- [x] Chạy `npm install zod @radix-ui/react-popover cmdk date-fns @date-fns/tz lru-cache papaparse isomorphic-dompurify`, rồi `npm install -D @types/papaparse`. Lấy bản ổn định mới nhất tại thời điểm cài và ghi lại version vào phụ lục B.
- [x] Thêm script `"test:tz": "TZ=Asia/Ho_Chi_Minh vitest run"`.
- [x] Chạy `npm run typecheck`, `npm run lint`, `TZ=UTC npm test` và `npm run test:tz`. Ghi vào phụ lục B: số test pass/fail của từng lần chạy, và **danh sách test chỉ fail ở một trong hai múi giờ**. Danh sách này là đầu vào cho Phase 2.
- [x] Commit `chore(deps): add zod, radix popover, cmdk, date-fns, lru-cache, papaparse, dompurify`.

#### Task 0.2: Cố định TZ khi chạy test

**Files:** `vitest.setup.ts`

- [x] Thêm `process.env.TZ ||= "UTC";` ở đầu file. Dùng `||=` để `npm run test:tz` vẫn ghi đè được.
- [x] `npm test` phải xanh. Các test nằm trong danh sách "chỉ fail ở +7" của Task 0.1 được phép đỏ ở `test:tz` cho tới khi Phase 2 xong. Ghi tên các test đó vào phụ lục B.
- [x] Commit `test: pin TZ=UTC by default, add test:tz script`.

---

### Phase 1: Sửa lỗi bảo mật và lỗi nhỏ (các task độc lập nhau)

#### Task 1.1: Chặn CSV formula injection bằng papaparse

**Files:**
- Create: `src/lib/csv/write.ts`
- Create: `src/lib/csv/write.test.ts`
- Modify: `src/lib/reports/export.ts`
- Modify: `src/app/(app)/bulk/create/lib/export-operation-csv.ts`

**Interfaces:**
- Produces:
  - `export const CSV_FORMULA_RE: RegExp`
  - `export function toCsv(rows: unknown[][], opts?: { bom?: boolean }): string`

- [x] **Viết test trước** (`write.test.ts`):
  - `toCsv([["=SUM(A1)"]])` === `"'=SUM(A1)"`
  - `toCsv([["+1 call"], ["@user"]])` có `'+1 call` và `'@user`
  - `toCsv([[-3, "-3", "-2.5"]])` === `"-3,-3,-2.5"`
  - `toCsv([["-abc"]])` === `"'-abc"`
  - `toCsv([['a"b', "x,y", "l1\nl2"]])` === `'"a""b","x,y","l1\nl2"'`
  - `toCsv([[null, undefined]])` === `","`
  - `toCsv([["a"]], { bom: true }).startsWith("﻿")`
- [x] **Kiểm tra output thật của papaparse trước khi chốt assertion.** Chạy `node -e 'const P=require("papaparse");console.log(JSON.stringify(P.unparse([["=SUM(A1)"," x ","-3",-3]],{escapeFormulae:/^(?:[=+@\t\r]|-(?!\d+(?:\.\d+)?$))/})))'`. Có hai khả năng:
  - **Không có ô nào bị bọc thêm dấu nháy** (ngoài các ô vốn cần nháy) thì giữ assertion như trên.
  - **papaparse bọc thêm nháy** (cho ô đã escape, hoặc ô có khoảng trắng đầu/cuối) thì **không dùng `Papa.unparse`**. Giữ `escapeCsvCell` 12 dòng hiện tại, chuyển nó sang `src/lib/csv/write.ts` và thêm bước chặn bằng `CSV_FORMULA_RE`. Như vậy `export.test.ts` không phải đổi.
  - Ghi lựa chọn và output vừa chạy vào phụ lục B.
- [x] Chạy `npx vitest run src/lib/csv/write.test.ts`. Kỳ vọng: FAIL.
- [x] **Cài đặt** (nếu dùng papaparse) bằng `Papa.unparse(rows, { escapeFormulae: CSV_FORMULA_RE, newline: <giữ đúng ký tự xuống dòng export.ts đang dùng> })`.
  - `CSV_FORMULA_RE = /^(?:[=+@\t\r]|-(?!\d+(?:\.\d+)?$))/`: bắt ký tự công thức ở đầu ô, và dấu `-` nếu phần sau không phải là số.
  - `null` và `undefined` thành ô rỗng.
- [x] Thay `escapeCsvCell` và `toCsvRow` trong `export.ts` bằng `toCsv(rows, { bom: true })`. Thay phần escape inline ở `export-operation-csv.ts` bằng `toCsv`.
- [x] `export.test.ts` và `export-operation-csv.test.ts` phải xanh mà không sửa test.
- [x] Commit `fix(security): neutralise CSV formula injection in report and bulk exports`.

#### Task 1.2: Lọc HTML wiki bằng DOMPurify

**Files:**
- Modify: `src/lib/wiki.ts`
- Test: `src/lib/wiki.test.ts`
- Có thể sửa: `next.config.ts`

**Interfaces:** `wikiToHtml(input: string, opts?: WikiOptions): string` giữ nguyên chữ ký. Output giờ đi qua sanitize.

- [ ] **Viết test trước** (thêm vào `wiki.test.ts`):
  - `wikiToHtml("[x|javascript:alert(1)]")` không chứa `javascript:`.
  - `wikiToHtml("<script>alert(1)</script>")` không chứa `<script`.
  - `wikiToHtml("<img src=x onerror=alert(1)>")` không chứa `onerror`.
  - Link ngoài vẫn giữ `target="_blank"` và `rel` (nếu `wiki.ts` hiện đang sinh ra).
  - 7 test ảnh hiện có phải cho **cùng nội dung** như trước.
- [ ] Chạy test. Kỳ vọng: test XSS PASS hoặc FAIL tuỳ code hiện tại. Ghi lại kết quả. 7 test ảnh phải PASS.
- [ ] **Cài đặt:** bọc kết quả cuối bằng `DOMPurify.sanitize(html, { ADD_ATTR: ["target"], ALLOWED_URI_REGEXP: /^(?:https?:|\/|#)/i })`. Import `DOMPurify` từ `isomorphic-dompurify`. Attribute `data-*` mặc định đã được giữ.
- [ ] Chạy test. Kỳ vọng: tất cả PASS.
  - **Được phép đổi test** nếu khác biệt chỉ nằm ở cách serialize (ví dụ `<img … />` thành `<img …>`, hoặc cách viết entity). Phải liệt kê từng assertion cũ → mới trong commit.
  - Mọi khác biệt khác (mất attribute, mất `src`) thì dừng lại và báo.
- [ ] Chạy `npm run build`. Nếu build lỗi vì jsdom:
  - Đọc `node_modules/next/dist/docs/` để biết tên key đúng của Next 16 cho package ngoài bundle server (hiện là `serverExternalPackages`).
  - Thêm `isomorphic-dompurify` và `jsdom` vào `next.config.ts`, ghi lý do trong commit, rồi build lại.
- [ ] QA tay: mở một issue có ảnh đính kèm trong mô tả. Bấm vào ảnh, lightbox vẫn mở. Link ngoài vẫn bấm được.
- [ ] Commit `fix(security): sanitize rendered Jira wiki HTML with DOMPurify`.

#### Task 1.3: Tên branch giữ chữ tiếng Việt và tương thích tên cũ

**Files:**
- Modify: `src/lib/bulk/branch-name.ts`
- Modify: `src/lib/bulk/executors.ts:138-146`
- Modify: `src/lib/bulk/ops.ts:356-362`
- Test: `src/lib/bulk/branch-name.test.ts`

**Interfaces:**
- Produces:
  - `renderBranchName(template, key, status): string`: chữ ký giữ nguyên, nhưng status được bỏ dấu (Đ/đ thành d).
  - `export function renderLegacyBranchName(template: string, key: string, status: string): string`: thuật toán cũ, chỉ dùng để tra cứu.

- [ ] **Viết test trước:**
  - `renderBranchName("{status}/{key}", "ABC-1", "Đang làm")` === `"dang-lam/ABC-1"`. Dùng placeholder thật trong `defaultBranchTemplate`.
  - `renderBranchName(..., "Chờ review")` cho ra `cho-review`.
  - `renderLegacyBranchName(..., "Đang làm")` cho ra `ang-lm`, tức là giữ đúng hành vi cũ.
  - 8 test cũ không đổi.
- [ ] **Cài đặt:** chuẩn hoá status bằng `.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d")` trước bước lọc `[a-z0-9-]`. `renderLegacyBranchName` là bản sao của thuật toán hiện tại.
- [ ] **Tra cứu tương thích:** ở `executors.ts` và `ops.ts`, nếu tên cũ khác tên mới thì gọi `getBranch` với tên mới trước. Nếu không thấy thì thử tên cũ. Nếu tên cũ tồn tại thì dùng tên cũ, không tạo branch mới.
  - Test trong `executors` hoặc `ops` test (dùng mock `bitbucket.getBranch` có sẵn): branch cũ `ang-lm/ABC-1` tồn tại thì `createBranch` không được gọi, và kết quả trả về tên cũ.
- [ ] Commit `fix(bulk): transliterate Vietnamese status in branch names, keep legacy lookup`.

#### Task 1.4: Sinh ID ngẫu nhiên bằng crypto

**Files:**
- Modify: `src/lib/utils.ts:50-58`
- Modify: `src/lib/notify/outbox.ts:116-117`
- Test: `src/lib/utils.test.ts`

- [ ] **Viết test trước:** khi stub `crypto.randomUUID` thành `undefined`, `safeRandomUUID()` vẫn khớp regex UUID v4 `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`, và `Math.random` không bị gọi (dùng `vi.spyOn`).
- [ ] **Cài đặt:** nhánh dự phòng dùng `crypto.getRandomValues(new Uint8Array(16))`, rồi đặt bit version 4 và variant 10. Ở `outbox.ts`, thay đuôi `Math.random().toString(36).slice(2,7)` bằng `crypto.randomUUID()`.
- [ ] Commit `fix: use crypto for UUID fallback and legacy outbox event keys`.

#### Task 1.5: Gộp 4 bản che secret về một

**Files:**
- Modify: `src/lib/ai/sanitizer.ts`
- Modify: `src/lib/notify/delivery-contract.ts:49`
- Modify: `src/lib/sentry/client.ts:32`
- Modify: `src/lib/admin/project-sync.ts:35`
- Test: các file `.test.ts` tương ứng

**Interfaces:**
- Produces: `redactSecrets(raw: string): string` là **hợp** của mọi mẫu đang có:
  - `sk-…`
  - `(Bot|Bearer) <token>`
  - userinfo trong URL
  - `api_key|secret|token|password = …`
  - query param `token|secret|key|api_key|auth`
  - token trong Discord webhook
- Không đổi chữ ký các hàm sau, chỉ đổi phần bên trong: `sanitizeErrorMessage` (cắt 500), `sanitizeSentryErrorMessage` (cắt 300), `sanitizeSyncError` (null vào thì null ra, cắt 300).

- [ ] **Viết test trước** trong `sanitizer.test.ts`:
  - `redactSecrets("Bot abcdefghijklmnop")` === `"Bot [REDACTED_TOKEN]"`
  - `redactSecrets("x?auth=abc123")` chứa `auth=[REDACTED]`
  - `redactSecrets("password=hunter2hunter2")` không chứa `hunter2`
- [ ] **Cài đặt:** 3 hàm còn lại gọi `redactSecrets(raw).slice(0, N)`.
- [ ] **Test được đổi có chủ đích:** `project-sync.test.ts` hiện kỳ vọng `token=***`, đổi thành kỳ vọng định dạng `[REDACTED]` của `redactSecrets`. Ghi rõ từng assertion cũ → mới trong commit message.
- [ ] Commit `refactor(security): single redactSecrets used by notify, sentry and sync errors`.

---

### Phase 2: Module ngày giờ và sửa lỗi múi giờ

#### Task 2.1: Module `src/lib/date`

**Files:**
- Create: `src/lib/date/index.ts`
- Create: `src/lib/date/index.test.ts`

**Interfaces (Produces):**

```ts
export const APP_TIMEZONE = "Asia/Ho_Chi_Minh";
export type DateKey = string; // YYYY-MM-DD
export function isDateKey(value: unknown): value is DateKey;           // real calendar date only
export function toDateKey(instant: Date, tz?: string): DateKey;        // calendar day of instant in tz
export function dateKeyToUtcMidnight(key: DateKey): Date;              // storage convention; throws on invalid
export function utcMidnightToDateKey(d: Date): DateKey;                // inverse, for dueDate/releaseDate
export function addDaysToKey(key: DateKey, days: number): DateKey;
export function diffDays(from: DateKey, to: DateKey): number;          // to - from, may be negative
export function zonedMidnight(year: number, month1: number, day: number, tz?: string): Date; // instant
export function startOfDayInTz(instant: Date, tz?: string): Date;      // instant of local 00:00
export function zonedParts(instant: Date, tz?: string): { year: number; month: number; day: number; weekday: number }; // month 1-12, weekday 0=Sun
export function startOfIsoWeekKey(instant: Date, tz?: string): DateKey; // Monday
export function businessDaysInclusive(from: DateKey, to: DateKey): number; // Mon–Fri, 0 if to < from
```

Tham số `tz` mặc định là `APP_TIMEZONE`.

- [ ] **Viết test trước.** Bọc toàn bộ trong `describe.each(["UTC", "Asia/Ho_Chi_Minh", "America/New_York"])`, đặt `process.env.TZ` ở `beforeEach` và khôi phục ở `afterEach`.
  - `toDateKey(new Date("2026-10-01T16:59:59Z"))` === `"2026-10-01"`
  - `toDateKey(new Date("2026-10-01T17:00:00Z"))` === `"2026-10-02"`
  - `toDateKey(new Date("2026-10-01T17:30:00Z"), "UTC")` === `"2026-10-01"`
  - `isDateKey("2026-02-30")` === false; `isDateKey("2028-02-29")` === true; `isDateKey("2026-1-05")` === false; `isDateKey(20261005)` === false
  - `dateKeyToUtcMidnight("2026-10-07").toISOString()` === `"2026-10-07T00:00:00.000Z"`; `dateKeyToUtcMidnight("bad")` throws
  - `addDaysToKey("2026-10-31", 1)` === `"2026-11-01"`; `diffDays("2026-10-01", "2026-10-31")` === 30
  - `zonedMidnight(2026, 10, 1).toISOString()` === `"2026-09-30T17:00:00.000Z"`
  - `startOfDayInTz(new Date("2026-10-02T03:00:00Z")).toISOString()` === `"2026-10-01T17:00:00.000Z"`
  - `startOfIsoWeekKey(new Date("2026-10-04T18:00:00Z"))` === `"2026-10-05"` (01:00 thứ Hai giờ VN)
  - `startOfIsoWeekKey(new Date("2026-10-04T16:00:00Z"))` === `"2026-09-28"` (23:00 Chủ nhật giờ VN)
  - `businessDaysInclusive("2026-10-02", "2026-10-05")` === 2 (thứ Sáu → thứ Hai)
  - `businessDaysInclusive("2026-10-05", "2026-10-12")` === 6
  - `businessDaysInclusive("2026-10-03", "2026-10-04")` === 0 (thứ Bảy → Chủ nhật)
- [ ] Chạy test. Kỳ vọng: FAIL vì module chưa tồn tại.
- [ ] **Cài đặt:** dùng `TZDate` / `tz()` của `@date-fns/tz` cùng `date-fns` (`addDays`, `differenceInCalendarDays`, `startOfISOWeek`, `isWeekend`). Không dùng getter local (`getDate`, `setHours`).
- [ ] Chạy `npx vitest run src/lib/date` và `TZ=Asia/Ho_Chi_Minh npx vitest run src/lib/date`. Kỳ vọng: cả hai PASS.
- [ ] Commit `feat(date): add timezone-safe date module on date-fns/tz`.

#### Task 2.2: Dùng module cho các bản sao mẹo en-CA

**Files:**
- `src/lib/reports/period.ts`
- `src/lib/reports/completion-date.ts:80-89`
- `src/lib/reports/snapshot.ts:30`
- `src/lib/queue/workers/notify-unmerged-prs.ts:7,17`
- `src/lib/reports/snapshot-service.ts:18`
- `src/app/api/reports/projects/route.ts:54`
- `src/app/api/reports/projects/[projectKey]/route.ts:40`
- `src/lib/leaderboard/period.ts:136`

**Interfaces:** giữ nguyên mọi chữ ký export.
- `DEFAULT_REPORT_TIMEZONE` và `UNMERGED_PR_TIMEZONE` trở thành re-export của `APP_TIMEZONE`.
- `formatDateInTimezone` gọi `toDateKey`, giữ fallback về ngày UTC khi tz không hợp lệ.
- `parseDateString` dùng `isDateKey`. Hệ quả: `2026-02-30` giờ trả về `null` thay vì bị cuộn sang tháng sau.
- `addDays`, `countDays` (= `diffDays + 1`) và `getWeekBounds`/`getMonthBounds` dùng các hàm của module.

- [ ] **Viết test trước:** thêm `parseDateString("2026-02-30")` → `null` vào `period.test.ts`. Mọi test hiện có của `period.test.ts`, `metrics-separation.test.ts:237-255`, `snapshot.test.ts` và `notify-unmerged-prs.test.ts` phải **giữ nguyên**.
- [ ] Cài đặt. Sau đó `grep -rn '"en-CA"' src --include=*.ts` chỉ còn lại kết quả trong `src/lib/date/`. Literal `"Asia/Ho_Chi_Minh"` chỉ còn trong `src/lib/date/index.ts`, ngoại trừ `schedules.ts` (Task 2.7 sẽ import hằng).
- [ ] Chạy `npm test` và `npm run test:tz`. Kỳ vọng: các test vừa nêu xanh ở cả hai.
- [ ] Commit `refactor(date): route all timezone day-key helpers through src/lib/date`.

#### Task 2.3: Stale — đầu tuần và ngày làm việc theo giờ VN

**Files:**
- `src/lib/stale/calculator.ts:37-42,230-235`
- `src/lib/stale/business-days.ts`
- Test: `src/lib/stale/calculator.test.ts`, `src/lib/stale/business-days.test.ts`

**Interfaces:** giữ nguyên chữ ký.
- `getIsoWeekStart(d)` = `startOfIsoWeekKey(d)`.
- `businessDaysBetween(from, to)` = `businessDaysInclusive(toDateKey(from), toDateKey(to))`.
- `overdueBusinessDays(due, now)`:
  - `dueKey = utcMidnightToDateKey(due)`, vì dueDate được lưu ở UTC midnight.
  - `todayKey = toDateKey(now)`.
  - Nếu `todayKey <= dueKey` thì trả 0. Ngược lại trả `businessDaysInclusive(dueKey, todayKey)`.
- 8 bucket trend được tạo bằng `addDaysToKey(startOfIsoWeekKey(now), -7*i)`.

- [ ] **Viết test trước:**
  - `getIsoWeekStart(new Date("2026-10-04T18:00:00Z"))` === `"2026-10-05"`, chạy được ở cả hai TZ.
  - Thay test tự tham chiếu ở `calculator.test.ts:226` bằng giá trị cố định: với `now = 2026-10-07T03:00Z`, 8 bucket là `2026-08-17`, `08-24`, `08-31`, `09-07`, `09-14`, `09-21`, `09-28`, `10-05`.
- [ ] **Test được đổi có chủ đích** (`business-days.test.ts`): đổi input dạng `new Date(2026,0,5,9)` (giờ local) thành instant ISO có `Z` cho cùng ngày VN, ví dụ `new Date("2026-01-05T02:00:00Z")`. **Kỳ vọng số giữ nguyên:** 2, 6, 11, 0, 1, 0 và overdue 0, 2, 2.
- [ ] Chạy `npm test` và `npm run test:tz` cho `src/lib/stale src/lib/reports`. Kỳ vọng: PASS cả hai.
- [ ] Commit `fix(stale): compute ISO week and business days in Vietnam time`.

#### Task 2.4: Quá hạn, health deadline, selection

**Files:**
- `src/lib/due-date.ts`
- `src/lib/reports/health.ts:117-128`
- `src/lib/bulk/selection.ts:160,168`
- Test: `due-date.test.ts`, `reports/health.test.ts`, `bulk/selection` test (nếu có)

**Interfaces:**
- `startOfTodayForDueDates(now)` = `dateKeyToUtcMidnight(toDateKey(now))`.
- Health: `daysUntilDeadline = diffDays(toDateKey(now), utcMidnightToDateKey(releaseDate))`.
- Selection: điều kiện quá hạn đổi thành `dueDate: { lt: startOfTodayForDueDates() }`, giống board.

- [ ] **Test được đổi có chủ đích** (`due-date.test.ts`):
  - `now = new Date(2026,9,7,15,30)` → `new Date("2026-10-07T08:30:00Z")`. Kỳ vọng `"2026-10-07T00:00:00.000Z"` giữ nguyên.
  - Thêm case `new Date("2026-10-07T18:00:00Z")` → `"2026-10-08T00:00:00.000Z"`.
- [ ] **Test mới:** health với releaseDate `2026-10-10T00:00Z` và now `2026-10-09T18:00Z` (01:00 ngày 10 giờ VN) cho `daysUntilDeadline === 0` và `deadlinePassed === false`.
- [ ] **Test mới:** selection với bộ lọc "quá hạn" không chọn task có dueDate là hôm nay.
- [ ] Ghi vào commit: **thay đổi hành vi có chủ đích** — selection "quá hạn" bên bulk không còn tính task đến hạn hôm nay.
- [ ] Commit `fix(dates): overdue and release deadlines use Vietnam calendar day`.

#### Task 2.5: Kỳ leaderboard theo 0h giờ VN

**Files:**
- `src/lib/leaderboard/period.ts`
- Test: `leaderboard/period.test.ts`, `leaderboard/leaderboard.test.ts`, `leaderboard/calculator.test.ts`
- Kiểm tra: mọi chỗ dùng `startDate`/`endDate` trong `src/lib/leaderboard/service.ts`, `src/app/api/leaderboard/`, `src/app/(app)/leaderboard/`

**Interfaces:** `computePeriodBounds` giữ nguyên chữ ký.
- `startDate = zonedMidnight(y, m, 1)`.
- `endDate = zonedMidnight(<ngày đầu kỳ sau>) - 1ms`.
- "Năm/tháng hiện tại" và `isCurrentPeriod` lấy từ `zonedParts(now)`.

- [ ] **Test được đổi có chủ đích** (giá trị cũ → mới):

| File:dòng | Cũ | Mới |
|---|---|---|
| `period.test.ts:14-15` (month 2026-10) | `2026-10-01T00:00:00.000Z` .. `2026-10-31T23:59:59.999Z` | `2026-09-30T17:00:00.000Z` .. `2026-10-31T16:59:59.999Z` |
| `period.test.ts:25-26` (Q4) | `2026-10-01T00:00Z` .. `2026-12-31T23:59:59.999Z` | `2026-09-30T17:00:00.000Z` .. `2026-12-31T16:59:59.999Z` |
| `period.test.ts:36-37` (year) | `2026-01-01T00:00Z` .. `2026-12-31T23:59:59.999Z` | `2025-12-31T17:00:00.000Z` .. `2026-12-31T16:59:59.999Z` |
| `period.test.ts:52-56` (fallback) | `now.getFullYear()`, `now.getMonth()+1` | `zonedParts(now).year`, `.month` |
| `leaderboard.test.ts:48-71` | `startsWith("2026-09-01")`, end `"2026-09-30"` | so sánh `toDateKey(startDate)` === `"2026-09-01"`, `toDateKey(endDate)` === `"2026-09-30"` (tương tự cho Q3 và cả năm) |

- [ ] **Test mới:** một task xong lúc `2026-09-30T18:00:00Z` (01:00 ngày 1/10 giờ VN) được tính vào tháng 10, không tính vào tháng 9.
- [ ] Chạy `calculator.test.ts`. Nếu fixture nào gần mốc tháng bị đổi kết quả, dừng lại và báo kèm tên fixture, không tự sửa.
- [ ] Rà người dùng `startDate`/`endDate`. Chỗ nào hiển thị ngày hoặc `toISOString().slice` thì đổi sang `toDateKey(...)`.
- [ ] Chạy `npm test` và `npm run test:tz`.
- [ ] Commit `fix(leaderboard): period bounds at Vietnam midnight`.

#### Task 2.6: Các khoá "hôm nay" đang dùng ngày UTC

**Files:**
- `src/lib/queue/workers/health-alert.ts:139,159,172,184,201`
- `src/lib/jira/resources/versions.ts:42`
- `src/lib/reports/query-primitives.ts:409`
- `src/app/(app)/reports/report-period-filter.tsx:60`

- [ ] **Viết test trước:**
  - health-alert với `now = 2026-10-09T18:00:00Z` sinh `eventKey` chứa `2026-10-10`.
  - versions: phát hành lúc `2026-10-09T18:00Z` thì gửi Jira `releaseDate: "2026-10-10"`.
- [ ] **Cài đặt:** cả 4 chỗ đổi `now.toISOString().slice(0,10)` / `createdAt…` thành `toDateKey(...)`.
- [ ] Ghi chú vào commit: ngày deploy có thể phát sinh **một** cảnh báo health trùng do khoá dedupe đổi định dạng ngày. Không cần xử lý thêm.
- [ ] Commit `fix(dates): use Vietnam day for alert dedupe, release date and period filter`.

#### Task 2.7: Cron hằng ngày chạy theo giờ VN

**Files:**
- `src/lib/queue/schedules.ts:29-32`
- Test: `src/lib/queue/registry-schedules.test.ts:37-54`

- [ ] Thêm `tz: APP_TIMEZONE` vào `capture-project-report-snapshots` (`15 0 * * *`) và `detect-people-fields` (`30 1 * * *`). Đổi literal của `notify-unmerged-prs` thành `APP_TIMEZONE`.
- [ ] **Test được đổi có chủ đích:** ở `registry-schedules.test.ts:37-54`, hai entry trên thêm `tz: "Asia/Ho_Chi_Minh"` trong `options`. Các entry khác giữ nguyên.
- [ ] Ghi chú vào commit: `detect-people-fields` chuyển từ 08:30 VN về 01:30 VN cho đúng nhãn.
- [ ] Commit `fix(queue): run daily snapshot and people-field jobs in Vietnam time`.

#### Task 2.8: Gộp các hàm kiểm tra ISO date

**Files:**
- `src/lib/bulk/csv-parser.ts:124`
- `src/lib/bulk/validation.ts:40-49`
- `src/lib/bulk/business-days.ts:36-60`
- `src/lib/issues/detail-route-service.ts:99`
- `src/app/(app)/bulk/create/lib/paste-matrix.ts:107`

**Interfaces:**
- `isValidIsoDate` (ở cả csv-parser và validation) và `isValidDateString` (business-days) giữ tên export, bên trong gọi `isDateKey`.
- `parseIsoDate`/`formatIsoDate` trong business-days thành `dateKeyToUtcMidnight`/`utcMidnightToDateKey`.

- [ ] Toàn bộ test hiện có của `csv-parser`, `validation`, `business-days` và `detail-route-service` phải xanh mà không sửa test.
- [ ] Commit `refactor(date): single ISO date validator`.

---

### Phase 3: zod cho body API và env

#### Task 3.1: `readJsonBody` nhận zod schema

**Files:**
- Modify: `src/lib/api/json-body.ts`
- Test: `src/lib/api/json-body.test.ts`
- Create: `src/lib/api/schemas/index.ts`
- 5 route đang dùng `readJsonBody`: `issues/[key]/transition`, `issues/[key]/comments`, `register`, `users/[id]/role`, `push/subscribe`

**Interfaces (Produces):**

```ts
export interface ReadJsonBodyOptions { maxBytes?: number; allowEmpty?: boolean } // allowEmpty: empty body parsed as {}
export async function readJsonBody<S extends z.ZodType>(req: Request, schema: S, opts?: ReadJsonBodyOptions): Promise<ReadJsonBodyResult<z.output<S>>>;
export type BodyIssue = { path: string; message: string };
// invalid body response: 400 { error: "invalid_body", issues: BodyIssue[] }  (path joined with ".")
```

Các lỗi `payload_too_large` (400) và `invalid_json` (400) giữ nguyên.

- [ ] **Test được đổi có chủ đích:** test "guard mismatch" đổi thành "schema mismatch". Kỳ vọng `{ error: "invalid_body", issues: [{ path: "role", message: expect.any(String) }] }`. 5 test còn lại không đổi.
- [ ] **Test mới:**
  - `allowEmpty: true` với body rỗng → `ok: true`, `data` là kết quả parse `{}`.
  - Không có `allowEmpty` thì body rỗng vẫn trả `invalid_json`.
- [ ] Viết schema cho 5 route vào `src/lib/api/schemas/<domain>.ts`, test trong `<domain>.test.ts`. Mỗi schema có ít nhất 1 case nhận và 1 case từ chối.
  - Push dùng `PushSubscriptionSchema`: `endpoint` là `z.url()` bắt đầu bằng `https://`, `keys.p256dh` và `keys.auth` là chuỗi không rỗng. Thay `isPushPayload`/`isValidPushSubscription`. Giữ thông báo lỗi `"subscription required"` của route.
- [ ] Commit `feat(api): zod-backed readJsonBody with allowEmpty and issue list`.

#### Task 3.2 – 3.5: Chuyển các route sang `readJsonBody` + schema

Quy tắc chung cho cả 4 task:

- Schema đặt ở `src/lib/api/schemas/<domain>.ts`, test schema ở `<domain>.test.ts`. Mỗi schema có 1 case nhận và 1 case sai kiểu.
- Schema chỉ thay **phần ép kiểu và `typeof`**. Các kiểm tra nghiệp vụ (key tồn tại, quyền, regex `JIRA_KEY_RE`, giới hạn độ dài kèm thông báo tiếng Việt) và **dạng lỗi riêng** của route đều giữ nguyên: projects trả `{ok:false,error}`, board-preferences trả `{error, code:"invalid_project"}`, worklogs trả `{error, code}`. Route nào có dạng lỗi riêng thì map `invalid_body` sang dạng đó.
- `route.test.ts` hiện có phải xanh mà không sửa test.
- **`allowEmpty`: kiểm tra phía client, đừng đoán.** Với mỗi route, grep chỗ client gọi (`api(`/`fetch(` tới đường dẫn đó trong `src/app` và `src/components`). Có lời gọi POST/PUT/PATCH/DELETE **không gửi `body`** thì route đó dùng `allowEmpty: true`. Cần kiểm tra kỹ các route sau: `sync/jira`, `bulk/operations/[id]/retry`, `issues/[key]/clone`, `notify/mark-read`, DELETE `notify`, `admin/outbox/retry`, `reports/projects/snapshot`. Ghi kết quả grep vào commit message.
- **zod bỏ key lạ.** `z.object` mặc định xoá field không khai báo. Body nào được chuyển tiếp xuống hàm khác (`issues/bulk` → `validateBulkRequest`, `issues/[key]/branches` → `createBranchForIssue`, `bulk/create` → `validateBulkCreateBatch`, `sentry/[id]/create`) thì:
  - truyền **giá trị raw** xuống hàm đó, schema chỉ dùng để kiểm tra envelope; hoặc
  - dùng `z.looseObject` / `.passthrough()`.
  - Task 3.2 thêm test: `issues/bulk` gửi `{selector, action, confirm, operationId}` thì `validateBulkRequest` nhận được **cả** `selector` và `action`.

| Task | Route và service | Ghi chú |
|---|---|---|
| **3.2** issues | `issues/bulk` (chỉ phần envelope `confirm`/`operationId`; `validateBulkRequest` giữ nguyên), `issues/[key]/links`, `children`, `ai-score/decision`, `clone`, `branches`, `src/lib/issues/detail-route-service.ts:43` | `ai-score/decision` dùng `z.enum` theo `EstimateDecision` |
| **3.3** projects, me, board, sync | `projects`, `projects/validate`, `projects/[key]/members`, `projects/[key]/people-fields`, `me/preferences`, `me/board-preferences`, `board/membership/refresh`, `sync/jira`, `src/lib/credentials/route-service.ts:93` | `boardId` dùng `z.coerce.number().int().positive()` |
| **3.4** bulk, sentry, admin, reports | `bulk/operations/[id]/retry`, `retry-branch`, `bulk/create` (`source: z.unknown()`; `validateBulkCreateBatch` giữ nguyên), `sentry/[id]/create`, `sentry/review`, `sentry/retry`, `sentry/bulk-create`, `admin/outbox/retry` (**allowEmpty**), `admin/projects`, `admin/projects/[key]`, `reports/projects/snapshot` (**allowEmpty**) | `sentry/review` giữ hành vi lọc id và `slice(0,100)` bằng `.transform` |
| **3.5** còn lại | `chat/identity/link`, `chat/identity/unlink`, `discord/integration`, `releases/[id]`, `releases/[id]/approvals`, `releases/[id]/overrides`, `ai/subtask-split`, `ai/task-draft`, `notify`, `notify/mark-read`, `notify/preferences`, `branches/[id]/link`, `branches/pull-requests`, `src/lib/releases/list-route-service.ts:279` | `discord` dùng `z.discriminatedUnion("destinationType", …)`; `notify/preferences` thay các chuỗi `Array.isArray`/`typeof` |

Mỗi task gồm các bước:
- [ ] Viết test schema (FAIL).
- [ ] Viết schema và chuyển route.
- [ ] Chạy `npm test`, typecheck và lint.
- [ ] Kiểm tra `grep -rn "req.json()\|request.json()" <các thư mục của task>` không còn kết quả.
- [ ] Commit `refactor(api): validate <domain> request bodies with zod`.

Task 3.5 xong thì `grep -rn "\.json()" src/app/api src/lib/*/route-service.ts src/lib/*/*-route-service.ts | grep -i "req\|request"` không còn kết quả, ngoài chính `json-body.ts`.

#### Task 3.6: Worklog validation bằng zod

**Files:** `src/lib/worklogs/schema.ts`, `src/lib/worklogs/route-service.ts:51-59`, test `src/lib/worklogs/schema.test.ts`

**Interfaces:**
- `validateCreateWorklogInput(raw: unknown): ValidationResult<CreateWorklogInput>` giữ nguyên chữ ký, cả dạng `{success, data}` / `{success:false, error, code}`.
- `route-service.ts` đọc body bằng `readJsonBody(req, z.unknown())` rồi gọi `validateCreateWorklogInput(data)`. JSON lỗi vẫn trả 400 `{error, code: "BAD_REQUEST"}` như hiện tại: map `invalid_json` và `payload_too_large` sang dạng này.
- Bên trong dùng `CreateWorklogSchema`. Mỗi lỗi map sang `WorklogErrorCode` bằng `.superRefine` với thông báo tiếng Việt như hiện tại.
- `parseJiraDuration` và `formatJiraStartedAt` giữ nguyên.

- [ ] 22 test của `schema.test.ts` phải xanh mà **không sửa test**. Nếu có test không đạt được, dừng lại và báo.
- [ ] Commit `refactor(worklogs): zod schema for create-worklog input`.

#### Task 3.7: `env.ts` bằng zod

**Files:** `src/lib/env.ts`, test `src/lib/env.test.ts`

**Interfaces:**
- Object `env` giữ **đúng** tập key và kiểu như hiện tại, vì 54 file test mock nó.
- Không throw khi giá trị không hợp lệ: dùng `.catch(<mặc định hiện tại>)`, đồng thời `console.warn` một lần cho mỗi biến sai.
- `validateProductionSecrets` (gồm cả ngoại lệ lúc build) giữ nguyên.
- **Không thêm key mới** vào `env`.
- Helper nội bộ:
  - `csvList(name: string, opts?: { upper?: boolean; lower?: boolean; dedupe?: boolean }): string[]`
  - `kvMap<V>(name: string, parseValue: (raw: string) => V | null): Record<string, V>`: thay 3 hàm parse `projectColumns`, `projectBoardIds`, `boardBacklogColumns`.

- [ ] **Viết test trước** (thêm vào `env.test.ts`, dùng `vi.resetModules()` + `await import("./env")` sau khi đặt `process.env`):
  - `JIRA_BOARD_MEMBERSHIP_MODE="bogus"` → `env.jiraBoardMembershipMode === "snapshot"`.
  - `JIRA_POLL_CONCURRENCY="9"` → 4.
  - `JIRA_SYNC_MAX_PAGES="3"` → 50.
  - `JIRA_PROJECT_BOARD_IDS="abc:12, def:x"` → `{ ABC: 12 }`.
  - `JIRA_PROJECT_KEYS="a, b ,A"` → `["A","B"]`.
- [ ] Cài đặt. Sau đó `npm test` toàn bộ phải xanh: 54 file mock không phải sửa.
- [ ] Commit `refactor(env): parse environment with zod, keep shape and fallbacks`.

#### Task 3.8 (tuỳ chọn, làm sau cùng): `bulk/validation.ts` bằng zod

- [ ] Viết lại `validateBulkRequest` bằng `z.discriminatedUnion` cho selector và action kind, giữ nguyên `ValidationResult` và **nguyên văn các thông báo lỗi tiếng Anh**.
- [ ] **Điều kiện dừng:** 25 test của `validation.test.ts`, cùng `ops.test.ts` và `branch-name.test.ts`, phải xanh mà không sửa test. Nếu không đạt thì revert, không commit, và ghi lý do vào phụ lục B.
- [ ] `create-validator.ts` **không** chuyển trong plan này.

---

### Phase 4: HTTP, cache, chạy song song, code trùng

#### Task 4.1: Timeout gộp signal bằng `AbortSignal.any`

**Files:**
- `src/lib/http/fetch-with-timeout.ts:26-74`
- `src/lib/jira/client.ts:302-356`
- `src/lib/jira/dev-status.ts:104-130,198-239`
- `src/lib/sentry/client.ts:69,134`

**Interfaces:**
- Produces: `export function timeoutSignal(ms: number, caller?: AbortSignal | null): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void }`, đặt trong `fetch-with-timeout.ts`.
  - Bên trong dùng một AbortController và `setTimeout`. **Không dùng `AbortSignal.timeout`**, vì test dùng `vi.useFakeTimers` mà `AbortSignal.timeout` không theo fake timer.
  - Gộp signal bằng `AbortSignal.any([caller, own.signal])`.
  - Phân biệt timeout với việc người gọi huỷ bằng `timedOut()`.
- `fetchWithTimeout`, `HttpTimeoutError` và thông báo timeout của Jira (`Jira <METHOD> <path> -> timeout`) giữ nguyên.

- [ ] **Viết test trước** (`fetch-with-timeout.test.ts`): `timeoutSignal(500)` sau `advanceTimersByTimeAsync(501)` thì `signal.aborted === true` và `timedOut() === true`. Nếu caller đã huỷ trước thì `signal.aborted === true` và `timedOut() === false`.
- [ ] **Cài đặt:**
  - `fetchWithTimeout`, `requestOnce` của Jira và 2 hàm trong dev-status dùng `timeoutSignal`. Đổi tên closure `fetchWithTimeout` trong dev-status thành `fetchDevStatusPath`.
  - Sentry: đổi `options?.signal ?? AbortSignal.timeout(...)` thành `AbortSignal.any([options.signal, AbortSignal.timeout(...)])` khi có signal.
- [ ] `fetch-with-timeout.test.ts`, `client-transport.test.ts` (6 test retry/timeout), `dev-status.test.ts` và `sentry/client.test.ts` phải xanh mà không sửa test.
- [ ] Commit `refactor(http): shared timeoutSignal merging caller signals with AbortSignal.any`.

#### Task 4.2: Jira client dùng chung `withRetry`

**Files:** `src/lib/jira/client.ts:105-111,360-385`, `src/lib/http/fetch-with-timeout.ts`

**Interfaces:**
- Consumes: `withRetry`, `parseRetryAfterHeader`.
- `request<T>` gọi `withRetry` với các tham số:
  - `retries: MAX_RETRIES`
  - `baseDelayMs: RETRY_BASE_MS`
  - `retryOn: (e) => e instanceof JiraRequestError && e.retryable`
  - `getDelayMs`: tính đúng công thức cũ `min(e.retryAfterMs ?? 2000*2^(attempt-1), 30000) + floor(random*500)`
- `RetryOptions.getDelayMs` hiện không nhận `attempt`. Thêm tham số thứ tư không bắt buộc: `getDelayMs?(err, result, defaultDelayMs, attempt: number)`, với `attempt` là lần vừa fail (đếm từ 1). Caller Bitbucket không bị ảnh hưởng. Thêm 1 test `withRetry` khẳng định `attempt` truyền vào là 1, rồi 2.
- Xoá `parseRetryAfterMs`. `requestOnce` gọi `parseRetryAfterHeader`.

- [ ] 6 test transport ở `client-transport.test.ts:157-247` và các test của `withRetry` phải xanh mà không sửa test. Lưu ý `attempt` của `withRetry` đếm từ 1, của vòng cũ đếm từ 0.
- [ ] Commit `refactor(jira): reuse withRetry and parseRetryAfterHeader`.

#### Task 4.3: Cache policy có giới hạn bằng lru-cache; board-options dùng chung

**Files:**
- `src/lib/jira/board-cache-policy.ts`
- `src/lib/jira/board-options.ts`
- Create: `src/lib/jira/board-options.test.ts`
- Test: `board-cache-policy.test.ts`

**Interfaces:**
- `createBoardCachePolicy<T>({ freshForMs, staleForMs, now?, maxEntries? })`:
  - `maxEntries` mặc định 1000.
  - Lưu bằng `new LRUCache<string, BoardCacheEntry<T>>({ max: maxEntries })`, **không đặt `ttl`**. Trạng thái fresh/stale/expired vẫn tính bằng `now` được inject, để test dùng đồng hồ giả vẫn đúng.
- Sửa F-005:
  - `track(key, p: Promise<T>)` dùng cho request chính.
  - Thêm `trackBackground(key, p: Promise<unknown>)`.
  - `hasInFlight` xét cả hai loại. `getInFlight(key): Promise<T> | undefined` chỉ trả request chính.
- `board-config.ts` và `board-membership.ts` đổi lời gọi refresh nền sang `trackBackground`.
- `board-options.ts` dùng `createBoardCachePolicy<BoardOptionsResponse>({ freshForMs: 5 * 60_000, staleForMs: 30 * 60_000 })`.
  - Giữ nguyên key `board-options:${userId}:${KEY}`, cách xoá entry khi gặp 401/403, và hành vi `clearBoardOptionsCache(userId?, projectKey?)`.

- [ ] **Viết test trước:**
  - `board-cache-policy`: `maxEntries: 2`, ghi 3 key thì key đầu bị loại. Trong khi đang refresh nền, `getInFlight(key)` trả `undefined` và `hasInFlight(key)` trả `true`.
  - `board-options.test.ts`:
    - Dữ liệu còn fresh thì trả cache.
    - Dữ liệu stale thì trả dữ liệu cũ và chỉ gọi refresh 1 lần.
    - Gặp 403 thì xoá entry.
    - `clearBoardOptionsCache(u, p)` chỉ xoá đúng 1 key.
- [ ] Các test hiện có của `board-cache-policy`, `board-config`, `board-membership` và `api/board/options/route.test.ts` phải xanh mà không sửa test.
- [ ] Commit `refactor(jira): bounded LRU board cache policy, reuse it for board options`.

#### Task 4.4: Cache avatar bằng lru-cache

**Files:** `src/lib/jira/avatar-route-service.ts:12-95`, test `avatar-route-service.test.ts`

**Interfaces:**
- `avatarCache = new LRUCache<string, AvatarEntry>({ max: MAX_AVATAR_CACHE_ENTRIES, ttl: AVATAR_CACHE_TTL_MS })`.
- `userAvatarUrlCache = new LRUCache({ max: 5000, ttl: USER_URLS_CACHE_TTL_MS })`.
- Xoá `setAvatarCache`, trường `expiresAt` và `setInterval` dọn dẹp.
- `_clearAvatarCache` xoá cả hai cache **và** hai map in-flight. `_getAvatarCacheSize` trả `avatarCache.size`.

- [ ] **Viết test trước:** ghi 5001 user URL thì `userAvatarUrlCache.size === 5000`. Export `_getUserUrlCacheSize()` để test đọc.
- [ ] Test "evicts oldest entries when cache exceeds cap" (dòng 166) và các test bảo mật phải xanh mà không sửa test.
- [ ] Commit `refactor(avatar): lru-cache for avatar and user-url caches, drop sweeper`.

#### Task 4.5: Bỏ 2 worker pool viết tay

**Files:**
- `src/lib/bulk/ops.ts:564-582`
- `src/lib/bulk/create-execution.ts:323-371`

**Interfaces:** Consumes `mapWithConcurrency(items, limit, fn)`.

- [ ] `ops.ts`: `await mapWithConcurrency(pending, concurrency, (item) => processWithRetry(operationId, item.id, item.jiraKey, auth, concurrency))`.
- [ ] `create-execution.ts`: `mapWithConcurrency` trả `results` theo thứ tự input. Phần đo latency và `slowItemCount` chuyển vào trong mapper. Giữ nguyên cách đọc concurrency từ `process.env.BULK_CREATE_CONCURRENCY`.
- [ ] Test của `ops` và `create-execution` phải xanh mà không sửa test.
- [ ] Commit `refactor(bulk): use mapWithConcurrency for bulk worker pools`.

#### Task 4.6: Một regex thời lượng Jira, một bộ hằng số

**Files:**
- `src/lib/format/time.ts:41-44`
- `src/lib/worklogs/schema.ts:32-38`
- `src/app/(app)/bulk/lib/bulk-action.ts:18-20`
- `src/app/(app)/bulk/create/lib/client-validation.ts:82`

**Interfaces:**
- `format/time.ts` export `SECONDS_PER_MINUTE`, `SECONDS_PER_HOUR`, `SECONDS_PER_DAY` (= 28800) và `SECONDS_PER_WEEK` (= 144000). `schema.ts` import các hằng này.
- `isValidEstimate(s)` = `!s.trim() || JIRA_DURATION_RE.test(s.trim())`.
- `client-validation` dùng `JIRA_DURATION_RE`.

- [ ] **Test mới** trong `bulk-logic.test.ts`: `isValidEstimate("2 h")` === true, khớp với server. Các case cũ (`"", "  ", "2h", "1d 4h", "30m", "1w2d"` hợp lệ; `"abc", "2", "h", "1x", "2h foo"` không hợp lệ) giữ nguyên.
- [ ] Ghi vào commit: thay đổi có chủ đích, client giờ nhận `"2 h"` giống server. Số thập phân (`1.5h`) **chưa** hỗ trợ.
- [ ] Commit `refactor(worklogs): single Jira duration regex and constants`.

#### Task 4.7 (tuỳ chọn): Bộ tách CSV bằng papaparse

**Files:** `src/lib/bulk/csv-parser.ts:160-258`

**Interfaces:** `tokenizeDelimitedText(rawText, preferredDelimiter?): TokenizeResult` giữ nguyên chữ ký và kết quả.
- Gọi `Papa.parse(text, { delimiter: preferredDelimiter ?? "", delimitersToGuess: ["\t", ";", ","], skipEmptyLines: false, step })`.
- Dòng bắt đầu của mỗi row tính từ `meta.cursor` của row trước: đếm số `\n` trong `text.slice(0, prevCursor)` rồi cộng 1. Làm sau khi đã bỏ BOM và chuẩn hoá CRLF.
- Lỗi `MissingQuotes` thì đặt `hasUnclosedQuote` và `unclosedQuoteLine`.

- [ ] **Điều kiện dừng:** khoảng 32 test của `csv-parser.test.ts` (gồm "Delimiter & Encoding" và số dòng trong thông báo lỗi) phải xanh mà không sửa test. Nếu không đạt thì revert và ghi lý do vào phụ lục B.
- [ ] Commit `refactor(bulk): papaparse tokenizer for CSV import`.

---

### Phase 5: UI bằng Radix Popover + cmdk và component có sẵn

QA tay của mọi task trong phase này: `npm run dev`, kiểm tra cả light và dark, ở 1280px và 375px. Chỉ dùng bàn phím: Tab, mũi tên, Enter, Esc. Bấm ra ngoài thì popup đóng. Mỗi task chạy thêm `npm run build`.

#### Task 5.1: `ui/sheet` dùng Radix Dialog

**Files:** `src/components/ui/sheet.tsx`, cùng 4 file đang import nó (chỉ để kiểm tra).

**Interfaces:**
- Props giữ nguyên: `{open, onOpenChange, title?, description?, children, headerExtra?, footer?, className?, side?: "right"|"left"}`.
- Thêm `onEscapeKeyDown?: (e: KeyboardEvent) => void`, truyền xuống `DialogPrimitive.Content`.
- Bên trong: Root, Portal, Overlay (`bg-black/50`), Content theo mẫu `branches/branch-detail-sheet.tsx`. Có `Title` (dùng `VisuallyHidden` nếu không có title) và nút Close dùng icon lucide `X`.

- [ ] Kiểm tra 4 file import (`task-detail-sheet.tsx`, `error-sheet.tsx`, `project-features-sheet.tsx`, `task-create-dialog.tsx`): có cái nào cần giữ state của children khi sheet đóng không? Nếu có thì dùng `forceMount` + `hidden` cho riêng chỗ đó và ghi vào commit.
- [ ] Test SSR (`src/components/ui/sheet.test.ts`, theo mẫu `renderToString` của `use-focus-trap.test.ts`): `open=false` render không lỗi. Không thêm thư viện test DOM.
- [ ] QA tay: mở sheet tạo task. Tab không thoát ra khỏi sheet, Esc đóng sheet, focus quay về nút đã mở.
- [ ] Commit `refactor(ui): Sheet on Radix Dialog with focus trap`.

#### Task 5.2: Primitive `ui/popover`, `ui/command`, và checkbox có trạng thái indeterminate

**Files:**
- Create: `src/components/ui/popover.tsx`
- Create: `src/components/ui/command.tsx`
- Modify: `src/components/ui/checkbox.tsx`
- Modify: `src/app/(dev)/ui-gallery/page.tsx`

**Interfaces (Produces):**
- `Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent` (theo shadcn new-york, `align="start"`, `sideOffset={4}`, class `bg-popover text-popover-foreground border-border`).
- `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator` (bọc `cmdk`).
- Checkbox: khi `checked === "indeterminate"` thì hiện icon `Minus` và nền primary.

- [ ] Chỉ dùng token, không dùng màu palette. `design-guard.test.ts` phải xanh.
- [ ] Thêm cả ba vào trang `ui-gallery` để QA hai mode.
- [ ] Commit `feat(ui): popover and command primitives, indeterminate checkbox`.

#### Task 5.3: Assignee — `AssigneeCombobox` và `AssigneeInput`

**Files:**
- `src/components/task-fields/assignee-combobox.tsx`
- `src/app/(app)/bulk/bulk-assignee-input.tsx`
- Create: `src/components/task-fields/lib/filter-options.ts` + `.test.ts`

**Interfaces:**
- Props export của cả hai component **giữ nguyên**, không file import nào phải sửa.
- Produces: `filterLocalOptions(options: string[], query: string, limit: number): string[]` (không phân biệt hoa thường, giữ thứ tự).

- [ ] **Viết test trước:** `filterLocalOptions(["anh","Bình","an"], "an", 8)` === `["anh","an"]`; với limit 1 thì === `["anh"]`.
- [ ] `AssigneeCombobox` dùng `Popover` + `PopoverAnchor` bọc ô Input, kèm `Command shouldFilter={false}`.
  - Thêm `useDebouncedValue(query, 250)` vào query key. Đây là thay đổi có chủ đích: trước đây không có debounce.
  - Bỏ mẹo `onBlur` + `setTimeout(200)`.
  - Giữ hành vi: Esc khi popup đã đóng mà đang có giá trị thì xoá giá trị.
- [ ] `AssigneeInput`: ô nhập tự do làm anchor. `PopoverContent onOpenAutoFocus={(e) => e.preventDefault()}` để focus ở lại ô input. Bỏ id cứng, dùng `useId()`.
- [ ] QA tay: assignee trong form tạo task (nằm trong sheet), trong dialog default của bulk, và trong hàng bảng bulk. Danh sách không bị cắt bởi bảng. Esc chỉ đóng popup, không đóng sheet.
- [ ] Commit `refactor(task-fields): assignee pickers on Popover + cmdk`.

#### Task 5.4: Parent — `ParentCombobox` và `EpicInput`

**Files:**
- `src/components/task-fields/parent-combobox.tsx`
- `src/app/(app)/bulk/bulk-epic-input.tsx`
- Create: `src/components/task-fields/lib/parent-options.ts` + `.test.ts`

**Interfaces:** Produces `filterBatchParentCandidates(args: { candidates: ParentCandidate[]; batchItems?: BulkCreateRowInput[]; query: string; currentClientRef?: string; subtaskIssueTypeIds?: Set<string> }): ParentCandidate[]`.
- Query dưới 2 ký tự thì trả `[]`.
- Tối đa 10 kết quả.
- Bỏ chính item hiện tại và các item có loại subtask.

- [ ] **Viết test trước** cho đủ 4 quy tắc trên.
- [ ] `ParentCombobox` dùng `PopoverTrigger` (giữ Button và nút X riêng), cùng `CommandGroup` "Trong batch này" và "Trên Jira". Giờ có thêm điều hướng bằng mũi tên và Enter, vì cmdk có sẵn.
- [ ] `EpicInput`: ô tự do làm anchor, `onOpenAutoFocus` preventDefault, giữ việc tự viết hoa khi gõ.
- [ ] Commit `refactor(task-fields): parent and epic pickers on Popover + cmdk`.

#### Task 5.5: `LabelCombobox`

**Files:**
- `src/components/task-fields/label-combobox.tsx`
- Create: `src/components/task-fields/lib/label-options.ts` + `.test.ts`

**Interfaces (Produces):**
- `buildLabelOptions(input: string, suggestions: string[], selected: string[]): Array<{ value: string; isNew: boolean }>`
- `addLabel(selected: string[], raw: string): string[]`

Cả hai áp dụng `MAX_LABEL_LENGTH`, `MAX_LABELS_COUNT`, so trùng không phân biệt hoa thường, và bỏ khoảng trắng hai đầu.

- [ ] **Viết test trước:**
  - `buildLabelOptions("New", ["new-ui"], [])[0]` === `{ value: "New", isNew: true }`.
  - `buildLabelOptions("new-ui", ["new-ui"], [])` không có option `isNew`.
  - `addLabel(["A"], "a")` === `["A"]`.
  - Khi đã đủ `MAX_LABELS_COUNT` thì `addLabel` không đổi mảng.
- [ ] Giữ chip và Backspace để xoá label cuối, Enter hoặc `,` để thêm. Danh sách gợi ý chuyển vào `PopoverContent` + `Command`.
- [ ] Commit `refactor(task-fields): label combobox on Popover + cmdk`.

#### Task 5.6: `ComponentsCombobox`

**Files:** `src/components/task-fields/components-combobox.tsx`

- [ ] Cả hai layout (compact và full) dùng `Popover` + `Command`, với bộ lọc có sẵn của cmdk (`shouldFilter` mặc định). Ô tìm kiếm chỉ hiện khi có hơn 5 option ở chế độ compact. Mục đã chọn có icon `Check`.
- [ ] Commit `refactor(task-fields): components combobox on Popover + cmdk`.

#### Task 5.7: Popup chọn project (board, sentry)

**Files:**
- `src/app/(app)/board/board-project-tabs.tsx:86-166`
- `src/app/(app)/sentry/sentry-project-tabs.tsx:145-216`
- `src/app/(app)/board/hooks/use-board-project-picker.ts`

**Interfaces:** `Popover open={showPicker} onOpenChange={(o) => (o ? openPicker() : closePicker())}`. Sentry làm tương tự với state riêng của nó.

- [ ] Quy tắc: đóng popup bằng Esc hoặc bấm ra ngoài thì **bỏ** lựa chọn nháp, giống `closePicker`. Chỉ nút "Xong" mới lưu.
- [ ] Nội dung (danh sách checkbox, ô thêm project, "Chọn tất cả", "Xong") giữ nguyên, chuyển vào `PopoverContent className="w-72 p-3"`.
- [ ] QA tay: Esc đóng popup, bấm ra ngoài đóng popup, mở lại thì thấy lựa chọn đã lưu chứ không phải bản nháp.
- [ ] Commit `fix(board,sentry): project pickers close on Escape and outside click`.

#### Task 5.8: QuickPanel dùng `ui/sheet`, xoá `useFocusTrap`

**Files:**
- `src/app/(app)/board/board-quick-panel.tsx`
- `src/components/issues/image-lightbox.tsx`
- Delete: `src/hooks/use-focus-trap.ts`, `src/hooks/use-focus-trap.test.ts`

**Interfaces:**
- `QuickPanel` giữ nguyên props.
- Render `<Sheet open onOpenChange={(o) => !o && onClose()} side="right" className="sm:w-1/2 sm:min-w-[34.5rem]" onEscapeKeyDown={…}>`.
- `onEscapeKeyDown` gọi `e.preventDefault()` khi `(e.target as HTMLElement).closest("[data-escape-local]")` khớp, hoặc khi `document.querySelector("[data-image-lightbox]")` tồn tại.
- `ImageLightbox` thêm `data-image-lightbox` và class `pointer-events-auto` vào phần tử gốc. Lý do: Radix Dialog ở chế độ modal đặt `pointer-events: none` lên `body`, còn lightbox được portal thẳng vào `body`, nên thiếu class này thì các nút trong lightbox không bấm được. Ngoài ra không đổi gì.
- `onPointerDownOutside` / `onInteractOutside` của Sheet gọi `e.preventDefault()` khi target nằm trong `[data-image-lightbox]`, để bấm vào lightbox không đóng panel. Thêm prop này vào `ui/sheet` theo cùng kiểu với `onEscapeKeyDown`.

- [ ] Phím tắt "c" của board vẫn bị chặn khi panel mở (Radix Content có `role="dialog"`).
- [ ] QA tay:
  - Esc trong ô sửa summary chỉ huỷ việc sửa.
  - Esc khi lightbox đang mở chỉ đóng lightbox.
  - Esc lần nữa thì đóng panel.
  - Bấm ra nền ngoài thì đóng panel.
  - Mở lightbox từ QuickPanel và bấm **từng nút**: trước, sau, tải xuống, đóng. Tất cả phải hoạt động, và panel không bị đóng.
- [ ] Commit `refactor(board): QuickPanel on Sheet, remove useFocusTrap`.

#### Task 5.9: Checkbox và select gốc → component ui

**Files:**
- Checkbox:
  - `release/release-add-tasks-dialog.tsx:141,152,189`
  - `branches/branch-link-dialog.tsx:195,210`
  - `branches/unlinked-branch-view.tsx:43,70`
  - `branches/task-pr-create-dialog.tsx:226`
  - `branches/task-branch-link-dialog.tsx:118,150`
  - `bulk/create/progress-items-table.tsx:145`, `csv-import-excel-preview.tsx:125`, `csv-import-csv-preview.tsx:110`, `template-preview.tsx:118`
- Select: `src/components/issues/link-issue-dialog.tsx:129`, `src/components/issues/create-child-dialog.tsx:107`

- [ ] Đổi `onChange={(e) => f(e.target.checked)}` thành `onCheckedChange={(c) => f(c === true)}`. Checkbox "chọn tất cả" (`unlinked-branch-view.tsx:43`, `release-add-tasks-dialog.tsx:141`) truyền `"indeterminate"` khi mới chọn một phần.
- [ ] Mỗi `<label>` bọc checkbox vẫn bấm được: dùng `ui/label` với `htmlFor` + `id`, hoặc giữ thẻ `label` bao ngoài.
- [ ] Radio giữ nguyên (ngoài phạm vi).
- [ ] Commit `refactor(ui): replace native checkboxes and selects with ui components`.

#### Task 5.10: Tab báo cáo dùng `ui/tabs`

**Files:**
- `src/app/(app)/reports/projects/[projectKey]/project-report-client.tsx:336-359,390+`
- `src/app/(app)/reports/projects/[projectKey]/member-detail-report.tsx:44,112-136`

- [ ] Project report: `<Tabs value={activeTab} onValueChange={handleTabChange}>`. Giữ prefetch ở `onMouseEnter`/`onFocus` của `TabsTrigger`. Nội dung vẫn render có điều kiện như hiện tại (không đổi sang `TabsContent`), để `TrendsTab` vẫn chỉ được tải khi mở tab.
- [ ] Member detail: Tabs có điều khiển với `chartTab`. Listener Esc trên `window` (dòng 54-62) giữ nguyên. QA: dùng mũi tên trái/phải trên tab không kích hoạt `onBack`.
- [ ] Commit `refactor(reports): report tabs on Radix Tabs`.

#### Task 5.11: Menu mobile dùng `ui/sheet`

**Files:** `src/app/(app)/app-shell.tsx:84,339-436`

- [ ] `<Sheet open={mobileOpen} onOpenChange={setMobileOpen} side="left" title="Menu">` chứa navGroups, link admin/settings và `ThemeToggle`. Thêm effect đóng menu khi `pathname` đổi.
- [ ] QA ở 375px: Esc, bấm ra ngoài, và chọn link đều đóng menu. Focus quay về nút menu.
- [ ] Commit `refactor(shell): mobile navigation in Sheet`.

---

## 6. Định nghĩa "xong" cho mỗi phase

| Phase | Điều kiện |
|---|---|
| 0 | Phụ lục B đã có version thư viện và danh sách test phụ thuộc múi giờ |
| 1 | `npm test`, typecheck, lint và build xanh. Các test bảo mật mới đều pass |
| 2 | `npm test` **và** `npm run test:tz` cùng xanh. Literal `"Asia/Ho_Chi_Minh"` và `"en-CA"` chỉ còn trong `src/lib/date/` |
| 3 | Không còn `req.json()` trực tiếp trong route hay route-service. 54 file mock `env` không bị sửa |
| 4 | Không còn `parseRetryAfterMs`, `new AbortController` cho timeout, hay `queue.shift()` pool |
| 5 | QA tay hai mode × hai độ rộng đạt. Không còn `useFocusTrap`, `input type="checkbox"` hay `<select>` gốc ngoài `components/ui` |

## 7. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Đổi mốc leaderboard làm số liệu lịch sử thay đổi | Đúng chủ đích: số mới khớp giờ VN. Ghi rõ trong commit và báo cho team biết |
| `isomorphic-dompurify` kéo jsdom vào bundle server | Chạy `npm run build` trong Task 1.2. Nếu cần thì dùng `serverExternalPackages` |
| Popover nằm trong sheet bị xung đột phím Esc | Task 5.1 (sheet sang Radix) làm **trước** mọi combobox |
| Sheet Radix unmount children khi đóng | Bước kiểm tra 4 file import ở Task 5.1 |
| Tên branch mới khác tên cũ | Tra cứu tên cũ (Task 1.3) |
| Cảnh báo health trùng một lần vào ngày deploy | Chấp nhận, đã ghi chú |
| lru-cache có đồng hồ riêng | Cache policy chỉ dùng lru-cache để giới hạn số entry, fresh/stale vẫn tính theo `now` được inject |

## 8. Ước lượng

| Phase | Số task | Ghi chú |
|---|---:|---|
| 0 | 2 | |
| 1 | 5 | Độc lập nhau, làm song song được |
| 2 | 8 | Theo thứ tự: 2.1 trước, 2.8 cuối |
| 3 | 7 + 1 tuỳ chọn | 3.1 trước; 3.2–3.5 độc lập nhau; 3.7 trước 4.5 |
| 4 | 6 + 1 tuỳ chọn | |
| 5 | 11 | 5.1 → 5.2 → các task còn lại |

---

## Phụ lục B: Kết quả baseline (Task 0.1 điền)

- Version đã cài:
  - `zod`: `^4.6.7` (resolved `4.6.7`)
  - `@radix-ui/react-popover`: `^1.3.1` (resolved `1.3.1`)
  - `cmdk`: `^1.1.1` (resolved `1.1.1`)
  - `date-fns`: `^4.4.0` (resolved `4.4.0`)
  - `@date-fns/tz`: `^1.5.0` (resolved `1.5.0`)
  - `lru-cache`: `^11.5.3` (resolved `11.5.3`)
  - `papaparse`: `^5.7.0` (resolved `5.7.0`)
  - `@types/papaparse`: `^5.5.2` (resolved `5.5.2`)
  - `isomorphic-dompurify`: `^4.6.0` (resolved `4.6.0`)
- `TZ=UTC npm test`: PASS (373 test files, 3242 passed, 0 failed, duration 48.48s)
- `npm run test:tz`: PASS (373 test files, 3242 passed, 0 failed, duration 45.72s)
- Test chỉ fail ở một múi giờ: Không có (cả 2 múi giờ đều pass toàn bộ 3242 tests)
- Task tuỳ chọn bị bỏ và lý do: Không có (chưa thực hiện)
- Task 1.1 (CSV escape formula):
  - Output lệnh kiểm tra papaparse: `node -e 'const P=require("papaparse");console.log(JSON.stringify(P.unparse([["=SUM(A1)"," x ","-3",-3]],{escapeFormulae:/^(?:[=+@\t\r]|-(?!\d+(?:\.\d+)?$))/})))'` -> `"\"'=SUM(A1)\",\" x \",-3,-3"`.
  - Lựa chọn: papaparse tự động bọc thêm dấu nháy kép cho các ô escape và ô có khoảng trắng viền (`" x "`), làm thay đổi định dạng output mong đợi của `export.test.ts`. Do đó, theo phương án 2 của plan, ta không dùng `Papa.unparse` trực tiếp mà triển khai `escapeCsvCell` trong `src/lib/csv/write.ts` kết hợp `CSV_FORMULA_RE` để vô hiệu hoá formula injection chuẩn RFC 4180 và giữ nguyên định dạng cho các test hiện có.
