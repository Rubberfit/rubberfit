import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"

/**
 * Lifecycle status of a `PurchaseOrder`. Mirrors the
 * `purchase_orders.status` CHECK constraint.
 *
 * Happy path:
 *   draft → pending_approval → approved → ordered →
 *     partial_received → received
 *
 * Side transitions:
 *   • `pending_approval → draft`  — rejection bounces back for edits
 *   • `* → cancelled`             — allowed from anywhere except `received`
 *
 * Both `received` and `cancelled` are terminal.
 *
 * Receipt recording flips `ordered` → `partial_received` or `received`
 * based on aggregate fill — that decision lives in the entity, not here.
 */
export type PoStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partial_received"
  | "received"
  | "cancelled"

export const PO_STATUSES: readonly PoStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "partial_received",
  "received",
  "cancelled",
] as const

const ALLOWED_TRANSITIONS: Readonly<Record<PoStatus, readonly PoStatus[]>> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "draft", "cancelled"],
  approved: ["ordered", "cancelled"],
  ordered: ["partial_received", "received", "cancelled"],
  partial_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
}

export function isPoStatus(value: unknown): value is PoStatus {
  return typeof value === "string" && (PO_STATUSES as readonly string[]).includes(value)
}

export function canPoStatusTransitionTo(from: PoStatus, to: PoStatus): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * Guard for entity-layer transitions. Throws `InvalidEntityError`
 * tagged as `PurchaseOrder` so error messages point to the aggregate,
 * not the VO file.
 */
export function assertPoStatusTransition(from: PoStatus, to: PoStatus): void {
  if (!canPoStatusTransitionTo(from, to)) {
    throw new InvalidEntityError(
      "PurchaseOrder",
      `cannot transition status from '${from}' to '${to}'`
    )
  }
}
