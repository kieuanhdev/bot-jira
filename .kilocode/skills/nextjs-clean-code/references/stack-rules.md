# Stack rules

Rule cụ thể cho từng công nghệ. Chỉ áp dụng khi **không đổi behavior**. Nếu repo đã có convention khác nhất quán → theo convention của repo.

## Mục lục
1. TypeScript
2. Next.js 16 App Router
3. React 19
4. TanStack Query v5
5. Zustand
6. Prisma 7 + adapter-pg
7. NextAuth v4
8. pg-boss + worker
9. web-push
10. Tailwind v4 + shadcn/ui
11. Vitest
12. ESLint 9

---

## 1. TypeScript
- `any` → type thật; không biết type → `unknown` + narrowing (type guard / zod). Không thay `any` bằng `as SomeType` cho qua chuyện.
- `as unknown as X` → tìm nguyên nhân gốc; thường là thiếu generic hoặc type sai ở nguồn.
- `@ts-ignore` → `@ts-expect-error` kèm lý do, hoặc xoá nếu không còn lỗi.
- Non-null `!` → narrow sớm bằng early return.
- Type trùng ở client/server → gom về `src/types/` hoặc suy ra từ Prisma (`Prisma.UserGetPayload<{ select: ... }>`) / zod (`z.infer`).
- Dùng `satisfies` cho object config thay cho annotation làm mất literal type.
- `enum` TS → giữ nguyên nếu đã dùng rộng (đổi sang union là thay đổi runtime nhỏ, chỉ làm khi thuần nội bộ).
- Không bật thêm flag tsconfig nếu sinh lỗi mới.

## 2. Next.js 16 App Router
- Next 16: `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()` là **async** — phải `await`. Nếu code còn truy cập sync → đây là bug, ghi report; sửa chỉ khi tsc báo.
- Next 16 đổi `middleware.ts` → `proxy.ts` (tên export `proxy`). Không tự đổi nếu repo chưa đổi (đó là migration, không phải cleanup).
- `next lint` đã bị bỏ ở Next 16 → dùng `eslint` trực tiếp.
- Turbopack là mặc định cho dev/build; không đụng config bundler.
- **Server Component mặc định.** Xoá `"use client"` chỉ khi file không dùng: hook, event handler, context, browser API, thư viện client-only (dnd-kit, zustand hook, react-query hook). Chuyển client → server có thể đổi hành vi (hydration, bundle) → chỉ làm với leaf component thuần hiển thị và đã kiểm tra mọi nơi import (một file được import từ client component vẫn chạy ở client).
- Đẩy `"use client"` xuống lá: tách phần tương tác ra component con, giữ phần tĩnh là server — chỉ khi DOM output giống hệt.
- Không dùng `useEffect` + `fetch` trong client component nếu có thể fetch ở server — NHƯNG chuyển đổi này đổi thời điểm load → coi là thay đổi behavior, chỉ ghi report.
- Route handler (`app/api/**/route.ts`):
  - Gom logic lặp: `requireSession()`, `parseBody(schema)`, `handleError()`, `json(data, status)`.
  - Giữ nguyên status code và message lỗi (client có thể đang so sánh chuỗi).
  - Không đổi `export const dynamic/runtime/revalidate`.
- Server Actions: không đổi tên export (form đang tham chiếu).
- `server-only` import: thêm vào module chỉ chạy server (prisma, secrets) là an toàn và nên làm, **trừ** module worker cũng import (worker chạy bằng tsx, `server-only` sẽ throw ngoài Next) → kiểm tra trước.

## 3. React 19
- `ref` là prop thường; `forwardRef` không còn bắt buộc. **Không mass-convert** shadcn/ui components (generated code, giữ nguyên để dễ update).
- Context: `<Context>` thay `<Context.Provider>` được, nhưng là cosmetic → chỉ làm nếu đang sửa file đó.
- Nếu React Compiler đang bật (`reactCompiler: true` / babel plugin) → có thể xoá `useMemo`/`useCallback` thừa. Nếu KHÔNG bật → giữ nguyên memo hiện có; chỉ xoá khi rõ ràng vô dụng (deps thay đổi mỗi render, giá trị primitive rẻ).
- Derived state: `useState` + `useEffect` để sync từ props/state khác → tính trực tiếp trong render (hành vi giống, bớt 1 render). Cẩn thận nếu effect có side-effect khác.
- Key list: không dùng index khi list sắp xếp lại được (Kanban!) — nếu thấy thì ghi report (đổi key đổi behavior remount).
- Tách component: props rõ ràng, không truyền cả object state xuống khi chỉ cần 2 field.

## 4. TanStack Query v5
- Query key factory tập trung, ví dụ `src/lib/query-keys.ts`:
  ```ts
  export const taskKeys = {
    all: ['tasks'] as const,
    lists: () => [...taskKeys.all, 'list'] as const,
    list: (filters: TaskFilters) => [...taskKeys.lists(), filters] as const,
    detail: (id: string) => [...taskKeys.all, 'detail', id] as const,
  };
  ```
  **Giá trị key sau refactor phải y hệt key cũ** (so từng phần tử), không thì cache/invalidate hỏng.
- Dùng `queryOptions()` để gom `queryKey + queryFn` dùng chung cho `useQuery`, `prefetchQuery`, `setQueryData`.
- v5 không có `onSuccess/onError` trong `useQuery` — nếu thấy code cũ kiểu này thì đó là bug có sẵn, ghi report.
- Mutation: gom `invalidateQueries` về đúng key factory; optimistic update (Kanban drag) giữ nguyên logic rollback.
- Không duplicate server state vào Zustand.
- Không đổi `staleTime`, `gcTime`, `refetchOnWindowFocus`, `retry`.
- `QueryClient` tạo một lần (useState/lazy) trong provider, không tạo mới mỗi render.

