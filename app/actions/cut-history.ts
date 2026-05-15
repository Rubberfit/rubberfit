"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import { labelForPartId } from "@/src/application/cuts/part-labels"
import type {
  IRecordCutUseCase,
  RecordCutResult,
} from "@/src/application/use-cases/cuts/record-cut.use-case"
import type { IOrganizationPreferencesService } from "@/src/application/services/organization-preferences.service.interface"
import {
  formatDimensionsInches,
  getAreaUnitLabel,
  getDisplayAreaValue,
  type UnitDisplayPreferencesInput,
} from "@/src/application/preferences/user-unit-display"
import {
  formatUserDateTime,
  type UserDatePreferencesInput,
} from "@/src/application/preferences/user-date-format"
import { getCutHistoryRowsForExport } from "@/src/infrastructure/services/cutHistoryService"
import {
  getCutPdfPublicUrl,
  safeRemoveOrphanedCutPdf,
} from "@/src/infrastructure/services/cutPdfStorageService"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireActiveSubscription } from "@/app/server/auth/require-active-subscription"
import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
import { FeatureLockedError, requireFeature } from "@/app/server/auth/require-feature"
import { requirePermission } from "@/app/server/auth/require-permission"
import { ensureDatabaseFactoryRegistered } from "@/app/server/database/register-factory"

const CUT_HISTORY_PATH = "/dashboard/cutting-engine/history"

const uuid = z.string().uuid({ message: "Invalid id" })

const offcutPieceSchema = z.object({
  width_in: z.number().nonnegative(),
  length_in: z.number().nonnegative(),
})

// Mirrors `PartCustomDimensions` from supabase models — all fields
// optional because each shape (rectangle / trapezoid / arc / ...)
// uses a different subset.
const partCustomDimensionsSchema = z.object({
  width: z.number().nonnegative().optional(),
  length: z.number().nonnegative().optional(),
  diameter: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  topWidth: z.number().nonnegative().optional(),
  bottomWidth: z.number().nonnegative().optional(),
  innerRadius: z.number().nonnegative().optional(),
  outerRadius: z.number().nonnegative().optional(),
  arcDegrees: z.number().optional(),
})

// Public action shape mirrors `RecordCutInput` minus the server-owned
// `id` field (which the action injects from `cutId` after auth) and
// minus `actor` (use cases that take an actor receive it from
// `requireAuthenticatedUser`; this use case takes `userId` separately).
//
// `cutId` is NOT optional here — the "PDF first, INSERT second" save
// flow requires the browser to generate a UUID *before* uploading the
// PDF so the storage filename (`<userId>/<cutId>.pdf`) and the
// eventual cut_history.id stay aligned. A periodic orphan-PDF sweep
// (separate ticket) relies on that alignment.
//
// `pdfUploaded` (boolean) replaced the previous `pdf_url: string|null`
// field on the wire. Sigilix flagged on PR #197 that accepting any
// URL string lets a malicious authenticated client store
// `pdf_url: "https://evil.com/phish.pdf"` in an immutable cut_history
// row (no UPDATE policy to correct it later) — stored phishing /
// SSRF vector. The server now constructs the URL itself from
// `actor.id` + `cutId` using the storage SDK, so the value is
// deterministic and the client only needs to signal "did the upload
// succeed?". A `false` (or absent) value persists `pdf_url = null`.
const saveCutSchema = z.object({
  cutId: uuid,
  pdfUploaded: z.boolean().optional(),
  material_id: z.number().int().nonnegative(),
  part_id: z.number().int().positive(),
  roll_id: uuid.nullable().optional(),
  job_id: uuid.nullable().optional(),
  offcut_pieces: z.array(offcutPieceSchema).optional(),
  cut_length: z.number().nonnegative(),
  cut_width: z.number().nonnegative(),
  cut_thickness: z.number().nonnegative(),
  kerf: z.number().nonnegative().optional(),
  cut_amount: z.number().int().positive(),
  part_custom_width: z.number().nonnegative().nullable().optional(),
  part_custom_height: z.number().nonnegative().nullable().optional(),
  part_custom_dimensions: z.array(partCustomDimensionsSchema).nullable().optional(),
  part_selected_size: z.array(z.number().int()).optional(),
  part_selected_size_text: z.array(z.string()).optional(),
  part_selected_label: z.array(z.string()).optional(),
  parts_completed: z.number().int().positive(),
  cut_pieces: z.number().int().positive(),
  material_used_sqft: z.number().nonnegative(),
  reusable_offset_sqft: z.number().nonnegative(),
  scrap_sqft: z.number().nonnegative(),
  fab_score: z.number().min(0).max(1),
  stock_label: z.string().nullable().optional(),
  cost_per_sqft: z.number().nonnegative().nullable().optional(),
  source: z.enum(["auto", "manual"]).optional(),
  layout_json: z.unknown().optional(),
})

