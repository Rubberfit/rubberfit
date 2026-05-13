import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { nullableEqual } from "@/src/entities/shared/equality"
import { trimOptional, trimRequired } from "@/src/entities/shared/string-helpers"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  InvoiceId,
  PersonId,
  ProfileId,
  ProjectId,
  TenantId,
} from "@/src/entities/value-objects/id"
import {
  PostalAddress,
  type PostalAddressSnapshot,
} from "@/src/entities/value-objects/postal-address"
import {
  assertInvoiceStatusTransition,
  isInvoiceStatus,
  type InvoiceStatus,
} from "@/src/entities/value-objects/invoice-status"
import { Money, type MoneySnapshot } from "@/src/entities/value-objects/money"

// ─── Constants (mirror DB column lengths / checks) ─────────────────────────

const INVOICE_NUMBER_MAX = 50
const PAYMENT_TERMS_MAX = 200
const PDF_URL_MAX = 500

// ─── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateInvoiceProps {
  id: InvoiceId
  tenantId: TenantId
  /**
   * Resolved by the caller from the supplier-side currency, the
   * tenant settings default, or the project's currency. The DB
   * schema does NOT persist currency on the invoice row — the mapper
   * must inject it on reconstitute.
   */
  currency: Currency
  invoiceNumber: string
  projectId?: ProjectId | null
  personId?: PersonId | null
  billingAddress?: PostalAddress | null
  issueDate?: Date
  dueDate?: Date | null
  status?: InvoiceStatus
  subtotal?: Money | null
  tax?: Money | null
  discount?: Money | null
  paid?: Money | null
  paymentTerms?: string | null
  notes?: string | null
  pdfUrl?: string | null
  sentAt?: Date | null
  paidAt?: Date | null
  createdBy?: ProfileId | null
}

export interface ReconstituteInvoiceProps {
  id: InvoiceId
  tenantId: TenantId
  projectId: ProjectId | null
  personId: PersonId | null
  billingAddress: PostalAddress | null
  invoiceNumber: string
  issueDate: Date
  dueDate: Date | null
  status: InvoiceStatus
  subtotal: Money
  tax: Money
  discount: Money
  total: Money
  paid: Money
  balance: Money
  paymentTerms: string | null
  notes: string | null
  pdfUrl: string | null
  sentAt: Date | null
  paidAt: Date | null
  createdAt: Date
  createdBy: ProfileId | null
  updatedAt: Date
  updatedBy: ProfileId | null
  deletedAt: Date | null
}

/**
 * Bulk-edit payload for `Invoice.updateDetails`. Only valid while
 * the invoice is in `draft`. Status transitions, payment recording,
 * and soft-delete have their own dedicated methods.
 */
export interface InvoiceUpdateProps {
  projectId: ProjectId | null
  personId: PersonId | null
  billingAddress: PostalAddress | null
  invoiceNumber: string
  issueDate: Date
  dueDate: Date | null
  subtotal: Money
  tax: Money
  discount: Money
  paymentTerms: string | null
  notes: string | null
  pdfUrl: string | null
}

export interface InvoiceSnapshot {
  id: string
  tenantId: string
  projectId: string | null
  personId: string | null
  billingAddress: PostalAddressSnapshot | null
  invoiceNumber: string
  issueDate: string
  dueDate: string | null
  status: InvoiceStatus
  subtotal: MoneySnapshot
  tax: MoneySnapshot
  discount: MoneySnapshot
  total: MoneySnapshot
  paid: MoneySnapshot
  balance: MoneySnapshot
  paymentTerms: string | null
  notes: string | null
  pdfUrl: string | null
  sentAt: string | null
  paidAt: string | null
  createdAt: string
  createdBy: string | null
  updatedAt: string
  updatedBy: string | null
  deletedAt: string | null
}

// ─── Entity ────────────────────────────────────────────────────────────────

