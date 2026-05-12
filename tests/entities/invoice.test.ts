import { describe, expect, it } from "vitest"

import { InvalidEntityError } from "@/src/entities/errors/invalid-entity.error"
import { Invoice } from "@/src/entities/invoice"
import { Currency } from "@/src/entities/value-objects/currency"
import {
  InvoiceId,
  PersonId,
  ProfileId,
  ProjectId,
  TenantId,
} from "@/src/entities/value-objects/id"
import { Money } from "@/src/entities/value-objects/money"

const INVOICE_UUID = "550e8400-e29b-41d4-a716-446655440000"
const TENANT_UUID = "00000000-0000-4000-8000-000000000010"
const PROJECT_UUID = "00000000-0000-4000-8000-000000000070"
const PERSON_UUID = "00000000-0000-4000-8000-000000000080"
const ACTOR_UUID = "00000000-0000-4000-8000-000000000040"

const T0 = new Date("2026-05-09T12:00:00.000Z")
const T1 = new Date("2026-05-09T12:30:00.000Z")
const T2 = new Date("2026-05-09T13:00:00.000Z")
const T3 = new Date("2026-05-09T13:30:00.000Z")
const T4 = new Date("2026-05-09T14:00:00.000Z")

const USD = Currency.create("USD")
const EUR = Currency.create("EUR")

const ACTOR = ProfileId.fromPersistence(ACTOR_UUID)

function makeInvoice(overrides: Partial<Parameters<typeof Invoice.create>[0]> = {}) {
  return Invoice.create(
    {
      id: InvoiceId.fromPersistence(INVOICE_UUID),
      tenantId: TenantId.fromPersistence(TENANT_UUID),
      currency: USD,
      invoiceNumber: "INV-001",
      issueDate: T0,
      subtotal: Money.fromCents(10000, USD),
      tax: Money.fromCents(800, USD),
      discount: Money.fromCents(500, USD),
      ...overrides,
    },
    T0
  )
}

