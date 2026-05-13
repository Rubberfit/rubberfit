import { describe, expect, it } from "vitest"

import { Supplier } from "@/src/entities/supplier"
import { Email } from "@/src/entities/value-objects/email"
import { ProfileId, SupplierId, TenantId } from "@/src/entities/value-objects/id"
import { Currency } from "@/src/entities/value-objects/currency"
import { Money } from "@/src/entities/value-objects/money"
import { PostalAddress } from "@/src/entities/value-objects/postal-address"
import {
  rowToSupplier,
  type SupplierRow,
  supplierToInsertRow,
  supplierToUpdateRow,
} from "@/src/infrastructure/mappers/supplier.mapper"

const SUPPLIER_UUID = "11111111-1111-4111-8111-111111111111"
const TENANT_UUID = "22222222-2222-4222-8222-222222222222"
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444"

const FULL_ROW: SupplierRow = {
  id: SUPPLIER_UUID,
  tenant_id: TENANT_UUID,
  name: "Acme Substrates",
  address_line1: "100 Mill St",
  address_line2: "Suite 4",
  city: "Brooklyn",
  state: "NY",
  postal_code: "11211",
  country: "United States",
  email: "orders@acme.example",
  general_phone: "+1-555-0100",
  website: "https://acme.example",
  tax_id: "EIN-12-3456789",
  tax_rate: 0.0825,
  tax_exempt: false,
  payment_terms: "Net 30",
  shipping_cost_cents: 12500,
  rating: 4,
  preferred: true,
  active: true,
  notes: "Reliable for vinyl rolls",
  created_at: "2026-04-21T09:00:00.000Z",
  created_by: ACTOR_UUID,
  updated_at: "2026-04-22T17:00:00.000Z",
  updated_by: ACTOR_UUID,
  deleted_at: null,
}

const MINIMAL_ROW: SupplierRow = {
  id: SUPPLIER_UUID,
  tenant_id: TENANT_UUID,
  name: "Bare Bones LLC",
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  email: null,
  general_phone: null,
  website: null,
  tax_id: null,
  tax_rate: null,
  tax_exempt: false,
  payment_terms: null,
  shipping_cost_cents: null,
  rating: null,
  preferred: false,
  active: true,
  notes: null,
  created_at: "2026-04-21T09:00:00.000Z",
  created_by: null,
  updated_at: "2026-04-21T09:00:00.000Z",
  updated_by: null,
  deleted_at: null,
}

describe("rowToSupplier", () => {
  it("hydrates every column into a Supplier entity", () => {
    const supplier = rowToSupplier(FULL_ROW)

    expect(supplier).toBeInstanceOf(Supplier)
    expect(supplier.id.value).toBe(SUPPLIER_UUID)
    expect(supplier.tenantId.value).toBe(TENANT_UUID)
    expect(supplier.name).toBe("Acme Substrates")
    expect(supplier.address?.line1).toBe("100 Mill St")
    expect(supplier.address?.line2).toBe("Suite 4")
    expect(supplier.address?.city).toBe("Brooklyn")
    expect(supplier.address?.state).toBe("NY")
    expect(supplier.address?.postalCode).toBe("11211")
    expect(supplier.address?.country).toBe("United States")
    expect(supplier.email?.value).toBe("orders@acme.example")
    expect(supplier.generalPhone).toBe("+1-555-0100")
    expect(supplier.website).toBe("https://acme.example")
    expect(supplier.taxId).toBe("EIN-12-3456789")
    expect(supplier.taxRate).toBe(0.0825)
    expect(supplier.taxExempt).toBe(false)
    expect(supplier.paymentTerms).toBe("Net 30")
    expect(supplier.shippingCost?.cents).toBe(12500)
    expect(supplier.shippingCost?.currency.value).toBe("USD")
    expect(supplier.rating).toBe(4)
    expect(supplier.preferred).toBe(true)
    expect(supplier.isActive).toBe(true)
    expect(supplier.notes).toBe("Reliable for vinyl rolls")
    expect(supplier.createdAt.toISOString()).toBe("2026-04-21T09:00:00.000Z")
    expect(supplier.createdBy?.value).toBe(ACTOR_UUID)
    expect(supplier.updatedAt.toISOString()).toBe("2026-04-22T17:00:00.000Z")
    expect(supplier.updatedBy?.value).toBe(ACTOR_UUID)
    expect(supplier.deletedAt).toBeNull()
  })

  it("leaves nullables as null when the row is sparse", () => {
    const supplier = rowToSupplier(MINIMAL_ROW)

    expect(supplier.address).toBeNull()
    expect(supplier.email).toBeNull()
    expect(supplier.generalPhone).toBeNull()
    expect(supplier.taxRate).toBeNull()
    expect(supplier.shippingCost).toBeNull()
    expect(supplier.rating).toBeNull()
    expect(supplier.createdBy).toBeNull()
    expect(supplier.updatedBy).toBeNull()
    expect(supplier.deletedAt).toBeNull()
  })

  it("maps deleted_at into a Date when the row is soft-deleted", () => {
    const supplier = rowToSupplier({
      ...FULL_ROW,
      deleted_at: "2026-04-30T00:00:00.000Z",
    })
    expect(supplier.deletedAt?.toISOString()).toBe("2026-04-30T00:00:00.000Z")
    expect(supplier.isDeleted).toBe(true)
  })
})

