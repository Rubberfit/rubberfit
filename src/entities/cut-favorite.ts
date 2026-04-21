import type { AuditFields, SoftDeletable } from "./shared"

export interface CutFavorite extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  userId: string
  cutHistoryId: string
}