export type SaveCutActionInput = z.input<typeof saveCutSchema>

/**
 * Server action for the "PDF first, INSERT second" cut-save flow.
 *
 *   1. Browser generates `cutId = crypto.randomUUID()` and uploads the
 *      cut-report PDF directly to Supabase Storage at
 *      `cut-history-pdfs/<userId>/<cutId>.pdf` (storage RLS enforces
 *      the per-user folder; see migration 20260420000001).
 *   2. Browser invokes this action with `{ cutId, pdfUploaded, ...cutData }`.
 *      `pdfUploaded` is a boolean signal — the action constructs the
 *      authoritative `pdf_url` server-side from `actor.id` + `cutId`,
 *      ignoring any URL the client might try to inject.
 *   3. Action authenticates the caller, runs RBAC, resolves the
 *      cookie-bound (RLS-respecting) Supabase client, and forwards to
 *      `RecordCutUseCase` with `id = cutId` and the server-constructed
 *      `pdf_url` populated. cut_history is write-once (see migration
 *      20260412055550 — no UPDATE policy), so pdf_url MUST arrive at
 *      INSERT time.
 *   4. On INSERT failure, the action removes the orphaned PDF object
 *      from storage via `safeRemoveOrphanedCutPdf` — which checks for
 *      an existing row before deleting, so a duplicate-submit race
 *      can't drop a file that a successfully-persisted row references.
 *
 * Action IDs ship in the client bundle and are callable by hash, so
 * the auth + permission + zod parse here are the security boundary —
 * `proxy.ts` does not see action invocations.
 *
 * The use-case insert runs through the *cookie-bound* request client,
 * not a service-role client. That makes the new
 * `cut_history_insert_own` RLS policy actually apply at the user's
 * write — the database boundary now enforces `user_id = auth.uid()`
 * for the ordinary save path. Service-role escape stays available for
 * admin endpoints (cleanup, sweeps) where it's intentional.
 */
export async function saveCut(input: SaveCutActionInput): Promise<RecordCutResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  await requireActiveSubscription(actor)
  requirePermission(actor, "createCut")
  const parsed = saveCutSchema.parse(input)

  const dbClient = await getDatabaseClient()

  // Server-construct the PDF URL from actor.id + cutId. Client only
  // signals presence/absence via `pdfUploaded`. See the schema doc-
  // comment for why this matters.
  const pdfUrl = parsed.pdfUploaded ? await getCutPdfPublicUrl(actor.id, parsed.cutId) : null

  const useCase = resolveUseCase<IRecordCutUseCase>(TOKENS.IRecordCutUseCase)

  const { cutId, pdfUploaded, ...rest } = parsed
  void pdfUploaded
  let result: RecordCutResult
  try {
    result = await useCase.execute(dbClient, { ...rest, id: cutId, pdf_url: pdfUrl }, actor.id)
  } catch (err) {
    // `useCase.execute` returns RecordCutFailure on validation /
    // insert errors rather than throwing, but defend against
    // unexpected throws (DB connection death, etc.). Cleanup is
    // safe — `safeRemoveOrphanedCutPdf` only deletes if no row
    // exists for cutId.
    await safeRemoveOrphanedCutPdf(actor.id, cutId)
    throw err
  }

  if (!result.ok) {
    await safeRemoveOrphanedCutPdf(actor.id, cutId)
    return result
  }

  revalidatePath(CUT_HISTORY_PATH)
  return result
}

const EXPORT_MAX_ROWS = 10_000

const exportCutHistoryCsvSchema = z.object({
  cutIds: z.array(uuid).max(EXPORT_MAX_ROWS),
})

export type ExportCutHistoryCsvInput = z.input<typeof exportCutHistoryCsvSchema>

/**
 * CSV column headers. Area columns interpolate the org's area unit
 * label (`sq ft` for imperial, `m²` for metric) at build time so the
 * spreadsheet header sentence matches the cell values below it.
 */
function buildCsvHeaders(prefs: UnitDisplayPreferencesInput | undefined): readonly string[] {
  const areaUnit = getAreaUnitLabel(prefs)
  return [
    "Cut Date",
    "Part Type",
    "Stock (W×L×T)",
    "Qty",
    "Parts Done",
    `Mat Used (${areaUnit})`,
    `Reuse (${areaUnit})`,
    `Scrap (${areaUnit})`,
    "Fab Score",
  ] as const
}

/**
 * Per-row CSV cell escape. Wraps values containing comma, quote, or
 * newline in double-quotes and doubles any embedded quotes. Keeps the
 * output spreadsheet-friendly (Excel + Numbers + Google Sheets).
 */