/**
 * An invoice issued to a customer. Standalone — no line items at the
 * schema level; the totals (`subtotal`, `tax`, `discount`, `total`)
 * are aggregate values, with line-item breakdowns derived elsewhere
 * (job parts, project cost rollups). Lifecycle is a 5-state machine
 * from `value-objects/invoice-status.ts`.
 *
 * **Currency model.** Same as `PurchaseOrder` — the DB schema does
 * not persist a currency column on `invoices`. Currency rides on the
 * `Money` VOs; every Money field on this aggregate shares one
 * currency, enforced at `create`/`reconstitute`/`updateDetails` and
 * on `recordPayment`. The mapper resolves the currency on read
 * (typically from the joined supplier on the related PO, or
 * `tenant_settings.default_currency`).
 *
 * **Money invariants** (entity-enforced, not DB):
 *   • `total = subtotal + tax − discount`  (DB stores; entity recomputes)
 *   • `balance = total − paid`             (DB stores; entity recomputes)
 *   • `paid ≤ total`                       (also a DB CHECK)
 *
 * **Editable scope.** `updateDetails` only works in `draft`. After
 * the invoice is sent the totals lock; the remaining valid actions
 * are `markOverdue`, `recordPayment`, `voidInvoice`, `softDelete`.
 *
 * **Payment flow.** `recordPayment(amount)` accumulates against
 * `paid`, rejects amounts that would overflow `total`, and
 * auto-flips status to `paid` (stamping `paidAt`) when the running
 * paid total equals `total`. Partial payments leave status
 * unchanged. Only valid in `sent` or `overdue` states — you cannot
 * pay a draft or a voided invoice.
 *
 * Source: invoices table.
 */
export class Invoice {
  #id: InvoiceId
  #tenantId: TenantId
  #projectId: ProjectId | null
  #personId: PersonId | null
  #billingAddress: PostalAddress | null
  #invoiceNumber: string
  #issueDate: Date
  #dueDate: Date | null
  #status: InvoiceStatus
  #subtotal: Money
  #tax: Money
  #discount: Money
  #total: Money
  #paid: Money
  #balance: Money
  #paymentTerms: string | null
  #notes: string | null
  #pdfUrl: string | null
  #sentAt: Date | null
  #paidAt: Date | null
  #createdAt: Date
  #createdBy: ProfileId | null
  #updatedAt: Date
  #updatedBy: ProfileId | null
  #deletedAt: Date | null

  private constructor(props: ReconstituteInvoiceProps) {
    this.#id = props.id
    this.#tenantId = props.tenantId
    this.#projectId = props.projectId
    this.#personId = props.personId
    this.#billingAddress = props.billingAddress
    this.#invoiceNumber = props.invoiceNumber
    this.#issueDate = props.issueDate
    this.#dueDate = props.dueDate
    this.#status = props.status
    this.#subtotal = props.subtotal
    this.#tax = props.tax
    this.#discount = props.discount
    this.#total = props.total
    this.#paid = props.paid
    this.#balance = props.balance
    this.#paymentTerms = props.paymentTerms
    this.#notes = props.notes
    this.#pdfUrl = props.pdfUrl
    this.#sentAt = props.sentAt
    this.#paidAt = props.paidAt
    this.#createdAt = props.createdAt
    this.#createdBy = props.createdBy
    this.#updatedAt = props.updatedAt
    this.#updatedBy = props.updatedBy
    this.#deletedAt = props.deletedAt
  }

  // ─── Factories ───────────────────────────────────────────────────────────

