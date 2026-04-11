import type { Roll } from "@/src/infrastructure/models/supabase"

export interface IRollsRepository {
  findById(id: string): Promise<Roll | null>
  findAll(userId: string): Promise<Roll[]>
  findByStatus(userId: string, status: Roll["status"]): Promise<Roll[]>
  findByMaterialType(userId: string, materialTypeId: string): Promise<Roll[]>
  create(data: Omit<Roll, "id" | "user_id" | "created_at" | "updated_at">): Promise<Roll>
  update(id: string, data: Partial<Omit<Roll, "id" | "user_id" | "created_at">>): Promise<Roll>
  delete(id: string): Promise<void>
}
