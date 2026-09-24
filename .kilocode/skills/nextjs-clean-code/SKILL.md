---
name: nextjs-clean-code
description: Tự động clean code / refactor an toàn cho repo fullstack Next.js 16 (App Router) + React 19 + TypeScript strict + Prisma 7 + TanStack Query v5 + Zustand + NextAuth v4 + pg-boss worker. Scan toàn repo, tìm dead code, duplicate, type yếu (any, ts-ignore, cast ép), component/route handler/worker quá rối, rồi refactor từng đợt nhỏ, verify bằng tsc + ESLint + Vitest + build sau mỗi đợt, giữ nguyên UI, business logic, API contract và DB behavior. Dùng skill này bất cứ khi nào user nói "clean code", "dọn code", "refactor", "tech debt", "code rối", "xoá dead code", "giảm duplicate", "siết type", "tối ưu cấu trúc" cho dự án Next.js/TypeScript, kể cả khi user không nói rõ chữ "skill".
---

# Next.js Fullstack Clean Code (safe, incremental, autonomous)

Mục tiêu: repo sạch hơn, dễ đọc hơn, type chặt hơn — **hành vi không đổi**.
Đây là refactor, KHÔNG phải rewrite, KHÔNG phải nâng cấp dependency, KHÔNG phải thêm feature.

## 0. Nguyên tắc vận hành

- **Tự chạy liên tục.** Không hỏi xác nhận từng bước. Chỉ dừng lại hỏi user khi gặp một trong các "Stop condition" ở mục 7.
- **Mỗi đợt (batch) nhỏ**: 1 loại thay đổi, tối đa ~10 file hoặc ~300 dòng diff. Làm xong → verify → commit → đợt tiếp.
- **Không bao giờ để repo ở trạng thái tệ hơn baseline.** Verify fail mà sửa 2 lần không được → revert batch đó (`git checkout -- .` / `git reset --hard HEAD`), ghi vào log là "skipped", đi tiếp.
- **Ưu tiên theo rủi ro tăng dần**: dead code → type → duplicate → tách component/handler → worker.
- Đọc `references/stack-rules.md` trước khi sửa bất kỳ code nào thuộc stack đó. Đọc `references/refactor-playbook.md` khi làm Phase 3.

## 1. Phase 0 — Chuẩn bị & baseline

1. Kiểm tra `git status`. Nếu working tree bẩn → commit/stash không được tự ý; dừng và báo user (Stop condition).
2. Tạo branch: `git checkout -b chore/clean-code-$(date +%Y%m%d)`.
3. Phát hiện package manager (lockfile: `pnpm-lock.yaml` / `yarn.lock` / `bun.lock*` / `package-lock.json`) và đọc `package.json` scripts, `tsconfig.json`, `eslint.config.*`, `next.config.*`, `vitest.config.*`, `prisma/schema.prisma` (hoặc `prisma.config.ts`).
4. Chạy baseline:
   ```bash
   bash <skill_dir>/scripts/verify.sh --baseline
   ```
   Script lưu kết quả vào `.cleanup/baseline.txt`. **Lỗi đã có sẵn ở baseline không phải lỗi do mình**, nhưng không được làm tăng số lượng.
   - Nếu build cần env (DATABASE_URL, NEXTAUTH_SECRET…) mà thiếu → dùng `.env.example` nếu có, không thì ghi chú và bỏ bước build khỏi gate (vẫn giữ tsc/eslint/vitest).
5. Thêm `.cleanup/` vào `.git/info/exclude` (không sửa `.gitignore` của dự án).

## 2. Phase 1 — Scan toàn repo

