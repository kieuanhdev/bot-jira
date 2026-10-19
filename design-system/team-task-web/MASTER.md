# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/team-task-web/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Team Task Web  
**Category:** Productivity Tool / Engineering Dashboard  
**Stack:** Next.js 16 (App Router) + React 19 + Tailwind CSS v4 (`@theme inline` in `src/app/globals.css`) + shadcn/ui (Radix) + TanStack Query + lucide-react.  
**Font:** Plus Jakarta Sans (`subsets: ["latin", "latin-ext", "vietnamese"]`).  

---

## 1. Global Color Palette (OKLCH)

Theme tokens are defined in `src/app/globals.css` with CSS variables for `:root` (light) and `.dark` (dark mode). All components must use semantic tokens (`bg-card`, `text-foreground`, `border-border`, etc.) instead of hardcoded hex or raw Tailwind palette classes (`emerald-*`, `sky-*`, `purple-*`, etc.).

### Light Mode (`:root`)

| Role | CSS Variable | Value (OKLCH) | Contrast / Usage |
|------|--------------|---------------|------------------|
| Background | `--background` | `oklch(0.965 0.006 220)` | App canvas; provides contrast against white cards (1.11:1) |
| Foreground | `--foreground` | `oklch(0.21 0.02 255)` | Primary body text |
| Card / Popover | `--card`, `--popover` | `oklch(1 0 0)` | White card and surface background |
| Card Foreground | `--card-foreground` | `oklch(0.21 0.02 255)` | Text inside cards |
| Primary | `--primary` | `oklch(0.52 0.105 184.7)` | Deep teal accent; text-white on primary achieves **5.11:1** (WCAG AA) |
| Primary Foreground | `--primary-foreground` | `oklch(1 0 0)` | White text on primary buttons |
| Primary Soft | `--primary-soft` | `oklch(0.94 0.03 184.7)` | Active nav item, selected chip background |
| Primary Soft Foreground | `--primary-soft-foreground` | `oklch(0.45 0.09 184.7)` | Text on `--primary-soft` (**5.92:1** contrast) |
| Secondary | `--secondary` | `oklch(0.95 0.025 184.7)` | Secondary chips / badges |
| Secondary Foreground | `--secondary-foreground` | `oklch(0.35 0.07 184.7)` | Text on secondary surface (**9.42:1**) |
| Muted | `--muted` | `oklch(0.94 0.01 220)` | Column backgrounds, subtle chips |
| Muted Foreground | `--muted-foreground` | `oklch(0.45 0.02 257.7)` | Secondary metadata, labels, table headers (**7.43:1**) |
| Accent | `--accent` | `oklch(0.945 0.015 200)` | Hover background for rows/cards |
| Accent Foreground | `--accent-foreground` | `oklch(0.21 0.02 255)` | Text on accent |
| Border | `--border` | `oklch(0.87 0.01 220)` | Card borders, dividers (1.48:1 against card) |
| Input | `--input` | `oklch(0.84 0.012 220)` | Clear form input boundaries |
| Ring | `--ring` | `oklch(0.52 0.105 184.7)` | Focus rings |
| Sidebar | `--sidebar` | `oklch(1 0 0)` | Clean white sidebar surface with `border-r` |
| Success | `--success` | `oklch(0.5 0.14 150)` | Green semantic text/badge (**5.61:1**) |
| Warning | `--warning` | `oklch(0.52 0.14 60)` | Amber semantic text/badge (**5.73:1**) |
| Info | `--info` | `oklch(0.5 0.14 240)` | Blue semantic text/badge (**5.75:1**) |
| Destructive | `--destructive` | `oklch(0.53 0.21 27)` | Danger red text/button (**5.89:1**) |

### Dark Mode (`.dark`)

