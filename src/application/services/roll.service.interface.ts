import type { CreateRollProps, Roll } from "@/src/entities/roll"
import type { BarcodeFormat } from "@/src/entities/roll"
import type { ProfileId } from "@/src/entities/value-objects/id"

/**
 * Roll inventory service. Wraps the `rolls` aggregate with strict
 * state-machine discipline (mirrors `Roll` entity):
 *
 * - `consumeLength` is the only path that decrements `remainingLengthMm`.
 *   The entity auto-flips status → `depleted` at zero. Cross-aggregate
 *   side effects (recording `cut_history`, allocating reusable offcuts)
 *   are use-case concerns — see the upcoming cut-recording use-cases.
 * - `reserve` / `release` set the whole roll aside; not callable on
 *   depleted rolls.
 * - `relocate` / `updateNotes` cover metadata.
 * - `recordBarcode` / `recordQrGenerated` track barcode and QR artifact
 *   generation.
 * - `softDelete` is admin-only and independent of status.
 *
 * Reads return entity instances. Cross-cutting queries that need joined
 * material-type / supplier shapes (dashboard cards, inventory lists)
 * stay on `legacyRollService` until the relevant UI page is rewritten.
 */
export interface IRollService {
  getById(id: string): Promise<Roll>
  getActive(): Promise<Roll[]>
  getByMaterialType(materialTypeId: string): Promise<Roll[]>
  getChildOffcuts(parentRollId: string): Promise<Roll[]>

  createRoll(props: CreateRollProps): Promise<Roll>

  consumeLength(id: string, mm: number, actor: ProfileId): Promise<Roll>
  reserve(id: string, actor: ProfileId): Promise<Roll>
  release(id: string, actor: ProfileId): Promise<Roll>
  relocate(id: string, location: string | null, actor: ProfileId): Promise<Roll>
  updateNotes(id: string, notes: string | null, actor: ProfileId): Promise<Roll>
  recordBarcode(
    id: string,
    format: BarcodeFormat,
    assetPath: string,
    actor: ProfileId
  ): Promise<Roll>
  recordQrGenerated(id: string, actor: ProfileId): Promise<Roll>
  softDelete(id: string, actor: ProfileId): Promise<Roll>
}
