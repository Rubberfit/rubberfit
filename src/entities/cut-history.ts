import type { Area, Length, Percentage, PricePerArea } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type CreateCutHistory = Omit<CutHistory, "id" | keyof AuditFields | keyof SoftDeletable>
export type UpdateCutHistory = Partial<CreateCutHistory>

export interface CutHistory extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  userId: string | null
  materialTypeId: string
  partId: string | null
  cutLength: Length
  cutWidth: Length
  cutThickness: Length | null
  partCustomWidth: Length | null
  partCustomHeight: Length | null
  partCustomDimensions: unknown
  cutAmount: number
  partsCompleted: number
  cutPieces: number
  materialUsed: Area
  scrap: Area
  fabScore: Percentage | null
  costPerArea: PricePerArea | null
  stockLabel: string | null
  pdfUrl: string | null
  cutDate: string
}
