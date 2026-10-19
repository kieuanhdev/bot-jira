# Làm mới UI/UX toàn app: rõ hơn, to hơn, có dark mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Phân vai:** Claude chỉ lập kế hoạch và review. Worker **agy** làm phần triển khai. Sau mỗi task, một worker Claude review commit local. Không push, không mở PR.

**Goal:** Sửa hai vấn đề người dùng phản ánh:

1. **UI nhạt.** Các lớp nền gần như không tách nhau, màu chủ đạo yếu, chữ xám quá nhiều.
2. **Chữ và control quá nhỏ, khó nhìn.**

Ngoài ra, bật dark mode (Sáng / Tối / Theo hệ thống). Dark mode đã được định nghĩa trong CSS nhưng chưa có cách nào để bật.

**Quyết định đã chốt với developer (2026-10-19):**

| Câu hỏi | Lựa chọn |
|---|---|
| Kích thước | **Vừa phải.** Chữ thân 14→15px. Chữ phụ tối thiểu 12px, bỏ hẳn 10/11px. Nút và input cao 36–40px. |
| Màu | **Giữ teal, tăng tương phản.** Teal đậm hơn, nền xám nhẹ để card trắng nổi lên, viền và chữ phụ đậm hơn. |
| Dark mode | **Thêm nút chuyển Sáng/Tối/Hệ thống.** Mặc định theo hệ thống. |
| Phạm vi | **Theo phase, làm nền tảng trước.** Mỗi phase đều có thể release riêng. |

**Tech Stack:** Next.js 16 App Router (`reactCompiler: true`), React 19, Tailwind CSS v4 (`@theme inline` trong `src/app/globals.css`), shadcn/ui (Radix), lucide-react, vitest.

---

## 1. Hiện trạng (đo trên code, commit `5709565`)

### 1.1 Vì sao chữ "nhỏ"

| Chỉ số | Số chỗ dùng | Ghi chú |
|---|---:|---|
| `text-xs` (12px) | **1164** | Đây là cỡ chữ phổ biến nhất của app |
| `text-[11px]` | 316 | |
| `text-[10px]` | 161 | Badge trên board, nhãn, meta |
| `text-sm` (14px) | 221 | Cỡ "lớn" nhất mà phần lớn nội dung dùng |
| `text-[8px]` | 1 | Chữ viết tắt trong avatar `xs` (`src/components/jira-avatar.tsx:19`) |
| `h-7` / `h-8` (28/32px) | 120 / 180 | Control thấp, vùng bấm nhỏ |
| Icon `h-2.5`/`h-3`/`h-3.5` | nhiều | Icon 10–14px ở badge và menu |

Ví dụ, thẻ board (`src/app/(app)/board/board-card.tsx`) có:

- jiraKey `text-[11px]`
- loại issue `text-[10px]`
- tiêu đề `text-[13px]`
- badge `h-4 text-[10px]`
- nút thao tác `h-5 w-5`

**Phân bố chữ nhỏ (`text-xs` + 10/11px) theo khu vực.** Dùng bảng này để xếp thứ tự ưu tiên:

| Khu vực | Số chỗ | Khu vực | Số chỗ |
|---|---:|---|---:|
| `bulk` | 354 | `settings` | 56 |
| `reports` | 245 | `issue` | 49 |
| `src/components/` (dùng chung) | 210 | `auth` | 34 |
| `board` | 138 | `notifications` | 28 |
| `branches` | 126 | `sentry` | 27 |
| `stale` | 121 | `watch` | 2 |
| `admin` | 88 | | |
| `leaderboard` | 77 | | |
| `release` | 76 | | |

### 1.2 Vì sao UI "nhạt" (tương phản WCAG đo bằng script, xem Phụ lục A)

| Cặp màu hiện tại (light) | Tỉ lệ | Đánh giá |
|---|---:|---|
| Card `oklch(1)` so với background `oklch(0.985)` | **1.04** | Card và nền gần như trùng màu |
| Border `0.92` so với card | 1.26 | Viền rất mờ |
| Chữ trắng trên `--primary` `oklch(0.6 0.108 184.7)` | **3.73** | ❌ Trượt AA 4.5. Nút chính khó đọc |
| `text-primary` trên `bg-primary/10` (menu đang chọn, chip) | **3.34** | ❌ Trượt |
| `--warning` dùng làm chữ trên nền trắng | 4.09 | ❌ Trượt |
| `text-emerald-400` (badge delivery trên board) trên nền trắng | **1.93** | ❌ Gần như không đọc được |
| `text-purple-400` trên nền trắng | 2.79 | ❌ Trượt |
| `--muted-foreground` `0.52` trên card | 5.51 | Đạt, nhưng dùng tới **1082 chỗ**, nên cả màn hình xám |

Các nguyên nhân khác:

- **Không có cách bật dark mode.** `.dark` được định nghĩa nhưng không có provider hay toggle nào gắn class này. Mọi người dùng chỉ thấy light mode như trên.
- **462 class màu hardcode** (`emerald-*`, `purple-*`, `sky-*`, `amber-*`, `red-*`...), cộng thêm 189 chỗ `dark:`. Nhiều chỗ chỉ đúng ở một mode.
- **Thứ bậc chữ yếu.** `h1` của `PageHeader` chỉ là `text-xl font-semibold`, và tiêu đề section gần như cùng cỡ với nội dung.
- **Font có thể thiếu glyph tiếng Việt.** `src/app/layout.tsx` nạp Plus Jakarta Sans với `subsets: ["latin"]`. Nếu các ký tự có dấu ("ệ", "ữ", "ạ"...) rơi về font hệ thống, chữ sẽ lẫn hai font và trông mảnh, lệch. Cần kiểm chứng ở Task 1.1.

