import type { CreateRollProps, Roll } from "@/src/entities/roll"
import type { BarcodeFormat } from "@/src/entities/roll"
import type { ProfileId } from "@/src/entities/value-objects/id"
import type {
  Roll as RollRow,
  RollReusableOffcutSummary,
} from "@/src/infrastructure/models/supabase"

/**
 * Roll inventory service. Wraps the `rolls` aggregate with strict
 * state-machine discipline (mirrors `Roll` entity):
 *
 * - `consumeLength` is the only path that decrements `remainingLengthMm`.
 *   The entity auto-flips status → `depleted` at zero. Cross-aggregate
 *   side effects (recording `cut_history`, allocating reusable offcuts)
 *   are use-case concerns — see the cut-recording use-cases.
 * - `reserve` / `release` set the whole roll aside; not callable on
 *   depleted rolls.
 * - `relocate` / `updateNotes` cover metadata.
 * - `recordBarcode` / `recordQrGenerated` track barcode and QR artifact
 *   generation.
 * - `softDelete` is admin-only and independent of status.
 *
 * Entity-typed reads return `Roll` instances. The transitional raw-row
 * read methods at the bottom of this interface return the legacy
 * `RollRow` shape from `@/src/infrastructure/models/supabase` — the
 * inventory / cutting / dashboard UI consumers still read raw columns
 * (`material_type` text, `cost_per_sqft`, `remaining_length`, ...), so
 * the wire shape must stay raw until per-page rewrites land. Mirrors
 * the `ICutHistoryService` `*Raw` pattern.
 */
export interface IRollService {
  getById(id: string): Promise<Roll>
  getActive(): Promise<Roll[]>
  getByMaterialType(materialTypeId: string): Promise<Roll[]>
  getChildOffcuts(parentRollId: string): Promise<Roll[]>

  /**
   * Returns the matching non-deleted roll for a PO item, or `null` if
   * none exists. Used by 7c-2 admin reconcile's stale-stamp recovery —
   * when `roll_created_at` is NULL on a receipt but a matching roll
   * actually exists, the use-case stamps the receipt rather than
   * creating a duplicate.
   */
  findByPurchaseOrderItemId(purchaseOrderItemId: string): Promise<Roll | null>

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

  // ─── Transitional raw-row reads + write ─────────────────────────────────
  //
  // Pass-throughs to the deprecated `IRollsRepository` raw-row surface.
  // They retire with each UI surface's own migration to entity-typed
  // reads. Consumers are: dashboard summary cards, inventory drawer,
  // sidebar low-stock badge, waste-comparison material join, PDF
  // report generator, materials/types FK pre-flight, and the quick-
  // create server action.

  /** Newest-first list of every roll regardless of status. */
  getAllRolls(): Promise<RollRow[]>

  /** Active rolls ordered by material type — dashboard + low-stock generator. */
  getActiveRolls(): Promise<RollRow[]>

  /** Newest-by-created N rolls — dashboard activity card. */
  getRecentRolls(limit: number): Promise<RollRow[]>

  /** Newest-by-updated N rolls — activity timeline. */
  getRecentlyUpdatedRolls(limit: number): Promise<RollRow[]>

  /** Sum of (width * remaining_length / 144) * cost_per_sqft over active rolls. */
  getInventoryValue(): Promise<number>

  /** Number of material types whose total active stock is under the min-stock threshold. */
  getLowStockCount(): Promise<number>

  /** FK pre-flight before deleting a material type. */
  existsByMaterialType(materialTypeName: string): Promise<boolean>

  /** rollId → material_type text map, for cuts→rolls joins on the analytics pages. */
  getRollMaterialTypeMap(): Promise<Map<string, string>>

  /** cut_history-derived usage aggregate for the inventory drawer. */
  getReusableOffcutSummary(rollId: string): Promise<RollReusableOffcutSummary | null>

  /** Raw-row insert used by the inventory quick-create server action. */
  addRoll(
    roll: Omit<RollRow, "id" | "user_id" | "created_at" | "updated_at">,
    userId?: string
  ): Promise<RollRow>

  /**
   * Raw-row offcut listing for the inventory drawer. The entity-typed
   * `getChildOffcuts` (above) returns hydrated `Roll` instances; this
   * variant returns the legacy row shape the drawer UI still consumes.
   */
  getChildOffcutsRaw(parentRollId: string): Promise<RollRow[]>
}
