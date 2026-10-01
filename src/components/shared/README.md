# `src/components/shared`

Application-level UI patterns that are reused by **two or more routes** and know
**nothing** about a business domain (no `Issue`, `Release`, `Branch`, no API URLs,
no query keys, no permission rules).

This is the middle layer of the component architecture defined in
[`docs/SHARED_UI_COMPONENT_REFACTOR_PLAN.md`](../../docs/SHARED_UI_COMPONENT_REFACTOR_PLAN.md):

```
src/components/
├── ui/       # shadcn/Radix primitives — no business knowledge
├── shared/   # application patterns used by 2+ routes (THIS directory)
└── domain/   # components that DO know a domain (created only when reused across routes)

src/app/(app)/<route>/
├── <route>-client.tsx   # orchestration: query, URL, mutation, composition
├── components/          # sections used only by this route
├── hooks/               # this route's query/state adapters
└── lib/                 # pure mappers/filters/config for this route
```

## Decision tree — where does a component belong?

1. **Only one route uses it** → colocate in that route (`src/app/(app)/<route>/components`).
2. **2+ routes use it and it knows no domain** → `components/shared` (here).
3. **2+ routes use it but it knows `Issue`/`Release`/`Branch`** → `components/domain/<domain>`.
4. **Simple, shadcn-like primitive** → `components/ui`.
5. **No second consumer yet** → do **not** put it here "because it might be reused".

A component is added here together with its first real consumer (same PR). No
orphan base components.

## Catalog

### Foundation

| Component | File | Server-compatible | Notes |
|---|---|:---:|---|
| `PageContainer` | `page-container.tsx` | Yes | Width bucketing (`narrow`/`default`/`wide`/`full`) + centering. Does NOT re-pad (app shell handles padding). |
| `PageHeader` | `page-header.tsx` | Yes | One `h1`; slots: `eyebrow`, `icon`, `title`, `meta`, `description`, `badge`, `actions`, `footer`. Actions wrap on mobile. |
| `EmptyState` | `empty-state.tsx` | Yes | Icon in muted circle + `title` + `hint` + optional `action`. Border dashed. |
| `AsyncState` / `ErrorState` | `async-state.tsx` | No (client) | `AsyncState`: composition only (loading > error > empty > children). `ErrorState`: `destructive` token, `role="alert"`, retry. |
| `ListSkeleton` / `GridSkeleton` | `skeleton.tsx` | Yes | Generic loading placeholders. Domain-specific skeleton anatomy stays in the domain. |

### Header / metric / filter

| Component | File | Server-compatible | Notes |
|---|---|:---:|---|
| `MetricCard` | `metric-card.tsx` | No (client) | KPI tile; only becomes `<button>`-like when `onClick` is set; `tone` tints the icon-chip, selection ring is always `primary`. |
| `MetricGrid` | `metric-grid.tsx` | Yes | Responsive wrapper (columns 2/3/4/5) for a row of `MetricCard`. |
| `FilterBar` | `filter-bar.tsx` | No (client) | Layout only: primary (left) / secondary (right) + "Xóa lọc (n)" when `activeCount > 0` & `onReset`. |
| `SearchField` | `search-field.tsx` | No (client) | Icon + clear button (only when there is a value), controlled. |
| `SegmentedControl<T>` | `segmented-control.tsx` | No (client) | `aria-pressed` single-select toggle cluster; `tone` primary/neutral; `count` optional. |

### Feedback / confirm

| Component | File | Server-compatible | Notes |
|---|---|:---:|---|
| `ConfirmDialog` | `confirm-dialog.tsx` | No (client) | One-step confirm only. `tone` default/destructive; `pending` blocks close/Escape/overlay + double-submit; `disabled` only blocks confirm button. |
| `FeedbackBanner` | `feedback-banner.tsx` | Yes | Inline status. `tone` info/success/warning/destructive → semantic tokens; default icon per tone; `role` auto-derived. |

Supporting helper: `getErrorMessage(error, fallback?)` in `src/lib/api-client.ts`
normalizes an unknown thrown value into a safe display string.

## Usage examples

### Query-backed list (full pattern)

