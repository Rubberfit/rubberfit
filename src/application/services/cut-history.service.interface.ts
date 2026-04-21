import type { CreateCutHistory, CutHistory, UpdateCutHistory } from "@/src/entities"

export interface ListCutHistoryOptions {
  from?: Date
  to?: Date
  userId?: string | null
  limit?: number
}

export interface ICutHistoryService {
  list(options?: ListCutHistoryOptions): Promise<CutHistory[]>
  getById(id: string): Promise<CutHistory | null>
  create(input: CreateCutHistory): Promise<CutHistory>
  update(id: string, patch: UpdateCutHistory): Promise<CutHistory>
  delete(id: string): Promise<void>

  listFavoriteIds(userId: string): Promise<string[]>
  toggleFavorite(userId: string, cutHistoryId: string): Promise<{ isFavorite: boolean }>

  uploadPdf(cutHistoryId: string, tenantId: string, pdfBlob: Blob): Promise<string | null>
}