  static create(props: CreateInvoiceProps, now: Date = new Date()): Invoice {
    const invoiceNumber = trimRequired(
      props.invoiceNumber,
      "invoiceNumber",
      INVOICE_NUMBER_MAX,
      "Invoice"
    )
    const paymentTerms = trimOptional(
      props.paymentTerms,
      "paymentTerms",
      PAYMENT_TERMS_MAX,
      "Invoice"
    )
    const notes = trimOptional(props.notes, "notes", null, "Invoice")
    const pdfUrl = trimOptional(props.pdfUrl, "pdfUrl", PDF_URL_MAX, "Invoice")

    const status: InvoiceStatus = props.status ?? "draft"
    if (!isInvoiceStatus(status)) {
      throw new InvalidEntityError("Invoice", `invalid status '${String(status)}'`)
    }

    const issueDate = props.issueDate ?? now
    Invoice.#assertDueDate(issueDate, props.dueDate ?? null)

    const subtotal = props.subtotal ?? Money.zero(props.currency)
    const tax = props.tax ?? Money.zero(props.currency)
    const discount = props.discount ?? Money.zero(props.currency)
    const paid = props.paid ?? Money.zero(props.currency)

    Invoice.#assertMoneyNonNegative(subtotal, "subtotal")
    Invoice.#assertMoneyNonNegative(tax, "tax")
    Invoice.#assertMoneyNonNegative(discount, "discount")
    Invoice.#assertMoneyNonNegative(paid, "paid")
    Invoice.#assertSameCurrency([subtotal, tax, discount, paid], props.currency)

    const total = Invoice.#computeTotal(subtotal, tax, discount)
    if (paid.cents > total.cents) {
      throw new InvalidEntityError("Invoice", "paid cannot exceed total")
    }
    const balance = total.subtract(paid)

    return new Invoice({
      id: props.id,
      tenantId: props.tenantId,
      projectId: props.projectId ?? null,
      personId: props.personId ?? null,
      billingAddress: props.billingAddress ?? null,
      invoiceNumber,
      issueDate,
      dueDate: props.dueDate ?? null,
      status,
      subtotal,
      tax,
      discount,
      total,
      paid,
      balance,
      paymentTerms,
      notes,
      pdfUrl,
      sentAt: props.sentAt ?? null,
      paidAt: props.paidAt ?? null,
      createdAt: now,
      createdBy: props.createdBy ?? null,
      updatedAt: now,
      updatedBy: null,
      deletedAt: null,
    })
  }

  static reconstitute(props: ReconstituteInvoiceProps): Invoice {
    Invoice.#assertReconstituteInvariants(props)
    return new Invoice(props)
  }

