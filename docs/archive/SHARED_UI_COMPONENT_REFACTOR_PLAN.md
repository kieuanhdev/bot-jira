# Kế hoạch chuẩn hóa component dùng chung và làm sạch UI code

> **Phiên bản:** 1.0  
> **Ngày lập:** 2026-09-30  
> **Trạng thái:** Proposed — chưa triển khai  
> **Phạm vi:** các màn hình trong `src/app/(app)`, các component nghiệp vụ trong
> `src/components`, cùng tầng UI foundation tại `src/components/ui`  
> **Design source:** `design-system/team-task-web/MASTER.md`; các override tại
> `design-system/team-task-web/pages/<page>.md` tiếp tục có quyền ưu tiên cao hơn

## 1. Kết luận

Codebase đã có một lớp primitive tương đối rõ (`Button`, `Card`, `Dialog`,
`Select`, `Skeleton`, `Tabs`...), nhưng chưa có lớp **application UI pattern** ở
giữa primitive và từng page. Kết quả là các màn hình tự dựng lại cùng một cấu
trúc theo nhiều biến thể nhỏ:

- page container, tiêu đề, mô tả, icon và vùng action;
- summary/KPI card;
- search, filter, segmented control và nút xóa lọc;
- loading, error, empty và no-results state;
- alert/feedback sau mutation;
- confirm dialog;
- desktop table và mobile card list;
- metadata row, status badge và cách hiển thị thời gian;
- logic fetch/mutation, normalize lỗi và reset filter.

Hướng refactor được đề xuất là tạo ba tầng rõ ràng:

1. **UI primitive**: component không biết nghiệp vụ, tiếp tục nằm ở
   `src/components/ui`.
2. **Application pattern**: các bố cục và trạng thái dùng chung, đặt tại
   `src/components/shared`.
3. **Domain component**: component hiểu dữ liệu Board, Release, Branch, Bulk...
   và nằm gần route/domain tương ứng.

Không xây một “super component” nhận hàng chục boolean. Base component chỉ chuẩn
hóa phần thực sự giống nhau; khác biệt nghiệp vụ được truyền qua composition
(`children`, slot, render function) hoặc giữ trong domain component.

## 2. Mục tiêu và chỉ số thành công

### 2.1 Mục tiêu

- Giảm JSX, Tailwind class và state-handling bị sao chép giữa các màn hình.
- Làm cho loading/error/empty/filter/header có cùng ngôn ngữ thiết kế và hành vi.
- Tách các file client quá lớn thành phần điều phối, domain section và base UI.
- Giữ nguyên contract API, URL, quyền, dữ liệu và hành vi nghiệp vụ trong đợt đầu.
- Cho phép một khác biệt nhỏ mà không cần fork toàn bộ component.
- Tạo đường dẫn rõ ràng để màn hình mới tái sử dụng component chung ngay từ đầu.

### 2.2 Chỉ số nghiệm thu

Baseline phải được đo lại ở PR đầu tiên; mục tiêu sau migration:

| Chỉ số | Mục tiêu |
|---|---:|
| Page dùng `PageHeader` thay vì tự dựng header | 100% page phù hợp |
| Query-backed list dùng shared state patterns | ít nhất 80% |
| Empty/error state tự viết còn lại | 0 ở các page đã migrate |
| Confirm dialog thuần xác nhận dùng base chung | 100% |
| Component client trên 1.000 dòng | giảm ít nhất 50% số file |
| Hardcoded màu cho semantic state trong phần migrate | 0 trường hợp mới |
| Regression về API/URL/permission | 0 |
| Typecheck, lint, test, production build | pass |

LOC không phải mục tiêu độc lập. Không chấp nhận giảm dòng bằng cách dồn logic
khó đọc vào config hoặc abstraction không có tên nghiệp vụ rõ ràng.

## 3. Baseline đã rà soát

### 3.1 Các hotspot lớn

