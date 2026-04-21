import type { CreatedOnly } from "./shared"

export interface CutHistorySelection extends CreatedOnly {
  id: string
  tenantId: string
  cutHistoryId: string
  selectionIndex: number
  sizeValue: number | null
  sizeText: string | null
  label: string | null
}
