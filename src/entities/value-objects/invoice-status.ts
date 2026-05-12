import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"

/**
 * Lifecycle status of an `Invoice`. Mirrors the `invoices.status`
 * CHECK constraint.
 *
 * Happy path:
 *   draft → sent → paid
 *
 * Side transitions:
 *   • `sent → overdue`        — due-date passed without full payment
 *   • `overdue → paid`        — late collection
 *   • `* → void`              — allowed from anywhere except `paid`
 *
 * Both `paid` and `void` are terminal. Payment accumulation is
 * driven by `Invoice.recordPayment(amount)` which auto-flips status
 * to `paid` only when the running paid total equals `total`.
 */
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void"

export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "draft",
  "sent",
  "paid",
  "overdue",
  "void",
] as const

const ALLOWED_TRANSITIONS: Readonly<Record<InvoiceStatus, readonly InvoiceStatus[]>> = {
  draft: ["sent", "void"],
  sent: ["paid", "overdue", "void"],
  overdue: ["paid", "void"],
  paid: [],
  void: [],
}

export function isInvoiceStatus(value: unknown): value is InvoiceStatus {
  return typeof value === "string" && (INVOICE_STATUSES as readonly string[]).includes(value)
}

export function canInvoiceStatusTransitionTo(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return false
  return ALLOWED_TRANSITIONS[from].includes(to)
}

/**
 * Guard for entity-layer transitions. Throws `InvalidEntityError`
 * tagged as `Invoice` so error messages point to the aggregate, not
 * the VO file.
 */
export function assertInvoiceStatusTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!canInvoiceStatusTransitionTo(from, to)) {
    throw new InvalidEntityError("Invoice", `cannot transition status from '${from}' to '${to}'`)
  }
}