| File | Quy mô gần đúng | Nhận định |
|---|---:|---|
| `board/board-client.tsx` | 3.351 dòng | trộn query, filter, DnD, summary, board, drawer và nhiều UI helper |
| `stale/stale-client.tsx` | 2.662 dòng | có `EmptyState` nội bộ, query state, filter panel và nhiều section/card |
| `bulk/bulk-client.tsx` | 2.127 dòng | trộn selection, field editor, preview, progress và confirm dialog |
| `notifications/notifications-client.tsx` | 1.211 dòng | tự dựng header, KPI, toolbar, query states, list và confirm dialog |
| `leaderboard/leaderboard-client.tsx` | 1.035 dòng | tự dựng KPI, skeleton, ranking list và detail dialog |
| `settings/notification-preferences.tsx` | 756 dòng | lặp setting card, feedback, pending state và toggle rows |
| `release/release-client.tsx` | 605 dòng | đã tách một phần nhưng header, filter, query state và dialog còn inline |
| `branches/branches-client.tsx` | 550 dòng | đã tách theo domain tốt hơn, nhưng shared query states vẫn tự dựng |

Số dòng chỉ là tín hiệu về cohesion, không phải bằng chứng rằng mọi file lớn đều
phải tách. `Board` có DnD phức tạp nên có thể vẫn lớn hơn các page khác sau refactor.

### 3.2 Pattern lặp đã xác nhận

| Pattern | Ví dụ hiện tại | Vấn đề |
|---|---|---|
| Page header | Notifications, Release, Branches, Stale, Watch, Bulk, Leaderboard | khác spacing, cỡ title, icon container và action layout |
| KPI/summary tile | Board, Notifications, Leaderboard, Release, Stale | markup và selected state gần giống nhưng mỗi page tự viết |
| Loading block | Watch, Branches, Notifications, Leaderboard, Release, Stale | cùng dùng `Skeleton` nhưng lặp wrapper/layout |
| Error state + retry | Branches, Notifications, Stale, Release permission | copy icon circle, text và nút thử lại; màu đỏ bị hardcode không nhất quán |
| Empty/no-results | Watch, Branches, Notifications, Stale, Release | cùng icon + title + hint + action nhưng mỗi nơi có implementation riêng |
| Toolbar/filter panel | Branches, Notifications, Release, Stale, Bulk | input/select/reset/filter count tự bố trí lại |
| Segmented control | Stale, Notifications, Release, Bulk create preview | cùng `aria-pressed` + active class nhưng tự viết |
| Mutation feedback | Branches toast-like message, Release sync banner, form error | nhiều cơ chế, màu và lifecycle khác nhau |
| Confirmation dialog | Bulk, Notifications, Release và các domain khác | footer/cancel/pending/destructive state lặp |
| Responsive list | Branches đã tách table/card; các màn khác tự xử lý | thiếu một quy ước composition chung |
| Fetch/error normalization | nhiều client gọi `fetch` trực tiếp, một số dùng `api()` | message/status/invalidation thiếu nhất quán |

### 3.3 Những gì không nên gộp

- Board column và draggable issue card không dùng chung với release/notification card.
- Release card, branch delivery row và stale task row có nghiệp vụ khác nhau; chỉ
  chia sẻ shell nhỏ nếu thật sự có cùng anatomy.
- Dialog form tạo Release, dialog import CSV và task detail dialog không ép vào
  `ConfirmDialog`.
- Skeleton đặc thù được giữ trong domain; base chỉ cung cấp list/grid skeleton
  đơn giản.
- Không đưa business label, API response type hoặc permission rule vào
  `src/components/shared`.

## 4. Kiến trúc component mục tiêu