| Role | CSS Variable | Value (OKLCH) | Contrast / Usage |
|------|--------------|---------------|------------------|
| Background | `--background` | `oklch(0.18 0.017 263.9)` | Deep slate dark background |
| Foreground | `--foreground` | `oklch(0.95 0.005 264)` | High-contrast light text |
| Card / Popover | `--card`, `--popover` | `oklch(0.225 0.019 263.9)` | Elevated dark cards |
| Card Foreground | `--card-foreground` | `oklch(0.95 0.005 264)` | Text inside dark cards |
| Primary | `--primary` | `oklch(0.72 0.12 184.7)` | Bright teal accent |
| Primary Foreground | `--primary-foreground` | `oklch(0.17 0.02 184.7)` | Dark text on bright primary (**8.10:1**) |
| Primary Soft | `--primary-soft` | `oklch(0.3 0.05 184.7)` | Dark active nav background |
| Primary Soft Foreground | `--primary-soft-foreground` | `oklch(0.85 0.1 184.7)` | Bright text on dark soft background |
| Secondary | `--secondary` | `oklch(0.25 0.03 184.7)` | Dark secondary chip surface |
| Secondary Foreground | `--secondary-foreground` | `oklch(0.85 0.1 184.7)` | Light secondary text |
| Muted | `--muted` | `oklch(0.24 0.015 263.9)` | Dark column surface |
| Muted Foreground | `--muted-foreground` | `oklch(0.75 0.015 247.9)` | Muted meta text (**7.45:1**) |
| Accent | `--accent` | `oklch(0.26 0.02 263.9)` | Dark hover background |
| Accent Foreground | `--accent-foreground` | `oklch(0.95 0.005 264)` | Text on dark hover |
| Border | `--border` | `oklch(0.33 0.019 263.9)` | Subtle dark borders |
| Input | `--input` | `oklch(0.33 0.019 263.9)` | Dark input borders |
| Ring | `--ring` | `oklch(0.72 0.12 184.7)` | Dark focus ring |
| Sidebar | `--sidebar` | `oklch(0.225 0.019 263.9)` | Sidebar surface |

### Soft Badge Color Rules
- Soft semantic badges use **`/12` alpha background** (`bg-success/12`, `bg-warning/12`, `bg-info/12`, `bg-destructive/12`) paired with solid text (`text-success`, `text-warning`, `text-info`, `text-destructive`). All achieve ≥ 4.5:1 WCAG AA contrast.
- For primary soft elements (nav items, active chips), **always use `bg-primary-soft text-primary-soft-foreground`**. Do NOT use `text-primary` on `bg-primary/10` or `bg-primary-soft` (fails WCAG AA at ~4.3:1).

---

## 2. Typography Scale & Hierarchy

### Scale Override in `@theme inline`
Tailwind CSS v4 overrides standard rem scales in `src/app/globals.css`. Notice the shifted semantic definitions:

```css
@theme inline {
  --text-2xs: 0.75rem;              /* 12px — thay cho 10px / 11px */
  --text-2xs--line-height: 1rem;
  --text-xs: 0.8125rem;             /* 13px (mặc định 12px) */
  --text-xs--line-height: 1.125rem;
  --text-sm: 0.9375rem;             /* 15px (mặc định 14px) */
  --text-sm--line-height: 1.375rem;
  /* --text-base trở lên giữ mặc định của Tailwind (16px, 18px, 20px, 24px...) */
}
```

> ⚠️ **IMPORTANT SIZING RULE:**
> - `text-2xs` = 12px
> - `text-xs` = 13px
> - `text-sm` = 15px
>
> **Strictly forbid** ad-hoc `text-[10px]`, `text-[11px]`, or `text-[13px]`. The absolute minimum font size across the application is `text-2xs` (12px). The single permitted exception below 12px is JiraAvatar `xs` (`text-[9px]`).

### Typography Hierarchy

| Role | Tailwind Classes | Description |
|------|------------------|-------------|
| Page Title (`h1`) | `text-2xl font-bold tracking-tight text-foreground` | Main header in `PageHeader` |
| Section Title / CardTitle | `text-base font-semibold text-foreground leading-tight` | Cards, section dividers (16px) |
| Body / Board Title / Table Cell | `text-sm text-foreground` | Main content, issue summaries, grid cells (15px) |
| Meta / Field Label / Table Header | `text-xs font-medium text-muted-foreground` | Secondary info, timestamps, table heads (13px) |
| Badge / Counter / Pill | `text-2xs font-semibold` | Status badges, counts, tags (12px) |
| KPI Metric Numbers | `text-3xl font-bold tabular-nums text-foreground` | Big numbers in `MetricCard` |

### Rules for Reducing Gray (Quy tắc giảm xám)
`text-muted-foreground` is strictly reserved for auxiliary metadata, form hints, and field labels.
**Never use `text-muted-foreground` for:**
- Primary content & descriptions
- User / assignee names
- Card titles & issue summaries
- Table cell values

---

## 3. Shadows & Elevation

Replace flat "no shadows" with refined, subtle elevation tokens:

| Token | CSS Variable Value | Usage |
|-------|--------------------|-------|
| Card Shadow | `--shadow-card: 0 1px 2px oklch(0.2 0.02 255 / 0.06), 0 1px 3px oklch(0.2 0.02 255 / 0.08)` | Standard `Card`, Kanban board cards |
| Popover Shadow | `--shadow-pop: 0 4px 6px -1px oklch(0.2 0.02 255 / 0.1), 0 2px 4px -2px oklch(0.2 0.02 255 / 0.1)` | Dropdowns, menus, modals, dialog sheets |

