import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import { TOKENS } from "@/di/tokens"
import type { IRollInventoryService } from "@/src/application/services/roll-inventory.service.interface"
import {
  insertCutHistory,
  type CutHistoryInsert,
} from "@/src/infrastructure/services/cutHistoryService"
import { resolveOffcutPieces } from "@/src/infrastructure/services/rollInventoryService"
import { maybeAutoCompleteJob } from "@/src/infrastructure/repositories/jobs.repository"
import type {
  CutHistory,
  CutHistoryLayoutJson,
  PartCustomDimensions,
} from "@/src/infrastructure/models/supabase"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const r2 = (n: number): number => Math.round(n * 100) / 100
const r4 = (n: number): number => Math.round(n * 10000) / 10000

export interface OffcutPiecePayload {
  width_in: number
  length_in: number
}

export interface RecordCutInput {
  material_id: number
  part_id: number
  roll_id?: string | null
  job_id?: string | null
  offcut_pieces?: OffcutPiecePayload[]
  cut_length: number
  cut_width: number
  cut_thickness: number
  /**
   * Saw-blade kerf width in inches (inter-part clearance the packer
   * enforced). Optional in the wire payload for back-compat with old
   * clients; the DB column has a default so omitted values land as
   * 0.125".
   */
  kerf?: number
  cut_amount: number
  part_custom_width?: number | null
  part_custom_height?: number | null
  part_custom_dimensions?: PartCustomDimensions[] | null
  part_selected_size?: number[]
  part_selected_size_text?: string[]
  part_selected_label?: string[]
  parts_completed: number
  cut_pieces: number
  material_used_sqft: number
  reusable_offset_sqft: number
  scrap_sqft: number
  fab_score: number
  stock_label?: string | null
  cost_per_sqft?: number | null
  source?: "auto" | "manual"
  layout_json?: unknown
}

export type ValidationFailure = { field: string; message: string }

export interface RecordCutSuccess {
  ok: true
  cut: CutHistory
}

export interface RecordCutFailure {
  ok: false
  status: 400 | 500
  error: string
  detail?: string
  code?: string
}

export type RecordCutResult = RecordCutSuccess | RecordCutFailure

export interface IRecordCutUseCase {
  execute(client: SupabaseClient, body: RecordCutInput, userId: string): Promise<RecordCutResult>
}

/**
 * Validate the request body. Returns the first failure encountered or
 * `null` when the body is well-formed. Pure — split out for unit
 * testing without the rest of the use-case.
 */
export function validateRecordCutInput(input: RecordCutInput): ValidationFailure | null {
  const nonNeg = {
    cut_length: input.cut_length,
    cut_width: input.cut_width,
    cut_thickness: input.cut_thickness,
    material_used_sqft: input.material_used_sqft,
    reusable_offset_sqft: input.reusable_offset_sqft,
    scrap_sqft: input.scrap_sqft,
    fab_score: input.fab_score,
  }
  for (const [key, val] of Object.entries(nonNeg)) {
    if (typeof val !== "number" || !isFinite(val) || val < 0) {
      return { field: key, message: `Missing or invalid required field: ${key}` }
    }
  }
  if (
    typeof input.material_id !== "number" ||
    !Number.isInteger(input.material_id) ||
    input.material_id < 0
  ) {
    return {
      field: "material_id",
      message: "Missing or invalid required field: material_id",
    }
  }
  const positiveInts = {
    part_id: input.part_id,
    cut_amount: input.cut_amount,
    parts_completed: input.parts_completed,
    cut_pieces: input.cut_pieces,
  }
  for (const [key, val] of Object.entries(positiveInts)) {
    if (typeof val !== "number" || !Number.isInteger(val) || val < 1) {
      return { field: key, message: `Missing or invalid required field: ${key}` }
    }
  }
  return null
}

