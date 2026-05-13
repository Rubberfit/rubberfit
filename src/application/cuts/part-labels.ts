/**
 * Shared part-id → human-readable label map for cut history surfaces.
 *
 * Lives in `src/application` because both the client hook (history
 * page) and the server action (CSV export) need to format the same
 * label. The taxonomy is hardcoded today — IDs 1..4 are the only
 * part types the cutting-engine accepts and the table is closed-set.
 * When a new part type is added, this map plus the cut-recording
 * schema both need updating.
 */
export const PART_LABELS: Record<number, string> = {
  1: "Rectangle",
  2: "Cylinder Wrap",
  3: "Cone Spread",
  4: "Hopper Panel",
}

export function labelForPartId(partId: number): string {
  return PART_LABELS[partId] ?? `Part ${partId}`
}