---

## 4. Component Standards

### Buttons (`src/components/ui/button.tsx`)
- Standard control heights increased for comfortable touch and click targets:
  - `default`: `h-10 px-4 text-sm font-semibold`
  - `sm`: `h-9 px-3 text-xs font-medium`
  - `lg`: `h-11 px-6 text-sm font-semibold`
  - `icon`: `h-10 w-10`
  - `icon-sm`: `h-8 w-8` (dense toolbars, action cards)
- `outline` variant uses `bg-card border-border shadow-[var(--shadow-card)]`.
- Always include `cursor-pointer transition-colors duration-150`.

### Form Controls (`Input`, `Select`, `Textarea`)
- Height: `h-10` (Inputs and Select triggers).
- Surface: `bg-card border-input text-foreground`.
- Focus state: `focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring`.
- Clear visible borders at all times.

### Badges (`src/components/ui/badge.tsx`)
- Base sizing: `px-2 py-0.5 text-2xs font-semibold rounded-md inline-flex items-center gap-1`.
- Sizing rule: Do not use fixed `h-4`. Use `py-0.5` or `h-5` minimum to prevent vertical text clipping.
- Variants:
  - `default`: `bg-primary text-primary-foreground`
  - `secondary`: `bg-secondary text-secondary-foreground`
  - `neutral`: `bg-muted text-foreground`
  - `success`: `bg-success/12 text-success border border-success/20`
  - `warning`: `bg-warning/12 text-warning border border-warning/20`
  - `info`: `bg-info/12 text-info border border-info/20`
  - `danger`: `bg-destructive/12 text-destructive border border-destructive/20`
  - `primary-soft`: `bg-primary-soft text-primary-soft-foreground border border-primary/20`

### Cards (`src/components/ui/card.tsx`)
- Surface: `bg-card text-card-foreground rounded-xl border border-border shadow-[var(--shadow-card)]`.
- CardTitle: `text-base font-semibold leading-tight`.
- CardDescription: `text-xs text-muted-foreground`.

### Tables (`src/components/ui/table.tsx`)
- TableHead: `h-11 text-xs font-semibold uppercase tracking-wide text-muted-foreground bg-muted/50`.
- TableCell: `px-3 py-2.5 text-sm text-foreground`.
- Minimum row height: 44px.

### JiraAvatar (`src/components/jira-avatar.tsx`)

| Size | Sizing & Font Class | Dimension |
|------|---------------------|-----------|
| `xs` | `h-5 w-5 text-[9px]` | 20px (the only exception below 12px) |
| `sm` | `h-6 w-6 text-2xs` | 24px |
| `md` | `h-7 w-7 text-xs` | 28px |
| `lg` | `h-9 w-9 text-sm` | 36px |
| `xl` | `h-12 w-12 text-base` | 48px |

---

## 5. Shared Components Patterns

- **PageHeader:**
  - `h1`: `text-2xl font-bold tracking-tight text-foreground`
  - description: `text-sm text-muted-foreground`
  - icon chip: `h-11 w-11 rounded-xl bg-primary-soft text-primary-soft-foreground`
- **MetricCard:**
  - KPI number: `text-3xl font-bold tabular-nums text-foreground`
  - label: `text-xs font-medium text-muted-foreground`
  - tone chips: use semantic tokens (`info`, `success`, `warning`, `destructive`) instead of palette colors (`sky`, `emerald`, `amber`, `rose`).
  - selected state: `ring-2 ring-primary bg-primary-soft`.
- **Loading States:** Always use `Skeleton` (`src/components/ui/skeleton.tsx`), never text spinners.
- **Empty States:** Always use an icon in a muted circle + short title + one-line hint. Never leave blank space.

---

## 6. Anti-Patterns & Quality Checklist

- ❌ **No hardcoded color palettes** — Never write `bg-emerald-500`, `text-purple-400`, `border-sky-200`. Use semantic tokens.
- ❌ **No micro-text** — Never write `text-[10px]`, `text-[11px]`, `text-[13px]`. Use `text-2xs` (12px), `text-xs` (13px), `text-sm` (15px).
- ❌ **No emoji icons** — Lucide icons only, with `aria-hidden` on decorative ones.
- ❌ **No cramped controls** — Buttons and inputs must be `h-9` or `h-10` minimum.
- ❌ **Missing cursor-pointer** — Every interactive item must have `cursor-pointer`.
- ❌ **Low contrast text** — Verify contrast ≥ 4.5:1 (3:1 for large/bold text).
- ❌ **Motion shifts** — Transitions 150–200ms ease; respect `prefers-reduced-motion`.