```bash
bash <skill_dir>/scripts/scan.sh
```
Script tạo `.cleanup/scan-report.md` gồm:
- Unused files / exports / dependencies (knip)
- Code duplicate (jscpd)
- Type yếu: `any`, `as any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, non-null `!` dày đặc
- File lớn (> 300 dòng), component/hàm dài
- `"use client"` ở file không dùng hook/event/browser API
- `console.log` sót, TODO/FIXME

Sau đó **tự đọc thêm** (không chỉ tin tool):
- `src/app/api/**/route.ts`: handler > 80 dòng, lặp logic auth/validate/error, trả response không đồng nhất.
- `src/worker.ts` và job handlers: switch khổng lồ, thiếu type payload, thiếu try/catch, không graceful shutdown.
- Components > 250 dòng hoặc > 5 `useState`/`useEffect`; `useEffect` dùng để fetch hoặc derive state.
- TanStack Query: queryKey viết tay rải rác, gọi `fetch` trùng lặp, invalidate sai key.
- Zustand: store chứa server state, subscribe cả store không selector.
- Prisma: `new PrismaClient()` ở nhiều chỗ, query không `select` trả cả record có field nhạy cảm, N+1.

### Lưu ý false positive của knip với Next.js
KHÔNG xoá dù tool báo unused:
- File convention của App Router: `page`, `layout`, `template`, `loading`, `error`, `global-error`, `not-found`, `route`, `default`, `opengraph-image`, `icon`, `sitemap`, `robots`, `manifest`, `middleware`/`proxy`, `instrumentation`.
- Export đặc biệt: `metadata`, `generateMetadata`, `generateStaticParams`, `dynamic`, `revalidate`, `runtime`, `GET/POST/PUT/PATCH/DELETE`, `config`.
- File được load qua string/path: worker entry, `prisma/seed.ts`, script trong `package.json`, service worker trong `public/` (web-push `sw.js`), file import động `import()`.
- Server Actions (`"use server"`) có thể chỉ được tham chiếu từ form.
- Export dùng trong test.
Trước khi xoá bất kỳ thứ gì: `grep -rn "<tên>" src/ scripts/ prisma/ public/ *.config.*` để chắc chắn.

## 3. Phase 2 — Lập kế hoạch

Viết `.cleanup/PLAN.md`: danh sách batch, mỗi batch có: mục tiêu, file ảnh hưởng, rủi ro (low/med/high), cách verify thêm (nếu cần). Thứ tự mặc định:

| # | Loại | Rủi ro |
|---|------|--------|
| 1 | Xoá `console.log` debug, import thừa, biến thừa, code comment-out | low |
| 2 | Xoá file/export/dependency không dùng (đã xác minh) | low |
| 3 | Siết type: thay `any` bằng type thật / `unknown` + narrowing; bỏ `@ts-ignore` không cần | low–med |
| 4 | Gom constant/type/util trùng lặp | med |
| 5 | Chuẩn hoá API layer: helper auth/validate/error cho route handler | med |
| 6 | TanStack Query: query key factory + `queryOptions`, gom hook fetch | med |
| 7 | Zustand: selector, `useShallow`, tách server state ra khỏi store | med |
| 8 | Tách component/handler lớn thành phần nhỏ | med–high |
| 9 | Worker: registry job handler, type payload, tách file | high |

Không cần user duyệt plan — ghi xong là bắt đầu làm.

## 4. Phase 3 — Vòng lặp refactor

Với mỗi batch:
1. Đọc lại code liên quan (không sửa theo trí nhớ).
2. Sửa tối thiểu cần thiết. Theo `references/refactor-playbook.md`.
3. Verify:
   ```bash
   bash <skill_dir>/scripts/verify.sh
   ```
   (tsc → eslint → vitest → build; so sánh với baseline). Batch nhỏ, chỉ đụng type/util có thể chạy `verify.sh --fast` (bỏ build), nhưng **cứ 3 batch hoặc trước khi kết thúc phải chạy full**.
4. Pass → `git add -A && git commit -m "refactor(cleanup): <mô tả ngắn>"`.
5. Fail → sửa tối đa 2 lần. Vẫn fail → `git reset --hard HEAD`, ghi "SKIPPED: lý do" vào `.cleanup/LOG.md`, sang batch tiếp.
6. Append kết quả vào `.cleanup/LOG.md`.

Nếu một batch lỡ lớn hơn giới hạn → tách thành nhiều commit.

## 5. Bất biến — KHÔNG được thay đổi

- **UI**: markup, `className`, text hiển thị, thứ tự render, a11y attribute. Tách component phải cho ra DOM y hệt.
- **Business logic**: điều kiện, công thức, thứ tự side-effect, giá trị mặc định.
- **API contract**: URL route, HTTP method, status code, shape JSON response/request, header, cookie, tên query param.
- **DB**: `schema.prisma`, migrations, tên bảng/cột, transaction boundary, thứ tự ghi. Không chạy `prisma migrate`, `db push`, `migrate reset`.
- **Queue**: tên queue/job pg-boss, shape payload, retry/expire options (job cũ đang nằm trong DB).
- **Auth**: `authOptions`, callbacks, shape session/JWT, cookie name, bcrypt salt rounds.
- **Web push**: VAPID config, payload gửi đi, logic xoá subscription hết hạn.
- **Dependencies**: không thêm/nâng cấp/hạ cấp package (chỉ được **xoá** dep đã xác minh không dùng; devDep như type-only thì cẩn thận).
- **Config**: `next.config.*`, `tsconfig` (được phép bật thêm rule strict chỉ khi không sinh lỗi mới), env var name.
- Public export của module dùng bởi worker và app cùng lúc.

## 6. Kết thúc

1. Chạy `verify.sh` full lần cuối. Phải ≥ baseline ở mọi mục.
2. Viết `.cleanup/REPORT.md` và in tóm tắt cho user:
   - Số batch done / skipped (kèm lý do)
   - Số dòng xoá/thêm (`git diff --stat main...HEAD`)
   - Số `any`/`ts-ignore`/duplicate trước → sau
   - Các điểm **phát hiện nhưng không sửa** vì chạm vào bất biến (bug tiềm ẩn, security, N+1…) → để user quyết.
3. Không merge, không push, không mở PR trừ khi user yêu cầu.

## 7. Stop condition — dừng và hỏi user

- Working tree bẩn lúc bắt đầu.
- Baseline `tsc` hoặc build không chạy được vì lý do môi trường không tự khắc phục được.
- Phát hiện bug thật mà sửa sẽ đổi behavior (ghi vào report, không tự sửa; chỉ dừng hỏi nếu nó chặn các batch khác).
- Cần đổi schema DB, API contract, tên queue, hoặc nâng dependency mới làm tiếp được.
- Không có test nào cho vùng rủi ro cao (auth, thanh toán, worker) mà thay đổi không phải thuần cơ học → bỏ qua batch đó, ghi report, không hỏi.

Mọi trường hợp khác: tự quyết, tự làm tiếp.
