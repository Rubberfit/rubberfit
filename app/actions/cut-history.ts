"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  IRecordCutUseCase,
  RecordCutResult,
} from "@/src/application/use-cases/cuts/record-cut.use-case"
import {
  getCutPdfPublicUrl,
  safeRemoveOrphanedCutPdf,
} from "@/src/infrastructure/services/cutPdfStorageService"
import { getDatabaseClient } from "@/src/infrastructure/supabase/get-database-client"

import { requireAuthenticatedUser } from "@/app/server/auth/require-authenticated-user"
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
    result = await useCase.execute(
      dbClient,
      { ...rest, id: cutId, pdf_url: pdfUrl },
      actor.id
    )
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