```text
src/components/
├── ui/                       # shadcn/Radix primitive, không biết nghiệp vụ
├── shared/                   # application patterns dùng từ 2 domain trở lên
│   ├── page-container.tsx
│   ├── page-header.tsx
│   ├── async-state.tsx
│   ├── empty-state.tsx
│   ├── feedback-banner.tsx
│   ├── metric-card.tsx
│   ├── metric-grid.tsx
│   ├── filter-bar.tsx
│   ├── search-field.tsx
│   ├── segmented-control.tsx
│   ├── confirm-dialog.tsx
│   ├── responsive-data-view.tsx
│   └── __tests__/
└── domain/                   # chỉ tạo khi component được dùng qua nhiều route
    ├── issues/
    ├── releases/
    └── branches/

src/app/(app)/<route>/
├── <route>-client.tsx        # orchestration: query, URL, mutation, composition
├── components/               # section/component chỉ dùng trong route
├── hooks/                    # state/query adapter riêng của route
└── lib/                      # pure mapper/filter/config riêng của route
```

Quy tắc vị trí:

- Dùng ở một route: colocate trong route.
- Dùng ở ít nhất hai route và không biết business domain: `components/shared`.
- Dùng ở ít nhất hai route nhưng hiểu `Issue`, `Release` hoặc `Branch`:
  `components/domain/<domain>`.
- Primitive hình thức đơn giản, có API tương tự shadcn: `components/ui`.
- Chưa có consumer thứ hai rõ ràng: chưa đưa vào shared chỉ vì “có thể dùng lại”.

## 5. Danh mục base component đề xuất

### 5.1 `PageContainer`

Chuẩn hóa chiều rộng, horizontal padding và vertical rhythm; hỗ trợ `size` thay
vì để mỗi page tự chọn chuỗi class.

```ts
type PageContainerProps = {
  size?: "narrow" | "default" | "wide" | "full";
  children: React.ReactNode;
  className?: string;
};
```

Mapping đề xuất: Notifications dùng `narrow`, Release/Leaderboard dùng `default`,
Stale/Branches dùng `wide`, Board dùng `full`.

### 5.2 `PageHeader`

Composition API gồm `eyebrow`, `icon`, `title`, `description`, `badge`, `actions`
và `footer`. Component quản lý responsive layout, typography và icon treatment;
action cụ thể vẫn do page sở hữu.

Yêu cầu:

- `h1` duy nhất và semantic đúng;
- icon Lucide trang trí có `aria-hidden`;
- action wrap trên mobile;
- không hardcode màu theo page; dùng token/variant;
- hỗ trợ title đơn giản như Watch, không bắt page phải dùng tất cả slot.

### 5.3 `MetricGrid` và `MetricCard`

API hỗ trợ `label`, `value`, `description`, `icon`, `tone`, `selected`, `onClick`
và `loading`. Chỉ card có hành động mới render button và `cursor-pointer`; card
chỉ đọc không giả vờ clickable.

`tone` dùng semantic variant (`neutral`, `info`, `success`, `warning`, `danger`),
không nhận chuỗi màu tùy ý. Release Summary Cards là consumer thử nghiệm đầu tiên,
sau đó mới áp dụng cho Notifications, Leaderboard và Board.

### 5.4 `AsyncState`, `EmptyState`, `ErrorState`, `LoadingState`

Không tạo component tự fetch. Đây là các view component có thể composition:

```ts
<AsyncState
  loading={query.isLoading}
  error={query.error}
  empty={!items.length}
  loadingFallback={<ListSkeleton rows={4} />}
  errorFallback={<ErrorState onRetry={query.refetch} />}
  emptyFallback={<EmptyState ... />}
>
  <ActualContent />
</AsyncState>
```

`EmptyState` phải tuân thủ AGENTS.md: icon trong muted circle, title ngắn, hint một
dòng và action tùy chọn. Phân biệt:

- dataset chưa có dữ liệu;
- không có kết quả do filter;
- lỗi tải dữ liệu;
- permission/configuration blocker.

Không biến stale-while-revalidate thành full-page loading: khi đã có data, giữ
content và thể hiện fetching nhẹ ở action/header.

### 5.5 `FeedbackBanner`

Thay các banner đỏ/vàng/teal tự dựng. Props gồm `tone`, `title`, `description`,
`action`, `dismissible`, `onDismiss`. Variant dùng semantic tokens, có role phù
hợp (`status` cho success/info, `alert` cho lỗi cần chú ý), không tự timeout đối
với lỗi khiến người dùng cần hành động.

