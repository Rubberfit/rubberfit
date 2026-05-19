import { type SupabaseClient } from "@supabase/supabase-js"

import { generateCutPdf } from "@/app/dashboard/cutting-engine/_components/cut-history-pdf"
import type { CutPdfData } from "@/app/dashboard/cutting-engine/_components/cut-history-pdf"
import {
  type LayoutModel,
  isLayoutModelArray,
} from "@/app/dashboard/cutting-engine/_components/layout-model"
import { PART_OPTIONS } from "@/app/dashboard/cutting-engine/_components/preset-template-data"
import type { CutHistory } from "@/src/infrastructure/models/supabase"
import {
  type CutHistoryLayoutJson,
  isSupportedLayoutJsonVersion,
} from "@/src/infrastructure/models/cut-history-layout"
import { uploadCutPdfBlob } from "@/src/infrastructure/services/cutPdfStorageService"
import {
  getOrgPreferencesForOwner,
  type OrgPrintPreferencesInput,
} from "@/src/infrastructure/services/cut-pdf-prefs-lookup"

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
 *
 * Accepts any envelope `version` in the supported set (currently `{1, 2}`).
 * v1 rows lack the polygon-with-holes sibling field on parts; v2 rows MAY
 * carry it. The downstream `isLayoutModel` guard already treats `holes` as
 * optional, so both versions deserialize through the same path — the
 * version check here is the explicit fence against unknown future
 * schemas getting interpreted with current renderers.
 */
export function extractAutoLayouts(layoutJson: CutHistoryLayoutJson | null): LayoutModel[] | null {
  if (!layoutJson || layoutJson.kind !== "auto") return null
  if (!isSupportedLayoutJsonVersion(layoutJson.version)) return null
  return isLayoutModelArray(layoutJson.layouts) ? layoutJson.layouts : null
}

/**
 * Re-derive the PDF payload from a persisted cut row + frozen layouts.
 * The save-time path (page.tsx) builds this from live engine state; this is
 * the recovery path that has only the row + layout snapshot to work with.
 */
export function buildCutPdfDataFromRow(
  cut: CutHistory,
  layouts: LayoutModel[],
  organizationPreferences?: OrgPrintPreferencesInput
): CutPdfData {
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
    organizationPreferences,
  }
}

/**
 * End-to-end: render the PDF from the cut row + frozen layouts, then
 * persist via the infra-layer storage service. Returns the URL or
 * `null` on any failure.
 */
export async function generateAndStoreCutPdf(
  admin: SupabaseClient,
  cut: CutHistory,
  userId: string,
  layouts: LayoutModel[]
): Promise<string | null> {
  const organizationPreferences = await getOrgPreferencesForOwner(admin, userId)
  const data = buildCutPdfDataFromRow(cut, layouts, organizationPreferences)
  const blob = await generateCutPdf({ svgElements: [], layouts, data })
  return uploadCutPdfBlob(admin, cut.id, userId, blob)
}