## 5. Zustand
- Luôn subscribe bằng selector: `useStore(s => s.x)`; nhiều field → `useShallow`.
- Tách action ra khỏi state trong type; action ổn định.
- Store chỉ cho **client state** (UI, filter, drag state, modal). Server data → TanStack Query. Nếu store đang giữ server data → ghi report, chỉ tách nếu thuần cơ học.
- `persist` middleware: KHÔNG đổi `name`, `version`, shape state (localStorage của user cũ).
- Next.js: tránh store global module-level chứa data theo user trên server (leak giữa request) → nếu thấy, ghi report (security).

## 6. Prisma 7 + @prisma/adapter-pg
- Một PrismaClient singleton (`src/lib/prisma.ts` / `db.ts`) với cache `globalThis` cho dev hot-reload. Các chỗ `new PrismaClient()` khác → dùng singleton (worker có thể có client riêng, được phép, nhưng nên dùng chung module).
- Prisma 7 dùng generated client output path + `prisma.config.ts`; import từ đường dẫn generated mà repo đang dùng, không đổi.
- Adapter: `new PrismaPg({ connectionString })` → `new PrismaClient({ adapter })`. Không đổi pool config.
- Không sửa `schema.prisma`, migrations, không chạy lệnh migrate/push/reset.
- `select` hẹp giúp performance nhưng đổi shape trả về → chỉ áp dụng khi kết quả **không** đi thẳng ra API response / không bị spread. Field nhạy cảm (`password`, `hash`, token) lộ ra response → ghi report như security issue.
- N+1 trong loop → ghi report; chỉ sửa bằng `include`/`in` khi chứng minh được kết quả giống hệt (thứ tự!).
- Giữ nguyên `$transaction` boundary và thứ tự query.
- Type: dùng `Prisma.XGetPayload`, `Prisma.XWhereInput` thay vì type tự viết lặp.

## 7. NextAuth v4
- `authOptions` ở một chỗ; mọi nơi dùng `getServerSession(authOptions)`.
- Gom helper `getCurrentUser()` / `requireUser()` nếu logic lặp.
- Module augmentation `next-auth.d.ts` cho `Session`/`JWT` thay vì cast `(session.user as any).id`.
- Không đổi callbacks, strategy, cookie, pages, secret, bcrypt rounds.
- `bcryptjs`: `hashSync`/`compareSync` trong route handler chặn event loop → được đổi sang `await hash`/`await compare` (kết quả giống hệt), commit riêng, nêu trong REPORT.

## 8. pg-boss + src/worker.ts
- Tên queue/job → constant tập trung (`src/jobs/names.ts`), **giá trị string không đổi**.
- Payload type + zod schema dùng chung giữa nơi `send` và nơi `work`.
- Registry pattern thay switch lớn:
  ```ts
  // src/jobs/registry.ts
  export const handlers = {
    [JOB.SCAN_JIRA]: scanJiraHandler,
    [JOB.SCAN_GITLAB]: scanGitlabHandler,
    [JOB.SEND_NOTIFICATION]: sendNotificationHandler,
  } satisfies Record<JobName, JobHandler>;
  ```
  Mỗi handler một file trong `src/jobs/handlers/`.
- pg-boss v10+: handler nhận **mảng** job (`async (jobs) => {}`); giữ đúng signature phiên bản đang dùng (xem `package.json`).
- Giữ nguyên options `work()`/`send()`/`schedule()`: `batchSize`, `retryLimit`, `expireIn`, cron, `singletonKey`.
- Worker chạy bằng `tsx` ngoài Next → không import module có `server-only`, `next/headers`, `next/cache`, alias chỉ Next hiểu (kiểm tra `tsconfig paths` + cách tsx resolve).
- Graceful shutdown (`SIGTERM`/`SIGINT` → `boss.stop()` + `prisma.$disconnect()`): nếu thiếu → ghi report (thêm vào là thay đổi behavior nhỏ nhưng an toàn; được phép thêm nếu có commit riêng và nêu trong REPORT).
- Client gọi Jira/GitLab: gom HTTP helper (base URL, auth header, error mapping) nhưng giữ nguyên request.

## 9. web-push
- `setVapidDetails` gọi một lần ở module init.
- Giữ logic: status 404/410 → xoá subscription.
- Payload type dùng chung với service worker (nếu SW là JS thuần trong `public/`, giữ nguyên shape).
- `public/sw.js` không bị knip nhìn thấy → không xoá.

## 10. Tailwind v4 + shadcn/ui
- Không đổi class (UI bất biến), kể cả class conflict/trùng — thứ tự và `tailwind-merge` có thể cho kết quả khác. Chỉ ghi report.
- `src/components/ui/*` (shadcn generated): không refactor style, chỉ sửa lỗi type/lint nếu có.
- Class lặp nhiều nơi → có thể tách component dùng chung nếu DOM giống hệt.

## 11. Vitest
- Không xoá/skip test để pass. Không sửa assertion để khớp code mới.
- Test fail ở baseline → giữ nguyên, ghi report.
- Khi tách util thuần (không side-effect), **nên** thêm test nhỏ cho util đó (được phép, không đổi behavior).
- Mock path đổi theo file bị di chuyển.

## 12. ESLint 9 (flat config)
- Sửa lỗi lint, không thêm `eslint-disable` mới trừ khi có comment lý do.
- Không nới rule trong `eslint.config.*`.
- `react-hooks/exhaustive-deps`: không tự thêm deps nếu làm effect chạy thêm lần (đổi behavior) → ghi report.
