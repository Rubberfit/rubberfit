interface StepBadgeProps {
  step: number
}

/**
 * Small circular step indicator for the CSV import wizard — Phase
 * 3 PR 3j. Sits left of each card title; the card title carries
 * only the action label (e.g., "Download template") with the badge
 * carrying the step number. Sentence-case throughout.
 */
export function StepBadge({ step }: StepBadgeProps) {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-accent-foreground tabular-nums"
    >
      {step}
    </span>
  )
}
