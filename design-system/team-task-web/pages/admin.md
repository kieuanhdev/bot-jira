# Admin Console — Design System Override

- **Density:** Dashboard density (8–32 px). Card padding `p-4`, section gap `gap-4`, row padding `py-2` to `py-2.5`.
- **Cards:** No hover lift unless the card is interactive (e.g. `MetricCard` with `onClick`).
- **Status:** 8 px dot indicator (`h-2 w-2 rounded-full`) + text badge; never rely solely on color.
- **Latency thresholds:** `< 1000 ms` success · `1000–3000 ms` warning ("Chậm") · `> 3000 ms` or error danger. Unconfigured services use secondary badge and muted text.
- **Live Data:** Always display "Cập nhật X trước" + "Dữ liệu cũ" warning badge when `> 90 s` without updates. Manual refresh button with spinning state and `motion-reduce:animate-none`.
- **Errors:** Display inline error summaries (masked via `maskSecrets`), expandable via disclosure button (`ChevronRight` with 90° rotation); never rely on `title` attribute tooltips.
- **Typography:** Plus Jakarta Sans body/headings; `font-mono` strictly for job codes, project keys, and masked error pre-blocks.
- **Color tokens:** Strict adherence to semantic variables (`bg-muted`, `text-muted-foreground`, `border-border`, semantic badge variants), preserving teal primary accent from `MASTER.md`.
