"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { resolveUseCase } from "@/di/resolve"
import { TOKENS } from "@/di/tokens"
import type {
  IRecordCutUseCase,
  RecordCutResult,
} from "@/src/application/use-cases/cuts/record-cut.use-case"
import { removeOrphanedCutPdf } from "@/src/infrastructure/services/cutPdfStorageService"
import { makeAdminClient } from "@/src/infrastructure/supabase/server-clients"

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
const saveCutSchema = z.object({
  cutId: uuid,
  pdf_url: z.string().url().nullable().optional(),
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
 *   2. Browser invokes this action with `{ cutId, pdf_url, ...cutData }`.
 *   3. Action authenticates the caller, runs RBAC, and forwards to
 *      `RecordCutUseCase` with `id = cutId` and `pdf_url` already
 *      populated. cut_history is write-once (see migration
 *      20260412055550 — no UPDATE policy), so pdf_url MUST arrive at
 *      INSERT time.
 *   4. On INSERT failure, the action removes the orphaned PDF object
 *      from storage. Best-effort — failures are logged but do not
 *      mask the original error.
 *
 * Action IDs ship in the client bundle and are callable by hash, so
 * the auth + permission + zod parse here are the security boundary —
 * `proxy.ts` does not see action invocations.
 */
export async function saveCut(input: SaveCutActionInput): Promise<RecordCutResult> {
  ensureDatabaseFactoryRegistered()
  const actor = await requireAuthenticatedUser()
  requirePermission(actor, "createCut")
  const parsed = saveCutSchema.parse(input)

  const adminClient = makeAdminClient()
  if (!adminClient) {
    return {
      ok: false,
      status: 500,
      error: "Server configuration error: SUPABASE_SERVICE_ROLE_KEY is not set",
    }
  }

  const useCase = resolveUseCase<IRecordCutUseCase>(TOKENS.IRecordCutUseCase)

  const { cutId, ...rest } = parsed
  let result: RecordCutResult
  try {
    result = await useCase.execute(adminClient, { ...rest, id: cutId }, actor.id)
  } catch (err) {
    await removeOrphanedCutPdf(actor.id, cutId)
    throw err
  }

  if (!result.ok) {
    await removeOrphanedCutPdf(actor.id, cutId)
    return result
  }

  revalidatePath(CUT_HISTORY_PATH)
  return result
}
