export function BulkStepBadge({ step }: { step: 1 | 2 | 3 }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary"
      aria-hidden="true"
    >
      {step}
    </span>
  );
}