function csvCell(value: string | number): string {
  const s = typeof value === "number" ? String(value) : value
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export type ExportCutHistoryCsvResult =
  | { ok: true; csv: string }
  | { ok: false; reason: "FEATURE_LOCKED"; requiredTier: string; currentTier: string }

/**
 * Pro-gated CSV export of cut-history rows. Receives the IDs the
 * client currently has displayed (already filtered by search /
 * favorites / user-select / date-range) and returns either the CSV
 * string or a discriminated `{ ok: false, reason: "FEATURE_LOCKED" }`.
 *
 * Why a result object instead of throwing FeatureLockedError:
 *   Next.js server actions serialize thrown errors as generic
 *   `Error` instances on the client — custom properties like `code`
 *   are stripped in production builds. The client UX (open
 *   UpgradeModal vs show generic toast) depends on a reliable
 *   feature-locked discriminator that survives that boundary, so we
 *   return the failure case explicitly. Auth failures
 *   (UnauthenticatedError, ForbiddenError) and bad-input zod errors
 *   still throw — those are programmer-error / 401-class signals
 *   the client doesn't need to discriminate against.
 *
 * Order: `cut_date DESC`. The client's display sort (favorites first)
 * is intentionally NOT preserved — a spreadsheet user wants
 * chronological order, not UX-pinned ordering.
 *
 * RLS is the security boundary on row scope — the cookie-bound
 * client only returns cuts the actor's org can see.
 */
export async function exportCutHistoryCsv(
  input: ExportCutHistoryCsvInput
): Promise<ExportCutHistoryCsvResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  const subscription = await requireActiveSubscription(actor)
  requirePermission(actor, "viewCutHistory")
  try {
    await requireFeature(actor, "cut_history_exports")
  } catch (err) {
    if (err instanceof FeatureLockedError) {
      return {
        ok: false,
        reason: "FEATURE_LOCKED",
        requiredTier: err.requiredTier,
        currentTier: err.currentTier,
      }
    }
    throw err
  }
  const parsed = exportCutHistoryCsvSchema.parse(input)

  // Org-level print prefs drive the CSV per the operator-seeds-prints
  // ruling — the exported artifact speaks the operator's voice
  // (date format, time zone, locale, unit system) regardless of the
  // viewer's per-user prefs. Best-effort: any prefs lookup error logs
  // and falls back to imperial / MM/dd/yyyy / America/Chicago so the
  // export never blocks on a missing prefs row.
  const organizationPreferences = await loadOrgPrintPrefs(subscription.organizationId)
  const headerCells = buildCsvHeaders(organizationPreferences)
  const header = headerCells.map(csvCell).join(",")
  if (parsed.cutIds.length === 0) {
    return { ok: true, csv: header }
  }

  const db = await getDatabaseClient()
  const data = await getCutHistoryRowsForExport(db, parsed.cutIds)

  const rows = data.map((cut) => {
    const cells = [
      formatUserDateTime(cut.cut_date, organizationPreferences) || "",
      labelForPartId(cut.part_id),
      formatDimensionsInches(
        [cut.cut_width, cut.cut_length, cut.cut_thickness],
        organizationPreferences,
        { precision: 3 }
      ),
      String(cut.cut_amount),
      String(cut.parts_completed),
      getDisplayAreaValue(cut.material_used_sqft, organizationPreferences).toFixed(2),
      getDisplayAreaValue(cut.reusable_offset_sqft, organizationPreferences).toFixed(2),
      getDisplayAreaValue(cut.scrap_sqft, organizationPreferences).toFixed(2),
      `${Math.round(cut.fab_score * 100)}%`,
    ]
    return cells.map(csvCell).join(",")
  })

  return { ok: true, csv: [header, ...rows].join("\n") }
}

/**
 * Best-effort fetch of the org-level print preferences for the
 * subscription's organization. Server-action context: the prefs
 * service is registered in DI; resolving + reading goes through the
 * cookie-bound database client (RLS-respecting). Any error is logged
 * and undefined is returned so the CSV export still produces a
 * spreadsheet-shaped artifact with helper defaults.
 */
async function loadOrgPrintPrefs(
  organizationId: string
): Promise<(UnitDisplayPreferencesInput & UserDatePreferencesInput) | undefined> {
  try {
    const prefsService = resolveUseCase<IOrganizationPreferencesService>(
      TOKENS.IOrganizationPreferencesService
    )
    return await prefsService.getForOrganization(organizationId)
  } catch (error) {
    console.error("[exportCutHistoryCsv] failed to resolve org print prefs", error)
    return undefined
  }
}