### 1.3 Tài liệu design system đang sai lệch với code

`AGENTS.md` yêu cầu đọc `design-system/team-task-web/MASTER.md` trước khi làm UI. Nhưng MASTER đang ghi:

- background tối `#0F172A`
- nút chính màu cam `#EA580C`
- "Flat, no shadows"
- page pattern "Product Demo + Features" (kiểu trang marketing)

Không mục nào khớp với `globals.css` hay với một công cụ nội bộ. Ngoài ra, `pages/board.md` bắt buộc "Density: High, card `p-2.5`", trái với yêu cầu làm to hơn.

**Nếu không sửa hai file này trước, agy sẽ làm theo quy tắc cũ.** Vì vậy việc sửa chúng là Task 0.2, chạy trước mọi thay đổi code.

---

## 2. Chiến lược

### 2.1 Hai đòn bẩy kích thước. Phải dùng đúng đòn cho từng chỗ

**Đòn A: đổi thang chữ trong `@theme` (không phải sửa 1600 dòng).**

Tailwind v4 cho phép ghi đè `--text-*` trong `@theme`. Chỉ cần sửa `globals.css` là toàn bộ `text-xs` và `text-sm` to lên cùng lúc.

```css
@theme inline {
  /* Thang chữ "Vừa phải": mọi nhãn phụ ≥12px */
  --text-2xs: 0.75rem;              /* 12px — MỚI, thay cho 10px/11px */
  --text-2xs--line-height: 1rem;
  --text-xs: 0.8125rem;             /* 13px (mặc định 12px) */
  --text-xs--line-height: 1.125rem;
  --text-sm: 0.9375rem;             /* 15px (mặc định 14px) */
  --text-sm--line-height: 1.375rem;
  /* --text-base trở lên giữ mặc định của Tailwind */
}
```

Lưu ý:

- **Không tăng `font-size` của `html`.** Cách đó làm phình mọi spacing và `h-*` dùng rem, khó kiểm soát hơn nhiều.
- Sau khi đổi, ý nghĩa của tên class thay đổi: `text-xs` = 13px, `text-sm` = 15px. Ghi rõ điều này trong MASTER.md (Task 0.2).
- `sparkline.test.ts` assert chuỗi `text-muted-foreground text-xs`. Test này vẫn đúng vì tên class không đổi.

**Đòn B: codemod cho cỡ chữ px cứng.** `text-[10px]`, `text-[11px]`, `text-[13px]` không chịu ảnh hưởng của token, nên phải sửa từng chỗ.

**Không dùng `sed` một dòng.** Chữ to lên sẽ bị cắt trong các khung có chiều cao cố định. Áp dụng theo bảng sau:

| Mẫu hiện tại | Đổi thành | Lý do |
|---|---|---|
| `text-[10px]`, `text-[11px]` | `text-2xs` | Tối thiểu 12px |
| `text-[13px]` | `text-sm` (15px), hoặc `text-xs` (13px) nếu là meta | Tiêu đề thẻ board nên là `text-sm` |
| Badge `h-4 ... text-[10px]` | Bỏ `h-4`, dùng `py-0.5 text-2xs` (hoặc `h-5`) | Tránh cắt chữ |
| Pill điểm `h-4 ... text-[10px]` | `h-5 px-2 text-2xs` | |
| Nút icon `h-5 w-5` | `h-7 w-7`, icon `h-4 w-4` | Vùng bấm tối thiểu 28px trong thẻ dày đặc |
| Icon trong badge `h-2.5 w-2.5` | `h-3 w-3` | |
| Icon trong menu/nội dung `h-3.5 w-3.5` | `h-4 w-4` | |
| Control `h-7` có chữ `text-xs` | `h-8` | Sau khi `text-xs` thành 13px |
| `h-8` có chữ `text-sm` | `h-9` | Sau khi `text-sm` thành 15px |

**Avatar (`src/components/jira-avatar.tsx`) có bảng size riêng:**

| size | Hiện tại | Mới |
|---|---|---|
| `xs` | `h-4 w-4 text-[8px]` | `h-5 w-5 text-[9px]` (ngoại lệ duy nhất được phép dưới 12px vì là chữ viết tắt trong vòng tròn) |
| `sm` | `h-5 w-5 text-[10px]` | `h-6 w-6 text-2xs` |
| `md` | `h-6 w-6 text-xs` | `h-7 w-7 text-xs` |
| `lg` | `h-8 w-8 text-sm` | `h-9 w-9 text-sm` |
| `xl` | `h-12 w-12 text-base` | giữ nguyên |

Cập nhật `DIMENSION_MAP` cho khớp với bảng trên.

### 2.2 Bảng màu mới (light). Mọi giá trị đã được đo, xem Phụ lục A