Toast transient là một quyết định riêng. Không dùng banner như toast fixed ở một
page và inline alert ở page khác mà không có quy ước.

### 5.6 `FilterBar` và `SearchField`

`FilterBar` chỉ quản lý layout, vùng primary/secondary actions, active-filter
count và nút reset; page vẫn sở hữu state, query params và từng filter control.
Không tạo schema engine sinh toàn bộ form filter từ config trong giai đoạn đầu.

`SearchField` chuẩn hóa icon, clear button, label ẩn/hiện, debounce tùy chọn và
keyboard accessibility. Nếu debounce ảnh hưởng URL/query, hook vẫn thuộc page.

### 5.7 `SegmentedControl<T>`

Dùng generic item `{ value, label, icon?, count?, disabled? }`; bảo đảm
`aria-pressed` hoặc semantics tabs tùy chế độ. Không thay Radix `Tabs` ở nơi cần
tab panel semantics; chỉ thay các cụm button dùng như filter/view switch.

### 5.8 `ConfirmDialog`

Dành riêng cho hành động xác nhận một bước. Props gồm title, description/content,
confirm label, cancel label, tone, pending và error. Pending phải disable close
hoặc double-submit theo policy đã chốt. Form dialog nhiều field tiếp tục dùng
Radix Dialog trực tiếp hoặc domain dialog.

### 5.9 `ResponsiveDataView`

Đây là layout adapter, không phải generic data-grid. Nó nhận `desktop`, `mobile`
và breakpoint; data mapping vẫn ở domain. Branches hiện đã có `BranchTable` và
`BranchCardList`, là nơi phù hợp để thử API này. Chỉ mở rộng sang domain khác sau
khi chứng minh giảm lặp.

## 6. Chuẩn hóa logic dùng chung ngoài JSX

### 6.1 HTTP error

Tạo hoặc hoàn thiện một error type thống nhất quanh helper `api()`:

- giữ `status`, `code`, `message` và optional details;
- parse response lỗi một lần;
- cung cấp helper hiển thị message an toàn;
- không làm mất riêng biệt 401/403/409/428;
- migration dần các call `fetch` trực tiếp, không đổi toàn bộ trong một PR.

### 6.2 Query keys và domain hooks

- Query key factory nằm trong domain (`releasesKeys`, `branchKeys`...), không đặt
  trong shared UI.
- Hook query/mutation chứa fetch, invalidate và optimistic policy.
- Page client giữ URL state và orchestration.
- Presentational component không import `useQueryClient` nếu chỉ cần callback.

### 6.3 Pure view model

Các phép map tone, label, metric và option nên là pure function có test. Không để
base component hiểu Jira status text hoặc suy luận release readiness.

### 6.4 URL/filter state

Chỉ tạo `useUrlFilters` sau khi inventory xác nhận ít nhất hai page có cùng quy
tắc serialize/deserialize. Không ép tất cả filter vào một hook generic vì Board,
Stale và Branches có lifecycle query khác nhau.

## 7. Kế hoạch migration theo pha

### Pha 0 — Khóa baseline và lập component map

**Công việc**

1. Ghi snapshot route, trạng thái và breakpoint cho: Board, Bulk, Branches,
   Release, Stale, Notifications, Leaderboard, Watch và Settings.
2. Thống kê pattern bằng code search, số consumer và các khác biệt bắt buộc.
3. Chốt visual contract theo Master và hai override hiện có cho Board/Leaderboard.
4. Đọc tài liệu Next.js 16.3.5 trong `node_modules/next/dist/docs/` trước khi thay
   đổi boundary server/client, routing, loading hoặc data-fetching.
5. Chạy baseline `typecheck`, `lint`, `test`, `build`; ghi lỗi có sẵn tách biệt.

**Deliverable:** component matrix được chốt và ảnh/snapshot manual của các route.

### Pha 1 — Foundation ít rủi ro

Tạo `PageContainer`, `PageHeader`, `EmptyState`, `ErrorState`, `ListSkeleton`,
`FeedbackBanner` và test tương ứng. Migrate hai màn nhỏ trước:

