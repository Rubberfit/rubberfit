/**
 * Common mixin shapes reused across entities. Keep these field conventions
 * aligned with the migration audit columns (created_at/by, updated_at/by,
 * deleted_at). Timestamps are ISO 8601 strings — match Supabase's return
 * shape so mappers don't have to convert at the repository boundary.
 */

export interface AuditFields {
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
}

export interface CreatedOnly {
  createdAt: string
  createdBy: string | null
}

export interface SoftDeletable {
  deletedAt: string | null
}