  static fromJSON(s: InvoiceSnapshot): Invoice {
    return Invoice.reconstitute({
      id: InvoiceId.fromPersistence(s.id),
      tenantId: TenantId.fromPersistence(s.tenantId),
      projectId: s.projectId ? ProjectId.fromPersistence(s.projectId) : null,
      personId: s.personId ? PersonId.fromPersistence(s.personId) : null,
      billingAddress: s.billingAddress ? PostalAddress.fromSnapshot(s.billingAddress) : null,
      invoiceNumber: s.invoiceNumber,
      issueDate: new Date(s.issueDate),
      dueDate: s.dueDate ? new Date(s.dueDate) : null,
      status: s.status,
      subtotal: Money.fromSnapshot(s.subtotal),
      tax: Money.fromSnapshot(s.tax),
      discount: Money.fromSnapshot(s.discount),
      total: Money.fromSnapshot(s.total),
      paid: Money.fromSnapshot(s.paid),
      balance: Money.fromSnapshot(s.balance),
      paymentTerms: s.paymentTerms,
      notes: s.notes,
      pdfUrl: s.pdfUrl,
      sentAt: s.sentAt ? new Date(s.sentAt) : null,
      paidAt: s.paidAt ? new Date(s.paidAt) : null,
      createdAt: new Date(s.createdAt),
      createdBy: s.createdBy ? ProfileId.fromPersistence(s.createdBy) : null,
      updatedAt: new Date(s.updatedAt),
      updatedBy: s.updatedBy ? ProfileId.fromPersistence(s.updatedBy) : null,
      deletedAt: s.deletedAt ? new Date(s.deletedAt) : null,
    })
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get id(): InvoiceId {
    return this.#id
  }
  get tenantId(): TenantId {
    return this.#tenantId
  }
  get projectId(): ProjectId | null {
    return this.#projectId
  }
  get personId(): PersonId | null {
    return this.#personId
  }
  get billingAddress(): PostalAddress | null {
    return this.#billingAddress
  }
  get invoiceNumber(): string {
    return this.#invoiceNumber
  }
  get issueDate(): Date {
    return this.#issueDate
  }
  get dueDate(): Date | null {
    return this.#dueDate
  }
  get status(): InvoiceStatus {
    return this.#status
  }
  get subtotal(): Money {
    return this.#subtotal
  }
  get tax(): Money {
    return this.#tax
  }
  get discount(): Money {
    return this.#discount
  }
  get total(): Money {
    return this.#total
  }
  get paid(): Money {
    return this.#paid
  }
  get balance(): Money {
    return this.#balance
  }
  /** Convenience — every Money field on this aggregate shares a currency. */
  get currency(): Currency {
    return this.#total.currency
  }
  get paymentTerms(): string | null {
    return this.#paymentTerms
  }
  get notes(): string | null {
    return this.#notes
  }
  get pdfUrl(): string | null {
    return this.#pdfUrl
  }
  get sentAt(): Date | null {
    return this.#sentAt
  }
  get paidAt(): Date | null {
    return this.#paidAt
  }
  get createdAt(): Date {
    return this.#createdAt
  }
  get createdBy(): ProfileId | null {
    return this.#createdBy
  }
  get updatedAt(): Date {
    return this.#updatedAt
  }
  get updatedBy(): ProfileId | null {
    return this.#updatedBy
  }
  get deletedAt(): Date | null {
    return this.#deletedAt
  }

  // ─── State queries ───────────────────────────────────────────────────────

  get isDeleted(): boolean {
    return this.#deletedAt !== null
  }
  get isDraft(): boolean {
    return this.#status === "draft"
  }
  get isSent(): boolean {
    return this.#status === "sent"
  }
  get isPaid(): boolean {
    return this.#status === "paid"
  }
  get isOverdue(): boolean {
    return this.#status === "overdue"
  }
  get isVoid(): boolean {
    return this.#status === "void"
  }
  get isFullyPaid(): boolean {
    return this.#balance.isZero
  }

  // ─── State transitions ───────────────────────────────────────────────────

  /**
   * Aggregated bulk edit of header-level fields including the money
   * totals. Recomputes `total` and `balance`. Only valid while
   * status is `draft` — sent invoices lock the totals.
   *
   * Status transitions, payment recording, and soft-delete have
   * their own dedicated methods.
   */
  updateDetails(props: InvoiceUpdateProps, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("update details")
    if (this.#status !== "draft") {
      throw new InvalidEntityError(
        "Invoice",
        `cannot update details on an invoice with status '${this.#status}'`
      )
    }

    const newInvoiceNumber = trimRequired(
      props.invoiceNumber,
      "invoiceNumber",
      INVOICE_NUMBER_MAX,
      "Invoice"
    )
    const newPaymentTerms = trimOptional(
      props.paymentTerms,
      "paymentTerms",
      PAYMENT_TERMS_MAX,
      "Invoice"
    )
    const newNotes = trimOptional(props.notes, "notes", null, "Invoice")
    const newPdfUrl = trimOptional(props.pdfUrl, "pdfUrl", PDF_URL_MAX, "Invoice")

    Invoice.#assertDueDate(props.issueDate, props.dueDate)
    Invoice.#assertMoneyNonNegative(props.subtotal, "subtotal")
    Invoice.#assertMoneyNonNegative(props.tax, "tax")
    Invoice.#assertMoneyNonNegative(props.discount, "discount")
    Invoice.#assertSameCurrency([props.subtotal, props.tax, props.discount], this.currency)

    const newTotal = Invoice.#computeTotal(props.subtotal, props.tax, props.discount)
    if (this.#paid.cents > newTotal.cents) {
      throw new InvalidEntityError("Invoice", "new total is below already-paid amount")
    }
    const newBalance = newTotal.subtract(this.#paid)

    if (
      nullableEqual(props.projectId, this.#projectId) &&
      nullableEqual(props.personId, this.#personId) &&
      nullableEqual(props.billingAddress, this.#billingAddress) &&
      newInvoiceNumber === this.#invoiceNumber &&
      props.issueDate.getTime() === this.#issueDate.getTime() &&
      Invoice.#sameDateOrNull(props.dueDate, this.#dueDate) &&
      props.subtotal.equals(this.#subtotal) &&
      props.tax.equals(this.#tax) &&
      props.discount.equals(this.#discount) &&
      newPaymentTerms === this.#paymentTerms &&
      newNotes === this.#notes &&
      newPdfUrl === this.#pdfUrl
    ) {
      return
    }

    this.#projectId = props.projectId
    this.#personId = props.personId
    this.#billingAddress = props.billingAddress
    this.#invoiceNumber = newInvoiceNumber
    this.#issueDate = props.issueDate
    this.#dueDate = props.dueDate
    this.#subtotal = props.subtotal
    this.#tax = props.tax
    this.#discount = props.discount
    this.#total = newTotal
    this.#balance = newBalance
    this.#paymentTerms = newPaymentTerms
    this.#notes = newNotes
    this.#pdfUrl = newPdfUrl
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Send the invoice. Stamps `sentAt` and flips status to `sent`.
   * Optionally attaches a PDF URL emitted by the rendering pipeline.
   */
  markSent(updatedBy: ProfileId, now: Date = new Date(), pdfUrl?: string | null): void {
    this.#assertNotDeleted("mark sent")
    assertInvoiceStatusTransition(this.#status, "sent")
    if (pdfUrl !== undefined) {
      this.#pdfUrl = trimOptional(pdfUrl, "pdfUrl", PDF_URL_MAX, "Invoice")
    }
    this.#status = "sent"
    this.#sentAt = now
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Flag a sent invoice as overdue. Only valid from `sent` — overdue
   * status is set by a billing-cycle scheduler or manual review, not
   * derived automatically by the entity.
   */
  markOverdue(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("mark overdue")
    assertInvoiceStatusTransition(this.#status, "overdue")
    this.#status = "overdue"
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Add a payment against this invoice. Only valid in `sent` or
   * `overdue` states (you cannot pay a draft or a voided invoice).
   *
   * `amount` must be positive, match the invoice currency, and not
   * overflow the remaining balance. When the running paid total
   * reaches `total`, status auto-flips to `paid` and `paidAt` is
   * stamped with the supplied `now`.
   */
  recordPayment(amount: Money, updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("record payment")
    if (this.#status !== "sent" && this.#status !== "overdue") {
      throw new InvalidEntityError(
        "Invoice",
        `can only record payments on invoices in 'sent' or 'overdue' state (current: '${this.#status}')`
      )
    }
    if (!amount.currency.equals(this.currency)) {
      throw new InvalidEntityError(
        "Invoice",
        `payment currency must match invoice currency (${this.currency.value})`
      )
    }
    if (amount.cents <= 0) {
      throw new InvalidEntityError("Invoice", "payment amount must be greater than zero")
    }
    const newPaid = this.#paid.add(amount)
    if (newPaid.cents > this.#total.cents) {
      throw new InvalidEntityError(
        "Invoice",
        `payment would exceed total (paid would be ${newPaid.cents} of ${this.#total.cents})`
      )
    }
    this.#paid = newPaid
    this.#balance = this.#total.subtract(newPaid)
    if (this.#balance.isZero) {
      this.#status = "paid"
      this.#paidAt = now
    }
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Void the invoice. Refused on a fully-paid invoice — paid
   * invoices need a separate credit-memo flow, not a void.
   */
  voidInvoice(updatedBy: ProfileId, now: Date = new Date()): void {
    this.#assertNotDeleted("void")
    assertInvoiceStatusTransition(this.#status, "void")
    this.#status = "void"
    this.#touchAudit(updatedBy, now)
  }

  /**
   * Admin-only soft delete. Existing FKs (projects, jobs) keep
   * their references. Idempotent.
   */
  softDelete(updatedBy: ProfileId, now: Date = new Date()): void {
    if (this.#deletedAt !== null) return
    this.#deletedAt = now
    this.#touchAudit(updatedBy, now)
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  #assertNotDeleted(operation: string): void {
    if (this.#deletedAt !== null) {
      throw new InvalidEntityError("Invoice", `cannot ${operation} on a soft-deleted invoice`)
    }
  }

  #touchAudit(updatedBy: ProfileId, now: Date): void {
    this.#updatedAt = now
    this.#updatedBy = updatedBy
  }

  static #computeTotal(subtotal: Money, tax: Money, discount: Money): Money {
    const total = subtotal.add(tax).subtract(discount)
    if (total.cents < 0) {
      throw new InvalidEntityError(
        "Invoice",
        "total cannot be negative (discount exceeds subtotal + tax)"
      )
    }
    return total
  }

  static #assertDueDate(issueDate: Date, dueDate: Date | null): void {
    if (dueDate !== null && dueDate.getTime() < issueDate.getTime()) {
      throw new InvalidEntityError("Invoice", "dueDate cannot be before issueDate")
    }
  }

  static #assertMoneyNonNegative(value: Money, field: string): void {
    if (value.cents < 0) {
      throw new InvalidEntityError("Invoice", `${field} must be >= 0`)
    }
  }

  static #assertSameCurrency(values: ReadonlyArray<Money>, expected: Currency): void {
    for (const v of values) {
      if (!v.currency.equals(expected)) {
        throw new InvalidEntityError(
          "Invoice",
          `currency mismatch: expected ${expected.value}, got ${v.currency.value}`
        )
      }
    }
  }

  static #sameDateOrNull(a: Date | null, b: Date | null): boolean {
    if (a === null && b === null) return true
    if (a === null || b === null) return false
    return a.getTime() === b.getTime()
  }

  static #assertReconstituteInvariants(props: ReconstituteInvoiceProps): void {
    const expectedCurrency = props.total.currency
    Invoice.#assertSameCurrency(
      [props.subtotal, props.tax, props.discount, props.paid, props.balance],
      expectedCurrency
    )
    if (!isInvoiceStatus(props.status)) {
      throw new InvalidEntityError(
        "Invoice",
        `reconstitute: invalid status '${String(props.status)}'`
      )
    }
    Invoice.#assertDueDate(props.issueDate, props.dueDate)
    if (props.paid.cents > props.total.cents) {
      throw new InvalidEntityError("Invoice", "reconstitute: paid cannot exceed total")
    }
    const expectedTotal = Invoice.#computeTotal(props.subtotal, props.tax, props.discount)
    if (expectedTotal.cents !== props.total.cents) {
      throw new InvalidEntityError(
        "Invoice",
        `reconstitute: total (${props.total.cents}) does not match subtotal + tax - discount (${expectedTotal.cents})`
      )
    }
    const expectedBalance = props.total.subtract(props.paid)
    if (expectedBalance.cents !== props.balance.cents) {
      throw new InvalidEntityError(
        "Invoice",
        `reconstitute: balance (${props.balance.cents}) does not match total - paid (${expectedBalance.cents})`
      )
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────

  toJSON(): InvoiceSnapshot {
    return {
      id: this.#id.value,
      tenantId: this.#tenantId.value,
      projectId: this.#projectId?.value ?? null,
      personId: this.#personId?.value ?? null,
      billingAddress: this.#billingAddress?.toJSON() ?? null,
      invoiceNumber: this.#invoiceNumber,
      issueDate: this.#issueDate.toISOString(),
      dueDate: this.#dueDate?.toISOString() ?? null,
      status: this.#status,
      subtotal: this.#subtotal.toJSON(),
      tax: this.#tax.toJSON(),
      discount: this.#discount.toJSON(),
      total: this.#total.toJSON(),
      paid: this.#paid.toJSON(),
      balance: this.#balance.toJSON(),
      paymentTerms: this.#paymentTerms,
      notes: this.#notes,
      pdfUrl: this.#pdfUrl,
      sentAt: this.#sentAt?.toISOString() ?? null,
      paidAt: this.#paidAt?.toISOString() ?? null,
      createdAt: this.#createdAt.toISOString(),
      createdBy: this.#createdBy?.value ?? null,
      updatedAt: this.#updatedAt.toISOString(),
      updatedBy: this.#updatedBy?.value ?? null,
      deletedAt: this.#deletedAt?.toISOString() ?? null,
    }
  }
}
