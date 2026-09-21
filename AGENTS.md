<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Design system

This project has a generated design system (from the `ui-ux-pro-max` skill) at
`design-system/team-task-web/MASTER.md`. Before designing or styling any page,
read that file first. If a per-page override exists at
`design-system/team-task-web/pages/<page>.md`, it takes precedence over the Master.

Stack: Next.js (App Router) + React 19 + Tailwind CSS v4 + shadcn/ui (Radix) +
TanStack Query + lucide-react. Theme tokens live in `src/app/globals.css`
(`:root` / `.dark` CSS variables). Font is Plus Jakarta Sans. Primary accent is
teal; status uses semantic badge variants (success/warning/danger/info).

Conventions to follow when adding UI:
- Loading states use the `Skeleton` component (`src/components/ui/skeleton.tsx`), not text spinners.
- Empty states show an icon in a muted circle + a short title + a one-line hint, never a blank screen.
- Use semantic color tokens (`bg-muted`, `text-muted-foreground`, `border-border`), not hardcoded hex.
- Icons: lucide-react only, consistent stroke, `aria-hidden` for decorative ones.
- Clickable elements get `cursor-pointer`; transitions are 150–200ms; respect `prefers-reduced-motion`.
- Light + dark mode: verify both, keep text contrast ≥4.5:1.