function buildInsertPayload(
  body: RecordCutInput,
  userId: string,
  rollId: string | null,
  jobId: string | null
): CutHistoryInsert {
  const costPerSqft =
    body.cost_per_sqft != null && isFinite(body.cost_per_sqft) && body.cost_per_sqft >= 0
      ? r2(body.cost_per_sqft)
      : null
  return {
    user_id: userId,
    roll_id: rollId,
    job_id: jobId,
    job_part_id: null,
    material_id: body.material_id,
    part_id: body.part_id,
    cut_length: r2(body.cut_length),
    cut_width: r2(body.cut_width),
    cut_thickness: r2(body.cut_thickness),
    // Round to 4dp so a 0.125" kerf round-trips exactly. Defaulted to
    // the column's default when omitted by the client.
    kerf: body.kerf != null && isFinite(body.kerf) && body.kerf >= 0 ? r4(body.kerf) : 0.125,
    cut_amount: body.cut_amount,
    parts_completed: body.parts_completed,
    cut_pieces: body.cut_pieces,
    material_used_sqft: r2(body.material_used_sqft),
    reusable_offset_sqft: r2(body.reusable_offset_sqft),
    scrap_sqft: r2(body.scrap_sqft),
    fab_score: r2(body.fab_score),
    part_custom_width: body.part_custom_width != null ? r2(body.part_custom_width) : null,
    part_custom_height: body.part_custom_height != null ? r2(body.part_custom_height) : null,
    part_custom_dimensions: body.part_custom_dimensions ?? null,
    part_selected_size: body.part_selected_size ?? null,
    part_selected_size_text: body.part_selected_size_text ?? null,
    part_selected_label: body.part_selected_label ?? null,
    stock_label: body.stock_label?.trim() || null,
    cost_per_sqft: costPerSqft,
    pdf_url: null,
    source: body.source === "manual" ? "manual" : "auto",
    layout_json: body.layout_json != null ? (body.layout_json as CutHistoryLayoutJson) : null,
  }
}

function parseUuidField(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value : null
}

@injectable()
export class RecordCutUseCase implements IRecordCutUseCase {
  constructor(
    @inject(TOKENS.IRollInventoryService)
    private readonly rollInventory: IRollInventoryService
  ) {}

  private async reconcileInventory(
    client: SupabaseClient,
    rollId: string,
    userId: string,
    cutId: string,
    body: RecordCutInput
  ): Promise<void> {
    const parent = await this.rollInventory.getParentRoll(client, rollId)
    if (!parent) return
    await this.rollInventory.decrementRollLength(client, rollId, body.cut_length)
    const pieces = resolveOffcutPieces({
      offcutPieces: body.offcut_pieces,
      reusableSqFt: body.reusable_offset_sqft,
      parentRollWidth: parent.width,
    })
    if (pieces.length === 0) return
    await this.rollInventory.spawnOffcuts(client, {
      parentRoll: parent,
      parentRollId: rollId,
      userId,
      cutId,
      pieces,
    })
  }

  async execute(
    client: SupabaseClient,
    body: RecordCutInput,
    userId: string
  ): Promise<RecordCutResult> {
    const validation = validateRecordCutInput(body)
    if (validation) {
      return { ok: false, status: 400, error: validation.message }
    }

    const rollId = parseUuidField(body.roll_id)
    const jobId = parseUuidField(body.job_id)
    const insert = buildInsertPayload(body, userId, rollId, jobId)

    let cut: CutHistory
    try {
      cut = await insertCutHistory(client, insert)
    } catch (err) {
      const e = err as { message?: string; code?: string }
      return {
        ok: false,
        status: 500,
        error: "Failed to record cut",
        detail: e.message,
        code: e.code,
      }
    }

    if (rollId) {
      await this.reconcileInventory(client, rollId, userId, cut.id, body)
    }

    if (jobId) {
      try {
        await maybeAutoCompleteJob(client, jobId)
      } catch (err) {
        // Best-effort — never block the cut record.
        console.error("maybeAutoCompleteJob threw:", err)
      }
    }

    return { ok: true, cut }
  }
}
