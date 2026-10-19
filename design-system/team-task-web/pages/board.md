# Board Page Overrides

> **PROJECT:** Team Task Web  
> **Generated:** 2026-09-19 08:30:02 (Updated: 2026-10-19 UI/UX Refresh)  
> **Page Type:** Dashboard / Data View  

> ⚠️ **IMPORTANT:** Rules in this file **override** the Master file (`design-system/team-task-web/MASTER.md`).
> Only deviations from the Master are documented here. For all other rules, refer to the Master.

---

## Page-Specific Rules

### Layout Overrides

- **Max Width:** full-width (board uses the entire main area; no max-w constraint).
- **Grid:** Workflow status columns (Kanban) OR single-column list (queue view) — user-togglable.
- **Density:** Comfortable-compact. Card padding `p-3`, column gap `gap-2.5`, card gap `gap-2.5`.
- **Column Surface:** `bg-muted/60 rounded-xl` so white cards (`bg-card`) stand out clearly against the column background.

### Responsive / Adaptive Layout (no horizontal scroll)

The board avoids page-level horizontal scrolling and adapts to viewport width. When many workflow columns remain visible, scrolling is contained inside the board:

| Width | Kanban layout |
|-------|---------------|
| wide (≥1280px) | Every workflow state = its own column (the project's full workflow) |
| medium (768–1279px) | Leading to-do states merged into a single **Queued** column; in-progress + done columns kept distinct |
| narrow (<768px) | Kanban disabled → forces **List view**; the Board toggle is disabled |

- Many workflow states (e.g. MR has 10) are handled by fluid columns
  (`flex-1 basis-72 min-w-64`) + the medium merge + horizontal scroll as a last
  resort; List view is the clean fallback for narrow screens.
- Users can hide/show individual columns and collapse columns from a central
  **Columns** menu. Preferences are stored per project in local storage, with a
  one-action reset. At least one column always remains visible.
- The user's explicit Board/List choice is honored on wide + medium screens; on
  narrow screens List is forced automatically.
- Columns come from `/api/board/statuses` (real project workflow states). Fallback
  when that endpoint returns nothing: the distinct statuses present in the loaded issues.
- Summary tiles use the shared `MetricCard` component with category metrics (Open / In Progress / Stale / Done).

### Spacing & Sizing Overrides (Task 3.1)

| Element | Value / Classes | Details |
|---------|-----------------|---------|
| Column container | `gap-2.5 overflow-x-auto` | Separates workflow columns cleanly |
| Column surface | `bg-muted/60 rounded-xl p-3` | Soft background to lift card elevation |
| Column header | `text-sm font-semibold text-foreground` | Status title |
| Column counter | `Badge variant="neutral"` (`text-2xs`) | Issue count badge |
| Card surface | `p-3 rounded-xl bg-card border border-border shadow-[var(--shadow-card)]` | Lifted white surface |
| Card jiraKey | `font-mono text-xs font-semibold text-muted-foreground` | Monospace key |
| Card issue type | `text-2xs text-muted-foreground` | Issue type indicator |
| Card title | `text-sm font-semibold text-foreground line-clamp-2` | Main summary (15px) |
| Priority rail | `w-1 rounded-full` | High visibility left edge |
| Action buttons | `h-7 w-7`, icon `h-4 w-4` | ⋯ and ‹ › quick navigation buttons |
| Delivery badges | `text-2xs py-0.5` | PR open → `success`, merged → `info` (no hardcoded palette) |
| Badges & pills | `text-2xs py-0.5` (bỏ `h-4`) | Prevents text clipping |
| Summary bar | `mb-4 gap-3` | Standardized with `MetricGrid` & `MetricCard` |

### Information Hierarchy (the point of this app vs Jira)

- The board is a **personal lens**, not a Jira clone. Default scope = "You" (assignee).
- Columns match the **project's Jira board columns** — NOT a fixed 5-group set,
  and NOT the full raw workflow (Jira boards curate a subset).
  - **Per-project config** (preferred, exact match to Jira): `JIRA_PROJECT_COLUMNS`
    in `.env`, e.g. `EPM:Backlog|Selected for Development|In Progress|Waiting For Deploy|ToDo Test|Done`.
  - **Auto-derivation** (fallback when a project isn't configured): keep every
    to-do + in-progress workflow state in workflow order, collapse the done-family
    into a single column.
  - Single project: that project's columns. "All" (multiple projects): the
    de-duplicated union across projects.
- Source of workflow data: Jira REST **v2** `/project/{key}/statuses`. Served by `/api/board/statuses`.
- An issue routes to a column by its **status category**.
- Column header dot color uses semantic status tokens (`text-muted-foreground`, `text-info`, `text-primary`, `text-warning`, `text-success`).
- **Workflow transitions** are configured in Jira. The board surfaces them via:
  - **Drag & drop** (`@dnd-kit/core`): drop target highlights with `bg-primary-soft/50 ring-1 ring-primary`.
  - **Quick arrows** (‹ › on card top-right): `h-7 w-7` buttons.
  - **Inbox commands**: `MOVE KEY TO Status`, `DONE KEY`, `REOPEN KEY`.
- **Differentiators must be prominent on each card**:
  - AI score (when present) — `info` badge with bot icon, placed first in meta row.
  - Stale indicator — `warning` badge with clock icon, when `ageDays` exceeds threshold.
  - Priority — left rail accent `w-1`.

### View Toggle

- Top-right of the board: `Board ⇄ List` segmented control (`h-9` or `h-10`).
- **List view** = single column, rows min-h 44px, text `text-sm`, inline status quick-actions.
- Remember the user's last choice per session.

---

## Page-Specific Components

- **Summary bar:** Row of `MetricCard` components (`In Progress`, `Stale`, `Up next`, `Done this week`). Numbers use `text-3xl font-bold tabular-nums`.
- **Issue card (Comfortable-compact):**
  - Line 1: `jiraKey` (mono, `text-xs`) + issue type (`text-2xs`) + quick buttons (`h-7 w-7`).
  - Line 2: `summary` (`text-sm font-semibold line-clamp-2 text-foreground`).
  - Line 3: AI score / stale / assignee / delivery badges (`text-2xs py-0.5`).
  - Line 4: updated time (`text-xs text-muted-foreground`).
- **Group header:** Colored status dot + group label (`text-sm font-semibold`) + count badge (`neutral`).

---

## Recommendations

- Hover: Card background shift (150ms), no layout-shift transform.
- Transitions 150–200ms; respect `prefers-reduced-motion` (handled globally).
- Loading: Skeleton matching real column and card dimensions.
- Empty (per column): Subtle muted icon in circle + short hint, not a blank column.
- Keep text contrast ≥4.5:1 in both light & dark (tokens already handle this).