1. `/watch` để kiểm chứng page/header/loading/empty.
2. `/branches` để kiểm chứng error/no-results và composition với component domain.

Không đổi query key, API call hoặc filter trong pha này.

**Điều kiện hoàn tất:** UI trước/sau tương đương, keyboard flow đúng, light/dark
và các breakpoint 375/768/1024/1440 không regression.

### Pha 2 — Header, metric và filter patterns

1. Migrate header theo thứ tự Release → Notifications → Leaderboard → Stale →
   Bulk → Board.
2. Dùng Release Summary Cards làm proof-of-concept cho `MetricCard`.
3. Sau khi API ổn định, migrate Notifications, Leaderboard và Board; cho phép
   domain wrapper khi metric có anatomy đặc thù.
4. Tạo `FilterBar`, `SearchField`, `SegmentedControl`; thử ở Release và
   Notifications trước, rồi Branches/Stale/Bulk.
5. Bảo toàn query params, debounce, selected state và count semantics.

**Điều kiện hoàn tất:** spacing/interaction nhất quán nhưng từng page vẫn giữ
nghiệp vụ và page override của mình.

### Pha 3 — Feedback, mutation và dialog

1. Migrate inline alert/banner sang `FeedbackBanner`.
2. Migrate dialog xóa notification và confirm Bulk sang `ConfirmDialog`.
3. Không migrate Create Release, CSV Import, Branch Link hoặc task detail modal vì
   chúng là form/domain dialog.
4. Chuẩn hóa pending, disable, retry và server error display.
5. Chuyển dần các mutation phù hợp sang domain hooks và helper `api()` thống nhất.

**Điều kiện hoàn tất:** không double-submit; lỗi 401/403/409/428 không bị mất;
focus được trả về trigger sau khi đóng dialog.

### Pha 4 — Tách các monolith theo domain

Làm từng route trong PR riêng, ưu tiên theo rủi ro/lợi ích:

#### 4A. Notifications

- `notifications-client.tsx`: orchestration và selection state.
- `notification-summary.tsx`, `notification-filters.tsx`,
  `notification-list.tsx`, `notification-row.tsx`.
- Pure mapper cho severity/type metadata.

#### 4B. Release

- Tách `release-toolbar`, create dialog hook/form và sync feedback.
- Giữ `release-card`, `release-task-list`, `release-publish-dialog` là domain
  component; chỉ thay shell chung bên trong khi có lợi.

#### 4C. Bulk

- Tách selection panel, field editor, operation preview và progress/history.
- Business state phức tạp nên dùng reducer/store selector có tên rõ thay vì một
  base form generic.
- Giữ Bulk Create ở sub-route riêng, chỉ chia sẻ primitive/pattern thật sự chung.

#### 4D. Stale

- Tách My Work Standardization, Team Diagnostics, filter panel và task list.
- Thay `EmptyState` nội bộ bằng shared component qua domain wrapper nếu cần copy.
- Pure hóa mapping reason/severity và derived summary.

#### 4E. Board

- Tách header/toolbar/summary khỏi DnD board và issue detail drawer.
- Giữ drag context gần board; tránh rerender toàn page do filter/metric update.
- Tách pure card/view model trước khi động tới DnD để giảm regression risk.

#### 4F. Leaderboard và Settings

- Leaderboard giữ podium/ranking là domain visual riêng; chỉ dùng shared shell,
  metric, query states và dialog shell phù hợp.
- Settings tạo `SettingsSection` hoặc `PreferenceGroup` chỉ sau khi so sánh các
  panel integration/notification; không biến mọi form thành schema renderer.

**Điều kiện hoàn tất:** page client chủ yếu điều phối; mỗi component có một lý do
thay đổi rõ; không tạo circular import giữa shared, domain và route.

### Pha 5 — Enforcement và tài liệu

1. Thêm `src/components/shared/README.md` với decision tree, examples và danh sách
   anti-pattern.
