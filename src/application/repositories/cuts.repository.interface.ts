import type { Cut } from "@/src/infrastructure/models/database.types"

export interface ICutsRepository {
  findById(id: string): Promise<Cut | null>
  findAll(userId: string): Promise<Cut[]>
  findByRollId(rollId: string): Promise<Cut[]>
  findByJobReference(jobReference: string): Promise<Cut[]>
  create(data: Omit<Cut, "id" | "user_id" | "created_at">): Promise<Cut>
}
