/**
 * Format the per-section "last saved" hint shown next to the
 * Save / Cancel row. Returns `undefined` until the section has
 * been saved at least once so the row stays visually clean.
 */
export function formatSavedHint(savedAt: number | null): string | undefined {
  if (savedAt === null) return undefined
  const elapsedSec = Math.max(0, Math.round((Date.now() - savedAt) / 1000))
  if (elapsedSec < 60) return "Saved just now"
  const elapsedMin = Math.round(elapsedSec / 60)
  return `Saved ${elapsedMin}m ago`
}
