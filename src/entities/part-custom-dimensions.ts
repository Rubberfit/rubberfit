/**
 * Shape of `cut_history.part_custom_dimensions jsonb`. Produced by the
 * cut planner when a user selects a custom size for a part. Permissive
 * record for now; tighten when the planner's output schema stabilizes.
 */
export interface PartCustomDimensions {
  widthMm?: number
  heightMm?: number
  lengthMm?: number
  [key: string]: unknown
}
