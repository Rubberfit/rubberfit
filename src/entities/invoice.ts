import type { Money } from "./value-objects"
import type { AuditFields, SoftDeletable } from "./shared"

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void"

export interface Invoice extends AuditFields, SoftDeletable {
  id: string
  tenantId: string
  projectId: string | null
  personId: string | null
  billingAddressId: string | null
  invoiceNumber: string
  issueDate: string
  dueDate: string | null
  status: InvoiceStatus
  currency: string
  subtotal: Money
  tax: Money
  discount: Money
  total: Money
  paid: Money
  balance: Money
  paymentTerms: string | null
  notes: string | null
  pdfUrl: string | null
  sentAt: string | null
  paidAt: string | null
}