```tsx
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { AsyncState, ErrorState } from "@/components/shared/async-state";
import { EmptyState } from "@/components/shared/empty-state";
import { GridSkeleton } from "@/components/shared/skeleton";
import { getErrorMessage } from "@/lib/api-client";
import { Eye } from "lucide-react";

// ... query setup ...

<PageContainer size="wide">
  <div className="flex flex-col gap-4">
    <PageHeader
      title="Task theo dõi"
      description="Xem nhanh các task bạn đã follow."
      icon={Eye}
    />
    <AsyncState
      loading={query.isLoading}
      error={query.error}
      empty={items.length === 0}
      loadingFallback={<GridSkeleton count={4} />}
      errorFallback={
        <ErrorState
          title="Không tải được dữ liệu"
          message={getErrorMessage(query.error, "Lỗi không xác định.")}
          onRetry={() => query.refetch()}
        />
      }
      emptyFallback={
        <EmptyState icon={Eye} title="Chưa có task nào" hint="Task bạn theo dõi sẽ hiện ở đây." />
      }
    >
      <YourList items={items} />
    </AsyncState>
  </div>
</PageContainer>
```

### KPI / metric row

```tsx
import { MetricGrid } from "@/components/shared/metric-grid";
import { MetricCard } from "@/components/shared/metric-card";

<MetricGrid columns={4}>
  <MetricCard label="Mở" value={12} icon={Circle} tone="info" />
  <MetricCard label="Đang làm" value={4} icon={Timer} tone="primary" />
  <MetricCard label="Tồn đọng (7d+)" value={3} icon={AlertTriangle} tone="warning" />
  <MetricCard label="Hoàn thành" value={28} icon={CheckCircle2} tone="success" />
</MetricGrid>
```

Interactive variant (filter card):

```tsx
<MetricCard
  label="Chưa đọc"
  value={5}
  icon={Bell}
  tone="info"
  selected={statusFilter === "unread"}
  onClick={() => setStatusFilter(statusFilter === "unread" ? "all" : "unread")}
  loading={query.isLoading}
/>
```

### Filter bar with search

```tsx
import { FilterBar } from "@/components/shared/filter-bar";
import { SearchField } from "@/components/shared/search-field";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

<FilterBar
  activeCount={activeFilterCount}
  onReset={resetFilters}
  actions={<SearchField value={q} onChange={setQ} placeholder="Tìm…" aria-label="Tìm" />}
>
  <Select value={priority} onValueChange={setPriority}>
    <SelectTrigger className="w-[140px]"><SelectValue placeholder="Ưu tiên" /></SelectTrigger>
    <SelectContent>
      <SelectItem value="">Tất cả</SelectItem>
      <SelectItem value="high">Cao</SelectItem>
    </SelectContent>
  </Select>
</FilterBar>
```

### Segmented control (view / status switch)

```tsx
import { SegmentedControl } from "@/components/shared/segmented-control";

<SegmentedControl
  items={[
    { value: "all", label: "Tất cả" },
    { value: "unread", label: "Chưa đọc", count: unreadCount },
    { value: "read", label: "Đã đọc" },
  ]}
  value={status}
  onChange={setStatus}
  tone="neutral"
  aria-label="Lọc trạng thái"
/>
```

### Feedback banner (post-mutation)

```tsx
import { FeedbackBanner } from "@/components/shared/feedback-banner";

{syncError ? (
  <FeedbackBanner tone="destructive" action={<Button size="sm" variant="outline" onClick={retry}>Làm mới</Button>}>
    Đồng bộ thất bại: {getErrorMessage(syncError)}
  </FeedbackBanner>
) : null}

{justSynced ? (
  <FeedbackBanner tone="success">Đã đồng bộ thành công.</FeedbackBanner>
) : null}
```

### Confirm dialog (destructive action)

```tsx
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Trash2 } from "lucide-react";

<ConfirmDialog
  open={confirmOpen}
  onOpenChange={setConfirmOpen}
  title="Xóa N thông báo?"
  description="Thao tác này không thể hoàn tác."
  icon={Trash2}
  tone="destructive"
  confirmLabel="Xác nhận xóa"
  cancelLabel="Hủy bỏ"
  onConfirm={doDelete}
  pending={isDeleting}
/>
```

## Domain wrapper pattern

