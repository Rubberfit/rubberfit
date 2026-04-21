import { supabase } from "@/src/infrastructure/models/supabase-context"
import type { CreateCutHistory, CutHistory, UpdateCutHistory } from "@/src/entities"
import {
  mapCreateCutHistoryToInsert,
  mapRowToCutHistory,
  mapUpdateCutHistoryToUpdate,
} from "@/src/infrastructure/mappers/cut-history.mapper"
import type {
  ICutHistoryService,
  ListCutHistoryOptions,
} from "@/src/application/services/cut-history.service.interface"

// TODO: resolve currency from tenant_settings.default_currency
const DEFAULT_CURRENCY = "USD"
const CUT_HISTORY_PDF_BUCKET = "cut-history-pdfs"

export class CutHistoryService implements ICutHistoryService {
  async list(options: ListCutHistoryOptions = {}): Promise<CutHistory[]> {
    let query = supabase
      .from("cut_history")
      .select("*")
      .is("deleted_at", null)
      .order("cut_date", { ascending: false })

    if (options.from) query = query.gte("cut_date", options.from.toISOString())
    if (options.to) query = query.lte("cut_date", options.to.toISOString())
    if (options.userId) query = query.eq("user_id", options.userId)
    if (options.limit) query = query.limit(options.limit)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []).map((row) => mapRowToCutHistory(row, DEFAULT_CURRENCY))
  }

  async getById(id: string): Promise<CutHistory | null> {
    const { data, error } = await supabase
      .from("cut_history")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    return mapRowToCutHistory(data, DEFAULT_CURRENCY)
  }

  async create(input: CreateCutHistory): Promise<CutHistory> {
    const { data, error } = await supabase
      .from("cut_history")
      .insert(mapCreateCutHistoryToInsert(input))
      .select()
      .single()
    if (error) throw error
    return mapRowToCutHistory(data, DEFAULT_CURRENCY)
  }

  async update(id: string, patch: UpdateCutHistory): Promise<CutHistory> {
    const { data, error } = await supabase
      .from("cut_history")
      .update(mapUpdateCutHistoryToUpdate(patch))
      .eq("id", id)
      .select()
      .single()
    if (error) throw error
    return mapRowToCutHistory(data, DEFAULT_CURRENCY)
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("cut_history").delete().eq("id", id)
    if (error) throw error
  }

  async listFavoriteIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("cut_favorites")
      .select("cut_history_id")
      .eq("user_id", userId)
      .is("deleted_at", null)
    if (error) throw error
    return (data ?? []).map((r) => r.cut_history_id)
  }

  async toggleFavorite(
    userId: string,
    cutHistoryId: string
  ): Promise<{ isFavorite: boolean }> {
    const { data: existing } = await supabase
      .from("cut_favorites")
      .select("id")
      .eq("user_id", userId)
      .eq("cut_history_id", cutHistoryId)
      .is("deleted_at", null)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from("cut_favorites").delete().eq("id", existing.id)
      if (error) throw error
      return { isFavorite: false }
    }

    // Look up the parent cut_history row's tenant_id for the insert.
    const { data: parent, error: parentError } = await supabase
      .from("cut_history")
      .select("tenant_id")
      .eq("id", cutHistoryId)
      .maybeSingle()
    if (parentError || !parent) {
      throw parentError ?? new Error("Cut history record not found")
    }

    const { error } = await supabase.from("cut_favorites").insert({
      user_id: userId,
      cut_history_id: cutHistoryId,
      tenant_id: parent.tenant_id,
    })
    if (error) throw error
    return { isFavorite: true }
  }

  async uploadPdf(
    cutHistoryId: string,
    tenantId: string,
    pdfBlob: Blob
  ): Promise<string | null> {
    const path = `${tenantId}/${cutHistoryId}.pdf`

    const { error: uploadError } = await supabase.storage
      .from(CUT_HISTORY_PDF_BUCKET)
      .upload(path, pdfBlob, {
        cacheControl: "3600",
        contentType: "application/pdf",
        upsert: true,
      })
    if (uploadError) {
      console.error("PDF upload failed:", uploadError)
      return null
    }

    const { error: updateError } = await supabase
      .from("cut_history")
      .update({ pdf_url: path })
      .eq("id", cutHistoryId)
    if (updateError) {
      console.error("Failed to save PDF path:", updateError)
      return null
    }

    return path
  }
}

export const cutHistoryService = new CutHistoryService()
