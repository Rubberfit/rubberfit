import { type SupabaseClient } from "@supabase/supabase-js"

import { generateCutPdf } from "@/app/dashboard/cutting-engine/_components/cut-history-pdf"
import type { CutPdfData } from "@/app/dashboard/cutting-engine/_components/cut-history-pdf"
import {
  type LayoutModel,
  isLayoutModelArray,
} from "@/app/dashboard/cutting-engine/_components/layout-model"
import { PART_OPTIONS } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { CutHistory } from "@/src/infrastructure/models/supabase"
import type { CutHistoryLayoutJson } from "@/src/infrastructure/models/cut-history-layout"

const PART_TYPE_BY_PART_ID: Record<number, string> = {
  1: "rectangle",
  2: "cylinder",
  3: "cone",
  4: "trapezoid",
}

/**
 * Recover the LayoutModel[] saved alongside an auto-nest cut. The Rust v2 DTO
 * doesn't carry layout_json yet, so callers must read it through the
 * service-role client (this helper only validates shape).
 */
export function extractAutoLayouts(layoutJson: CutHistoryLayoutJson | null): LayoutModel[] | null {
  if (!layoutJson || layoutJson.kind !== "auto") return null
  return isLayoutModelArray(layoutJson.layouts) ? layoutJson.layouts : null
}

/**
 * Re-derive the PDF payload from a persisted cut row + frozen layouts.
 * The save-time path (page.tsx) builds this from live engine state; this is
 * the recovery path that has only the row + layout snapshot to work with.
 */
export function buildCutPdfDataFromRow(cut: CutHistory, layouts: LayoutModel[]): CutPdfData {
  const partType = PART_TYPE_BY_PART_ID[cut.part_id]
  const partOption = partType ? PART_OPTIONS.find((p) => p.partType === partType) : null
  const partLabel = partOption?.label ?? "Custom"

  const templateCount = cut.part_selected_label?.length ?? 0
  const profileTitle = `${partLabel} ${templateCount > 1 ? "mixed-size layout" : "layout"}`

  // Tag map: each PlacedPart already carries its tag letter as `label`.
  // Walk the layouts to discover unique tags, then map them back to
  // dimension labels via specIndex → part_selected_label[specIndex].
  const dimensionLabels = cut.part_selected_label ?? []
  const tagMap = new Map<string, string>()
  for (const layout of layouts) {
    for (const part of layout.parts) {
      if (!tagMap.has(part.label)) {
        tagMap.set(part.label, dimensionLabels[part.specIndex] ?? part.label)
      }
    }
  }

  const rollCount = layouts.length
  const totalStockSqFt = ((cut.cut_width * cut.cut_length) / 144) * rollCount
  const reusableOffcutPct =
    totalStockSqFt > 0 ? (cut.reusable_offset_sqft / totalStockSqFt) * 100 : 0
  const scrapPct = totalStockSqFt > 0 ? (cut.scrap_sqft / totalStockSqFt) * 100 : 0

  return {
    cutId: cut.id,
    stockWidth: cut.cut_width,
    stockLength: cut.cut_length,
    stockThickness: cut.cut_thickness,
    // stock_label includes the user-entered material name (page.tsx line 454
    // prefers stock.material before falling back to dimensions). Falls back
    // to a generic label when null on legacy rows.
    materialName: cut.stock_label ?? "Material",
    profileTitle,
    tagMap,
    partsCompleted: cut.parts_completed,
    cutPieces: cut.cut_pieces,
    rollCount,
    materialUsedSqFt: cut.material_used_sqft,
    reusableOffcutSqFt: cut.reusable_offset_sqft,
    reusableOffcutPct,
    scrapSqFt: cut.scrap_sqft,
    scrapPct,
    fabScore: cut.fab_score,
    cutDate: cut.cut_date,
  }
}

/**
 * Render + upload the PDF for a cut row using the admin Supabase client.
 * Uses a deterministic storage path (`${userId}/${cutId}.pdf`) with upsert so
 * repeated regeneration overwrites in place rather than orphaning files.
 * Returns the public URL on success or null on upload/update failure.
 */
export async function uploadCutPdfWithAdmin(
  admin: SupabaseClient,
  cutId: string,
  userId: string,
  pdf: Blob
): Promise<string | null> {
  const fileName = `${userId}/${cutId}.pdf`
  const { error: uploadError } = await admin.storage
    .from("cut-history-pdfs")
    .upload(fileName, pdf, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    console.error("PDF upload failed:", uploadError)
    return null
  }

  const { data: urlData } = admin.storage.from("cut-history-pdfs").getPublicUrl(fileName)
  const publicUrl = urlData.publicUrl

  const { error: updateError } = await admin
    .from("cut_history")
    .update({ pdf_url: publicUrl })
    .eq("id", cutId)

  if (updateError) {
    // Surface the failure rather than returning the URL: callers treat
    // any non-null return as "row healed", but with `pdf_url` still null
    // in the DB the next page load would re-trigger this slow regen
    // path. Better to fail loudly so the user knows + retries (the
    // deterministic storage path means retry overwrites in place).
    console.error("Failed to persist PDF URL (storage object exists):", {
      cutId,
      publicUrl,
      updateError,
    })
    return null
  }

  return publicUrl
}

/**
 * End-to-end: render the PDF from the cut row + frozen layouts and persist
 * it. Returns the URL or null on any failure.
 */
export async function generateAndStoreCutPdf(
  admin: SupabaseClient,
  cut: CutHistory,
  userId: string,
  layouts: LayoutModel[]
): Promise<string | null> {
  const data = buildCutPdfDataFromRow(cut, layouts)
  const blob = await generateCutPdf({ svgElements: [], layouts, data })
  return uploadCutPdfWithAdmin(admin, cut.id, userId, blob)
}