| Token | Hiện tại | Mới | Kết quả đo |
|---|---|---|---|
| `--background` | `oklch(0.985 0.001 200)` | `oklch(0.965 0.006 220)` | Card trắng tách khỏi nền (1.04 → 1.11, kết hợp border và shadow) |
| `--foreground` | `oklch(0.244 0.006 264.4)` | `oklch(0.21 0.02 255)` | Chữ chính đậm hơn |
| `--card`, `--popover` | `oklch(1 0 0)` | giữ nguyên | |
| `--primary` | `oklch(0.6 0.108 184.7)` | `oklch(0.52 0.105 184.7)` | Chữ trắng trên primary 3.73 → **5.11** ✅; primary làm chữ trên trắng 5.11 ✅ |
| `--ring` | = primary cũ | = primary mới | |
| `--secondary` / `-foreground` | `0.967` / `0.38` | `oklch(0.95 0.025 184.7)` / `oklch(0.35 0.07 184.7)` | Chip teal rõ hơn |
| `--muted` | `oklch(0.955 0.005 200)` | `oklch(0.94 0.01 220)` | |
| `--muted-foreground` | `oklch(0.52 0.01 257.7)` | `oklch(0.45 0.02 257.7)` | Trên card 5.51 → **7.43**, trên muted **6.25** |
| `--accent` (nền hover) | `oklch(0.95 0.01 184.7)` | `oklch(0.945 0.015 200)` | |
| `--border` | `oklch(0.92 0.005 200)` | `oklch(0.87 0.01 220)` | Viền rõ (1.26 → 1.48) |
| `--input` | `oklch(0.92 ...)` | `oklch(0.84 0.012 220)` | Ô nhập nhìn thấy rõ viền |
| `--success` | `oklch(0.55 0.16 145)` | `oklch(0.5 0.14 150)` | Làm chữ: 4.54 → **5.61** |
| `--warning` | `oklch(0.6 0.16 65)` | `oklch(0.52 0.14 60)` | 4.09 → **5.73** ✅ |
| `--info` | `oklch(0.58 0.15 230)` | `oklch(0.5 0.14 240)` | **5.75** |
| `--destructive` | `oklch(0.577 0.245 27.3)` | `oklch(0.53 0.21 27)` | **5.89** |
| `--sidebar` | `oklch(0.975 ...)` | `oklch(1 0 0)` + `border-r` | Sidebar trắng nổi trên nền xám |

Bổ sung token mới:

- `--primary-soft: oklch(0.94 0.03 184.7)` cho nền mục đang chọn và chip đang chọn.
- `--primary-soft-foreground: oklch(0.45 0.09 184.7)` cho chữ trên nền `--primary-soft`. Đo được **5.92** ✅. Đi kèm một thanh dọc 3px màu primary ở cạnh trái.
  - **Không dùng `text-primary` trên `bg-primary-soft`** (4.34 ❌), và không dùng trên `bg-primary/10`–`/15` (4.15–4.33 ❌).
  - Dark: `--primary-soft: oklch(0.3 0.05 184.7)`, `--primary-soft-foreground: oklch(0.85 0.1 184.7)`. Đo lại ở Task 5.1.
- `--shadow-card: 0 1px 2px oklch(0.2 0.02 255 / 0.06), 0 1px 3px oklch(0.2 0.02 255 / 0.08)`. Dùng cho Card và thẻ board.
- `--shadow-pop` cho dropdown và dialog.
- Thêm `--color-primary-soft` và `--color-primary-soft-foreground` vào `@theme inline`.

**Badge mềm** (chữ `text-*` trên nền `bg-*/N` phủ lên nền trắng, trộn alpha trong gamma space như CSS):

| Variant | Nền `/12` | Nền `/15` |
|---|---:|---:|
| success | 4.72 ✅ | 4.51 (sát ngưỡng) |
| warning | 4.83 ✅ | 4.62 |
| info | 4.83 ✅ | 4.62 |
| danger | 4.77 ✅ | 4.52 (sát ngưỡng) |

Quy tắc rút ra:

- Badge mềm dùng **`/12`** (badge hiện tại dùng `/15`).
- Badge đặt trên `bg-muted` (ví dụ cột board) phải đo lại. Nếu dưới 4.5 thì dùng chữ đậm hơn 0.04 L hoặc đổi sang variant `neutral`.
- `secondary-foreground` trên `secondary`: 9.42 ✅.

**Dark mode** (đã đo):

| Token | Giá trị | Kết quả đo |
|---|---|---|
| `--primary` | `oklch(0.72 0.12 184.7)` | |
| `--primary-foreground` | `oklch(0.17 0.02 184.7)` (chữ tối trên teal sáng) | **8.10** ✅. Hiện tại là chữ trắng trên 0.6, chỉ đạt 3.73 ❌ |
| `--muted-foreground` | `oklch(0.75 0.015 247.9)` | Trên card **7.45** |
| `--background` | `oklch(0.18 0.017 263.9)` | |
| `--card` | `oklch(0.225 0.019 263.9)` | |
| `--border` | `oklch(0.33 0.019 263.9)` | |

Tinh chỉnh dark mode thêm ở Task 5.1.

### 2.3 Thứ bậc chữ