2. Thêm Storybook không nằm trong phạm vi mặc định; chỉ đề xuất nếu team muốn có
   visual catalog lâu dài.
3. Bổ sung PR checklist: reuse search, a11y, responsive, dark mode, async states.
4. Cân nhắc ESLint/import boundary sau khi cấu trúc ổn định; không chặn migration
   bằng custom rule ngay từ đầu.
5. Xóa component cũ chỉ sau khi không còn import; không giữ alias vô thời hạn.

## 8. Ma trận migration theo màn hình

| Route | Base pattern áp dụng | Domain component giữ riêng | Ưu tiên |
|---|---|---|---:|
| `/watch` | container, header, async/empty | watched issue card | P0 pilot |
| `/branches` | container, header, async/error/empty, responsive view | toolbar logic, task delivery, branch table/card/detail | P0 pilot |
| `/release` | header, metric, filter bar, feedback, async state | release card, task list, publish/create form | P1 |
| `/notifications` | header, metric, filter bar, async state, confirm | notification row/grouping/selection | P1 |
| `/stale` | header, filter bar, segmented control, async state | health/diagnostic/standardization sections | P1 |
| `/bulk` | header, filter bar, confirm, feedback | issue selection, field editor, operation workflow | P1 |
| `/leaderboard` | header, metric, async state | podium, ranking, contribution dialog body | P2 |
| `/board` | header, metric, filter shell, async state | DnD columns/cards, detail drawer | P2 high risk |
| `/settings` | header, feedback; có thể thêm settings section | credential/integration/preference forms | P2 |
| `/issue/[key]` | feedback, confirm, section states | issue detail, worklogs, dependency/branch business UI | P2 |

## 9. Test plan

### 9.1 Unit/component contract

- `PageHeader`: heading level, optional slots, action wrapping.
- `EmptyState`/`ErrorState`: icon decorative, text, retry/action callback.
- `MetricCard`: static card không clickable; interactive card hỗ trợ keyboard và
  selected state.
- `SegmentedControl`: value, disabled, badge/count và keyboard behavior.
- `ConfirmDialog`: cancel/confirm/pending/error, focus restoration, destructive tone.
- Pure domain mappers: response → metric/filter/view model.

Nếu repo chưa có DOM test environment, thêm dependency/test setup trong PR riêng
hoặc ưu tiên test pure function + route regression; không viết test chỉ snapshot
class string dễ vỡ.

### 9.2 Regression theo route

Mỗi route migrate phải kiểm tra ít nhất:

- loading lần đầu;
- success có dữ liệu;
- empty dataset;
- no-results do filter;
- network/server error và retry;
- background refetch có dữ liệu cũ;
- mutation pending/success/error;
- quyền hoặc cấu hình thiếu nếu route có;
- URL/query params sau refresh/back/forward;
- mobile và desktop layout.

### 9.3 Accessibility và visual

- Một `h1` mỗi page; heading hierarchy không nhảy cấp tùy tiện.
- Focus visible, thứ tự tab, Escape/close và focus return của dialog.
- `aria-label`, `aria-pressed`, `aria-live`/role đúng mục đích.
- Không dùng màu là tín hiệu duy nhất.
- Contrast tối thiểu 4.5:1, light/dark.
- Clickable có `cursor-pointer`; transition 150–200ms.
- `prefers-reduced-motion`; spinner/animation có `motion-reduce` hoặc skeleton.
- Breakpoints 375, 768, 1024 và 1440 px; không horizontal scroll ngoài data table
  được chủ ý cho phép.

### 9.4 Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Không dùng kết quả “file đã ngắn hơn” thay cho regression test.

## 10. Chiến lược PR và rollout

Mỗi PR phải nhỏ, có thể rollback độc lập và không trộn redesign nghiệp vụ:

1. Baseline + shared foundation.
2. Pilot Watch.
3. Pilot Branches.
4. Metric/header/filter patterns qua Release.
5. Notifications.
6. Stale.
7. Bulk.
8. Leaderboard.
9. Board.
10. Settings/Issue detail cleanup và enforcement.