describe("supplierToInsertRow", () => {
  it("produces the persistence shape from an entity built via Supplier.create", () => {
    const supplier = Supplier.create(
      {
        id: SupplierId.fromPersistence(SUPPLIER_UUID),
        tenantId: TenantId.fromPersistence(TENANT_UUID),
        name: "Cobra Materials",
        address: PostalAddress.create({
          line1: "200 Park Ave",
          city: "Manhattan",
          state: "NY",
          postalCode: "10003",
        }),
        email: Email.create("hello@cobra.example"),
        generalPhone: "+1-555-0200",
        website: "https://cobra.example",
        taxId: "EIN-98-7654321",
        taxRate: 0.07,
        taxExempt: false,
        paymentTerms: "Net 15",
        shippingCost: Money.fromCents(8000, Currency.fromPersistence("USD")),
        rating: 5,
        preferred: false,
        notes: " a quick note ",
        createdBy: ProfileId.fromPersistence(ACTOR_UUID),
      },
      new Date("2026-05-01T00:00:00.000Z")
    )

    const row = supplierToInsertRow(supplier)

    expect(row).toEqual({
      id: SUPPLIER_UUID,
      tenant_id: TENANT_UUID,
      name: "Cobra Materials",
      address_line1: "200 Park Ave",
      address_line2: null,
      city: "Manhattan",
      state: "NY",
      postal_code: "10003",
      country: "United States",
      email: "hello@cobra.example",
      general_phone: "+1-555-0200",
      website: "https://cobra.example",
      tax_id: "EIN-98-7654321",
      tax_rate: 0.07,
      tax_exempt: false,
      payment_terms: "Net 15",
      shipping_cost_cents: 8000,
      rating: 5,
      preferred: false,
      active: true,
      notes: "a quick note",
      created_by: ACTOR_UUID,
    })
  })
})

describe("supplierToUpdateRow", () => {
  it("captures mutator-stamped audit fields after updateDetails", () => {
    const supplier = rowToSupplier(FULL_ROW)
    const now = new Date("2026-05-10T08:30:00.000Z")
    supplier.updateDetails(
      {
        name: "Acme Substrates",
        address: supplier.address,
        email: supplier.email,
        generalPhone: supplier.generalPhone,
        website: supplier.website,
        taxId: supplier.taxId,
        taxRate: supplier.taxRate,
        taxExempt: supplier.taxExempt,
        paymentTerms: "Net 45",
        shippingCost: supplier.shippingCost,
        rating: 5,
        preferred: supplier.preferred,
        notes: supplier.notes,
      },
      ProfileId.fromPersistence(ACTOR_UUID),
      now
    )

    const row = supplierToUpdateRow(supplier)

    expect(row.payment_terms).toBe("Net 45")
    expect(row.rating).toBe(5)
    expect(row.updated_at).toBe("2026-05-10T08:30:00.000Z")
    expect(row.updated_by).toBe(ACTOR_UUID)
    expect(row.deleted_at).toBeNull()
  })

  it("stamps deleted_at on soft delete", () => {
    const supplier = rowToSupplier(FULL_ROW)
    supplier.softDelete(ProfileId.fromPersistence(ACTOR_UUID), new Date("2026-05-11T12:00:00.000Z"))

    const row = supplierToUpdateRow(supplier)
    expect(row.deleted_at).toBe("2026-05-11T12:00:00.000Z")
  })
})

describe("round-trip", () => {
  it("row → entity → update row preserves persistence-relevant fields", () => {
    const supplier = rowToSupplier(FULL_ROW)
    const row = supplierToUpdateRow(supplier)

    expect(row.name).toBe(FULL_ROW.name)
    expect(row.address_line1).toBe(FULL_ROW.address_line1)
    expect(row.address_line2).toBe(FULL_ROW.address_line2)
    expect(row.city).toBe(FULL_ROW.city)
    expect(row.state).toBe(FULL_ROW.state)
    expect(row.postal_code).toBe(FULL_ROW.postal_code)
    expect(row.country).toBe(FULL_ROW.country)
    expect(row.email).toBe(FULL_ROW.email)
    expect(row.general_phone).toBe(FULL_ROW.general_phone)
    expect(row.website).toBe(FULL_ROW.website)
    expect(row.tax_id).toBe(FULL_ROW.tax_id)
    expect(row.tax_rate).toBe(FULL_ROW.tax_rate)
    expect(row.tax_exempt).toBe(FULL_ROW.tax_exempt)
    expect(row.payment_terms).toBe(FULL_ROW.payment_terms)
    expect(row.shipping_cost_cents).toBe(FULL_ROW.shipping_cost_cents)
    expect(row.rating).toBe(FULL_ROW.rating)
    expect(row.preferred).toBe(FULL_ROW.preferred)
    expect(row.active).toBe(FULL_ROW.active)
    expect(row.notes).toBe(FULL_ROW.notes)
  })
})