| Vai trò | Class |
|---|---|
| Tiêu đề trang (`h1`, trong `PageHeader`) | `text-2xl font-bold tracking-tight` |
| Tiêu đề section / CardTitle | `text-base font-semibold` (16px) |
| Nội dung, ô bảng, tiêu đề thẻ | `text-sm` (15px) |
| Meta, nhãn, header bảng | `text-xs` (13px), `text-muted-foreground` |
| Badge, chú thích phụ | `text-2xs` (12px), `font-medium` |
| Số KPI (MetricCard) | `text-3xl font-bold tabular-nums` |

Quy tắc **giảm xám**: `text-muted-foreground` chỉ dùng cho meta, nhãn và chữ gợi ý. Không dùng cho:

- nội dung chính
- tên người
- tiêu đề thẻ
- giá trị trong bảng

### 2.4 Dark mode và thứ tự an toàn

**Ràng buộc cứng:** nếu toggle lộ ra cho người dùng trước khi 462 class màu hardcode được chuyển sang token, các trang ở P3/P4 sẽ vỡ ở dark mode. Vì vậy:

- **P1** dựng hạ tầng theme: script chặn nháy màu và hook `useTheme`. Toggle được cài nhưng ẩn sau cờ `THEME_TOGGLE_ENABLED = false` (hằng số trong `src/lib/theme.ts`, không dùng env).
- **P2–P4** chuyển màu hardcode sang token ở mỗi khu vực được đụng tới.
- **P5** QA toàn bộ dark mode, rồi bật cờ.

**Cách cài theme: dùng script inline, không thêm `next-themes`.** Thêm dependency nghĩa là sửa `package.json`, mà đây là file được bảo vệ. Script inline đủ cho nhu cầu này:

- `src/lib/theme.ts`:
  - kiểu `ThemePref = "light" | "dark" | "system"`
  - key `localStorage` là `"theme"`
  - hàm `applyTheme(pref)` bật/tắt `document.documentElement.classList` `dark` và đặt `style.colorScheme`
- **CSP:** `src/proxy.ts:8` hiện đặt `Content-Security-Policy-Report-Only` với `script-src 'self' 'unsafe-inline'`, nên script inline chạy được. Nếu sau này CSP chuyển sang nonce-based và enforce, script này sẽ cần nonce theo request, tức là phải render động. Khi đó đổi sang `<script src="/theme-init.js">` tĩnh trong `public/`. Ghi chú điều này trong `src/lib/theme.ts`.
- `src/app/layout.tsx`:
  - thêm `<script dangerouslySetInnerHTML>` vào `<head>`. Script đọc `localStorage` + `matchMedia('(prefers-color-scheme: dark)')` rồi gắn class `dark` **trước khi paint**, bọc trong try/catch
  - thêm `suppressHydrationWarning` cho `<html>`
  - **không** đọc cookie ở root layout, vì `providers.tsx` (REF-032.1) yêu cầu `/login` và `/register` giữ static
- `src/hooks/use-theme.ts`: hook client gồm state, setter (ghi `localStorage` rồi gọi `applyTheme`) và listener `matchMedia` khi pref là `system`.

Nếu developer muốn dùng `next-themes`, cần duyệt riêng việc sửa `package.json`. Kế hoạch này mặc định **không** thêm.

---

## 3. Global Constraints (áp dụng cho mọi task)

- **Không** thêm dependency, không sửa `package.json`/lockfile, `.env*`, cấu hình deploy, Prisma migration hay `AGENTS.md`.
- Không đổi API route, logic dữ liệu hay hành vi server. Đây thuần là thay đổi trình bày (className, token, component UI).
- Không đổi copy, trừ khi task ghi rõ. Copy viết bằng tiếng Việt, giữ giọng văn hiện có.
- Đọc `design-system/team-task-web/MASTER.md` (bản đã sửa ở Task 0.2) và `pages/<page>.md` trước khi làm một trang.
- Chỉ dùng token ngữ nghĩa. **Cấm thêm** class màu palette mới (`emerald-500`, `sky-600`...). Khi đụng vào một file, chuyển luôn class palette cũ trong file đó sang `success`/`warning`/`info`/`destructive`/`primary` hoặc token mới.
- Không thêm `text-[Npx]` mới. Cỡ chữ tối thiểu là `text-2xs`. Ngoại lệ duy nhất là avatar `xs`.
- Icon chỉ dùng lucide-react. Icon trang trí phải có `aria-hidden`. Phần tử bấm được có `cursor-pointer`. Transition dài 150–200ms. Tôn trọng `prefers-reduced-motion`.
- Loading dùng `Skeleton`. Empty state gồm icon trong vòng tròn `bg-muted`, một tiêu đề và một dòng gợi ý.
- **Không làm yếu test.** Nếu một test assert class màu đã đổi có chủ đích (ví dụ `unread-badge.test.ts` assert `bg-red-500`), cập nhật expectation sang class mới và ghi lý do trong commit message.
- **Checks bắt buộc sau mỗi task:** `npm run typecheck`, `npm run lint`, `npm test`.
- Mỗi task là một commit local riêng. Không push, không mở PR. Sau mỗi task có một worker Claude review-only.

### Giới hạn an toàn cho worker agy (worker chạy bypass-permissions)