Trong mỗi PR:

- thêm component và migrate consumer ngay; tránh tạo abstraction chưa dùng;
- chụp/ghi lại before-after cho các trạng thái chính;
- không đổi API contract cùng lúc trừ khi đó là bug fix tách riêng;
- theo dõi bundle/client boundary; shared component chỉ có `"use client"` khi thật
  sự cần event/state/browser API;
- xóa code cũ sau khi import graph sạch;
- nếu khác biệt phát sinh quá nhiều, giữ domain wrapper thay vì thêm boolean vào base.

## 11. Rủi ro và cách kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| Abstraction quá sớm | yêu cầu ít nhất hai consumer hoặc một pilot + consumer kế tiếp đã xác định |
| Base component có quá nhiều props | ưu tiên slot/composition; tách variant có anatomy khác |
| Mất khác biệt page override | Board/Leaderboard đối chiếu file override trước migration |
| Tăng client bundle | giữ presentational component server-compatible; tránh barrel import nặng |
| Rerender Board/Bulk | giữ state gần consumer, memoize theo bằng chứng profiling |
| Regression query/URL | không đổi data flow ở pha visual; thêm test back/forward và query params |
| UI nhìn đồng nhất nhưng mất semantics | test heading, button/link, tab, aria và focus |
| Big-bang PR khó review | migration theo route và pattern, không rewrite đồng thời |
| Shared trở thành thư mục rác | README decision tree, ownership và kỳ cleanup sau migration |

## 12. Anti-pattern bị cấm trong đợt refactor

- `BasePage` nhận hàng chục props để render mọi loại màn hình.
- Component `mode="board|release|stale|..."` chứa logic rẽ nhánh theo domain.
- Truyền raw Tailwind class để thay thế mọi phần của base component.
- Đưa query, mutation và API URL vào presentational shared component.
- Tạo generic table/form schema engine khi chưa có nhu cầu thật.
- Tách file chỉ để giảm LOC nhưng component mới vẫn phụ thuộc toàn bộ state page.
- Dùng index barrel gây circular dependency hoặc làm client bundle kéo theo domain khác.
- Trộn refactor cấu trúc với redesign, đổi contract API hoặc thay nghiệp vụ trong
  cùng PR mà không có lý do bắt buộc.
- Ép mọi loading vào spinner text; loading skeleton tiếp tục là chuẩn của dự án.
- Hardcode hex/màu Tailwind semantic rải rác thay vì token/variant.

## 13. Definition of Done

Một route chỉ được xem là migrate xong khi:

- dùng base pattern phù hợp và không còn implementation lặp đã được thay thế;
- khác biệt nghiệp vụ nằm trong domain component/hook, không rò vào shared layer;
- loading, error, empty, filtered-empty và refetch state đúng;
- API, permission, mutation, query invalidation và URL behavior không đổi ngoài
  thay đổi đã được phê duyệt;
- keyboard, screen reader semantics, light/dark và responsive đã kiểm tra;
- test liên quan, typecheck, lint và build pass;
- import cũ/dead code được xóa;
- tài liệu shared component được cập nhật nếu API hoặc guideline thay đổi.

Toàn bộ chương trình refactor hoàn tất khi các route trong ma trận đã qua DoD,
không còn base component mồ côi, và team có thể thêm một list/dashboard page mới
mà không phải tự dựng lại header, async states, metric, filter layout và confirm
flow từ đầu.

## 14. Việc không nằm trong phạm vi

- Redesign toàn bộ sản phẩm hoặc thay đổi brand/theme.
- Đổi API/database/Jira/Bitbucket business rules chỉ để phục vụ refactor UI.
- Thay TanStack Query, Tailwind, shadcn/Radix hoặc state library.
- Xây một design-system package publish độc lập.
- Thêm Storybook, visual regression service hoặc monorepo nếu chưa có quyết định
  riêng về hạ tầng.
- Chuyển mọi component sang Server Component trong cùng đợt; client boundary được
  tối ưu dần và phải theo tài liệu Next.js phiên bản đang cài.
