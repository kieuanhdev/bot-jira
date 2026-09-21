# Board Page Overrides

> **PROJECT:** Team Task Web
> **Generated:** 2026-09-19 08:30:02
> **Page Type:** Dashboard / Data View

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** full-width (board uses the entire main area; no max-w constraint)
- **Grid:** 5 fixed status columns (kanban) OR a single-column list (queue view) — user-togglable
- **Density:** High (dashboard). Card padding `p-2.5`, column gap `gap-3`, card gap `gap-2`.

### Responsive / Adaptive Layout (no horizontal scroll)

The board never requires horizontal scrolling. It adapts to viewport width:

| Width | Kanban layout |
|-------|---------------|
| wide (≥1280px) | Every workflow state = its own column (the project's full workflow) |
| medium (768–1279px) | Leading to-do states merged into a single **Queued** column; in-progress + done columns kept distinct |
| narrow (<768px) | Kanban disabled → forces **List view**; the Board toggle is disabled |

- Many workflow states (e.g. MR has 10) are handled by fluid columns
  (`flex-1 basis-64 min-w-0`) + the medium merge + horizontal scroll as a last
  resort; List view is the clean fallback for narrow screens.
- The user's explicit Board/List choice is honored on wide + medium screens; on
  narrow screens List is forced automatically.
- Columns come from `/api/board/statuses` (real project workflow states). Fallback
  when that endpoint returns nothing: the distinct statuses present in the loaded issues.
- Summary tiles are category-based (Open / In Progress / Stale / Done), not fixed
  status names, so they stay correct regardless of the project's workflow.

### Spacing Overrides

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | icon gaps, badge inner |
| `--space-sm` | `6px` | card inner rows |
| `--space-md` | `8px` | card→card vertical |
| `--space-lg` | `12px` | section gaps |

- Column width `w-72` (288px), board container `overflow-x-auto`.
- Summary bar sits above the columns with `mb-3`, gap `gap-2`.

### Information Hierarchy (the point of this app vs Jira)

- The board is a **personal lens**, not a Jira clone. Default scope = "You" (assignee).
- Columns match the **project's Jira board columns** — NOT a fixed 5-group set,
  and NOT the full raw workflow (Jira boards curate a subset).
  - **Per-project config** (preferred, exact match to Jira): `JIRA_PROJECT_COLUMNS`
    in `.env`, e.g. `EPM:Backlog|Selected for Development|In Progress|Waiting For Deploy|ToDo Test|Done`.
    These are raw workflow status names, shown in the given order.
  - **Auto-derivation** (fallback when a project isn't configured): keep every
    to-do + in-progress workflow state in workflow order, collapse the done-family
    into a single column.
  - Single project: that project's columns. "All" (multiple projects): the
    de-duplicated union across projects (a column named the same in two projects,
    e.g. `In Progress`, is one column).
- Source of workflow data: Jira REST **v2** `/project/{key}/statuses` (v3 is
  unavailable on this DC — it 302-redirects to login). Served by
  `/api/board/statuses`.
- An issue routes to a column by its **status category** (so a status not listed
  as a column header still lands in the right column, e.g. `Done Test`+`Deploy`
  → `Done`).
- A configured column label that isn't a real workflow status (e.g. `Done`) gets
  its category **inferred from the label** (done/closed/released → done,
  progress → in-progress, backlog/todo/… → to-do), so it correctly collects the
  project's done-family issues.
- Column dot color is derived from the Jira status category. On this instance the
  category ids are **2 = To Do, 4 = In Progress, 3 = Done** (not the canonical
  1/4/5). sky = to-do, teal = in progress, emerald = done.
- **Workflow transitions** are configured in Jira. The board surfaces them via
  three interaction patterns (all resolve to a Jira transition lookup):
  - **Drag & drop** (`@dnd-kit/core`): drag a card to another column → finds the
    transition to that column's status name → POSTs the transition. Drop target
    highlights with `bg-primary/5 ring-1 ring-primary/20`. Drag overlay shows a
    rotated/scaled clone.
  - **Quick arrows** (↖ ↗ on card top-right): move to the adjacent column
    (prev/next in column order). Stops at edges. Fastest single-action path.
  - **Inbox commands**: `MOVE KEY TO Status`, `DONE KEY`, `REOPEN KEY` — typed
    from chat or the Inbox page for batch/voice workflows.
  - All three call `GET /api/issues/[key]/transitions` → match by `to.name`
    case-insensitive → `POST /api/issues/[key]/transition`. If no transition
    exists to the target, the action silently no-ops (Jira workflow constraint).
- **Differentiators must be prominent on each card** (this is the reason to use the app over Jira):
  - AI score (when present) — `info` badge with bot icon, placed first in the meta row.
  - Stale indicator — `warning` badge with clock icon, when `ageDays` exceeds threshold.
  - Priority — shown via a left border accent or a high-priority badge.

### View Toggle

- Top-right of the board: `Board ⇄ List` segmented toggle (icon + label).
- **List view** = single column, rows sorted by priority then age, inline status quick-action.
- Remember the user's last choice per session (local state is fine).

### Color Overrides

- Column header dot color per group:
  - Backlog `text-muted-foreground`
  - To Do `sky`
  - In Progress `teal` (primary)
  - In Review `amber`
  - Done `emerald`
- Summary tiles use `bg-muted/40` surface, `tabular-nums` for counts.

### Component Overrides

- Card padding tighter than Master (`p-2.5` vs `p-3`).
- Summary tiles: small stat cards, no shadow, `tabular-nums`.
- Use `Skeleton` for column/card loading (not text).

---

## Page-Specific Components

- **Summary bar:** row of small stat tiles — In Progress, Stale, Up next (this week), Done this week. Each = label + big number + small trend icon.
- **Issue card (dense):** line 1 = `jiraKey` (mono, muted) + points badge; line 2 = summary (line-clamp-2, font-medium); line 3 = AI score / stale / assignee badges; line 4 = "updated Xh" muted.
- **Group header:** colored dot + group label + count.

---

## Recommendations

- Hover: card background shift (150ms), no layout-shift transform.
- Transitions 150–200ms; respect `prefers-reduced-motion` (handled globally).
- Loading: 5-column skeleton matching real column widths.
- Empty (per column): subtle muted hint, not a blank column.
- Keep text contrast ≥4.5:1 in both light & dark (tokens already handle this).