- Chỉ sửa các file liệt kê trong mục **Files** của task. Cần sửa file khác thì dừng lại và báo.
- Không chạy `npm install`, `prisma migrate`, `git push`, `git reset --hard`, `git checkout -- .`, `rm -rf`.
- Không sửa `.kilo/`, `autoimprove/`, `AGENTS.md`, `package*.json`, `.env*`, `prisma/migrations/`, `Dockerfile`, `compose.yaml`.
- Không tự chuyển sang task tiếp theo khi chưa có review.

---

## 4. Định nghĩa "xong" cho mỗi phase (acceptance)

1. Ba lệnh `typecheck`, `lint`, `test` đều pass.
2. Ảnh chụp trước/sau ở 375 / 768 / 1280 / 1440px. Từ P5 chụp cả light và dark. Các trang cần chụp:
   - `/board` (cả Kanban và List)
   - `/issue/[key]`
   - `/bulk` và `/bulk/create`
   - `/reports/projects/[projectKey]`
   - các trang của phase đó
3. `grep -rE 'text-\[(10|11|13)px\]'` trên các thư mục đã migrate trả về 0 kết quả.
4. Không có chữ bị cắt hay tràn trong badge, pill hoặc nút. Không có scroll ngang ở cấp trang khi rộng 375px (board vẫn được scroll bên trong vùng của nó).
5. Mọi cặp chữ/nền mới đạt tối thiểu 4.5:1. Riêng chữ lớn (≥18px, hoặc 14px bold) đạt 3:1.

---

## 5. Các phase và task

### Phase 0: Chuẩn bị

#### Task 0.1: Chụp ảnh baseline

- [ ] Chạy `npm run dev` (port 3100), đăng nhập bằng tài khoản dev, chụp các trang ở mục 4.2 (light, 1280 và 375px).
- [ ] Lưu ảnh vào `docs/ui-refresh/baseline/` (hoặc thư mục scratch nếu không muốn commit ảnh).

#### Task 0.2: Sửa tài liệu design system cho khớp code và quyết định mới

**Files:**

- Modify: `design-system/team-task-web/MASTER.md`
- Modify: `design-system/team-task-web/pages/board.md`

- [x] Viết lại MASTER.md theo mục 2 của kế hoạch này:
  - Bảng màu light và dark bằng `oklch` (bỏ hex tối và cam)
  - Thang chữ mới, có ghi chú "`text-xs` = 13px, `text-sm` = 15px, `text-2xs` = 12px"
  - Thứ bậc chữ
  - Quy tắc giảm xám
  - Shadow `--shadow-card`/`--shadow-pop` (bỏ "no shadows")
  - Kích thước control: Button `h-10`, `sm` `h-9`; Input `h-10`
- [x] Xóa mục "Page Pattern: Product Demo + Features" và các spec nút/card/modal kiểu marketing.
- [x] Trong `board.md`:
  - đổi "Density: High, `p-2.5`" thành "Density: Comfortable-compact, card `p-3`, gap `gap-2.5`"
  - cập nhật spacing theo Task 3.1
- [x] Commit: `docs(design-system): align MASTER with ui refresh plan`.

### Phase 1: Nền tảng (ảnh hưởng toàn app)

#### Task 1.1: Token màu, thang chữ, font tiếng Việt

**Files:**

- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Đọc trước** (bản Next này khác kiến thức cũ, xem `AGENTS.md`): các guide về font (`next/font`) và về CSS/Tailwind trong `node_modules/next/dist/docs/01-app/`. Tìm bằng `grep -ril "next/font" node_modules/next/dist/docs/01-app`.
- [ ] Áp dụng bảng màu light/dark ở mục 2.2, kể cả token mới `--primary-soft`, `--primary-soft-foreground`, `--shadow-card`, `--shadow-pop`, và map chúng trong `@theme inline`.
- [ ] Ghi đè thang chữ như mục 2.1, Đòn A.
- [ ] Kiểm tra glyph tiếng Việt:
  - Mở DevTools, vào Elements → Computed → "Rendered Fonts" trên chữ "Bảng công việc" và "Cập nhật hàng loạt"
  - Nếu thấy font fallback, đổi `subsets: ["latin"]` thành `subsets: ["latin", "latin-ext", "vietnamese"]` trong `layout.tsx`
- [ ] Đổi tên biến font `--font-geist-sans` thành `--font-sans-app`. Việc này không bắt buộc. Nếu làm thì sửa đồng bộ trong `layout.tsx` và `@theme`.
- [ ] Commit, rồi chụp nhanh `/board` để xác nhận app không vỡ.

#### Task 1.2: Primitive `src/components/ui/*`