When a shared component needs route-specific copy or anatomy, create a **thin
domain wrapper** in the route directory — do NOT add a `mode` prop to the shared
component.

```tsx
// src/app/(app)/branches/branch-empty-state.tsx
import { EmptyState } from "@/components/shared/empty-state";
import { GitBranch } from "lucide-react";

export function BranchEmptyState({ hint }: { hint?: string }) {
  return (
    <EmptyState
      icon={GitBranch}
      title="Chưa có branch nào"
      hint={hint ?? "Tạo branch mới từ một Jira task để bắt đầu."}
    />
  );
}
```

See also: `notifications-summary-cards.tsx`, `leaderboard-summary-cards.tsx`,
`board-summary-cards.tsx` (metric domain wrappers), `stale-empty-state.tsx`
inside `stale-client.tsx`.

## Accessibility rules

- One `h1` per page (via `PageHeader`); heading hierarchy must not skip levels.
- Decorative icons: always `aria-hidden="true"` (already handled by shared components).
- `SegmentedControl`: uses `role="group"` + `aria-pressed` (not tabs, since there is no tabpanel).
- `ErrorState`: `role="alert"` (announced immediately).
- `FeedbackBanner`: `role="alert"` for warning/destructive, `role="status"` otherwise.
- `MetricCard` interactive: `role="button"`, `tabIndex=0`, keyboard Enter/Space.
- `ConfirmDialog`: focus returns to trigger via Radix; `pending` blocks Escape/overlay.
- All focusable elements: visible focus ring (`focus-visible:ring-2`).

## Dark mode & visual rules

- Use **semantic tokens** only: `bg-muted`, `text-foreground`, `text-muted-foreground`,
  `border-border`, `bg-card`, `text-destructive`, `bg-primary`, etc.
- Status colors: `emerald` (success), `amber` (warning), `destructive` (danger/error),
  `primary`/teal (info/action). No hardcoded hex or arbitrary Tailwind colors.
- Verify both light and dark mode after any change.
- Contrast ≥ 4.5:1 for text in both modes.
- Transitions 150–200ms; respect `prefers-reduced-motion` (use `motion-safe:animate-*`).

## Rules / anti-patterns (do not)

| Anti-pattern | Why it's bad |
|---|---|
| `BasePage` taking a dozen booleans to render every screen | Unmaintainable; each page is different enough that a god-component explodes |
| `mode="board\|release\|stale"` component with per-domain branches | Couples shared to domain; violates single-responsibility |
| Passing raw Tailwind classes to override whole sections of a base component | Defeats the purpose of the shared component; hard to maintain |
| Putting queries, mutations, or API URLs in a presentational shared component | Shared must remain server-compatible and domain-agnostic |
| Building a generic table/form schema engine without a real need | Abstraction over-engineering; no second consumer to validate the API |
| Splitting a file just to cut LOC when the new piece still depends on all of page state | No cohesion gain; just more indirection |
| Hardcoding semantic-state colors (hex, `red-500`, `teal-400`) | Breaks dark mode and theming; use tokens/variants |
| Turning stale-while-revalidate into a full-page loading state | When data is present, keep it visible; show fetching lightly in the header/action |
| Creating an index barrel (`index.ts`) in `shared/` | Risks circular imports and pulls unrelated code into the bundle |
| Importing `useQueryClient` in a shared component | Presentational components should receive callbacks, not manage cache |

## Verification checklist (when adding/modifying a shared component)

- [ ] Has at least 2 real consumers in the same PR (or 1 pilot + 1 confirmed next).
- [ ] No `"use client"` unless truly needed (event handlers, state, browser APIs).
- [ ] No business domain types, API URLs, or query keys.
- [ ] Uses semantic tokens (no hardcoded colors).
- [ ] `aria-hidden` on decorative icons; correct `role` for interactive elements.
- [ ] Keyboard-accessible (Tab, Enter, Space, Escape).
- [ ] Works in both light and dark mode.
- [ ] No horizontal overflow at 375px width.
- [ ] `typecheck`, `lint`, `test`, `build` all pass.

## Not created yet (intended catalog)

- `ResponsiveDataView` — Branches already has `BranchTable`/`BranchCardList`. Will
  be added only once a second consumer proves the API reduces duplication, to
  avoid an orphan abstraction.
