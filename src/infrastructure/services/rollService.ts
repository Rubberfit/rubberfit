import "reflect-metadata"
import { inject, injectable } from "tsyringe"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { IRollsRepository } from "@/src/application/repositories/rolls.repository.interface"
import type { IRollService } from "@/src/application/services/roll.service.interface"
import {
  type BarcodeFormat,
  type CreateRollProps,
  Roll,
} from "@/src/entities/roll"
import type { ProfileId } from "@/src/entities/value-objects/id"
import { rollsRepository } from "@/src/infrastructure/repositories/rolls.repository"
import { TOKENS } from "@/di/tokens"

@injectable()
export class RollService implements IRollService {
  constructor(
    @inject(TOKENS.IRollsRepository)
    private readonly repo: IRollsRepository
  ) {}

  getById(id: string): Promise<Roll> {
    return this.repo.findById(id)
  }

  getActive(): Promise<Roll[]> {
    return this.repo.findActive()
  }

  getByMaterialType(materialTypeId: string): Promise<Roll[]> {
    return this.repo.findByMaterialType(materialTypeId)
  }

  getChildOffcuts(parentRollId: string): Promise<Roll[]> {
    return this.repo.findChildOffcuts(parentRollId)
  }

  createRoll(props: CreateRollProps): Promise<Roll> {
    const roll = Roll.create(props)
    return this.repo.insert(roll)
  }

  async consumeLength(id: string, mm: number, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.consumeLength(mm, actor)
    return this.repo.update(roll)
  }

  async reserve(id: string, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.reserve(actor)
    return this.repo.update(roll)
  }

  async release(id: string, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.release(actor)
    return this.repo.update(roll)
  }

  async relocate(id: string, location: string | null, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.relocate(location, actor)
    return this.repo.update(roll)
  }

  async updateNotes(id: string, notes: string | null, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.updateNotes(notes, actor)
    return this.repo.update(roll)
  }

  async recordBarcode(
    id: string,
    format: BarcodeFormat,
    assetPath: string,
    actor: ProfileId
  ): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.recordBarcode(format, assetPath, actor)
    return this.repo.update(roll)
  }

  async recordQrGenerated(id: string, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.recordQrGenerated(actor)
    return this.repo.update(roll)
  }

  async softDelete(id: string, actor: ProfileId): Promise<Roll> {
    const roll = await this.repo.findById(id)
    roll.softDelete(actor)
    return this.repo.update(roll)
  }
}

/**
 * Module-level singleton bound to the concrete `rollsRepository`. New
 * consumers (use-cases, server actions) resolve through DI; legacy
 * `app/` consumers that imported the old `rollService` re-export are
 * routed through `legacyRollService` instead — they keep their raw-row
 * shape until the relevant UI surface is rewritten.
 */
export const rollService: IRollService = new RollService(rollsRepository)

/**
 * Public-facing projection of a roll — the subset of columns safe to
 * embed in the unauthenticated `/r/[partNumber]/pdf` scan endpoint.
 * Adding a column here is a security-relevant change.
 */
export interface PublicRoll {
  id: string
  part_number: string | null
  material_type: string
  width: number
  length: number
  thickness: number
  remaining_length: number
  status: "active" | "depleted" | "reserved"
  color: string | null
  location: string | null
  date_received: string | null
  is_offcut: boolean
  parent_roll_id: string | null
}

const PUBLIC_ROLL_COLUMNS =
  "id, part_number, material_type, width, length, thickness, remaining_length, status, color, location, date_received, is_offcut, parent_roll_id"

/**
 * Looks up a roll by `part_number` first; falls back to `id` if the
 * input looks like a UUID. Returns `null` if neither lookup hits — the
 * route maps that to a 404. Caller passes a service-role client because
 * this is an unauthenticated public endpoint.
 */
export async function getPublicRollByPartNumberOrId(
  client: SupabaseClient,
  partNumberOrId: string
): Promise<PublicRoll | null> {
  const cleaned = partNumberOrId.trim()
  if (!cleaned) return null

  const byPart = await client
    .from("rolls")
    .select(PUBLIC_ROLL_COLUMNS)
    .eq("part_number", cleaned)
    .maybeSingle()
  if (byPart.error) {
    console.error("rollService.getPublicRollByPartNumberOrId byPart error:", byPart.error)
    throw byPart.error
  }
  if (byPart.data) return byPart.data as unknown as PublicRoll

  const isUuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)
  if (!isUuidLike) return null

  const byId = await client
    .from("rolls")
    .select(PUBLIC_ROLL_COLUMNS)
    .eq("id", cleaned)
    .maybeSingle()
  if (byId.error) {
    console.error("rollService.getPublicRollByPartNumberOrId byId error:", byId.error)
    throw byId.error
  }

  return (byId.data as unknown as PublicRoll | null) ?? null
}