**Files:** `button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `badge.tsx`, `card.tsx`, `table.tsx`, `tabs.tsx`, `dropdown-menu.tsx`, `dialog.tsx`, `sheet.tsx`, `checkbox.tsx`, `progress.tsx`, `label.tsx`

- [ ] **Button:**
  - size `default` `h-10 px-4`, `sm` `h-9 px-3 text-xs`, `lg` `h-11 px-6`, `icon` `h-10 w-10`
  - thêm size `icon-sm` = `h-8 w-8` cho toolbar dày đặc
  - thêm `font-semibold` cho variant `default`
  - `outline` dùng `bg-card` và có `shadow-[var(--shadow-card)]`
- [ ] **Input / Select trigger / Textarea:**
  - `h-10`, `bg-card`, `border-input`
  - focus: `focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring`
- [ ] **Badge:**
  - base `px-2 py-0.5 text-2xs font-semibold`
  - variant mềm: nền `bg-*/12` (đổi từ `/15`) + chữ `text-*`. Đã đo được 4.72–4.83, xem bảng Badge mềm ở mục 2.2
  - không có variant "mềm" cho primary. Dùng `bg-primary-soft text-primary-soft-foreground`
  - thêm variant `neutral` = `bg-muted text-foreground`
- [ ] **Card:**
  - `shadow-[var(--shadow-card)]`, `rounded-xl`
  - CardTitle: `text-base font-semibold leading-tight`
  - CardDescription: `text-xs`
- [ ] **Table:**
  - TableHead: `h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50`
  - TableCell: `px-3 py-2.5`
- [ ] **Tabs:** list `h-10`, trigger active `bg-card text-foreground shadow-sm font-semibold`.
- [ ] **DropdownMenu item:** `py-2 text-sm`, icon `size-4`. Content dùng `shadow-[var(--shadow-pop)]`.
- [ ] **Dialog / Sheet:** title `text-lg font-semibold`, overlay `bg-black/50`.
- [ ] Commit.

#### Task 1.3: Component dùng chung `src/components/shared/*` và `src/components/jira-avatar.tsx`

**Files:** `page-header.tsx`, `metric-card.tsx`, `metric-grid.tsx`, `empty-state.tsx`, `filter-bar.tsx`, `search-field.tsx`, `segmented-control.tsx`, `facet-select.tsx`, `facet-multi-select.tsx`, `pagination-footer.tsx`, `show-more-footer.tsx`, `feedback-banner.tsx`, `async-state.tsx`, `page-container.tsx`, `jira-avatar.tsx`

- [ ] **PageHeader:**
  - `h1` thành `text-2xl font-bold tracking-tight`
  - description `text-sm`
  - icon chip `h-11 w-11 rounded-xl bg-primary-soft text-primary-soft-foreground`
- [ ] **MetricCard:**
  - số `text-3xl font-bold tabular-nums`, label `text-xs font-medium`
  - bảng `toneChip` đổi từ `sky`/`emerald`/`amber`/`rose` sang `info`/`success`/`warning`/`destructive`
  - trạng thái selected dùng `ring-2 ring-primary` + `bg-primary-soft`
- [ ] **JiraAvatar:** áp dụng bảng size ở mục 2.1.
- [ ] Codemod `text-[10px]`/`text-[11px]` trong toàn bộ `src/components/` (210 chỗ, kể cả `issues/`, `task-create/`, `task-fields/`) theo bảng mapping.
- [ ] Chuyển class palette hardcode trong `src/components/` sang token.
- [ ] Commit.

#### Task 1.4: Hạ tầng theme (toggle bị ẩn)

**Files:**

- Create: `src/lib/theme.ts`
- Create: `src/hooks/use-theme.ts`
- Create: `src/components/shared/theme-toggle.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Đọc trước:** guide về root layout, `<head>`/`<Script>` và hydration trong `node_modules/next/dist/docs/01-app/`. Nếu Next 16 có cách khuyến nghị khác cho script chạy trước khi hydrate (ví dụ `next/script` `strategy="beforeInteractive"`), làm theo docs đó và ghi lý do trong commit.
- [ ] Làm như mục 2.4. `ThemeToggle` là segmented control 3 nút (Sun / Moon / Monitor), mỗi nút có `aria-label` tiếng Việt: "Sáng", "Tối", "Theo hệ thống".
- [ ] Thêm `THEME_TOGGLE_ENABLED = false`. Khi cờ tắt, toggle không render, nhưng script vẫn chạy với pref mặc định `"light"`, để hành vi giữ nguyên như hiện tại.
- [ ] Unit test (vitest, không cần DOM lib) cho hàm thuần `resolveTheme(pref, systemDark)`.
- [ ] Commit.

#### Task 1.5: Test chặn tái phạm (design guard)

**Files:** Create `src/lib/design-guard.test.ts`

- [ ] Test đọc các file `*.tsx` nằm trong danh sách `MIGRATED_DIRS` (dùng `fs`, không cần dependency) và fail nếu:
  - có `text-\[(8|9|10|11|13)px\]`, trừ `jira-avatar.tsx`
  - có class palette (`(bg|text|border|ring)-(emerald|purple|sky|amber|red|rose|green|blue|yellow|orange|violet|indigo|slate|gray|zinc)-\d+`)
- [ ] **Chỉ quét `MIGRATED_DIRS`, không quét toàn bộ `src/`.** Sau P1 vẫn còn khoảng 270 chỗ 10/11px ở các trang chưa migrate. Quét toàn bộ sẽ làm `npm test` fail ngay từ P1.
- [ ] Giá trị khởi tạo: `MIGRATED_DIRS = ["src/components"]`, vì Task 1.3 đã migrate thư mục này. Mỗi phase sau thêm thư mục của nó vào danh sách. Đến P5 thì danh sách là toàn bộ `src/`.
- [ ] Commit.

**Mốc release P1:** toàn app đã to hơn và rõ hơn nhờ token. Các trang chưa migrate có thể còn một vài chỗ 10/11px, nhưng không vỡ layout.

### Phase 2: Khung app

#### Task 2.1: Sidebar, header mobile, banner

**Files:**

- Modify: `src/app/(app)/app-shell.tsx`
- Modify: `src/app/(app)/unread-badge.tsx`, `freshness-banner.tsx`, `reconnect-banner.tsx`, `global-sync-indicator.tsx`
- Modify: `src/app/(app)/unread-badge.test.ts` (nếu đổi `bg-red-500` thành `bg-destructive`)

- [ ] **Kích thước:**
  - sidebar mở rộng `w-56` → `w-60`
  - nav item `h-10 px-3 text-sm font-medium gap-3`, icon `h-[18px] w-[18px]`
- [ ] **Item đang chọn:** `bg-primary-soft text-primary-soft-foreground font-semibold` cộng một thanh dọc 3px màu primary ở cạnh trái (`before:` pseudo hoặc span). Item không chọn dùng `text-foreground/80`, **không dùng `muted-foreground`**.
- [ ] **Nhóm menu:** chia 11 mục thành 3 nhóm, mỗi nhóm có nhãn `text-2xs font-semibold uppercase tracking-wider text-muted-foreground`. Đổi tên nhóm cần developer xác nhận ở review.
  - **Công việc:** Bảng công việc, Task cần xử lý, Task theo dõi, Thông báo
  - **Delivery:** Lỗi Sentry, Cập nhật hàng loạt, Quản lý phát hành, Nhánh & Delivery
  - **Phân tích:** Báo cáo dự án, Xếp hạng
  - Cài đặt và Quản trị chuyển xuống footer
- [ ] **Header sidebar:** logo chip `h-9 w-9 bg-primary text-primary-foreground` (đặc thay vì `/10`), tên app `text-base font-bold`.
- [ ] **Footer sidebar:** đặt `ThemeToggle` (vẫn bị cờ ẩn), Cài đặt, nút thu gọn.
- [ ] **Vùng nội dung chính:** `main` dùng `p-4 md:p-6 xl:p-8`.
- [ ] **Header mobile:** dùng cùng style item như sidebar desktop.
- [ ] Chuyển màu hardcode trong 4 component banner/badge sang token.
- [ ] Thêm `src/app/(app)` (chỉ các file ở cấp này) vào `MIGRATED_DIRS`.
- [ ] Commit.

### Phase 3: Board (màn dùng nhiều nhất)

#### Task 3.1: Thẻ board và cột

**Files:** `src/app/(app)/board/board-card.tsx`, `board-column.tsx`, `board-kanban-view.tsx`, `board-summary-cards.tsx`, `board-quick-filter-chips.tsx`

- [ ] **Thẻ:**
  - padding `p-3`
  - jiraKey `font-mono text-xs font-semibold text-muted-foreground`
  - loại issue `text-2xs`
  - **tiêu đề `text-sm font-semibold text-foreground line-clamp-2`**
  - badge theo bảng mapping (bỏ `h-4`)
  - nút ⋯ và ‹ › dùng `h-7 w-7` với icon `h-4 w-4`
  - rail priority rộng `w-1`
- [ ] **Badge delivery:** đổi `emerald-400`/`purple-400` (tương phản 1.93/2.79) thành:
  - PR open → `success`
  - merged → `info`, hoặc thêm token `--merged` (tím) có giá trị light/dark đã đo ≥4.5
- [ ] **Cột:**
  - header cột `text-sm font-semibold`, bộ đếm là badge `neutral`
  - nền cột `bg-muted/60` để thẻ trắng nổi lên
  - `gap-2.5`
- [ ] **Summary cards:** dùng MetricCard đã làm ở Task 1.3.
- [ ] Commit.

#### Task 3.2: List view, toolbar, quick panel

**Files:** `board-list-view.tsx`, `board-list-row.tsx`, `board-list-inline-cells.tsx`, `board-list-bulk-bar.tsx`, `board-header.tsx`, `board-toolbar-section.tsx`, `board-project-tabs.tsx`, `board-columns-menu.tsx`, `board-team-view.tsx`, `board-banners.tsx`, `board-toast.tsx`, `board-skeleton.tsx`, `quick-panel/*`, `board-quick-panel.tsx`

- [ ] **Hàng List:** cao tối thiểu 44px, chữ `text-sm`.
- [ ] **Project tabs:** `h-10`, tab active dùng `bg-card shadow`.
- [ ] **`quick-panel-fields.tsx`** là file có nhiều chữ nhỏ nhất (29 chỗ):
  - label `text-xs font-medium`
  - value `text-sm`
  - panel rộng thêm khoảng 40px nếu cần
- [ ] Skeleton phải khớp kích thước mới.
- [ ] Thêm `board` vào `MIGRATED_DIRS`.
- [ ] Commit, chụp ảnh Kanban và List ở 4 breakpoint.

### Phase 4: Các trang còn lại (theo thứ tự ưu tiên)

Mỗi task bên dưới làm cùng một việc cho thư mục được chỉ định:

1. Codemod 10/11/13px theo bảng mapping.
2. Chuyển màu palette sang token.
3. Dùng `PageHeader` và `MetricCard` chung, bỏ header/KPI tự chế nếu có.
4. Áp dụng thứ bậc chữ.
5. Thêm thư mục vào `MIGRATED_DIRS`.
6. Commit.

| Task | Khu vực (`src/app/(app)/…`) | Chữ nhỏ | Chú ý riêng |
|---|---|---:|---|
| 4.1 | `issue/[key]` | 49 | Tiêu đề issue `text-2xl font-bold`. `.wiki-content` trong `globals.css` đặt `font-size: 0.9375rem` và `line-height` 1.65 |
| 4.2 | `bulk` + `bulk/create` | 354 | Lưới dữ liệu (`bulk-create-data-grid.tsx`) giữ ô cao khoảng 40px, `text-sm`. Kiểm tra cuộn ngang trong lưới |
| 4.3 | `reports/projects` + `[projectKey]` | 245 | Chart dùng `--chart-*`. Kiểm tra lại tương phản legend và trục với `text-xs` |
| 4.4 | `stale` | 121 | |
| 4.5 | `branches` | 126 | Badge trạng thái PR dùng chung quy tắc với Task 3.1 |
| 4.6 | `release` | 76 | |
| 4.7 | `leaderboard` | 77 | Podium: số hạng `text-3xl` |
| 4.8 | `admin` + `admin/sync` | 88 | |
| 4.9 | `settings`, `notifications`, `sentry`, `watch` | 113 | Thêm `ThemeToggle` vào Cài đặt (vẫn bị cờ ẩn) |
| 4.10 | `src/app/(auth)/*` (login, register, setup-jira) | 34 | Đọc `pages/login.md`. Trang auth phải giữ static, không thêm logic theme phía server |

Đọc `pages/bulk-create.md`, `pages/leaderboard.md`, `pages/admin.md` trước khi làm các task tương ứng, và cập nhật mọi chỗ trong các file đó còn mâu thuẫn với kích thước mới.

### Phase 5: Dark mode, bật toggle, dọn dẹp

#### Task 5.1: QA dark mode

- [ ] Tạm bật cờ ở local và chụp mọi trang ở dark mode, 1280 và 375px.
- [ ] Sửa các chỗ `dark:` thừa hoặc sai. Mục tiêu là không còn `dark:` nào cho màu, vì token đã tự đổi theo mode.
- [ ] Đo lại tương phản dark bằng script ở Phụ lục A (thêm các cặp mới).

#### Task 5.2: Bật toggle

- [ ] Đặt `THEME_TOGGLE_ENABLED = true` và đổi pref mặc định thành `"system"`.
- [ ] `MIGRATED_DIRS` = toàn bộ `src/`.
- [ ] Commit `feat(ui): enable light/dark/system theme toggle`.

#### Task 5.3 (tuỳ chọn): Trang gallery cho dev

- [ ] Tạo `src/app/(dev)/ui-gallery/page.tsx`. Trang gọi `notFound()` khi `NODE_ENV === "production"` và hiển thị mọi primitive ở cả 2 mode, để review sau này không cần đăng nhập Jira.

---

## 6. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Chữ to lên làm tràn layout ở board, bảng và lưới bulk | Bảng mapping kích thước (mục 2.1), ảnh chụp 4 breakpoint mỗi phase, review sau mỗi task |
| Bảng hiển thị ít dòng hơn | Chấp nhận được với mức "Vừa phải" (hàng khoảng 44px). Nếu phản hồi xấu, thêm tùy chọn mật độ ở một kế hoạch sau |
| Dark mode vỡ ở trang chưa migrate | Cờ `THEME_TOGGLE_ENABLED` chỉ bật ở P5 |
| Nháy theme khi tải trang (FOUC) | Script inline chặn trong `<head>` + `suppressHydrationWarning` |
| Trang auth mất static rendering | Không đọc cookie ở root layout. Theme chỉ chạy phía client |
| Agy làm theo tài liệu design system cũ | Task 0.2 chạy trước mọi thay đổi code |
| Test assert class bị đổi | Cập nhật expectation có chủ đích và ghi lý do. Không xóa hoặc skip test |

## 7. Ước lượng

| Phase | Số task | Độ lớn |
|---|---:|---|
| P0 | 2 | Nhỏ |
| P1 | 5 | Lớn nhất về ảnh hưởng, vừa về số dòng |
| P2 | 1 | Vừa |
| P3 | 2 | Vừa |
| P4 | 10 | Lớn về số dòng nhưng lặp lại, cơ học |
| P5 | 2–3 | Vừa |

## Phụ lục A: Script đo tương phản

Script dùng để lấy mọi số liệu trong mục 1.2 và 2.2: chuyển oklch → sRGB tuyến tính, rồi tính tỉ lệ tương phản WCAG 2.x. Chạy bằng `node contrast.mjs`.

```js
function oklchToLin([L, C, h]) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
}
const Y = (c) => { const [r, g, b] = oklchToLin(c); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const x = Y(a), y = Y(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
console.log(ratio([1, 0, 0], [0.52, 0.105, 184.7]).toFixed(2)); // chữ trắng trên primary mới → 5.11
```

> Ghi chú: OKLab → sRGB cho ra giá trị *tuyến tính*, đúng là đầu vào mà công thức luminance WCAG cần. Phần xấp xỉ duy nhất là màu ngoài gamut bị kẹp về [0,1]. Trước khi chốt, xác nhận các cặp sát ngưỡng (4.5–5.0) bằng DevTools (Inspect → Contrast).