describe("Invoice", () => {
  describe("create()", () => {
    it("constructs with required fields, derives total/balance, defaults to draft", () => {
      const inv = makeInvoice()
      expect(inv.id.value).toBe(INVOICE_UUID)
      expect(inv.status).toBe("draft")
      expect(inv.invoiceNumber).toBe("INV-001")
      expect(inv.subtotal.cents).toBe(10000)
      expect(inv.tax.cents).toBe(800)
      expect(inv.discount.cents).toBe(500)
      expect(inv.total.cents).toBe(10300)
      expect(inv.paid.cents).toBe(0)
      expect(inv.balance.cents).toBe(10300)
      expect(inv.currency.value).toBe("USD")
      expect(inv.isDraft).toBe(true)
    })

    it("defaults all money to zero in given currency when omitted", () => {
      const inv = Invoice.create(
        {
          id: InvoiceId.fromPersistence(INVOICE_UUID),
          tenantId: TenantId.fromPersistence(TENANT_UUID),
          currency: USD,
          invoiceNumber: "INV-001",
        },
        T0
      )
      expect(inv.subtotal.cents).toBe(0)
      expect(inv.tax.cents).toBe(0)
      expect(inv.discount.cents).toBe(0)
      expect(inv.total.cents).toBe(0)
      expect(inv.paid.cents).toBe(0)
      expect(inv.balance.cents).toBe(0)
    })

    it("trims invoiceNumber and rejects empty after trim", () => {
      expect(() => makeInvoice({ invoiceNumber: "   " })).toThrow(InvalidEntityError)
      const inv = makeInvoice({ invoiceNumber: "  INV-2  " })
      expect(inv.invoiceNumber).toBe("INV-2")
    })

    it("rejects negative subtotal / tax / discount / paid", () => {
      expect(() => makeInvoice({ subtotal: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
      expect(() => makeInvoice({ tax: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
      expect(() => makeInvoice({ discount: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
      expect(() => makeInvoice({ paid: Money.fromCents(-1, USD) })).toThrow(InvalidEntityError)
    })

    it("rejects discount greater than subtotal + tax (total would go negative)", () => {
      expect(() =>
        makeInvoice({
          subtotal: Money.fromCents(1000, USD),
          tax: Money.fromCents(0, USD),
          discount: Money.fromCents(1500, USD),
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects currency mismatch across the money fields", () => {
      expect(() => makeInvoice({ tax: Money.fromCents(100, EUR) })).toThrow(InvalidEntityError)
      expect(() => makeInvoice({ discount: Money.fromCents(100, EUR) })).toThrow(InvalidEntityError)
      expect(() => makeInvoice({ subtotal: Money.fromCents(100, EUR) })).toThrow(InvalidEntityError)
      expect(() => makeInvoice({ paid: Money.fromCents(100, EUR) })).toThrow(InvalidEntityError)
    })

    it("rejects paid > total", () => {
      expect(() =>
        makeInvoice({
          subtotal: Money.fromCents(1000, USD),
          tax: Money.fromCents(0, USD),
          discount: Money.fromCents(0, USD),
          paid: Money.fromCents(2000, USD),
        })
      ).toThrow(InvalidEntityError)
    })

    it("rejects dueDate earlier than issueDate", () => {
      expect(() => makeInvoice({ issueDate: T2, dueDate: T1 })).toThrow(InvalidEntityError)
    })

    it("defaults issueDate to now when omitted", () => {
      const inv = Invoice.create(
        {
          id: InvoiceId.fromPersistence(INVOICE_UUID),
          tenantId: TenantId.fromPersistence(TENANT_UUID),
          currency: USD,
          invoiceNumber: "INV-001",
        },
        T0
      )
      expect(inv.issueDate).toEqual(T0)
    })
  })

  describe("updateDetails()", () => {
    it("updates fields and recomputes total/balance", () => {
      const inv = makeInvoice()
      inv.updateDetails(
        {
          projectId: ProjectId.fromPersistence(PROJECT_UUID),
          personId: null,
          billingAddressId: null,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: T2,
          subtotal: Money.fromCents(20000, USD),
          tax: Money.fromCents(1600, USD),
          discount: Money.fromCents(0, USD),
          paymentTerms: "net 30",
          notes: "fixed price",
          pdfUrl: null,
        },
        ACTOR,
        T1
      )
      expect(inv.subtotal.cents).toBe(20000)
      expect(inv.total.cents).toBe(21600)
      expect(inv.balance.cents).toBe(21600)
      expect(inv.dueDate).toEqual(T2)
      expect(inv.paymentTerms).toBe("net 30")
      expect(inv.projectId?.value).toBe(PROJECT_UUID)
      expect(inv.updatedAt).toEqual(T1)
    })

    it("is a no-op when nothing changed", () => {
      const inv = makeInvoice()
      const before = inv.updatedAt
      inv.updateDetails(
        {
          projectId: null,
          personId: null,
          billingAddressId: null,
          invoiceNumber: inv.invoiceNumber,
          issueDate: inv.issueDate,
          dueDate: null,
          subtotal: inv.subtotal,
          tax: inv.tax,
          discount: inv.discount,
          paymentTerms: null,
          notes: null,
          pdfUrl: null,
        },
        ACTOR,
        T1
      )
      expect(inv.updatedAt).toBe(before)
    })

    it("rejects currency mismatch", () => {
      const inv = makeInvoice()
      expect(() =>
        inv.updateDetails(
          {
            projectId: null,
            personId: null,
            billingAddressId: null,
            invoiceNumber: inv.invoiceNumber,
            issueDate: inv.issueDate,
            dueDate: null,
            subtotal: Money.fromCents(20000, EUR),
            tax: inv.tax,
            discount: inv.discount,
            paymentTerms: null,
            notes: null,
            pdfUrl: null,
          },
          ACTOR,
          T1
        )
      ).toThrow(InvalidEntityError)
    })

    it("rejects after the invoice has been sent", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      expect(() =>
        inv.updateDetails(
          {
            projectId: null,
            personId: null,
            billingAddressId: null,
            invoiceNumber: "INV-2",
            issueDate: inv.issueDate,
            dueDate: null,
            subtotal: inv.subtotal,
            tax: inv.tax,
            discount: inv.discount,
            paymentTerms: null,
            notes: null,
            pdfUrl: null,
          },
          ACTOR,
          T2
        )
      ).toThrow(InvalidEntityError)
    })

    it("rejects if new total is below already-paid amount (theoretical — paid is 0 in draft)", () => {
      const inv = makeInvoice()
      // Draft invoices have paid=0 so this branch is hard to hit directly,
      // but guard against caller-supplied paid via reconstitute. Validate
      // shape via a controlled reconstitute path.
      const snap = inv.toJSON()
      snap.paid = Money.fromCents(100, USD).toJSON()
      snap.balance = Money.fromCents(10300 - 100, USD).toJSON()
      const partial = Invoice.fromJSON(snap)
      expect(() =>
        partial.updateDetails(
          {
            projectId: null,
            personId: null,
            billingAddressId: null,
            invoiceNumber: partial.invoiceNumber,
            issueDate: partial.issueDate,
            dueDate: null,
            subtotal: Money.fromCents(50, USD),
            tax: Money.fromCents(0, USD),
            discount: Money.fromCents(0, USD),
            paymentTerms: null,
            notes: null,
            pdfUrl: null,
          },
          ACTOR,
          T1
        )
      ).toThrow(InvalidEntityError)
    })
  })

  describe("markSent()", () => {
    it("flips draft → sent and stamps sentAt", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      expect(inv.status).toBe("sent")
      expect(inv.isSent).toBe(true)
      expect(inv.sentAt).toEqual(T1)
    })

    it("attaches an optional pdfUrl on send", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1, "https://files.example/inv-001.pdf")
      expect(inv.pdfUrl).toBe("https://files.example/inv-001.pdf")
    })

    it("rejects from anything other than draft", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      expect(() => inv.markSent(ACTOR, T2)).toThrow(InvalidEntityError)
    })
  })

  describe("markOverdue()", () => {
    it("flips sent → overdue", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.markOverdue(ACTOR, T2)
      expect(inv.status).toBe("overdue")
      expect(inv.isOverdue).toBe(true)
    })

    it("rejects from draft", () => {
      const inv = makeInvoice()
      expect(() => inv.markOverdue(ACTOR, T1)).toThrow(InvalidEntityError)
    })

    it("rejects after paid", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.recordPayment(inv.total, ACTOR, T2)
      expect(() => inv.markOverdue(ACTOR, T3)).toThrow(InvalidEntityError)
    })
  })

  describe("recordPayment()", () => {
    it("partial payment lowers balance but keeps status sent", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.recordPayment(Money.fromCents(3000, USD), ACTOR, T2)
      expect(inv.paid.cents).toBe(3000)
      expect(inv.balance.cents).toBe(7300)
      expect(inv.status).toBe("sent")
      expect(inv.paidAt).toBeNull()
    })

    it("full payment auto-flips to paid and stamps paidAt", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.recordPayment(inv.total, ACTOR, T2)
      expect(inv.status).toBe("paid")
      expect(inv.isPaid).toBe(true)
      expect(inv.isFullyPaid).toBe(true)
      expect(inv.balance.cents).toBe(0)
      expect(inv.paidAt).toEqual(T2)
    })

    it("accumulates partial payments to paid", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.recordPayment(Money.fromCents(4000, USD), ACTOR, T2)
      inv.recordPayment(Money.fromCents(6300, USD), ACTOR, T3)
      expect(inv.status).toBe("paid")
      expect(inv.paid.cents).toBe(10300)
    })

    it("accepts payment in overdue state and can settle to paid", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.markOverdue(ACTOR, T2)
      inv.recordPayment(inv.total, ACTOR, T3)
      expect(inv.status).toBe("paid")
    })

    it("rejects payment in draft", () => {
      const inv = makeInvoice()
      expect(() => inv.recordPayment(Money.fromCents(100, USD), ACTOR, T1)).toThrow(
        InvalidEntityError
      )
    })

    it("rejects payment after voided", () => {
      const inv = makeInvoice()
      inv.voidInvoice(ACTOR, T1)
      expect(() => inv.recordPayment(Money.fromCents(100, USD), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })

    it("rejects amount that exceeds balance", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      expect(() => inv.recordPayment(Money.fromCents(10301, USD), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })

    it("rejects non-positive amount", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      expect(() => inv.recordPayment(Money.fromCents(0, USD), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })

    it("rejects currency mismatch", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      expect(() => inv.recordPayment(Money.fromCents(100, EUR), ACTOR, T2)).toThrow(
        InvalidEntityError
      )
    })
  })

  describe("voidInvoice()", () => {
    it("voids from draft", () => {
      const inv = makeInvoice()
      inv.voidInvoice(ACTOR, T1)
      expect(inv.status).toBe("void")
      expect(inv.isVoid).toBe(true)
    })

    it("voids from sent", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.voidInvoice(ACTOR, T2)
      expect(inv.status).toBe("void")
    })

    it("voids from overdue", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.markOverdue(ACTOR, T2)
      inv.voidInvoice(ACTOR, T3)
      expect(inv.status).toBe("void")
    })

    it("rejects from paid", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.recordPayment(inv.total, ACTOR, T2)
      expect(() => inv.voidInvoice(ACTOR, T3)).toThrow(InvalidEntityError)
    })
  })

  describe("softDelete is independent of status", () => {
    it("marks deletedAt and preserves status", () => {
      const inv = makeInvoice()
      inv.markSent(ACTOR, T1)
      inv.softDelete(ACTOR, T2)
      expect(inv.isDeleted).toBe(true)
      expect(inv.status).toBe("sent")
    })

    it("is idempotent", () => {
      const inv = makeInvoice()
      inv.softDelete(ACTOR, T1)
      inv.softDelete(ACTOR, T2)
      expect(inv.deletedAt).toEqual(T1)
    })

    it("blocks subsequent edits", () => {
      const inv = makeInvoice()
      inv.softDelete(ACTOR, T1)
      expect(() => inv.markSent(ACTOR, T2)).toThrow(InvalidEntityError)
      expect(() => inv.voidInvoice(ACTOR, T2)).toThrow(InvalidEntityError)
    })
  })

  describe("reconstitute() invariants", () => {
    function baseSnap() {
      return makeInvoice().toJSON()
    }

    it("rejects when total does not match subtotal + tax − discount", () => {
      const snap = baseSnap()
      snap.total = Money.fromCents(99999, USD).toJSON()
      expect(() => Invoice.fromJSON(snap)).toThrow(InvalidEntityError)
    })

    it("rejects when balance does not match total − paid", () => {
      const snap = baseSnap()
      snap.balance = Money.fromCents(1, USD).toJSON()
      expect(() => Invoice.fromJSON(snap)).toThrow(InvalidEntityError)
    })

    it("rejects when paid > total", () => {
      const snap = baseSnap()
      snap.paid = Money.fromCents(20000, USD).toJSON()
      snap.balance = Money.fromCents(-9700, USD).toJSON()
      expect(() => Invoice.fromJSON(snap)).toThrow(InvalidEntityError)
    })
  })

  describe("toJSON / fromJSON round-trip", () => {
    it("preserves all fields including payment flow + project link", () => {
      const inv = makeInvoice({
        projectId: ProjectId.fromPersistence(PROJECT_UUID),
        personId: PersonId.fromPersistence(PERSON_UUID),
        dueDate: T2,
        notes: "x",
        paymentTerms: "net 30",
      })
      inv.markSent(ACTOR, T1, "https://files.example/inv.pdf")
      inv.recordPayment(Money.fromCents(3000, USD), ACTOR, T2)
      inv.recordPayment(Money.fromCents(7300, USD), ACTOR, T3)
      const snap = inv.toJSON()
      expect(Invoice.fromJSON(snap).toJSON()).toEqual(snap)
    })

    it("snapshot uses primitives for ids and timestamps", () => {
      const snap = makeInvoice().toJSON()
      expect(typeof snap.id).toBe("string")
      expect(typeof snap.tenantId).toBe("string")
      expect(typeof snap.issueDate).toBe("string")
      expect(typeof snap.createdAt).toBe("string")
    })

    it("Money fields round-trip as snapshot shape", () => {
      const snap = makeInvoice().toJSON()
      expect(snap.subtotal).toEqual({ cents: 10000, currency: "USD" })
      expect(snap.total).toEqual({ cents: 10300, currency: "USD" })
      expect(snap.balance).toEqual({ cents: 10300, currency: "USD" })
    })
  })
})
