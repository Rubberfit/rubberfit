import type { MaterialType } from "@/src/infrastructure/models/supabase"

export interface IMaterialTypeRepository {
  getAll(): Promise<MaterialType[]>
  getByIds(ids: string[]): Promise<MaterialType[]>
  getNames(): Promise<Pick<MaterialType, "id" | "name">[]>
  getTopByCost(limit: number): Promise<MaterialType[]>
  /**
   * Inserts a new material type. `userId` is the owner of the row
   * inserted as `material_types.user_id`. Server-action callers pass
   * `actor.id` explicitly (since the browser-singleton-backed
   * `getCurrentUserId()` has no session in a Node runtime). Legacy
   * browser callers may omit it and fall back to `getCurrentUserId()`
   * until they migrate.
   */
  create(
    material: Omit<MaterialType, "id" | "user_id" | "created_at" | "updated_at">,
    userId?: string
  ): Promise<MaterialType>
  update(id: string, updates: Partial<MaterialType>): Promise<MaterialType>
  delete(id: string): Promise<void>
}
